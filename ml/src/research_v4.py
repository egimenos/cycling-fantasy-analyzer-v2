"""
ML Scoring Research — v4: Profile-Aware Features

Builds on v3 (40 features) by adding terrain-profile features:
- Rider profile specialization (what % of points on flat/mountain/etc.)
- Target race profile distribution (how many flat/mountain stages)
- Rider-race profile match score

Hypothesis: riders who historically perform well on mountain stages
should score higher in mountain-heavy GTs, and vice versa for sprinters
in flat-heavy races. The rules-based engine already does this; the ML
model should learn it from data.

Methodology:
- Train: 2023-2024, Test: full 2025 (same as v3)
- Compare multiple feature configurations against v3 baseline
- Per-type models (mini_tour, grand_tour only; classics excluded)

Usage:
    cd ml && python -m src.research_v4
"""

import os
from collections import defaultdict
from datetime import date

import numpy as np
import pandas as pd
import psycopg2
from scipy.stats import spearmanr
from sklearn.ensemble import RandomForestRegressor

from .data import load_data
from .features import (
    FEATURE_COLS as V3_FEATURE_COLS,
    _compute_rider_features,
    _compute_team_info,
)
from .points import get_points

# ── V4 Profile Feature Columns ──────────────────────────────────────

PROFILE_RIDER_FEATURES = [
    'pct_pts_p1p2',       # % of stage points on flat/hilly (sprinter signal)
    'pct_pts_p4p5',       # % of stage points on mountain (climber signal)
    'pct_pts_p3',         # % on intermediate (rouleur signal)
    'itt_top10_rate',     # rate of top-10 in ITTs
    'stage_wins_flat',    # wins on P1+P2 stages (12m)
    'stage_wins_mountain',# wins on P4+P5 stages (12m)
]

PROFILE_RACE_FEATURES = [
    'target_flat_pct',    # % of P1+P2 stages in target race
    'target_mountain_pct',# % of P4+P5 stages in target race
    'target_itt_pct',     # % of ITT stages in target race
]

PROFILE_MATCH_FEATURES = [
    'profile_match',      # dot product of rider profile vs race profile
]

ALL_PROFILE_FEATURES = PROFILE_RIDER_FEATURES + PROFILE_RACE_FEATURES + PROFILE_MATCH_FEATURES
V4_FEATURE_COLS = V3_FEATURE_COLS + ALL_PROFILE_FEATURES


# ── Race profile computation ────────────────────────────────────────

def compute_race_profiles(results_df: pd.DataFrame) -> dict:
    """Pre-compute profile distribution for each (race_slug, year).

    For training, we derive the target race's profile from the stage
    results already in the DB (we know the parcours_type of each stage).

    Returns:
        Dict mapping (race_slug, year) -> {
            'flat_pct': float,    # P1+P2 share
            'mountain_pct': float,# P4+P5 share
            'itt_pct': float,     # ITT share
            'total_stages': int,
            'p1': int, 'p2': int, 'p3': int, 'p4': int, 'p5': int, 'itt': int
        }
    """
    # Only stage results with parcours_type
    stages = results_df[
        (results_df['category'] == 'stage') &
        (results_df['parcours_type'].notna())
    ].copy()

    # Distinct stages per race (one row per stage_number per race)
    distinct_stages = stages.drop_duplicates(
        subset=['race_slug', 'year', 'stage_number']
    )

    profiles = {}
    for (slug, year), group in distinct_stages.groupby(['race_slug', 'year']):
        total = len(group)
        if total == 0:
            continue
        p_counts = group['parcours_type'].value_counts().to_dict()
        itt_count = group['is_itt'].sum() if 'is_itt' in group.columns else 0

        p1 = p_counts.get('p1', 0)
        p2 = p_counts.get('p2', 0)
        p3 = p_counts.get('p3', 0)
        p4 = p_counts.get('p4', 0)
        p5 = p_counts.get('p5', 0)

        profiles[(slug, year)] = {
            'flat_pct': (p1 + p2) / total,
            'mountain_pct': (p4 + p5) / total,
            'p3_pct': p3 / total,
            'itt_pct': itt_count / total,
            'total_stages': total,
            'p1': p1, 'p2': p2, 'p3': p3, 'p4': p4, 'p5': p5, 'itt': int(itt_count),
        }

    return profiles


# ── Rider profile features ──────────────────────────────────────────

def compute_rider_profile_features(
    rider_id,
    hist: pd.DataFrame,
    d365,
) -> dict:
    """Compute profile-specialization features for a single rider.

    Uses the rider's historical stage results to determine their
    terrain affinity (sprinter vs climber vs rouleur).
    """
    rh = hist[hist['rider_id'] == rider_id]
    rh_12m = rh[rh['race_date'] >= d365]

    # Stage results with parcours info
    stages = rh_12m[
        (rh_12m['category'] == 'stage') &
        (rh_12m['parcours_type'].notna()) &
        (rh_12m['position'].notna())
    ]

    feats = {}

    total_stage_pts = stages['pts'].sum()
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

    # ITT performance
    itt_results = rh_12m[
        (rh_12m['is_itt'] == True) &
        (rh_12m['position'].notna())
    ]
    n_itt = len(itt_results)
    feats['itt_top10_rate'] = (itt_results['position'] <= 10).sum() / n_itt if n_itt > 0 else 0.0

    # Stage wins by terrain (12m)
    feats['stage_wins_flat'] = len(stages[
        (stages['parcours_type'].isin(['p1', 'p2'])) & (stages['position'] == 1)
    ])
    feats['stage_wins_mountain'] = len(stages[
        (stages['parcours_type'].isin(['p4', 'p5'])) & (stages['position'] == 1)
    ])

    return feats


# ── Profile match score ─────────────────────────────────────────────

def compute_profile_match(rider_feats: dict, race_profile: dict) -> float:
    """Dot product between rider terrain affinity and race terrain distribution.

    A sprinter (high pct_pts_p1p2) racing a flat race (high flat_pct)
    produces a high match score. A climber in the same race: low match.

    Educational note: This is essentially a cosine-similarity-like
    metric between the rider's strengths and the race's demands.
    """
    rider_vec = np.array([
        rider_feats.get('pct_pts_p1p2', 0),
        rider_feats.get('pct_pts_p3', 0),
        rider_feats.get('pct_pts_p4p5', 0),
    ])
    race_vec = np.array([
        race_profile.get('flat_pct', 0),
        race_profile.get('p3_pct', 0),
        race_profile.get('mountain_pct', 0),
    ])
    return float(np.dot(rider_vec, race_vec))


# ── Feature extraction with profile features ────────────────────────

def extract_v4_features(results_df, startlists_df, race_profiles):
    """Build feature matrix with v3 + v4 profile features."""
    races = startlists_df.drop_duplicates(subset=['race_slug', 'year']).merge(
        results_df[['race_slug', 'year', 'race_type', 'race_name', 'race_date']]
            .drop_duplicates(subset=['race_slug', 'year']),
        on=['race_slug', 'year'],
        how='inner',
    )
    print(f"Races with both startlist and results: {len(races)}")

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

        # Race profile for this race
        race_profile = race_profiles.get((race_slug, race_year), {})

        for rider_id in sl_riders:
            # V3 features (unchanged)
            feats = _compute_rider_features(
                rider_id=rider_id, hist=hist, results_df=results_df,
                race_slug=race_slug, race_type=race_type,
                race_date=race_date, race_date_py=race_date_py,
                d365=d365, d180=d180, d90=d90, d30=d30, d14=d14,
                rider_team_info=rider_team_info,
            )

            # V4 NEW: Rider profile features
            profile_feats = compute_rider_profile_features(rider_id, hist, d365)
            feats.update(profile_feats)

            # V4 NEW: Race profile features
            feats['target_flat_pct'] = race_profile.get('flat_pct', 0.0)
            feats['target_mountain_pct'] = race_profile.get('mountain_pct', 0.0)
            feats['target_itt_pct'] = race_profile.get('itt_pct', 0.0)

            # V4 NEW: Profile match
            feats['profile_match'] = compute_profile_match(profile_feats, race_profile)

            # Target + metadata
            rider_actual = actual[actual['rider_id'] == rider_id]
            feats['actual_pts'] = rider_actual['pts'].sum()
            feats['rider_id'] = rider_id
            feats['race_slug'] = race_slug
            feats['race_year'] = race_year
            feats['race_type'] = race_type
            feats['race_date'] = race_date_py

            all_rows.append(feats)

        processed += 1
        if processed % 20 == 0:
            print(f"  [{processed}/{len(races)}] races...")

    df = pd.DataFrame(all_rows)
    print(f"Feature matrix: {df.shape[0]:,} rows x {df.shape[1]} cols")
    return df


# ── Evaluation ──────────────────────────────────────────────────────

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

    print(f"  {model_name:45s}  rho={mean_rho:.4f}  ({len(rhos)} races)")
    for t in sorted(type_rhos):
        print(f"    {t:15s} rho={np.mean(type_rhos[t]):.4f} ({len(type_rhos[t])})")

    return mean_rho, rhos, type_rhos


# ── Main ────────────────────────────────────────────────────────────

def main():
    db_url = os.environ.get('DATABASE_URL',
        'postgresql://cycling:cycling@localhost:5432/cycling_analyzer')

    print("=" * 70)
    print("  ML Scoring Research v4 — Profile-Aware Features")
    print("  Baseline: v3 rho ~0.41 global, ~0.52 mini_tour, ~0.59 grand_tour")
    print("=" * 70)

    # Load data
    print("\n[1/5] Loading data...")
    results_df, startlists_df = load_data(db_url)

    # Compute race profiles
    print("\n[2/5] Computing race profiles from DB...")
    race_profiles = compute_race_profiles(results_df)
    print(f"  Race profiles computed for {len(race_profiles)} races")

    # Show example profiles
    for key in list(race_profiles.keys())[:3]:
        p = race_profiles[key]
        print(f"  {key[0]} {key[1]}: flat={p['flat_pct']:.0%} mtn={p['mountain_pct']:.0%} "
              f"itt={p['itt_pct']:.0%} ({p['total_stages']} stages)")

    # Build v4 features
    print("\n[3/5] Building features (v4 — profile-aware)...")
    dataset = extract_v4_features(results_df, startlists_df, race_profiles)

    # Split
    train = dataset[dataset['race_year'].isin([2023, 2024])]
    test = dataset[dataset['race_year'] == 2025]
    print(f"\nTrain: {len(train):,} rows ({train['race_slug'].nunique()} races, 2023-2024)")
    print(f"Test:  {len(test):,} rows ({test['race_slug'].nunique()} races, 2025)")

    RF_PARAMS = dict(n_estimators=500, max_depth=14, min_samples_leaf=5,
                     random_state=42, n_jobs=-1)

    # ── EXPERIMENT CONFIGS ──────────────────────────────────────
    configs = {
        'v3 baseline (40 feat)': V3_FEATURE_COLS,
        'v4a: +rider profile (46 feat)': V3_FEATURE_COLS + PROFILE_RIDER_FEATURES,
        'v4b: +race profile (49 feat)': V3_FEATURE_COLS + PROFILE_RIDER_FEATURES + PROFILE_RACE_FEATURES,
        'v4c: +profile match (50 feat)': V4_FEATURE_COLS,
        'v4d: rider+match only (47 feat)': V3_FEATURE_COLS + PROFILE_RIDER_FEATURES + PROFILE_MATCH_FEATURES,
    }

    # ── PER-TYPE MODELS (stage races only) ──────────────────────
    print(f"\n{'='*70}")
    print("  PER-TYPE MODELS — mini_tour + grand_tour")
    print(f"{'='*70}")

    results_table = []

    for rtype in ['mini_tour', 'grand_tour']:
        train_rt = train[train['race_type'] == rtype]
        test_rt = test[test['race_type'] == rtype]

        if len(train_rt) < 50 or len(test_rt) < 20:
            print(f"\n  {rtype}: insufficient data, skip")
            continue

        print(f"\n  {'─'*60}")
        print(f"  {rtype.upper()} ({len(train_rt):,} train, {len(test_rt):,} test)")
        print(f"  {'─'*60}")

        for config_name, feature_cols in configs.items():
            X_tr = train_rt[feature_cols].fillna(0).values
            y_tr = train_rt['actual_pts'].values

            model = RandomForestRegressor(**RF_PARAMS)
            model.fit(X_tr, y_tr)
            rho, _, type_rhos = evaluate(model, test_rt, feature_cols, config_name)
            results_table.append({
                'race_type': rtype,
                'config': config_name,
                'rho': rho,
                'n_features': len(feature_cols),
            })

    # ── GLOBAL MODELS ───────────────────────────────────────────
    print(f"\n{'='*70}")
    print("  GLOBAL MODELS (all race types)")
    print(f"{'='*70}")

    for config_name, feature_cols in configs.items():
        X_tr = train[feature_cols].fillna(0).values
        y_tr = train['actual_pts'].values

        model = RandomForestRegressor(**RF_PARAMS)
        model.fit(X_tr, y_tr)
        rho, _, type_rhos = evaluate(model, test, feature_cols, config_name)
        results_table.append({
            'race_type': 'global',
            'config': config_name,
            'rho': rho,
            'n_features': len(feature_cols),
        })

    # ── Feature importance for best v4 config ───────────────────
    print(f"\n{'='*70}")
    print("  Feature Importance — v4c (all profile features)")
    print(f"{'='*70}")

    for rtype in ['mini_tour', 'grand_tour']:
        train_rt = train[train['race_type'] == rtype]
        X_tr = train_rt[V4_FEATURE_COLS].fillna(0).values
        y_tr = train_rt['actual_pts'].values

        model = RandomForestRegressor(**RF_PARAMS)
        model.fit(X_tr, y_tr)

        imps = model.feature_importances_
        feat_imp = sorted(zip(V4_FEATURE_COLS, imps), key=lambda x: -x[1])

        print(f"\n  {rtype.upper()} — Top 25 features:")
        for i, (feat, imp) in enumerate(feat_imp[:25], 1):
            bar = '█' * int(imp * 80)
            tag = ' ★' if feat in ALL_PROFILE_FEATURES else ''
            print(f"  {i:2d}. {feat:25s} {imp:.4f} {bar}{tag}")

        # Show where profile features rank
        print(f"\n  Profile feature ranks for {rtype}:")
        for feat in ALL_PROFILE_FEATURES:
            rank = [f for f, _ in feat_imp].index(feat) + 1
            imp_val = dict(feat_imp)[feat]
            print(f"    {feat:25s} rank={rank:2d}  importance={imp_val:.4f}")

    # ── Summary ─────────────────────────────────────────────────
    print(f"\n{'='*70}")
    print("  SUMMARY — v4 Profile Features Impact")
    print(f"{'='*70}")

    results_df_out = pd.DataFrame(results_table)
    for rtype in ['mini_tour', 'grand_tour', 'global']:
        subset = results_df_out[results_df_out['race_type'] == rtype]
        if len(subset) == 0:
            continue
        print(f"\n  {rtype.upper()}:")
        baseline = subset[subset['config'].str.contains('v3')]['rho'].values
        baseline_rho = baseline[0] if len(baseline) > 0 else 0
        for _, row in subset.iterrows():
            delta = row['rho'] - baseline_rho
            marker = '←baseline' if 'v3' in row['config'] else (
                '↑' if delta > 0.005 else ('↓' if delta < -0.005 else '≈'))
            print(f"    {row['config']:45s}  rho={row['rho']:.4f}  ({delta:+.4f}) {marker}")

    # ── Save report ─────────────────────────────────────────────
    report_path = 'ml/results/report_v4.md'
    os.makedirs('ml/results', exist_ok=True)
    with open(report_path, 'w') as f:
        f.write("# ML Research v4 — Profile-Aware Features\n\n")
        f.write(f"**Date**: {date.today()}\n")
        f.write(f"**Baseline**: v3 (40 features, no profile awareness)\n\n")
        f.write("## New features in v4\n\n")
        f.write("### Rider profile specialization (6 features)\n")
        for feat in PROFILE_RIDER_FEATURES:
            f.write(f"- `{feat}`\n")
        f.write("\n### Race profile distribution (3 features)\n")
        for feat in PROFILE_RACE_FEATURES:
            f.write(f"- `{feat}`\n")
        f.write("\n### Profile match (1 feature)\n")
        for feat in PROFILE_MATCH_FEATURES:
            f.write(f"- `{feat}`\n")
        f.write(f"\n## Results\n\n")
        f.write("| Race Type | Config | Features | rho | vs v3 |\n")
        f.write("|-----------|--------|----------|-----|-------|\n")
        for _, row in results_df_out.iterrows():
            baseline = results_df_out[
                (results_df_out['race_type'] == row['race_type']) &
                (results_df_out['config'].str.contains('v3'))
            ]['rho'].values
            bl = baseline[0] if len(baseline) > 0 else 0
            f.write(f"| {row['race_type']} | {row['config']} | {row['n_features']} "
                    f"| {row['rho']:.4f} | {row['rho']-bl:+.4f} |\n")

    print(f"\nReport: {report_path}")


if __name__ == '__main__':
    main()
