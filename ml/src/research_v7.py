"""
ML Scoring Research — v7: Weighted Features + Model Comparison

Key insight from v6: adding correlated features doesn't help RF because it
already deduces the same signal from existing features. Instead, we TRANSFORM
the existing features to encode domain knowledge directly:

1. Race-class weighting: UWT pts count full, Pro pts discounted
2. Cross-type signal: GT success predicts mini-tour success (and vice versa)
3. Model comparison: XGBoost vs Random Forest

Configs:
- v4b: baseline Random Forest (49 features, no weighting)
- v7a: RF with race-class weighted pts (UWT=1.0, Pro=0.6)
- v7b: RF with cross-type signal (pts_same_type includes GT for mini_tour)
- v7c: RF with both weightings combined
- v7d: XGBoost with v4b features (model change only)
- v7e: XGBoost with both weightings (v7c features + XGBoost)

Usage:
    cd ml && python -m src.research_v7
"""

import os
import sys
from collections import defaultdict
from datetime import date

import numpy as np
import pandas as pd
from scipy.stats import spearmanr
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor

from .features import (
    FEATURE_COLS as V4B_FEATURE_COLS,
    _compute_team_info,
    compute_race_profile,
)
from .research_v6 import load_data_fast

# Check for XGBoost availability
try:
    from xgboost import XGBRegressor
    HAS_XGBOOST = True
except ImportError:
    HAS_XGBOOST = False
    print("  XGBoost not available, will use GradientBoosting as fallback")


# ── Weighting constants ──────────────────────────────────────────────

# Race class weights: how much a point in each class "counts"
RACE_CLASS_WEIGHT = {
    'UWT': 1.0,
    'Pro': 0.6,
    '1': 0.4,
}

# Cross-type multiplier: when predicting for target_type, how much do
# pts from source_type count?  Currently pts_same_type_12m uses 1.0 for
# same type and 0.0 for others — we relax this.
CROSS_TYPE_WEIGHT = {
    # (source_type, target_type) -> weight
    ('grand_tour', 'mini_tour'): 0.8,    # GT success strongly predicts mini tour
    ('mini_tour', 'grand_tour'): 0.5,    # mini tour success moderately predicts GT
    ('grand_tour', 'grand_tour'): 1.0,
    ('mini_tour', 'mini_tour'): 1.0,
    ('classic', 'mini_tour'): 0.0,       # classics don't predict stage races
    ('classic', 'grand_tour'): 0.0,
}

# ── Race type encoding (same as features.py) ────────────────────────
_RACE_TYPE_ENC = {'classic': 0, 'mini_tour': 1, 'grand_tour': 2}


# ── Weighted feature computation ────────────────────────────────────

def _compute_rider_features_weighted(
    rider_id,
    hist: pd.DataFrame,
    results_df: pd.DataFrame,
    race_slug: str,
    race_type: str,
    race_date,
    race_date_py,
    d365, d180, d90, d30, d14,
    rider_team_info: dict,
    apply_class_weight: bool = False,
    apply_cross_type: bool = False,
) -> dict:
    """Compute features with optional race-class and cross-type weighting.

    When apply_class_weight=True, pts are multiplied by RACE_CLASS_WEIGHT
    before aggregation. This means UWT pts count full, Pro pts are discounted.

    When apply_cross_type=True, pts_same_type_12m includes GT pts (weighted)
    when predicting mini_tour, and vice versa.
    """
    rh = hist[hist['rider_id'] == rider_id].copy()

    # Apply race-class weighting to pts if requested
    if apply_class_weight and 'race_class' in rh.columns:
        rh['pts'] = rh['pts'] * rh['race_class'].map(RACE_CLASS_WEIGHT).fillna(0.5)

    rh_12m = rh[rh['race_date'] >= d365]
    rh_6m = rh[rh['race_date'] >= d180]
    rh_3m = rh[rh['race_date'] >= d90]
    rh_30d = rh[rh['race_date'] >= d30]
    rh_14d = rh[rh['race_date'] >= d14]

    feats = {}

    # ── V2 features ──────────────────────────────────────────────
    for cat in ['gc', 'stage', 'mountain', 'sprint']:
        feats[f'pts_{cat}_12m'] = rh_12m[rh_12m['category'] == cat]['pts'].sum()

    feats['pts_total_12m'] = rh_12m['pts'].sum()
    feats['pts_total_6m'] = rh_6m['pts'].sum()
    feats['pts_total_3m'] = rh_3m['pts'].sum()

    # pts_same_type: with cross-type signal if requested
    if apply_cross_type:
        same_type_pts = 0.0
        for src_type in ['grand_tour', 'mini_tour', 'classic']:
            weight = CROSS_TYPE_WEIGHT.get((src_type, race_type), 0.0)
            if weight > 0:
                same_type_pts += rh_12m[rh_12m['race_type'] == src_type]['pts'].sum() * weight
        feats['pts_same_type_12m'] = same_type_pts
    else:
        feats['pts_same_type_12m'] = rh_12m[rh_12m['race_type'] == race_type]['pts'].sum()

    feats['race_count_12m'] = rh_12m[['race_slug', 'year']].drop_duplicates().shape[0]
    feats['race_count_6m'] = rh_6m[['race_slug', 'year']].drop_duplicates().shape[0]

    gc_12m = rh_12m[(rh_12m['category'] == 'gc') & (rh_12m['position'].notna())]
    n_gc = len(gc_12m)
    feats['top10_rate'] = (gc_12m['position'] <= 10).sum() / n_gc if n_gc > 0 else 0.0
    feats['top5_rate'] = (gc_12m['position'] <= 5).sum() / n_gc if n_gc > 0 else 0.0
    feats['win_rate'] = (gc_12m['position'] == 1).sum() / n_gc if n_gc > 0 else 0.0
    feats['podium_rate'] = (gc_12m['position'] <= 3).sum() / n_gc if n_gc > 0 else 0.0

    if len(rh_12m) > 0:
        race_pts = rh_12m.groupby(['race_slug', 'year'])['pts'].sum()
        feats['best_race_pts_12m'] = race_pts.max()
        feats['median_race_pts_12m'] = race_pts.median()
    else:
        feats['best_race_pts_12m'] = 0.0
        feats['median_race_pts_12m'] = 0.0

    if len(rh) > 0:
        feats['days_since_last'] = (race_date - rh['race_date'].max()).days
    else:
        feats['days_since_last'] = 365

    same_race = rh[rh['race_slug'] == race_slug]
    if len(same_race) > 0:
        sr_pts = same_race.groupby('year')['pts'].sum()
        feats['same_race_best'] = sr_pts.max()
        feats['same_race_mean'] = sr_pts.mean()
        feats['same_race_editions'] = len(sr_pts)
    else:
        feats['same_race_best'] = 0.0
        feats['same_race_mean'] = 0.0
        feats['same_race_editions'] = 0

    feats['pts_total_alltime'] = rh['pts'].sum()
    feats['race_type_enc'] = _RACE_TYPE_ENC.get(race_type, 0)
    feats['pts_trend_3m'] = feats['pts_total_3m'] - (feats['pts_total_6m'] - feats['pts_total_3m'])

    if race_type in ('mini_tour', 'grand_tour'):
        feats['stage_pts_12m'] = rh_12m[rh_12m['category'] == 'stage']['pts'].sum()
        # gc_pts_same_type: with cross-type if requested
        if apply_cross_type:
            gc_cross = 0.0
            for src_type in ['grand_tour', 'mini_tour']:
                weight = CROSS_TYPE_WEIGHT.get((src_type, race_type), 0.0)
                if weight > 0:
                    gc_cross += rh_12m[
                        (rh_12m['category'] == 'gc') & (rh_12m['race_type'] == src_type)
                    ]['pts'].sum() * weight
            feats['gc_pts_same_type'] = gc_cross
        else:
            feats['gc_pts_same_type'] = rh_12m[
                (rh_12m['category'] == 'gc') & (rh_12m['race_type'] == race_type)
            ]['pts'].sum()
    else:
        feats['stage_pts_12m'] = 0.0
        feats['gc_pts_same_type'] = 0.0

    # ── V3: Micro-form ──────────────────────────────────────────
    feats['pts_30d'] = rh_30d['pts'].sum()
    feats['pts_14d'] = rh_14d['pts'].sum()
    feats['race_count_30d'] = rh_30d[['race_slug', 'year']].drop_duplicates().shape[0]

    if len(rh_12m) > 0:
        recent_race_pts = rh_12m.groupby(['race_slug', 'year']).agg(
            pts=('pts', 'sum'), date=('race_date', 'max'),
        ).sort_values('date', ascending=False)
        last_3 = recent_race_pts.head(3)['pts'].values
        feats['last_race_pts'] = last_3[0] if len(last_3) >= 1 else 0.0
        feats['last_3_mean_pts'] = np.mean(last_3) if len(last_3) >= 1 else 0.0
        feats['last_3_max_pts'] = np.max(last_3) if len(last_3) >= 1 else 0.0
    else:
        feats['last_race_pts'] = 0.0
        feats['last_3_mean_pts'] = 0.0
        feats['last_3_max_pts'] = 0.0

    # ── V3: Age & trajectory ────────────────────────────────────
    rider_rows = results_df[results_df['rider_id'] == rider_id]
    rider_row = rider_rows.iloc[0] if len(rider_rows) > 0 else None
    birth_date_val = rider_row['rider_birth_date'] if rider_row is not None else None

    if birth_date_val is not None and not pd.isna(birth_date_val):
        bd = birth_date_val.date() if hasattr(birth_date_val, 'date') else birth_date_val
        age_days = (race_date_py - bd).days
        feats['age'] = age_days / 365.25
        feats['is_young'] = 1 if feats['age'] < 25 else 0
        feats['is_veteran'] = 1 if feats['age'] > 33 else 0
        career_years = max(1, feats['age'] - 18)
        feats['pts_per_career_year'] = feats['pts_total_alltime'] / career_years
    else:
        feats['age'] = 28.0
        feats['is_young'] = 0
        feats['is_veteran'] = 0
        feats['pts_per_career_year'] = 0.0

    # ── V3: Team leader signal ──────────────────────────────────
    ti = rider_team_info.get(rider_id, {})
    feats['team_rank'] = ti.get('team_rank', 4)
    feats['is_leader'] = ti.get('is_leader', 0)
    feats['team_size'] = ti.get('team_size', 7)
    feats['pct_of_team'] = ti.get('pct_of_team', 0)
    feats['team_total_pts'] = ti.get('team_total_pts', 0)

    # ── V4: Rider profile specialization ────────────────────────
    stages = rh_12m[
        (rh_12m['category'] == 'stage') &
        (rh_12m['parcours_type'].notna()) &
        (rh_12m['position'].notna())
    ] if 'parcours_type' in rh_12m.columns else pd.DataFrame()

    total_stage_pts = stages['pts'].sum() if len(stages) > 0 else 0
    if total_stage_pts > 0:
        flat_pts = stages[stages['parcours_type'].isin(['p1', 'p2'])]['pts'].sum()
        mtn_pts = stages[stages['parcours_type'].isin(['p4', 'p5'])]['pts'].sum()
        p3_pts = stages[stages['parcours_type'] == 'p3']['pts'].sum()
        feats['pct_pts_p1p2'] = flat_pts / total_stage_pts
        feats['pct_pts_p4p5'] = mtn_pts / total_stage_pts
        feats['pct_pts_p3'] = p3_pts / total_stage_pts
    else:
        feats['pct_pts_p1p2'] = 0.0
        feats['pct_pts_p4p5'] = 0.0
        feats['pct_pts_p3'] = 0.0

    itt_results = rh_12m[
        (rh_12m.get('is_itt', pd.Series(dtype=bool)) == True) &
        (rh_12m['position'].notna())
    ] if 'is_itt' in rh_12m.columns else pd.DataFrame()
    n_itt = len(itt_results)
    feats['itt_top10_rate'] = (itt_results['position'] <= 10).sum() / n_itt if n_itt > 0 else 0.0

    feats['stage_wins_flat'] = len(stages[
        (stages['parcours_type'].isin(['p1', 'p2'])) & (stages['position'] == 1)
    ]) if len(stages) > 0 else 0
    feats['stage_wins_mountain'] = len(stages[
        (stages['parcours_type'].isin(['p4', 'p5'])) & (stages['position'] == 1)
    ]) if len(stages) > 0 else 0

    feats.setdefault('target_flat_pct', 0.0)
    feats.setdefault('target_mountain_pct', 0.0)
    feats.setdefault('target_itt_pct', 0.0)

    return feats


# ── Data extraction ──────────────────────────────────────────────────

def extract_features_weighted(
    results_df: pd.DataFrame,
    startlists_df: pd.DataFrame,
    target_year: int,
    apply_class_weight: bool = False,
    apply_cross_type: bool = False,
) -> pd.DataFrame:
    """Extract features for a single year with optional weighting."""
    races = startlists_df.drop_duplicates(subset=['race_slug', 'year']).merge(
        results_df[['race_slug', 'year', 'race_type', 'race_name', 'race_date']]
            .drop_duplicates(subset=['race_slug', 'year']),
        on=['race_slug', 'year'],
        how='inner',
    )
    races = races[races['year'] == target_year]
    # Only stage races (no classics for ML)
    races = races[races['race_type'].isin(['mini_tour', 'grand_tour'])]

    all_rows = []
    processed = 0

    for _, race in races.iterrows():
        race_slug = race['race_slug']
        race_year = race['year']
        race_type = race['race_type']
        race_date = race['race_date']
        if pd.isna(race_date):
            continue
        race_date_py = race_date.date() if hasattr(race_date, 'date') else race_date

        sl = startlists_df[
            (startlists_df['race_slug'] == race_slug) &
            (startlists_df['year'] == race_year)
        ]
        sl_riders = sl['rider_id'].values

        hist = results_df[
            (results_df['rider_id'].isin(sl_riders)) &
            (results_df['race_date'] < race_date)
        ]

        actual = results_df[
            (results_df['race_slug'] == race_slug) &
            (results_df['year'] == race_year)
        ]

        d365 = race_date - pd.Timedelta(days=365)
        d180 = race_date - pd.Timedelta(days=180)
        d90 = race_date - pd.Timedelta(days=90)
        d30 = race_date - pd.Timedelta(days=30)
        d14 = race_date - pd.Timedelta(days=14)

        rider_team_info = _compute_team_info(sl, sl_riders, hist, d365)
        rp = compute_race_profile(results_df, race_slug, race_year)

        for rider_id in sl_riders:
            feats = _compute_rider_features_weighted(
                rider_id=rider_id, hist=hist, results_df=results_df,
                race_slug=race_slug, race_type=race_type,
                race_date=race_date, race_date_py=race_date_py,
                d365=d365, d180=d180, d90=d90, d30=d30, d14=d14,
                rider_team_info=rider_team_info,
                apply_class_weight=apply_class_weight,
                apply_cross_type=apply_cross_type,
            )
            feats['target_flat_pct'] = rp.get('target_flat_pct', 0.0)
            feats['target_mountain_pct'] = rp.get('target_mountain_pct', 0.0)
            feats['target_itt_pct'] = rp.get('target_itt_pct', 0.0)

            rider_actual = actual[actual['rider_id'] == rider_id]
            feats['actual_pts'] = rider_actual['pts'].sum()
            feats['rider_id'] = rider_id
            feats['race_slug'] = race_slug
            feats['race_year'] = race_year
            feats['race_type'] = race_type
            feats['race_date'] = race_date_py

            all_rows.append(feats)

        processed += 1
        if processed % 10 == 0:
            print(f"    [{processed}/{len(races)}]...")

    df = pd.DataFrame(all_rows)
    print(f"    {len(df):,} rows ({target_year})")
    return df


# ── Models ───────────────────────────────────────────────────────────

RF_PARAMS = {
    'n_estimators': 500,
    'max_depth': 14,
    'min_samples_leaf': 5,
    'random_state': 42,
    'n_jobs': -1,
}

XGB_PARAMS = {
    'n_estimators': 500,
    'max_depth': 6,
    'learning_rate': 0.05,
    'subsample': 0.8,
    'colsample_bytree': 0.8,
    'min_child_weight': 5,
    'random_state': 42,
    'n_jobs': -1,
}

GB_PARAMS = {
    'n_estimators': 500,
    'max_depth': 6,
    'learning_rate': 0.05,
    'subsample': 0.8,
    'min_samples_leaf': 5,
    'random_state': 42,
}


def make_model(model_type: str):
    """Create a model instance."""
    if model_type == 'rf':
        return RandomForestRegressor(**RF_PARAMS)
    elif model_type == 'xgb':
        if HAS_XGBOOST:
            return XGBRegressor(**XGB_PARAMS)
        else:
            return GradientBoostingRegressor(**GB_PARAMS)
    elif model_type == 'gb':
        return GradientBoostingRegressor(**GB_PARAMS)
    else:
        raise ValueError(f"Unknown model type: {model_type}")


# ── Evaluation ───────────────────────────────────────────────────────

def evaluate(
    model_type: str,
    feature_cols: list,
    train_df: pd.DataFrame,
    test_df: pd.DataFrame,
) -> dict:
    """Train + evaluate, returning per-race-type Spearman rho."""
    results = {}

    for race_type in ['mini_tour', 'grand_tour']:
        train_rt = train_df[train_df['race_type'] == race_type]
        test_rt = test_df[test_df['race_type'] == race_type]

        if len(train_rt) == 0 or len(test_rt) == 0:
            continue

        X_train = train_rt[feature_cols].fillna(0).values
        y_train = train_rt['actual_pts'].values
        X_test = test_rt[feature_cols].fillna(0).values

        model = make_model(model_type)
        model.fit(X_train, y_train)
        preds = model.predict(X_test)

        test_rt = test_rt.copy()
        test_rt['predicted'] = preds

        rhos = []
        for (slug, year), g in test_rt.groupby(['race_slug', 'race_year']):
            if len(g) < 3 or g['actual_pts'].std() == 0:
                continue
            rho, _ = spearmanr(g['predicted'].values, g['actual_pts'].values)
            if not np.isnan(rho):
                rhos.append(rho)

        mean_rho = np.mean(rhos) if rhos else 0.0
        results[race_type] = {'mean_rho': mean_rho, 'n_races': len(rhos)}

        # Feature importances (top 5)
        if hasattr(model, 'feature_importances_'):
            imp = sorted(zip(feature_cols, model.feature_importances_), key=lambda x: -x[1])
            results[race_type]['top_features'] = imp[:5]

    return results


# ── Vingegaard vs Almeida case study ─────────────────────────────────

def case_study(train_df, test_df, feature_cols, model_type, config_name):
    """Quick Vingegaard vs Almeida comparison."""
    VING_ID = '352cb964-42b0-4ac1-b278-1d5c18c6d62c'
    ALM_ID = '46cb6c3f-2a9b-40ba-a702-4f150a7680f2'

    train_mt = train_df[train_df['race_type'] == 'mini_tour']
    if len(train_mt) == 0:
        return

    model = make_model(model_type)
    model.fit(train_mt[feature_cols].fillna(0).values, train_mt['actual_pts'].values)

    for name, rid in [("Vingegaard", VING_ID), ("Almeida", ALM_ID)]:
        rows = test_df[(test_df['rider_id'] == rid) & (test_df['race_type'] == 'mini_tour')]
        rows = rows.sort_values('race_date', ascending=False)
        if len(rows) > 0:
            row = rows.iloc[0]
            X = row[feature_cols].fillna(0).values.reshape(1, -1)
            pred = model.predict(X)[0]
            actual = row['actual_pts']
            slug = row['race_slug']
            # Show key feature values
            same_type = row.get('pts_same_type_12m', '?')
            total = row.get('pts_total_12m', '?')
            print(f"    {name:15s} pred={pred:>7.1f}  actual={actual:>7.1f}  "
                  f"same_type={same_type:>7.0f}  total={total:>7.0f}  ({slug})")
        else:
            print(f"    {name:15s} — no test data")


# ── Main ─────────────────────────────────────────────────────────────

def main():
    db_url = os.environ.get(
        'DATABASE_URL',
        'postgresql://cycling:cycling@localhost:5432/cycling_analyzer',
    )

    print("=" * 70)
    print("  ML Research v7: Weighted Features + Model Comparison")
    print("=" * 70)

    print("\n[1/5] Loading data...")
    results_df, startlists_df = load_data_fast(db_url)

    # ── Extract features for each config ──────────────────────────
    # We need separate extractions for different weighting schemes

    configs = {
        # config_name: (class_weight, cross_type, model_type)
        'v4b_rf':       (False, False, 'rf'),
        'v7a_rf':       (True,  False, 'rf'),    # class weight only
        'v7b_rf':       (False, True,  'rf'),    # cross-type only
        'v7c_rf':       (True,  True,  'rf'),    # both
        'v7d_xgb':      (False, False, 'xgb'),   # XGBoost baseline
        'v7e_xgb':      (True,  True,  'xgb'),   # XGBoost + both
    }

    # Group by weighting scheme to avoid redundant extraction
    weight_schemes = {}
    for name, (cw, ct, _) in configs.items():
        key = (cw, ct)
        if key not in weight_schemes:
            weight_schemes[key] = []
        weight_schemes[key].append(name)

    all_train = {}
    all_test = {}

    print("\n[2/5] Extracting features per weighting scheme...")
    for (cw, ct), config_names in weight_schemes.items():
        label = f"class_weight={cw}, cross_type={ct}"
        print(f"\n  --- {label} (used by: {', '.join(config_names)}) ---")

        train_dfs = []
        for yr in [2022, 2023, 2024]:
            df = extract_features_weighted(
                results_df, startlists_df, yr,
                apply_class_weight=cw, apply_cross_type=ct,
            )
            if len(df) > 0:
                train_dfs.append(df)

        train = pd.concat(train_dfs, ignore_index=True) if train_dfs else pd.DataFrame()
        test = extract_features_weighted(
            results_df, startlists_df, 2025,
            apply_class_weight=cw, apply_cross_type=ct,
        )

        for name in config_names:
            all_train[name] = train
            all_test[name] = test

    # ── Evaluate ──────────────────────────────────────────────────
    print("\n[3/5] Evaluating configs...")
    print("=" * 70)

    all_results = {}
    for config_name, (_, _, model_type) in configs.items():
        train = all_train[config_name]
        test = all_test[config_name]

        if len(train) == 0 or len(test) == 0:
            print(f"\n  {config_name}: NO DATA")
            continue

        results = evaluate(model_type, list(V4B_FEATURE_COLS), train, test)
        all_results[config_name] = results

        mt = results.get('mini_tour', {})
        gt = results.get('grand_tour', {})
        print(f"\n  {config_name:15s}  "
              f"mini_tour={mt.get('mean_rho', 0):.4f} ({mt.get('n_races', 0)} races)  "
              f"grand_tour={gt.get('mean_rho', 0):.4f} ({gt.get('n_races', 0)} races)")

        for rt_name in ['mini_tour', 'grand_tour']:
            if rt_name in results and 'top_features' in results[rt_name]:
                top = results[rt_name]['top_features'][:3]
                feats_str = ', '.join(f"{f}={i:.3f}" for f, i in top)
                print(f"    {rt_name} top3: {feats_str}")

    # ── Summary ───────────────────────────────────────────────────
    print("\n\n" + "=" * 70)
    print("  SUMMARY — Spearman rho")
    print("=" * 70)
    print(f"\n  {'Config':<15} {'Model':>6}  {'ClassWt':>7}  {'CrossT':>6}  {'Mini':>8}  {'Grand':>8}")
    print(f"  {'-'*15} {'-'*6}  {'-'*7}  {'-'*6}  {'-'*8}  {'-'*8}")

    baseline_mt = all_results.get('v4b_rf', {}).get('mini_tour', {}).get('mean_rho', 0)
    baseline_gt = all_results.get('v4b_rf', {}).get('grand_tour', {}).get('mean_rho', 0)

    for config_name, (cw, ct, mt) in configs.items():
        r = all_results.get(config_name, {})
        mini = r.get('mini_tour', {}).get('mean_rho', 0)
        grand = r.get('grand_tour', {}).get('mean_rho', 0)
        print(f"  {config_name:<15} {mt:>6}  {str(cw):>7}  {str(ct):>6}  {mini:>8.4f}  {grand:>8.4f}")

    print(f"\n  Deltas vs v4b_rf baseline (mini/grand):")
    for config_name in configs:
        if config_name == 'v4b_rf':
            continue
        r = all_results.get(config_name, {})
        mt = r.get('mini_tour', {}).get('mean_rho', 0)
        gt = r.get('grand_tour', {}).get('mean_rho', 0)
        d_mt = mt - baseline_mt
        d_gt = gt - baseline_gt
        marker = " ***" if d_mt > 0.005 or d_gt > 0.005 else ""
        print(f"    {config_name:<15} {d_mt:+.4f} / {d_gt:+.4f}{marker}")

    # ── Case study ────────────────────────────────────────────────
    print("\n\n[4/5] Case study: Vingegaard vs Almeida (mini_tour)")
    print("=" * 70)
    for config_name, (_, _, model_type) in configs.items():
        train = all_train[config_name]
        test = all_test[config_name]
        print(f"\n  {config_name}:")
        case_study(train, test, list(V4B_FEATURE_COLS), model_type, config_name)

    print("\n[5/5] Done.")


if __name__ == '__main__':
    main()
