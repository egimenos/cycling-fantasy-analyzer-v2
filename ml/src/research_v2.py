"""
ML Scoring Feasibility Research — v2
Feature 005 — Cycling Analyzer v2

Improvements over v1:
- Uses 2022-2023 data for richer features
- Train on 2023-2024, test on full 2025 season
- Separate models per race type (classic vs stage race)
- Compares against rules-based baseline per type
"""

import os
import sys
from collections import defaultdict
from datetime import date, timedelta

import numpy as np
import pandas as pd
import psycopg2
from scipy.stats import spearmanr
from sklearn.linear_model import LinearRegression
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from xgboost import XGBRegressor

# ── Position points tables (same as TypeScript scoring) ──────────────

STAGE_POINTS = {1:40,2:25,3:22,4:19,5:17,6:15,7:14,8:13,9:12,10:11,
                11:10,12:9,13:8,14:7,15:6,16:5,17:4,18:3,19:2,20:1}
GC_CLASSIC = {1:200,2:125,3:100,4:80,5:60,6:50,7:45,8:40,9:35,10:30}
GC_MINI_TOUR = {1:100,2:80,3:65,4:55,5:45,6:40,7:35,8:30,9:25,10:20,
                11:18,12:16,13:14,14:12,15:10}
GC_GRAND_TOUR = {1:150,2:125,3:100,4:80,5:60,6:50,7:45,8:40,9:35,10:30,
                 11:28,12:26,13:24,14:22,15:20,16:18,17:16,18:14,19:12,20:10}
FINAL_CLASS_MINI = {1:40,2:25,3:15}
FINAL_CLASS_GT = {1:50,2:35,3:25,4:15,5:10}


def get_points(category, position, race_type):
    if position is None or (isinstance(position, float) and np.isnan(position)) or position < 1:
        return 0.0
    position = int(position)
    if category == 'stage':
        return float(STAGE_POINTS.get(position, 0))
    if category == 'gc':
        tbl = {'classic': GC_CLASSIC, 'mini_tour': GC_MINI_TOUR, 'grand_tour': GC_GRAND_TOUR}
        return float(tbl.get(race_type, {}).get(position, 0))
    if category in ('mountain', 'sprint'):
        if race_type == 'classic':
            return 0.0
        tbl = FINAL_CLASS_GT if race_type == 'grand_tour' else FINAL_CLASS_MINI
        return float(tbl.get(position, 0))
    return 0.0


# ── Data loading ─────────────────────────────────────────────────────

def load_data(db_url):
    conn = psycopg2.connect(db_url)
    results_df = pd.read_sql("""
        SELECT rr.rider_id, rr.race_slug, rr.race_name, rr.race_type, rr.race_class,
               rr.year, rr.category, rr.position, rr.stage_number, rr.dnf,
               rr.race_date, rr.parcours_type, rr.is_itt, rr.is_ttt,
               r.full_name as rider_name
        FROM race_results rr
        JOIN riders r ON rr.rider_id = r.id
        WHERE rr.race_date IS NOT NULL
        ORDER BY rr.race_date
    """, conn)
    startlists_df = pd.read_sql("""
        SELECT se.race_slug, se.year, se.rider_id
        FROM startlist_entries se
    """, conn)
    conn.close()
    print(f"Loaded {len(results_df)} results ({results_df['year'].min()}-{results_df['year'].max()})")
    print(f"Startlist entries: {len(startlists_df)}")
    return results_df, startlists_df


# ── Feature extraction (vectorized for speed) ────────────────────────

def extract_all_features(results_df, startlists_df):
    """Build feature matrix for all (rider, race) pairs with startlists."""

    # Pre-compute points for every result row
    results_df = results_df.copy()
    results_df['pts'] = results_df.apply(
        lambda r: get_points(r['category'], r['position'], r['race_type']), axis=1
    )

    # Get distinct races from startlists
    races = startlists_df.drop_duplicates(subset=['race_slug', 'year']).merge(
        results_df[['race_slug', 'year', 'race_type', 'race_name', 'race_date']]
            .drop_duplicates(subset=['race_slug', 'year']),
        on=['race_slug', 'year'],
        how='inner'
    )
    print(f"Races with both startlist and results: {len(races)}")

    all_rows = []

    for idx, race in races.iterrows():
        race_slug = race['race_slug']
        race_year = race['year']
        race_type = race['race_type']
        race_date = race['race_date']
        if pd.isna(race_date):
            continue
        race_date_py = race_date.date() if hasattr(race_date, 'date') else race_date

        # Get race's startlist rider IDs
        sl_riders = startlists_df[
            (startlists_df['race_slug'] == race_slug) &
            (startlists_df['year'] == race_year)
        ]['rider_id'].values

        # Pre-filter historical results for all riders in this startlist
        hist = results_df[
            (results_df['rider_id'].isin(sl_riders)) &
            (results_df['race_date'] < race_date)
        ]

        # Actual results for this race
        actual = results_df[
            (results_df['race_slug'] == race_slug) &
            (results_df['year'] == race_year)
        ]

        # Time windows
        d365 = race_date - pd.Timedelta(days=365)
        d180 = race_date - pd.Timedelta(days=180)
        d90 = race_date - pd.Timedelta(days=90)

        for rider_id in sl_riders:
            rh = hist[hist['rider_id'] == rider_id]
            rh_12m = rh[rh['race_date'] >= d365]
            rh_6m = rh[rh['race_date'] >= d180]
            rh_3m = rh[rh['race_date'] >= d90]

            feats = {}

            # Points by category (12m)
            for cat in ['gc', 'stage', 'mountain', 'sprint']:
                feats[f'pts_{cat}_12m'] = rh_12m[rh_12m['category'] == cat]['pts'].sum()

            feats['pts_total_12m'] = rh_12m['pts'].sum()
            feats['pts_total_6m'] = rh_6m['pts'].sum()
            feats['pts_total_3m'] = rh_3m['pts'].sum()

            # Points in same race type (12m)
            feats['pts_same_type_12m'] = rh_12m[rh_12m['race_type'] == race_type]['pts'].sum()

            # Race count
            feats['race_count_12m'] = rh_12m[['race_slug', 'year']].drop_duplicates().shape[0]
            feats['race_count_6m'] = rh_6m[['race_slug', 'year']].drop_duplicates().shape[0]

            # GC top-10 and win rates
            gc_12m = rh_12m[(rh_12m['category'] == 'gc') & (rh_12m['position'].notna())]
            n_gc = len(gc_12m)
            feats['top10_rate'] = (gc_12m['position'] <= 10).sum() / n_gc if n_gc > 0 else 0.0
            feats['top5_rate'] = (gc_12m['position'] <= 5).sum() / n_gc if n_gc > 0 else 0.0
            feats['win_rate'] = (gc_12m['position'] == 1).sum() / n_gc if n_gc > 0 else 0.0
            feats['podium_rate'] = (gc_12m['position'] <= 3).sum() / n_gc if n_gc > 0 else 0.0

            # Best single race
            if len(rh_12m) > 0:
                race_pts = rh_12m.groupby(['race_slug', 'year'])['pts'].sum()
                feats['best_race_pts_12m'] = race_pts.max()
                feats['median_race_pts_12m'] = race_pts.median()
            else:
                feats['best_race_pts_12m'] = 0.0
                feats['median_race_pts_12m'] = 0.0

            # Days since last race
            if len(rh) > 0:
                last_date = rh['race_date'].max()
                feats['days_since_last'] = (race_date - last_date).days
            else:
                feats['days_since_last'] = 365

            # Same race history
            same_race = rh[rh['race_slug'] == race_slug]
            if len(same_race) > 0:
                same_race_pts = same_race.groupby('year')['pts'].sum()
                feats['same_race_best'] = same_race_pts.max()
                feats['same_race_mean'] = same_race_pts.mean()
                feats['same_race_editions'] = len(same_race_pts)
            else:
                feats['same_race_best'] = 0.0
                feats['same_race_mean'] = 0.0
                feats['same_race_editions'] = 0

            # All-time total
            feats['pts_total_alltime'] = rh['pts'].sum()

            # Race context
            type_map = {'classic': 0, 'mini_tour': 1, 'grand_tour': 2}
            feats['race_type_enc'] = type_map.get(race_type, 0)

            # Trend: 3m vs prior 3m
            feats['pts_trend_3m'] = feats['pts_total_3m'] - (feats['pts_total_6m'] - feats['pts_total_3m'])

            # Stage-specific features (for stage races)
            if race_type in ('mini_tour', 'grand_tour'):
                feats['stage_pts_12m'] = rh_12m[rh_12m['category'] == 'stage']['pts'].sum()
                feats['gc_pts_same_type'] = rh_12m[
                    (rh_12m['category'] == 'gc') & (rh_12m['race_type'] == race_type)
                ]['pts'].sum()
            else:
                feats['stage_pts_12m'] = 0.0
                feats['gc_pts_same_type'] = 0.0

            # Target
            rider_actual = actual[actual['rider_id'] == rider_id]
            feats['actual_pts'] = rider_actual['pts'].sum()

            # Metadata
            feats['rider_id'] = rider_id
            feats['race_slug'] = race_slug
            feats['race_year'] = race_year
            feats['race_type'] = race_type
            feats['race_date'] = race_date_py

            all_rows.append(feats)

        if (len(races) > 20) and ((list(races.index).index(idx) + 1) % 20 == 0):
            print(f"  [{list(races.index).index(idx)+1}/{len(races)}] races...")

    df = pd.DataFrame(all_rows)
    print(f"Feature matrix: {df.shape[0]} rows x {df.shape[1]} cols")
    return df


# ── Feature columns ──────────────────────────────────────────────────

FEATURE_COLS_ALL = [
    'pts_gc_12m', 'pts_stage_12m', 'pts_mountain_12m', 'pts_sprint_12m',
    'pts_total_12m', 'pts_total_6m', 'pts_total_3m',
    'pts_same_type_12m', 'race_count_12m', 'race_count_6m',
    'top10_rate', 'top5_rate', 'win_rate', 'podium_rate',
    'best_race_pts_12m', 'median_race_pts_12m',
    'days_since_last', 'same_race_best', 'same_race_mean', 'same_race_editions',
    'pts_total_alltime', 'race_type_enc', 'pts_trend_3m',
    'stage_pts_12m', 'gc_pts_same_type',
]

# For classic-only model, remove stage-race-specific features
FEATURE_COLS_CLASSIC = [c for c in FEATURE_COLS_ALL if c not in ('stage_pts_12m', 'gc_pts_same_type')]


# ── Evaluation ───────────────────────────────────────────────────────

def evaluate(model, test_df, feature_cols, model_name):
    X = test_df[feature_cols].fillna(0).values
    preds = model.predict(X)
    test_df = test_df.copy()
    test_df['predicted'] = preds

    rhos = []
    for (slug, year), g in test_df.groupby(['race_slug', 'race_year']):
        if len(g) < 3 or g['actual_pts'].std() == 0:
            continue
        rho, _ = spearmanr(g['predicted'].values, g['actual_pts'].values)
        if not np.isnan(rho):
            rhos.append({'race': slug, 'year': year, 'type': g.iloc[0]['race_type'], 'rho': rho})

    mean_rho = np.mean([r['rho'] for r in rhos]) if rhos else 0.0

    type_rhos = defaultdict(list)
    for r in rhos:
        type_rhos[r['type']].append(r['rho'])

    print(f"  {model_name:30s}  ρ = {mean_rho:.4f}  ({len(rhos)} races)")
    for t in sorted(type_rhos):
        print(f"    {t:15s} ρ = {np.mean(type_rhos[t]):.4f} ({len(type_rhos[t])})")

    return mean_rho, rhos


# ── Main ─────────────────────────────────────────────────────────────

def main():
    db_url = os.environ.get('DATABASE_URL',
        'postgresql://cycling:cycling@localhost:5432/cycling_analyzer')

    print("=" * 60)
    print("  ML Scoring Feasibility Research v2")
    print("  With 2022-2023 historical depth")
    print("  Separate models by race type")
    print("=" * 60)

    # Load
    print("\n[1/4] Loading data...")
    results_df, startlists_df = load_data(db_url)

    # Check year coverage
    year_counts = results_df.groupby('year').size()
    print("\nResults by year:")
    for y, c in year_counts.items():
        print(f"  {y}: {c:,} results")

    # Build features
    print("\n[2/4] Building features...")
    dataset = extract_all_features(results_df, startlists_df)
    dataset.to_csv('ml/data/features_v2.csv', index=False)

    # Split: train = 2023+2024, test = 2025
    train = dataset[dataset['race_year'].isin([2023, 2024])]
    test = dataset[dataset['race_year'] == 2025]
    print(f"\nTrain: {len(train):,} rows ({train['race_slug'].nunique()} races, 2023-2024)")
    print(f"Test:  {len(test):,} rows ({test['race_slug'].nunique()} races, 2025)")

    if len(train) == 0 or len(test) == 0:
        # Fallback if 2023 data not available yet
        print("\nWARNING: Not enough data for 2023-2024 train / 2025 test split.")
        print("Falling back to 2024 train / 2025+2026 test")
        train = dataset[dataset['race_year'] == 2024]
        test = dataset[dataset['race_year'] >= 2025]
        print(f"Train: {len(train):,} rows, Test: {len(test):,} rows")

    # ── EXPERIMENT 1: Global model (all race types together) ─────
    print(f"\n{'='*60}")
    print("  EXPERIMENT 1: Global model (all types)")
    print(f"{'='*60}")

    X_train = train[FEATURE_COLS_ALL].fillna(0).values
    y_train = train['actual_pts'].values

    models = {
        'Linear Regression': LinearRegression(),
        'Random Forest': RandomForestRegressor(n_estimators=300, max_depth=12, random_state=42, n_jobs=-1),
        'XGBoost': XGBRegressor(n_estimators=500, max_depth=6, learning_rate=0.05,
                                subsample=0.8, colsample_bytree=0.8, reg_alpha=1.0,
                                random_state=42, n_jobs=-1, verbosity=0),
    }

    global_results = {}
    for name, model in models.items():
        model.fit(X_train, y_train)
        rho, details = evaluate(model, test, FEATURE_COLS_ALL, name)
        global_results[name] = rho

    # ── EXPERIMENT 2: Separate models by race type ───────────────
    print(f"\n{'='*60}")
    print("  EXPERIMENT 2: Separate models per race type")
    print(f"{'='*60}")

    split_results = {}
    for rtype in ['classic', 'mini_tour', 'grand_tour']:
        train_rt = train[train['race_type'] == rtype]
        test_rt = test[test['race_type'] == rtype]

        if len(train_rt) < 50 or len(test_rt) < 50:
            print(f"\n  {rtype}: insufficient data (train={len(train_rt)}, test={len(test_rt)}), skip")
            continue

        feat_cols = FEATURE_COLS_CLASSIC if rtype == 'classic' else FEATURE_COLS_ALL
        X_tr = train_rt[feat_cols].fillna(0).values
        y_tr = train_rt['actual_pts'].values

        print(f"\n  --- {rtype} ({len(train_rt)} train, {len(test_rt)} test) ---")

        best_rho = 0
        best_name = ""
        for name, cls in [
            ('XGBoost', XGBRegressor(n_estimators=500, max_depth=6, learning_rate=0.05,
                                     subsample=0.8, colsample_bytree=0.8, reg_alpha=1.0,
                                     random_state=42, n_jobs=-1, verbosity=0)),
            ('RandomForest', RandomForestRegressor(n_estimators=300, max_depth=12,
                                                   random_state=42, n_jobs=-1)),
        ]:
            cls.fit(X_tr, y_tr)
            rho, _ = evaluate(cls, test_rt, feat_cols, f"{rtype}/{name}")
            if rho > best_rho:
                best_rho = rho
                best_name = name

        split_results[rtype] = best_rho

    # ── Feature importance ───────────────────────────────────────
    print(f"\n{'='*60}")
    print("  Feature Importance (Global XGBoost)")
    print(f"{'='*60}")
    xgb_model = models['XGBoost']
    importances = xgb_model.feature_importances_
    feat_imp = sorted(zip(FEATURE_COLS_ALL, importances), key=lambda x: -x[1])
    for feat, imp in feat_imp[:15]:
        bar = '█' * int(imp * 80)
        print(f"  {feat:25s} {imp:.4f} {bar}")

    # ── Summary ──────────────────────────────────────────────────
    print(f"\n{'='*60}")
    print("  SUMMARY")
    print(f"{'='*60}")
    print(f"  Rules-based baseline:      ρ ≈ 0.3833 (all types)")
    print()
    print("  Global models:")
    for name, rho in global_results.items():
        delta = rho - 0.3833
        print(f"    {name:25s} ρ = {rho:.4f} ({delta:+.4f})")
    print()
    if split_results:
        print("  Per-type best models:")
        for rtype, rho in split_results.items():
            print(f"    {rtype:25s} ρ = {rho:.4f}")

    best_global = max(global_results.values())
    print(f"\n  Best global:               ρ = {best_global:.4f}")
    if best_global > 0.50:
        print("  ✅ GO")
    elif best_global > 0.42:
        print("  ⚠️  MARGINAL")
    else:
        print("  ❌ NO-GO")


if __name__ == '__main__':
    main()
