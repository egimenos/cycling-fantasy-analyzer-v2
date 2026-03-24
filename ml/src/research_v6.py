"""
ML Scoring Research — v6: Race Quality & Normalized Features

Builds on v4b (49 features) by adding features that address observed weaknesses:

Problem: Model scores Vingegaard (236) ≈ Almeida (230) for Catalunya 2026,
despite Vingegaard being clearly the superior rider (won Vuelta 2025, 2nd Tour).

Root causes identified:
1. pts_same_type_12m only counts mini_tour pts → misses GT signal
2. No normalization by race count → volume beats quality
3. No race-class weighting → Pro race pts = UWT race pts
4. birth_date is NULL for all riders (bug) → age features are dead

New features (v6):
- pts_gt_12m:          Grand tour points in last 12m (GT success predicts mini tour)
- pts_stage_race_12m:  GT + mini tour combined points
- pts_per_race_12m:    Average pts per race (quality over quantity)
- pts_uwt_12m:         Points scored in UWT races only
- pct_pts_uwt:         Fraction of points from UWT races

Configs tested:
- v4b: baseline (49 features)
- v6a: v4b + all 5 new features (54 features)
- v6b: v4b + pts_per_race_12m + pts_gt_12m only (51 features, minimal)
- v6c: v6a but replace pts_same_type_12m with pts_stage_race_12m (54 features)

Usage:
    cd ml && python -m src.research_v6
"""

import os
from collections import defaultdict
from datetime import date

import numpy as np
import pandas as pd
from scipy.stats import spearmanr
from sklearn.ensemble import RandomForestRegressor

from .data import load_data, get_sprint_count_per_stage
from .features import (
    FEATURE_COLS as V4B_FEATURE_COLS,
    _compute_rider_features,
    _compute_team_info,
    compute_race_profile,
)
from .points import (
    STAGE_POINTS, GC_CLASSIC, GC_MINI_TOUR, GC_GRAND_TOUR,
    FINAL_CLASS_MINI, FINAL_CLASS_GT, GC_DAILY,
    MOUNTAIN_PASS_HC, MOUNTAIN_PASS_CAT1, MOUNTAIN_PASS_CAT2,
    MOUNTAIN_PASS_CAT3, MOUNTAIN_PASS_CAT4,
    SPRINT_INTERMEDIATE_SINGLE, SPRINT_INTERMEDIATE_MULTI,
    REGULARIDAD_DAILY,
)

# ── v6 New Features ──────────────────────────────────────────────────

V6_NEW_FEATURES = [
    'pts_gt_12m',           # Grand tour points in last 12 months
    'pts_stage_race_12m',   # GT + mini tour pts combined
    'pts_per_race_12m',     # Average pts per race (quality metric)
    'pts_uwt_12m',          # Points in UWT-class races only
    'pct_pts_uwt',          # Fraction of total pts from UWT races
]

# Feature set configs
V6A_FEATURES = list(V4B_FEATURE_COLS) + V6_NEW_FEATURES           # 54 features
V6B_FEATURES = list(V4B_FEATURE_COLS) + [                         # 51 features
    'pts_per_race_12m', 'pts_gt_12m',
]
V6C_FEATURES = [                                                   # 54 features
    f for f in V6A_FEATURES if f != 'pts_same_type_12m'
] + ['pts_stage_race_12m'] if 'pts_stage_race_12m' not in V6A_FEATURES else [
    f for f in V6A_FEATURES if f != 'pts_same_type_12m'
]

# v6c: same as v6a but drop pts_same_type_12m (replaced by pts_stage_race_12m)
V6C_FEATURES = [f for f in V6A_FEATURES if f != 'pts_same_type_12m']

CONFIGS = {
    'v4b': list(V4B_FEATURE_COLS),
    'v6a': V6A_FEATURES,
    'v6b': V6B_FEATURES,
    'v6c': V6C_FEATURES,
}


# ── Vectorized points computation (replaces slow apply) ─────────────

def _build_lookup(table: dict) -> np.ndarray:
    """Convert a {position: pts} dict to a numpy array for fast lookup."""
    if not table:
        return np.zeros(1)
    max_pos = max(table.keys())
    arr = np.zeros(max_pos + 1)
    for pos, pts in table.items():
        arr[pos] = pts
    return arr

# Pre-build lookup arrays
_STAGE_ARR = _build_lookup(STAGE_POINTS)
_GC_CLASSIC_ARR = _build_lookup(GC_CLASSIC)
_GC_MINI_ARR = _build_lookup(GC_MINI_TOUR)
_GC_GT_ARR = _build_lookup(GC_GRAND_TOUR)
_FINAL_MINI_ARR = _build_lookup(FINAL_CLASS_MINI)
_FINAL_GT_ARR = _build_lookup(FINAL_CLASS_GT)
_GC_DAILY_ARR = _build_lookup(GC_DAILY)
_MPASS_HC_ARR = _build_lookup(MOUNTAIN_PASS_HC)
_MPASS_1_ARR = _build_lookup(MOUNTAIN_PASS_CAT1)
_MPASS_2_ARR = _build_lookup(MOUNTAIN_PASS_CAT2)
_MPASS_3_ARR = _build_lookup(MOUNTAIN_PASS_CAT3)
_MPASS_4_ARR = _build_lookup(MOUNTAIN_PASS_CAT4)
_SPRINT_SINGLE_ARR = _build_lookup(SPRINT_INTERMEDIATE_SINGLE)
_SPRINT_MULTI_ARR = _build_lookup(SPRINT_INTERMEDIATE_MULTI)
_REG_DAILY_ARR = _build_lookup(REGULARIDAD_DAILY)


def _np_lookup(arr: np.ndarray, positions: np.ndarray) -> np.ndarray:
    """Vectorized position -> points lookup."""
    valid = (positions >= 1) & (positions < len(arr))
    result = np.zeros(len(positions))
    idx = positions[valid].astype(int)
    result[valid] = arr[idx]
    return result


def compute_pts_vectorized(df: pd.DataFrame) -> np.ndarray:
    """Compute fantasy points for entire DataFrame at once (~100x faster than apply)."""
    n = len(df)
    pts = np.zeros(n)

    pos = df['position'].values.copy()
    pos = np.where(np.isnan(pos.astype(float)), 0, pos).astype(int)

    cat = df['category'].values
    rt = df['race_type'].values

    # Stage
    mask = cat == 'stage'
    if mask.any():
        pts[mask] = _np_lookup(_STAGE_ARR, pos[mask])

    # GC
    for race_type, arr in [('classic', _GC_CLASSIC_ARR), ('mini_tour', _GC_MINI_ARR), ('grand_tour', _GC_GT_ARR)]:
        mask = (cat == 'gc') & (rt == race_type)
        if mask.any():
            pts[mask] = _np_lookup(arr, pos[mask])

    # Mountain/Sprint finals
    for race_type, arr in [('mini_tour', _FINAL_MINI_ARR), ('grand_tour', _FINAL_GT_ARR)]:
        mask = ((cat == 'mountain') | (cat == 'sprint')) & (rt == race_type)
        if mask.any():
            pts[mask] = _np_lookup(arr, pos[mask])

    # GC daily
    mask = cat == 'gc_daily'
    if mask.any():
        pts[mask] = _np_lookup(_GC_DAILY_ARR, pos[mask])

    # Mountain pass (by climb_category)
    if 'climb_category' in df.columns:
        cc = df['climb_category'].values
        for cc_val, arr in [('HC', _MPASS_HC_ARR), ('1', _MPASS_1_ARR), ('2', _MPASS_2_ARR),
                            ('3', _MPASS_3_ARR), ('4', _MPASS_4_ARR)]:
            mask = (cat == 'mountain_pass') & (cc == cc_val)
            if mask.any():
                pts[mask] = _np_lookup(arr, pos[mask])

    # Sprint intermediate
    if 'sprint_count' in df.columns:
        sc = df['sprint_count'].values
        mask_single = (cat == 'sprint_intermediate') & (sc <= 1)
        mask_multi = (cat == 'sprint_intermediate') & (sc > 1)
        if mask_single.any():
            pts[mask_single] = _np_lookup(_SPRINT_SINGLE_ARR, pos[mask_single])
        if mask_multi.any():
            pts[mask_multi] = _np_lookup(_SPRINT_MULTI_ARR, pos[mask_multi])
    else:
        mask = cat == 'sprint_intermediate'
        if mask.any():
            pts[mask] = _np_lookup(_SPRINT_SINGLE_ARR, pos[mask])

    # Regularidad daily
    mask = cat == 'regularidad_daily'
    if mask.any():
        pts[mask] = _np_lookup(_REG_DAILY_ARR, pos[mask])

    return pts


def load_data_fast(db_url: str):
    """Load data with vectorized points computation (much faster than apply)."""
    import psycopg2

    conn = psycopg2.connect(db_url)

    print("  Loading results from DB...")
    results_df = pd.read_sql("""
        SELECT rr.rider_id, rr.race_slug, rr.race_name, rr.race_type, rr.race_class,
               rr.year, rr.category, rr.position, rr.stage_number, rr.dnf,
               rr.race_date, rr.parcours_type, rr.is_itt, rr.is_ttt, rr.profile_score,
               rr.climb_category, rr.sprint_name,
               r.full_name as rider_name, r.birth_date as rider_birth_date,
               r.current_team as rider_team
        FROM race_results rr
        JOIN riders r ON rr.rider_id = r.id
        WHERE rr.race_date IS NOT NULL
        ORDER BY rr.race_date
    """, conn)

    startlists_df = pd.read_sql("""
        SELECT se.race_slug, se.year, se.rider_id, se.team_name
        FROM startlist_entries se
    """, conn)

    conn.close()

    results_df['race_date'] = pd.to_datetime(results_df['race_date'])

    # Sprint counts per stage
    sprint_rows = results_df[results_df['category'] == 'sprint_intermediate']
    if not sprint_rows.empty:
        sc = sprint_rows.groupby(['race_slug', 'year', 'stage_number'])['sprint_name'].nunique()
        sc_df = sc.reset_index().rename(columns={'sprint_name': 'sprint_count'})
        results_df = results_df.merge(sc_df, on=['race_slug', 'year', 'stage_number'], how='left')
        results_df['sprint_count'] = results_df['sprint_count'].fillna(1).astype(int)
    else:
        results_df['sprint_count'] = 1

    # Vectorized points computation
    print("  Computing points (vectorized)...")
    results_df['pts'] = compute_pts_vectorized(results_df)

    print(f"  Loaded {len(results_df):,} results, {len(startlists_df):,} startlist entries")
    return results_df, startlists_df


def compute_v6_features(
    rider_id: str,
    hist_12m: pd.DataFrame,
    race_count_12m: int,
) -> dict:
    """Compute the 5 new v6 features for a single rider.

    Args:
        rider_id: Rider ID.
        hist_12m: Historical results for this rider in last 12 months.
        race_count_12m: Number of distinct races in last 12 months.

    Returns:
        Dict with the 5 new feature values.
    """
    rh = hist_12m[hist_12m['rider_id'] == rider_id]

    # Grand tour points
    gt_pts = rh[rh['race_type'] == 'grand_tour']['pts'].sum()

    # Stage race (GT + mini tour) combined
    stage_race_pts = rh[rh['race_type'].isin(['grand_tour', 'mini_tour'])]['pts'].sum()

    # Average pts per race
    pts_total = rh['pts'].sum()
    pts_per_race = pts_total / race_count_12m if race_count_12m > 0 else 0.0

    # UWT points
    uwt_pts = rh[rh['race_class'] == 'UWT']['pts'].sum()
    pct_uwt = uwt_pts / pts_total if pts_total > 0 else 0.0

    return {
        'pts_gt_12m': gt_pts,
        'pts_stage_race_12m': stage_race_pts,
        'pts_per_race_12m': pts_per_race,
        'pts_uwt_12m': uwt_pts,
        'pct_pts_uwt': pct_uwt,
    }


# ── Data extraction ──────────────────────────────────────────────────

def extract_features_v6(
    results_df: pd.DataFrame,
    startlists_df: pd.DataFrame,
    target_year: int | None = None,
    include_target: bool = True,
) -> pd.DataFrame:
    """Extract v4b + v6 features for races.

    Args:
        results_df: Full results with pre-computed pts column.
        startlists_df: Startlist entries.
        target_year: If set, only extract for this year (faster for testing).
        include_target: If True, include actual_pts column.

    Returns:
        DataFrame with all v6a features + metadata.
    """
    races = startlists_df.drop_duplicates(subset=['race_slug', 'year']).merge(
        results_df[['race_slug', 'year', 'race_type', 'race_name', 'race_date']]
            .drop_duplicates(subset=['race_slug', 'year']),
        on=['race_slug', 'year'],
        how='inner',
    )

    if target_year:
        races = races[races['year'] == target_year]

    print(f"  Races to process: {len(races)}")

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
        ] if include_target else None

        d365 = race_date - pd.Timedelta(days=365)
        d180 = race_date - pd.Timedelta(days=180)
        d90 = race_date - pd.Timedelta(days=90)
        d30 = race_date - pd.Timedelta(days=30)
        d14 = race_date - pd.Timedelta(days=14)

        rider_team_info = _compute_team_info(sl, sl_riders, hist, d365)
        rp = compute_race_profile(results_df, race_slug, race_year)

        # Pre-filter 12m history for v6 features
        hist_12m = hist[hist['race_date'] >= d365]

        for rider_id in sl_riders:
            # v4b features
            feats = _compute_rider_features(
                rider_id=rider_id, hist=hist, results_df=results_df,
                race_slug=race_slug, race_type=race_type,
                race_date=race_date, race_date_py=race_date_py,
                d365=d365, d180=d180, d90=d90, d30=d30, d14=d14,
                rider_team_info=rider_team_info,
            )
            feats['target_flat_pct'] = rp.get('target_flat_pct', 0.0)
            feats['target_mountain_pct'] = rp.get('target_mountain_pct', 0.0)
            feats['target_itt_pct'] = rp.get('target_itt_pct', 0.0)

            # v6 new features
            v6_feats = compute_v6_features(
                rider_id, hist_12m, feats['race_count_12m'],
            )
            feats.update(v6_feats)

            # Target + metadata
            if include_target and actual is not None:
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
            print(f"    [{processed}/{len(races)}] races...")

    df = pd.DataFrame(all_rows)
    print(f"  Feature matrix: {df.shape[0]:,} rows x {df.shape[1]} cols")
    return df


# ── Evaluation ───────────────────────────────────────────────────────

RF_PARAMS = {
    'n_estimators': 500,
    'max_depth': 14,
    'min_samples_leaf': 5,
    'random_state': 42,
    'n_jobs': -1,
}


def evaluate_config(
    config_name: str,
    feature_cols: list,
    train_df: pd.DataFrame,
    test_df: pd.DataFrame,
) -> dict:
    """Train + evaluate a feature config using time-split cross-validation.

    Trains on all data before test_year, evaluates on test_year races.
    Reports per-race-type Spearman rho.
    """
    results = {}

    for race_type in ['mini_tour', 'grand_tour']:
        train_rt = train_df[train_df['race_type'] == race_type]
        test_rt = test_df[test_df['race_type'] == race_type]

        if len(train_rt) == 0 or len(test_rt) == 0:
            continue

        X_train = train_rt[feature_cols].fillna(0).values
        y_train = train_rt['actual_pts'].values
        X_test = test_rt[feature_cols].fillna(0).values

        model = RandomForestRegressor(**RF_PARAMS)
        model.fit(X_train, y_train)
        preds = model.predict(X_test)

        test_rt = test_rt.copy()
        test_rt['predicted'] = preds

        rhos = []
        per_race = []
        for (slug, year), g in test_rt.groupby(['race_slug', 'race_year']):
            if len(g) < 3 or g['actual_pts'].std() == 0:
                continue
            rho, _ = spearmanr(g['predicted'].values, g['actual_pts'].values)
            if not np.isnan(rho):
                rhos.append(rho)
                per_race.append({'race': slug, 'year': year, 'rho': rho, 'n': len(g)})

        mean_rho = np.mean(rhos) if rhos else 0.0
        results[race_type] = {
            'mean_rho': mean_rho,
            'n_races': len(rhos),
            'per_race': per_race,
        }

        # Feature importances (top 10)
        imp = sorted(zip(feature_cols, model.feature_importances_), key=lambda x: -x[1])
        results[race_type]['top_features'] = imp[:10]

    return results


# ── Case study: Vingegaard vs Almeida ────────────────────────────────

def case_study_vingegaard_almeida(
    dataset: pd.DataFrame,
    feature_cols: list,
    config_name: str,
    train_df: pd.DataFrame,
):
    """Show predicted scores for Vingegaard vs Almeida under each config.

    Uses the latest Catalunya data or simulates if not available.
    """
    VING_ID = '352cb964-42b0-4ac1-b278-1d5c18c6d62c'
    ALM_ID = '46cb6c3f-2a9b-40ba-a702-4f150a7680f2'

    # Train a mini_tour model with this config
    train_mt = train_df[train_df['race_type'] == 'mini_tour']
    if len(train_mt) == 0:
        return

    model = RandomForestRegressor(**RF_PARAMS)
    X_train = train_mt[feature_cols].fillna(0).values
    y_train = train_mt['actual_pts'].values
    model.fit(X_train, y_train)

    # Find their rows in the dataset (any recent mini_tour)
    for name, rid in [("Vingegaard", VING_ID), ("Almeida", ALM_ID)]:
        rider_rows = dataset[
            (dataset['rider_id'] == rid) &
            (dataset['race_type'] == 'mini_tour')
        ].sort_values('race_date', ascending=False)

        if len(rider_rows) > 0:
            row = rider_rows.iloc[0]
            X = pd.DataFrame([row])[feature_cols].fillna(0).values
            pred = model.predict(X)[0]
            race = row.get('race_slug', '?')
            actual = row.get('actual_pts', '?')
            print(f"    {name:15s} pred={pred:>7.1f}  actual={actual:>7.1f}  (from {race})")

            # Show v6 features if present
            for f in V6_NEW_FEATURES:
                if f in row.index:
                    print(f"      {f}: {row[f]:.1f}")
        else:
            print(f"    {name:15s} — no mini_tour data in dataset")


# ── Main ─────────────────────────────────────────────────────────────

def main():
    db_url = os.environ.get(
        'DATABASE_URL',
        'postgresql://cycling:cycling@localhost:5432/cycling_analyzer',
    )

    print("=" * 70)
    print("  ML Research v6: Race Quality & Normalized Features")
    print("=" * 70)

    # Load data (vectorized — much faster than load_data which uses apply())
    print("\n[1/4] Loading data (vectorized)...")
    results_df, startlists_df = load_data_fast(db_url)

    # Synthesize startlists fallback
    if len(startlists_df) == 0:
        sl = results_df[['race_slug', 'year', 'rider_id']].drop_duplicates()
        sl = sl.copy()
        sl['team_name'] = results_df.groupby('rider_id')['rider_team'].first().reindex(
            sl['rider_id']
        ).values
        sl['team_name'] = sl['team_name'].fillna('unknown')
        startlists_df = sl
        print(f"  Synthesized {len(sl):,} startlist entries from results")

    # Extract features (all years, with v6 additions)
    # Extract train (2022-2024) and test (2025) separately
    # This is much faster than extracting ALL years
    print("\n[2/4] Extracting features...")

    print("\n  --- Train set (2022-2024) ---")
    train_dfs = []
    for yr in [2022, 2023, 2024]:
        print(f"\n  Year {yr}:")
        yr_df = extract_features_v6(results_df, startlists_df, target_year=yr, include_target=True)
        if len(yr_df) > 0:
            train_dfs.append(yr_df)
    train_df = pd.concat(train_dfs, ignore_index=True) if train_dfs else pd.DataFrame()

    print(f"\n  --- Test set (2025) ---")
    test_df = extract_features_v6(results_df, startlists_df, target_year=2025, include_target=True)

    full_dataset = pd.concat([train_df, test_df], ignore_index=True) if len(train_df) > 0 else test_df

    print(f"\n  Train: {len(train_df):,} rows (2022-2024)")
    print(f"  Test:  {len(test_df):,} rows (2025)")

    # Quick sanity check on v6 features
    print("\n  v6 feature stats (test set):")
    for f in V6_NEW_FEATURES:
        if f in test_df.columns:
            vals = test_df[f].fillna(0)
            print(f"    {f:25s} mean={vals.mean():>8.1f}  std={vals.std():>8.1f}  "
                  f"min={vals.min():>8.1f}  max={vals.max():>8.1f}")

    # Evaluate all configs
    print("\n[3/4] Evaluating configs...")
    print("=" * 70)

    all_results = {}
    for config_name, feature_cols in CONFIGS.items():
        print(f"\n  --- {config_name} ({len(feature_cols)} features) ---")
        results = evaluate_config(config_name, feature_cols, train_df, test_df)
        all_results[config_name] = results

        for rt in ['mini_tour', 'grand_tour']:
            if rt in results:
                r = results[rt]
                print(f"    {rt:12s}  rho={r['mean_rho']:.4f}  ({r['n_races']} races)")

                if config_name != 'v4b':
                    # Show top features
                    print(f"    Top 5 features:")
                    for feat, imp in r['top_features'][:5]:
                        print(f"      {feat:35s} {imp:.4f}")

    # Summary comparison
    print("\n\n" + "=" * 70)
    print("  SUMMARY — Spearman rho comparison")
    print("=" * 70)
    print(f"\n  {'Config':<10} {'Features':>8}  {'Mini Tour':>12}  {'Grand Tour':>12}")
    print(f"  {'-'*10} {'-'*8}  {'-'*12}  {'-'*12}")

    for config_name, feature_cols in CONFIGS.items():
        r = all_results[config_name]
        mt = r.get('mini_tour', {}).get('mean_rho', 0)
        gt = r.get('grand_tour', {}).get('mean_rho', 0)
        n_feats = len(feature_cols)
        print(f"  {config_name:<10} {n_feats:>8}  {mt:>12.4f}  {gt:>12.4f}")

    # Deltas vs baseline
    baseline_mt = all_results['v4b'].get('mini_tour', {}).get('mean_rho', 0)
    baseline_gt = all_results['v4b'].get('grand_tour', {}).get('mean_rho', 0)
    print(f"\n  Deltas vs v4b baseline:")
    for config_name in ['v6a', 'v6b', 'v6c']:
        r = all_results[config_name]
        mt = r.get('mini_tour', {}).get('mean_rho', 0)
        gt = r.get('grand_tour', {}).get('mean_rho', 0)
        d_mt = mt - baseline_mt
        d_gt = gt - baseline_gt
        print(f"    {config_name}: mini_tour {d_mt:+.4f}, grand_tour {d_gt:+.4f}")

    # Case study
    print("\n\n[4/4] Case study: Vingegaard vs Almeida")
    print("=" * 70)
    for config_name, feature_cols in CONFIGS.items():
        print(f"\n  {config_name}:")
        case_study_vingegaard_almeida(full_dataset, feature_cols, config_name, train_df)

    # Save results
    results_dir = os.path.join(os.path.dirname(__file__), '..', 'results')
    os.makedirs(results_dir, exist_ok=True)

    output_file = os.path.join(results_dir, f'research_v6_{date.today()}.txt')
    print(f"\n  Results date: {date.today()}")
    print(f"  (Full output in terminal)")


if __name__ == '__main__':
    main()
