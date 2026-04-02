"""
Canonical benchmark runner — the ONE source of truth for ML evaluation.

Supports every model × feature-set × target-transform combination,
validates cache integrity, and auto-saves a detailed logbook artifact
for every run (per-race, per-rider breakdown).

Usage:
    cd ml && python -m src.benchmark_canonical                            # rf, baseline, raw
    cd ml && python -m src.benchmark_canonical --model lgbm --features all --transform sqrt
    cd ml && python -m src.benchmark_canonical --all-combos               # all 24 combinations
    cd ml && python -m src.benchmark_canonical --all-combos --models lgbm # only lgbm combos
"""

import argparse
import csv
import os
import sys
from datetime import date, datetime

import numpy as np
import pandas as pd
import psycopg2
from sklearn.ensemble import RandomForestRegressor

from src.features.stage_race import (
    FEATURE_COLS, E01_MISSINGNESS_COLS, E02_INTENSITY_COLS,
    E03_REST_BUCKET_COLS, E04_PRESTIGE_COLS, SR_GC_COLS,
)
from src.features.startlist import STARTLIST_FEATURE_COLS
from src.features.cache_stage import (
    GLICKO_FEATURES, load_train_test, validate_cache, compute_schema_hash,
)
from benchmarks.harness import (
    FOLDS, RANDOM_SEED,
    find_optimal_team, spearman_rho, precision_at_k, ndcg_at_k, bootstrap_ci,
)
from benchmarks.logbook import (
    build_run_metadata, build_race_detail, save_logbook_entry,
)

# ── Feature sets ──────────────────────────────────────────────────────

_PHASE_B = (E01_MISSINGNESS_COLS + E02_INTENSITY_COLS
            + E03_REST_BUCKET_COLS + E04_PRESTIGE_COLS + SR_GC_COLS)

# Features superseded by E02/E04/SR_GC decontaminated variants
_VOLUME_NOISE = {
    'pts_total_12m', 'pts_total_6m', 'pts_total_3m', 'pts_gc_12m',
    'pts_stage_12m', 'pts_mountain_12m', 'pts_sprint_12m', 'pts_same_type_12m',
    # General quality metrics contaminated by classics (replaced by sr_* variants)
    'best_race_pts_12m', 'median_race_pts_12m',
    # top10_rate/win_rate mix classic + stage race GC (replaced by sr_gc_*)
    'top10_rate', 'win_rate',
}

FEATURE_SETS = {
    'baseline': list(FEATURE_COLS),
    'startlist': list(FEATURE_COLS) + STARTLIST_FEATURE_COLS,
    'glicko': list(FEATURE_COLS) + GLICKO_FEATURES,
    'all': list(FEATURE_COLS) + STARTLIST_FEATURE_COLS + GLICKO_FEATURES,
    # Phase B experiments
    'e01e03': list(FEATURE_COLS) + E01_MISSINGNESS_COLS + E03_REST_BUCKET_COLS,
    'e02': list(FEATURE_COLS) + E02_INTENSITY_COLS,
    'e04': list(FEATURE_COLS) + E04_PRESTIGE_COLS,
    'phase_b': list(FEATURE_COLS) + _PHASE_B,
    'phase_b_all': list(FEATURE_COLS) + STARTLIST_FEATURE_COLS + GLICKO_FEATURES + _PHASE_B,
    # Pruned: phase_b minus volume noise (E06 ablation result)
    'pruned': [c for c in list(FEATURE_COLS) + _PHASE_B if c not in _VOLUME_NOISE],
}

# ── Model params ──────────────────────────────────────────────────────

RF_PARAMS = {
    'n_estimators': 500, 'max_depth': 14, 'min_samples_leaf': 5,
    'random_state': RANDOM_SEED, 'n_jobs': -1,
}

LGB_PARAMS = {
    'objective': 'regression', 'verbose': -1, 'n_jobs': -1,
    'random_state': RANDOM_SEED,
    'n_estimators': 256, 'max_depth': 8, 'learning_rate': 0.0204,
    'num_leaves': 71, 'subsample': 0.957, 'colsample_bytree': 0.535,
    'min_child_samples': 48, 'reg_alpha': 0.000197, 'reg_lambda': 0.000548,
}

# ── Target transforms ────────────────────────────────────────────────

TRANSFORMS = {
    'raw': (
        lambda y: y,
        lambda p: p,
    ),
    'sqrt': (
        lambda y: np.sqrt(np.clip(y, 0, None)),
        lambda p: np.clip(p, 0, None) ** 2,
    ),
    'log1p': (
        lambda y: np.log1p(np.clip(y, 0, None)),
        lambda p: np.expm1(np.clip(p, 0, None)),
    ),
}


# ── Model factory ─────────────────────────────────────────────────────

def _make_model(model_type: str):
    if model_type == 'rf':
        return RandomForestRegressor(**RF_PARAMS), dict(RF_PARAMS)
    elif model_type == 'lgbm':
        import lightgbm as lgb
        return lgb.LGBMRegressor(**LGB_PARAMS), dict(LGB_PARAMS)
    else:
        raise ValueError(f"Unknown model type: {model_type}")


# ── Core evaluation ───────────────────────────────────────────────────

def evaluate_fold(
    fold_num: int,
    feature_cols: list[str],
    model_type: str,
    transform_name: str,
    prices_df: pd.DataFrame,
    rider_names: dict[str, str],
) -> dict:
    """Evaluate one fold with full per-race, per-rider detail."""
    train_fn, inverse_fn = TRANSFORMS[transform_name]
    train_df, test_df = load_train_test(fold_num)
    available = [c for c in feature_cols if c in train_df.columns]

    fold_result = {
        'fold': fold_num,
        'test_year': FOLDS[fold_num]['test_year'],
        'race_types': {},
    }

    for rt in ['mini_tour', 'grand_tour']:
        tr = train_df[train_df['race_type'] == rt]
        te = test_df[test_df['race_type'] == rt]
        if len(tr) == 0 or len(te) == 0:
            continue

        model, _ = _make_model(model_type)
        y_raw = tr['actual_pts'].values
        y_train = train_fn(y_raw)

        # NaN handling: LightGBM handles NaN natively (learns separate
        # splits for missing vs zero). RF requires fillna(0).
        if model_type == 'lgbm':
            X_train = tr[available].values
            X_test = te[available].values
        else:
            X_train = tr[available].fillna(0).values
            X_test = te[available].fillna(0).values

        model.fit(X_train, y_train)
        raw_preds = model.predict(X_test)
        preds = inverse_fn(raw_preds)

        te = te.copy()
        te['predicted'] = preds

        race_details = []
        rhos, p15s, ndcgs, captures, overlaps = [], [], [], [], []

        for (slug, year), g in te.groupby(['race_slug', 'race_year']):
            if len(g) < 3:
                continue

            pred = g['predicted'].values
            actual = g['actual_pts'].values

            rho = spearman_rho(pred, actual)
            if np.isnan(rho):
                continue

            p15 = precision_at_k(pred, actual, 15)
            ndcg = ndcg_at_k(pred, actual, 20)

            rhos.append(rho)
            p15s.append(p15)
            ndcgs.append(ndcg)

            # Team selection (requires prices)
            rp = prices_df[
                (prices_df['race_slug'] == slug) & (prices_df['year'] == year)
            ]
            predicted_team = None
            actual_team = None
            tc = None
            to = None

            if len(rp) > 0:
                pm = dict(zip(rp['rider_id'], rp['price_hillios']))
                ids = g['rider_id'].tolist()
                am = dict(zip(g['rider_id'], g['actual_pts']))
                prm = dict(zip(g['rider_id'], g['predicted']))

                actual_team = find_optimal_team(ids, am, pm)
                predicted_team = find_optimal_team(ids, prm, pm)

                if actual_team and predicted_team:
                    ap = sum(am.get(r, 0) for r in actual_team)
                    pp = sum(am.get(r, 0) for r in predicted_team)
                    if ap > 0:
                        tc = pp / ap
                        captures.append(tc)
                    to = len(set(actual_team) & set(predicted_team)) / len(actual_team)
                    overlaps.append(to)

            detail = build_race_detail(
                race_slug=slug,
                year=year,
                race_type=rt,
                riders_df=g,
                prices_df=prices_df,
                rider_names=rider_names,
                predicted_team=predicted_team,
                actual_team=actual_team,
                rho=rho,
                p_at_15=p15,
                ndcg_at_20=ndcg,
                team_capture=tc,
                team_overlap=to,
            )
            race_details.append(detail)

        agg = {
            'n_races': len(rhos),
            'rho_mean': float(np.mean(rhos)) if rhos else None,
            'rho_ci': list(bootstrap_ci(rhos)) if len(rhos) >= 2 else [None, None],
            'p15_mean': float(np.mean(p15s)) if p15s else None,
            'ndcg_mean': float(np.mean(ndcgs)) if ndcgs else None,
            'team_capture_mean': float(np.mean(captures)) if captures else None,
            'team_overlap_mean': float(np.mean(overlaps)) if overlaps else None,
            'n_priced_races': len(captures),
        }

        fold_result['race_types'][rt] = {
            'aggregate': agg,
            'races': race_details,
        }

    return fold_result


# ── Decomposed evaluation (E07) ──────────────────────────────────────

# Category groups for decomposed prediction
CATEGORY_TARGETS = {
    'gc':       'actual_gc_pts',        # gc + gc_daily
    'stage':    'actual_stage_pts',      # stage
    'mountain': 'actual_mountain_pts',   # mountain + mountain_pass
    'sprint':   'actual_sprint_pts',     # sprint + sprint_intermediate + regularidad
}


def evaluate_fold_decomposed(
    fold_num: int,
    feature_cols: list[str],
    model_type: str,
    transform_name: str,
    prices_df: pd.DataFrame,
    rider_names: dict[str, str],
) -> dict:
    """Evaluate one fold using per-category sub-models.

    Trains 4 models (gc, stage, mountain, sprint), sums predictions
    to get total predicted points.  This prevents classic specialists
    from being overvalued — they score ~0 in gc/mountain sub-models.
    """
    train_fn, inverse_fn = TRANSFORMS[transform_name]
    train_df, test_df = load_train_test(fold_num)
    available = [c for c in feature_cols if c in train_df.columns]

    fold_result = {
        'fold': fold_num,
        'test_year': FOLDS[fold_num]['test_year'],
        'race_types': {},
    }

    for rt in ['mini_tour', 'grand_tour']:
        tr = train_df[train_df['race_type'] == rt]
        te = test_df[test_df['race_type'] == rt]
        if len(tr) == 0 or len(te) == 0:
            continue

        if model_type == 'lgbm':
            X_train = tr[available].values
            X_test = te[available].values
        else:
            X_train = tr[available].fillna(0).values
            X_test = te[available].fillna(0).values

        # Train one sub-model per category, sum predictions
        te = te.copy()
        te['predicted'] = 0.0

        for cat_name, target_col in CATEGORY_TARGETS.items():
            if target_col not in tr.columns:
                continue
            model, _ = _make_model(model_type)
            y_raw = tr[target_col].values
            y_train = train_fn(y_raw)
            model.fit(X_train, y_train)
            cat_preds = inverse_fn(model.predict(X_test))
            cat_preds = np.clip(cat_preds, 0, None)
            te[f'pred_{cat_name}'] = cat_preds
            te['predicted'] += cat_preds

        race_details = []
        rhos, p15s, ndcgs, captures, overlaps = [], [], [], [], []

        for (slug, year), g in te.groupby(['race_slug', 'race_year']):
            if len(g) < 3:
                continue

            pred = g['predicted'].values
            actual = g['actual_pts'].values

            rho = spearman_rho(pred, actual)
            if np.isnan(rho):
                continue

            p15 = precision_at_k(pred, actual, 15)
            ndcg = ndcg_at_k(pred, actual, 20)

            rhos.append(rho)
            p15s.append(p15)
            ndcgs.append(ndcg)

            # Team selection
            rp = prices_df[
                (prices_df['race_slug'] == slug) & (prices_df['year'] == year)
            ]
            predicted_team = None
            actual_team = None
            tc = None
            to = None

            if len(rp) > 0:
                pm = dict(zip(rp['rider_id'], rp['price_hillios']))
                ids = g['rider_id'].tolist()
                am = dict(zip(g['rider_id'], g['actual_pts']))
                prm = dict(zip(g['rider_id'], g['predicted']))

                actual_team = find_optimal_team(ids, am, pm)
                predicted_team = find_optimal_team(ids, prm, pm)

                if actual_team and predicted_team:
                    ap = sum(am.get(r, 0) for r in actual_team)
                    pp = sum(am.get(r, 0) for r in predicted_team)
                    if ap > 0:
                        tc = pp / ap
                        captures.append(tc)
                    to = len(set(actual_team) & set(predicted_team)) / len(actual_team)
                    overlaps.append(to)

            detail = build_race_detail(
                race_slug=slug, year=year, race_type=rt,
                riders_df=g, prices_df=prices_df, rider_names=rider_names,
                predicted_team=predicted_team, actual_team=actual_team,
                rho=rho, p_at_15=p15, ndcg_at_20=ndcg,
                team_capture=tc, team_overlap=to,
            )
            race_details.append(detail)

        agg = {
            'n_races': len(rhos),
            'rho_mean': float(np.mean(rhos)) if rhos else None,
            'rho_ci': list(bootstrap_ci(rhos)) if len(rhos) >= 2 else [None, None],
            'p15_mean': float(np.mean(p15s)) if p15s else None,
            'ndcg_mean': float(np.mean(ndcgs)) if ndcgs else None,
            'team_capture_mean': float(np.mean(captures)) if captures else None,
            'team_overlap_mean': float(np.mean(overlaps)) if overlaps else None,
            'n_priced_races': len(captures),
        }

        fold_result['race_types'][rt] = {
            'aggregate': agg,
            'races': race_details,
        }

    return fold_result


# ── Ordinal evaluation (E07b) ────────────────────────────────────────

from src.domain.points import (
    gc_position_to_bucket, gc_bucket_expected_pts, N_GC_BUCKETS,
    classification_position_to_bucket, classification_bucket_expected_pts,
    n_classification_buckets, compute_expected_pts,
    get_points, estimate_gc_daily_pts,
)

# Minimal GC feature set (spec 012, Phase 2).
# Only features with direct GC signal — no stage_mu, no micro-form, no volume.
# The hypothesis: fewer, cleaner features → less Skjelmose/Ciccone inflation.
# Minimal GC feature set (spec 012, Phase 2).
# Only features with direct GC signal — no stage_mu, no micro-form, no volume.
# same_race_gc_best replaces same_race_best to avoid target contamination
# (same_race_best included stage/sprint/mountain pts, inflating Alaphilippe etc.)
GC_GATE_FEATURES_MINIMAL = [
    'gc_mu',                    # Glicko-2 GC strength (recalibrated UCI weights)
    'gc_mu_delta_12m',          # Trend: improving or declining
    'same_race_gc_best',        # Best GC pts (gc+gc_daily) in this specific race
    'strongest_teammate_gap',   # Team dynamics: negative = gregario, positive = leader
    'age',                      # Secondary context
    'gc_pts_same_type',         # GC points in same race type (GT vs mini)
]

# Extended GC feature set (original Phase B + gc_mu_delta_12m).
# More features, potentially more signal but also more noise.
GC_GATE_FEATURES = [
    # Glicko-2 level (measures RELATIVE strength vs same rivals)
    'gc_mu', 'gc_mu_delta_12m',
    # GT direct (primary signal)
    'gt_pts_12m', 'gt_gc_pts_12m', 'best_gt_pts_12m',
    'gt_pts_per_race_12m', 'gt_gc_top10_rate', 'gt_race_count_12m',
    # UWT GC rates (filters Luxembourg/Denmark noise)
    'uwt_gc_top10_rate', 'uwt_gc_win_rate',
    # Mini tour GC (secondary, lower weight than GT/UWT)
    'mini_gc_top10_rate', 'mini_gc_win_rate',
    # Race history
    'same_race_best', 'same_race_mean', 'has_same_race',
    'gc_pts_same_type',
    # Context
    'age', 'sr_race_pct',
    'strongest_teammate_gap', 'is_leader', 'team_rank',
]

# Regressors shared by decomposed and ordinal modes
ORDINAL_REGRESSORS = {
    'stage':        'actual_stage_pts',
    'mountain_pass': 'actual_mountain_pass_pts',
    'sprint_inter': 'actual_sprint_inter_pts',
}


def evaluate_fold_ordinal(
    fold_num: int,
    feature_cols: list[str],
    model_type: str,
    transform_name: str,
    prices_df: pd.DataFrame,
    rider_names: dict[str, str],
    gc_feature_set: str = 'extended',
) -> dict:
    """Evaluate one fold using hierarchical gate + position prediction.

    E07c approach:
      GC:  binary gate (top20 y/n) → position regressor (1-20) → scoring table
      GC daily: heuristic from predicted GC position × stage count
      Mountain/Sprint final: binary gate (top5 y/n) → position → scoring table
      Stage/mountain_pass/sprint_inter: regression (most continuous targets)
    """
    import lightgbm as lgb

    train_fn, inverse_fn = TRANSFORMS[transform_name]
    train_df, test_df = load_train_test(fold_num)
    available = [c for c in feature_cols if c in train_df.columns]

    fold_result = {
        'fold': fold_num,
        'test_year': FOLDS[fold_num]['test_year'],
        'race_types': {},
    }

    for rt in ['mini_tour', 'grand_tour']:
        tr = train_df[train_df['race_type'] == rt]
        te = test_df[test_df['race_type'] == rt]
        if len(tr) == 0 or len(te) == 0:
            continue

        X_train = tr[available].values
        X_test = te[available].values
        te = te.copy()
        te['predicted'] = 0.0

        # ── GC: gate + conservative mu + capped form (012 frozen) ──
        if 'gc_final_position' in tr.columns:
            gc_pos = tr['gc_final_position']
            y_gate = (gc_pos.fillna(999) <= 20).astype(int).values

            if rt == 'grand_tour' and gc_feature_set == 'minimal':
                # 012 frozen pipeline: LogReg gate + heuristic score
                from sklearn.linear_model import LogisticRegression, Ridge
                from sklearn.preprocessing import StandardScaler

                gc_avail = [c for c in GC_GATE_FEATURES_MINIMAL if c in tr.columns]

                # Step 1: LogReg gate
                _sg = StandardScaler()
                _gate = LogisticRegression(
                    C=0.1, class_weight='balanced', max_iter=1000,
                    random_state=RANDOM_SEED,
                )
                _gate.fit(_sg.fit_transform(tr[gc_avail].values), y_gate)
                p_top20 = _gate.predict_proba(_sg.transform(te[gc_avail].values))[:, 1]

                # Step 2: heuristic score = conservative_mu + capped form
                CONSERVATIVE_LAMBDA = 1.0
                FORM_MULTIPLIER = 10.0
                FORM_CAP = 100.0
                cons_mu = te['gc_mu'].values - CONSERVATIVE_LAMBDA * te['gc_rd'].values
                form = te['recent_gc_form_score'].values if 'recent_gc_form_score' in te.columns else np.zeros(len(te))
                form_bonus = np.minimum(form * FORM_MULTIPLIER, FORM_CAP)
                gc_score = cons_mu + form_bonus

                # Step 3: rank within race, convert to points via scoring table
                te['pred_gc_score'] = gc_score
                te['pred_gc_p_top20'] = p_top20

                gc_pts_total = np.zeros(len(te))
                gc_daily_total = np.zeros(len(te))
                n_stages = te['target_stage_count'].values if 'target_stage_count' in te.columns else np.full(len(te), 21)

                for (slug, year), idx in te.groupby(['race_slug', 'race_year']).groups.items():
                    g = te.loc[idx]
                    scoreable = g[g['pred_gc_p_top20'] >= 0.40].sort_values('pred_gc_score', ascending=False)
                    for rank, (ridx, _) in enumerate(scoreable.iterrows(), 1):
                        gc_pts_total[te.index.get_loc(ridx)] = get_points('gc', rank, rt)
                        ns = int(te.loc[ridx, 'target_stage_count']) if 'target_stage_count' in te.columns else 21
                        gc_daily_total[te.index.get_loc(ridx)] = estimate_gc_daily_pts(rank, ns, rt) * te.loc[ridx, 'pred_gc_p_top20']

                te['pred_gc'] = gc_pts_total
                te['pred_gc_daily'] = gc_daily_total
                te['predicted'] += gc_pts_total + gc_daily_total

            else:
                # Original LGBM approach for mini tours or extended feature set
                if rt == 'grand_tour':
                    gc_feats = GC_GATE_FEATURES
                    gc_avail = [c for c in gc_feats if c in tr.columns]
                    X_gc_train = tr[gc_avail].values
                    X_gc_test = te[gc_avail].values
                else:
                    gc_avail = available
                    X_gc_train = X_train
                    X_gc_test = X_test

                gate = lgb.LGBMClassifier(
                    objective='binary', verbose=-1, n_jobs=-1,
                    random_state=RANDOM_SEED,
                    n_estimators=256, max_depth=6, learning_rate=0.02,
                    num_leaves=31, subsample=0.9, colsample_bytree=0.7,
                    min_child_samples=20,
                )
                gate.fit(X_gc_train, y_gate)
                p_top20 = gate.predict_proba(X_gc_test)[:, 1]

                top20_mask = y_gate == 1
                if top20_mask.sum() >= 10:
                    pos_reg = lgb.LGBMRegressor(
                        verbose=-1, n_jobs=-1, random_state=RANDOM_SEED,
                        n_estimators=256, max_depth=5, learning_rate=0.02,
                        num_leaves=15, subsample=0.9, colsample_bytree=0.8,
                        min_child_samples=5,
                    )
                    pos_reg.fit(X_gc_train[top20_mask], gc_pos.values[top20_mask])
                    pred_pos = np.clip(pos_reg.predict(X_gc_test), 1, 20)
                else:
                    pred_pos = np.full(len(X_gc_test), 10.0)

                gc_pts = np.array([
                    get_points('gc', round(pos), rt) * prob
                    for pos, prob in zip(pred_pos, p_top20)
                ])
                te['pred_gc'] = gc_pts
                te['pred_gc_p_top20'] = p_top20
                te['predicted'] += gc_pts

                n_stages = te['target_stage_count'].values if 'target_stage_count' in te.columns else np.full(len(te), 21)
                gc_daily_pts = np.array([
                    estimate_gc_daily_pts(pos, int(ns), rt) * prob
                    for pos, ns, prob in zip(pred_pos, n_stages, p_top20)
                ])
                te['pred_gc_daily'] = gc_daily_pts
                te['predicted'] += gc_daily_pts

        # ── Mountain/Sprint final: gate + position ────────────────
        for cls_name, pos_col, category in [
            ('mtn_final', 'mountain_final_position', 'mountain'),
            ('spr_final', 'sprint_final_position', 'sprint'),
        ]:
            if pos_col not in tr.columns:
                continue
            max_scoring = 5 if rt == 'grand_tour' else 3
            cls_pos = tr[pos_col]
            y_gate_cls = (cls_pos.fillna(999) <= max_scoring).astype(int).values

            if y_gate_cls.sum() < 5:
                te[f'pred_{cls_name}'] = 0.0
                continue

            gate_cls = lgb.LGBMClassifier(
                objective='binary', verbose=-1, n_jobs=-1,
                random_state=RANDOM_SEED,
                n_estimators=128, max_depth=6, learning_rate=0.03,
                num_leaves=31, subsample=0.9, colsample_bytree=0.7,
                min_child_samples=20,
            )
            gate_cls.fit(X_train, y_gate_cls)
            p_scoring = gate_cls.predict_proba(X_test)[:, 1]

            top_mask = y_gate_cls == 1
            if top_mask.sum() >= 5:
                pos_reg_cls = lgb.LGBMRegressor(
                    verbose=-1, n_jobs=-1, random_state=RANDOM_SEED,
                    n_estimators=128, max_depth=4, learning_rate=0.03,
                    num_leaves=15, min_child_samples=5,
                )
                pos_reg_cls.fit(X_train[top_mask], cls_pos.values[top_mask])
                raw_cls_pos = pos_reg_cls.predict(X_test)
                pred_cls_pos = np.clip(raw_cls_pos, 1, max_scoring)
            else:
                pred_cls_pos = np.full(len(X_test), 3.0)

            cls_pts = np.array([
                get_points(category, round(pos), rt) * prob
                for pos, prob in zip(pred_cls_pos, p_scoring)
            ])
            te[f'pred_{cls_name}'] = cls_pts
            te['predicted'] += cls_pts

        # ── Stage: count model (predict top-10 finishes → pts) ────
        if 'stage_top10_count' in tr.columns:
            stage_model, _ = _make_model(model_type)
            stage_model.fit(X_train, tr['stage_top10_count'].values)
            pred_top10 = np.clip(stage_model.predict(X_test), 0, None)
            # ~22 pts per top-10 finish + ~3 pts base (from data analysis)
            stage_pts = pred_top10 * 22.0 + 3.0
            te['pred_stage'] = stage_pts
            te['pred_stage_top10'] = pred_top10
            te['predicted'] += stage_pts
        else:
            # Fallback to regression
            model, _ = _make_model(model_type)
            model.fit(X_train, tr['actual_stage_pts'].values)
            te['pred_stage'] = np.clip(model.predict(X_test), 0, None)
            te['predicted'] += te['pred_stage']

        # ── Mountain pass: capture rate model ─────────────────────
        if 'mtn_pass_capture' in tr.columns and 'target_mtn_pass_supply' in te.columns:
            mtn_model, _ = _make_model(model_type)
            mtn_model.fit(X_train, tr['mtn_pass_capture'].values)
            pred_capture = np.clip(mtn_model.predict(X_test), 0, 1)
            mtn_supply = te['target_mtn_pass_supply'].values
            mtn_pts = pred_capture * mtn_supply
            te['pred_mountain_pass'] = mtn_pts
            te['predicted'] += mtn_pts
        else:
            model, _ = _make_model(model_type)
            model.fit(X_train, tr['actual_mountain_pass_pts'].values)
            te['pred_mountain_pass'] = np.clip(model.predict(X_test), 0, None)
            te['predicted'] += te['pred_mountain_pass']

        # ── Sprint inter + regularidad: capture rate model ────────
        if 'spr_inter_capture' in tr.columns and 'target_spr_inter_supply' in te.columns:
            spr_model, _ = _make_model(model_type)
            spr_model.fit(X_train, tr['spr_inter_capture'].values)
            pred_capture = np.clip(spr_model.predict(X_test), 0, 1)
            spr_supply = te['target_spr_inter_supply'].values
            spr_pts = pred_capture * spr_supply
            te['pred_sprint_inter'] = spr_pts
            te['predicted'] += spr_pts
        else:
            model, _ = _make_model(model_type)
            model.fit(X_train, tr['actual_sprint_inter_pts'].values)
            te['pred_sprint_inter'] = np.clip(model.predict(X_test), 0, None)
            te['predicted'] += te['pred_sprint_inter']

        # ── Per-race metrics ──────────────────────────────────────
        race_details = []
        rhos, p15s, ndcgs, captures, overlaps = [], [], [], [], []

        for (slug, year), g in te.groupby(['race_slug', 'race_year']):
            if len(g) < 3:
                continue
            pred = g['predicted'].values
            actual = g['actual_pts'].values
            rho = spearman_rho(pred, actual)
            if np.isnan(rho):
                continue
            p15 = precision_at_k(pred, actual, 15)
            ndcg = ndcg_at_k(pred, actual, 20)
            rhos.append(rho)
            p15s.append(p15)
            ndcgs.append(ndcg)

            rp = prices_df[
                (prices_df['race_slug'] == slug) & (prices_df['year'] == year)
            ]
            predicted_team, actual_team, tc, to = None, None, None, None
            if len(rp) > 0:
                pm = dict(zip(rp['rider_id'], rp['price_hillios']))
                ids = g['rider_id'].tolist()
                am = dict(zip(g['rider_id'], g['actual_pts']))
                prm = dict(zip(g['rider_id'], g['predicted']))
                actual_team = find_optimal_team(ids, am, pm)
                predicted_team = find_optimal_team(ids, prm, pm)
                if actual_team and predicted_team:
                    ap = sum(am.get(r, 0) for r in actual_team)
                    pp = sum(am.get(r, 0) for r in predicted_team)
                    if ap > 0:
                        tc = pp / ap
                        captures.append(tc)
                    to = len(set(actual_team) & set(predicted_team)) / len(actual_team)
                    overlaps.append(to)

            detail = build_race_detail(
                race_slug=slug, year=year, race_type=rt,
                riders_df=g, prices_df=prices_df, rider_names=rider_names,
                predicted_team=predicted_team, actual_team=actual_team,
                rho=rho, p_at_15=p15, ndcg_at_20=ndcg,
                team_capture=tc, team_overlap=to,
            )
            race_details.append(detail)

        agg = {
            'n_races': len(rhos),
            'rho_mean': float(np.mean(rhos)) if rhos else None,
            'rho_ci': list(bootstrap_ci(rhos)) if len(rhos) >= 2 else [None, None],
            'p15_mean': float(np.mean(p15s)) if p15s else None,
            'ndcg_mean': float(np.mean(ndcgs)) if ndcgs else None,
            'team_capture_mean': float(np.mean(captures)) if captures else None,
            'team_overlap_mean': float(np.mean(overlaps)) if overlaps else None,
            'n_priced_races': len(captures),
        }
        fold_result['race_types'][rt] = {
            'aggregate': agg,
            'races': race_details,
        }

    return fold_result


# ── Single experiment ─────────────────────────────────────────────────

def run_experiment(
    model_type: str,
    feature_set_name: str,
    transform_name: str,
    prices_df: pd.DataFrame,
    rider_names: dict[str, str],
    quiet: bool = False,
    decompose: bool = False,
    ordinal: bool = False,
    gc_feature_set: str = 'extended',
) -> dict:
    """Run a complete 3-fold experiment and save logbook."""
    feature_cols = FEATURE_SETS[feature_set_name]
    _, model_params = _make_model(model_type)

    mode = "ordinal" if ordinal else ("decomposed" if decompose else "single")
    gc_label = f" gc={gc_feature_set}" if ordinal else ""
    label = f"{model_type.upper()} / {feature_set_name} / {transform_name} / {mode}{gc_label} ({len(feature_cols)} features)"
    if not quiet:
        print(f"\n{'='*65}")
        print(f"  {label}")
        print(f"{'='*65}")

    metadata = build_run_metadata(
        model_type=model_type,
        model_params=model_params,
        feature_set_name=feature_set_name,
        feature_cols=feature_cols,
        target_transform=transform_name,
        cache_schema_hash=compute_schema_hash(),
    )

    fold_details = []
    for fold_num in [1, 2, 3]:
        if not quiet:
            print(f"  Fold {fold_num} (test {FOLDS[fold_num]['test_year']})...", end=' ', flush=True)
        if ordinal:
            eval_fn = evaluate_fold_ordinal
        elif decompose:
            eval_fn = evaluate_fold_decomposed
        else:
            eval_fn = evaluate_fold
        kwargs = dict(
            fold_num=fold_num, feature_cols=feature_cols,
            model_type=model_type, transform_name=transform_name,
            prices_df=prices_df, rider_names=rider_names,
        )
        if ordinal:
            kwargs['gc_feature_set'] = gc_feature_set
        result = eval_fn(**kwargs)
        fold_details.append(result)
        if not quiet:
            for rt in ['mini_tour', 'grand_tour']:
                a = result.get('race_types', {}).get(rt, {}).get('aggregate', {})
                rho = a.get('rho_mean')
                tc = a.get('team_capture_mean')
                if rho is not None:
                    tc_str = f" TC={tc:.1%}" if tc else ""
                    print(f"{rt[:4]} rho={rho:.4f}{tc_str}", end='  ')
            print()

    if ordinal:
        label_suffix = '_ordinal'
        metadata['ordinal'] = True
        metadata['regressors'] = list(ORDINAL_REGRESSORS.keys())
        metadata['gc_approach'] = 'hierarchical: gate(top20) + position(1-20) + gc_daily_heuristic'
        metadata['gc_feature_set'] = gc_feature_set
        if gc_feature_set == 'minimal':
            metadata['gc_features_used'] = GC_GATE_FEATURES_MINIMAL
            label_suffix = '_ordinal_gc_minimal'
    elif decompose:
        label_suffix = '_decomposed'
        metadata['decomposed'] = True
        metadata['category_targets'] = list(CATEGORY_TARGETS.keys())
    else:
        label_suffix = None
    path = save_logbook_entry(metadata, fold_details, label=label_suffix)
    if not quiet:
        print(f"  Logbook saved: {path}")

    return {
        'model': model_type,
        'features': feature_set_name,
        'transform': transform_name,
        'n_features': len(feature_cols),
        'fold_details': fold_details,
        'logbook_path': path,
        'metadata': metadata,
    }


# ── Report formatting ─────────────────────────────────────────────────

def _avg_metric(experiment: dict, race_type: str, metric: str) -> float | None:
    """Average a metric across folds for a race type."""
    vals = []
    for fold in experiment['fold_details']:
        a = fold.get('race_types', {}).get(race_type, {}).get('aggregate', {})
        v = a.get(metric)
        if v is not None:
            vals.append(v)
    return float(np.mean(vals)) if vals else None


def print_experiment_report(experiment: dict):
    """Print a detailed report for a single experiment."""
    meta = experiment['metadata']
    print(f"\n{'='*70}")
    print(f"  BENCHMARK REPORT — {meta['model_type'].upper()} / {meta['feature_set']} / {meta['target_transform']}")
    print(f"  Date: {date.today()}  |  Git: {meta['git_sha']}  |  Features: {meta['feature_count']}")
    print(f"  Cache schema: {meta['cache_schema_hash']}")
    print(f"{'='*70}")

    for rt in ['mini_tour', 'grand_tour']:
        print(f"\n  {rt.upper()}")
        print(f"  {'Metric':<20} {'Fold 1':>10} {'Fold 2':>10} {'Fold 3':>10} {'Average':>10}")
        print(f"  {'-'*20} {'-'*10} {'-'*10} {'-'*10} {'-'*10}")

        metrics = [
            ('rho_mean', 'Spearman rho', '.4f'),
            ('p15_mean', 'Precision@15', '.3f'),
            ('ndcg_mean', 'NDCG@20', '.3f'),
            ('team_capture_mean', 'Team Capture %', '.1%'),
            ('team_overlap_mean', 'Team Overlap %', '.1%'),
        ]

        for key, label, fmt in metrics:
            vals = []
            for fold in experiment['fold_details']:
                v = fold.get('race_types', {}).get(rt, {}).get('aggregate', {}).get(key)
                vals.append(v)
            val_strs = [f"{v:{fmt}}" if v is not None else "N/A" for v in vals]
            valid = [v for v in vals if v is not None]
            avg_str = f"{np.mean(valid):{fmt}}" if valid else "N/A"
            print(f"  {label:<20} {val_strs[0]:>10} {val_strs[1]:>10} {val_strs[2]:>10} {avg_str:>10}")

        # Bootstrap CI across all per-race rhos
        all_rhos = []
        for fold in experiment['fold_details']:
            for race in fold.get('race_types', {}).get(rt, {}).get('races', []):
                r = race.get('metrics', {}).get('rho')
                if r is not None:
                    all_rhos.append(r)
        if len(all_rhos) >= 2:
            ci = bootstrap_ci(all_rhos)
            print(f"  {'Rho 95% CI':<20} {'':>10} {'':>10} {'':>10} [{ci[0]:.4f}, {ci[1]:.4f}]")


def print_comparison_table(results: list[dict]):
    """Print a compact comparison table for --all-combos."""
    print(f"\n{'='*90}")
    print("  COMPARISON TABLE")
    print(f"{'='*90}")
    header = f"  {'Model':<6} {'Features':<10} {'Transform':<10} {'#Feat':>5} {'Mini rho':>10} {'Mini TC%':>10} {'GT rho':>10} {'GT TC%':>10}"
    print(header)
    print(f"  {'-'*6} {'-'*10} {'-'*10} {'-'*5} {'-'*10} {'-'*10} {'-'*10} {'-'*10}")

    for r in results:
        mr = _avg_metric(r, 'mini_tour', 'rho_mean')
        mt = _avg_metric(r, 'mini_tour', 'team_capture_mean')
        gr = _avg_metric(r, 'grand_tour', 'rho_mean')
        gt = _avg_metric(r, 'grand_tour', 'team_capture_mean')

        mr_s = f"{mr:.4f}" if mr else "N/A"
        mt_s = f"{mt:.1%}" if mt else "N/A"
        gr_s = f"{gr:.4f}" if gr else "N/A"
        gt_s = f"{gt:.1%}" if gt else "N/A"

        print(f"  {r['model']:<6} {r['features']:<10} {r['transform']:<10} {r['n_features']:>5} {mr_s:>10} {mt_s:>10} {gr_s:>10} {gt_s:>10}")


def save_comparison_csv(results: list[dict]) -> str:
    """Save comparison results as CSV."""
    results_dir = os.path.join(os.path.dirname(__file__), '..', 'results')
    os.makedirs(results_dir, exist_ok=True)
    path = os.path.join(results_dir, f'comparison_{date.today()}.csv')

    rows = []
    for r in results:
        rows.append({
            'model': r['model'],
            'features': r['features'],
            'transform': r['transform'],
            'n_features': r['n_features'],
            'mini_rho': _avg_metric(r, 'mini_tour', 'rho_mean'),
            'mini_p15': _avg_metric(r, 'mini_tour', 'p15_mean'),
            'mini_ndcg': _avg_metric(r, 'mini_tour', 'ndcg_mean'),
            'mini_tc': _avg_metric(r, 'mini_tour', 'team_capture_mean'),
            'mini_to': _avg_metric(r, 'mini_tour', 'team_overlap_mean'),
            'gt_rho': _avg_metric(r, 'grand_tour', 'rho_mean'),
            'gt_p15': _avg_metric(r, 'grand_tour', 'p15_mean'),
            'gt_ndcg': _avg_metric(r, 'grand_tour', 'ndcg_mean'),
            'gt_tc': _avg_metric(r, 'grand_tour', 'team_capture_mean'),
            'gt_to': _avg_metric(r, 'grand_tour', 'team_overlap_mean'),
        })

    with open(path, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)

    return path


# ── DB helpers ────────────────────────────────────────────────────────

def _load_prices(db_url: str) -> pd.DataFrame:
    conn = psycopg2.connect(db_url)
    df = pd.read_sql(
        "SELECT rider_id, race_slug, year, price_hillios FROM rider_prices",
        conn,
    )
    conn.close()
    return df


def _load_rider_names(db_url: str) -> dict[str, str]:
    conn = psycopg2.connect(db_url)
    df = pd.read_sql("SELECT id, full_name FROM riders", conn)
    conn.close()
    return dict(zip(df['id'], df['full_name']))


# ── CLI ───────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description='Canonical benchmark runner for ML scoring experiments',
    )
    parser.add_argument('--model', choices=['rf', 'lgbm'], default='rf')
    parser.add_argument('--features', choices=list(FEATURE_SETS.keys()), default='baseline')
    parser.add_argument('--transform', choices=list(TRANSFORMS.keys()), default='raw')
    parser.add_argument('--all-combos', action='store_true',
                        help='Run all model × features × transform combinations')
    parser.add_argument('--models', nargs='+', choices=['rf', 'lgbm'],
                        default=['rf', 'lgbm'],
                        help='Models to include in --all-combos')
    parser.add_argument('--decompose', action='store_true',
                        help='Use per-category decomposed prediction (E07)')
    parser.add_argument('--ordinal', action='store_true',
                        help='Use ordinal bucket classification for GC/mountain/sprint (E07b)')
    parser.add_argument('--quiet', action='store_true',
                        help='Minimal output (useful for --all-combos)')
    parser.add_argument('--gc-features', choices=['minimal', 'extended'], default='extended',
                        help='GC gate feature set for --ordinal mode (minimal=6 curated, extended=20+)')
    args = parser.parse_args()

    # Validate cache
    ok, msg = validate_cache()
    if not ok:
        print(f"ERROR: {msg}")
        sys.exit(1)
    print(f"Cache: {msg}")

    # Load shared data
    db_url = os.environ.get(
        'DATABASE_URL',
        'postgresql://cycling:cycling@localhost:5432/cycling_analyzer',
    )
    print("Loading prices and rider names...")
    prices_df = _load_prices(db_url)
    rider_names = _load_rider_names(db_url)
    print(f"  {len(prices_df):,} price entries, {len(rider_names):,} riders")

    if args.all_combos:
        combos = [
            (m, f, t)
            for m in args.models
            for f in FEATURE_SETS
            for t in TRANSFORMS
        ]
        print(f"\nRunning {len(combos)} combinations...")
        all_results = []
        for model, features, transform in combos:
            result = run_experiment(
                model, features, transform, prices_df, rider_names,
                quiet=args.quiet,
            )
            all_results.append(result)

        print_comparison_table(all_results)
        csv_path = save_comparison_csv(all_results)
        print(f"\n  CSV saved: {csv_path}")
    else:
        result = run_experiment(
            args.model, args.features, args.transform,
            prices_df, rider_names,
            decompose=args.decompose,
            ordinal=args.ordinal,
            gc_feature_set=args.gc_features,
        )
        print_experiment_report(result)

    print(f"\nDone. ({date.today()})")


if __name__ == '__main__':
    main()
