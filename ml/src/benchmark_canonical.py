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

from .features import (
    FEATURE_COLS, E01_MISSINGNESS_COLS, E02_INTENSITY_COLS,
    E03_REST_BUCKET_COLS, E04_PRESTIGE_COLS,
)
from .startlist_features import STARTLIST_FEATURE_COLS
from .cache_features import (
    GLICKO_FEATURES, load_train_test, validate_cache, compute_schema_hash,
)
from .benchmark_v8 import (
    FOLDS, RANDOM_SEED,
    find_optimal_team, spearman_rho, precision_at_k, ndcg_at_k, bootstrap_ci,
)
from .logbook import (
    build_run_metadata, build_race_detail, save_logbook_entry,
)

# ── Feature sets ──────────────────────────────────────────────────────

_PHASE_B = (E01_MISSINGNESS_COLS + E02_INTENSITY_COLS
            + E03_REST_BUCKET_COLS + E04_PRESTIGE_COLS)

# Volume features superseded by E02 intensity + E04 prestige
_VOLUME_NOISE = {
    'pts_total_12m', 'pts_total_6m', 'pts_total_3m', 'pts_gc_12m',
    'pts_stage_12m', 'pts_mountain_12m', 'pts_sprint_12m', 'pts_same_type_12m',
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


# ── Single experiment ─────────────────────────────────────────────────

def run_experiment(
    model_type: str,
    feature_set_name: str,
    transform_name: str,
    prices_df: pd.DataFrame,
    rider_names: dict[str, str],
    quiet: bool = False,
) -> dict:
    """Run a complete 3-fold experiment and save logbook."""
    feature_cols = FEATURE_SETS[feature_set_name]
    _, model_params = _make_model(model_type)

    label = f"{model_type.upper()} / {feature_set_name} / {transform_name} ({len(feature_cols)} features)"
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
        result = evaluate_fold(
            fold_num, feature_cols, model_type, transform_name,
            prices_df, rider_names,
        )
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

    path = save_logbook_entry(metadata, fold_details)
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
    parser.add_argument('--quiet', action='store_true',
                        help='Minimal output (useful for --all-combos)')
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
        )
        print_experiment_report(result)

    print(f"\nDone. ({date.today()})")


if __name__ == '__main__':
    main()
