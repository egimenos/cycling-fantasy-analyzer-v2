"""
ML Scoring Research — v5: Continuous Profile Score Features

Builds on v4b (49 features) by replacing/augmenting the categorical P1-P5
profile features with the continuous profile_score from PCS.

Hypothesis: profile_score (0-483) is much more granular than P1-P5 categories.
A P2 with score 74 (gentle hills) is very different from P2 score 272 (hard hills).
Using the continuous score should improve rider-race matching.

New features:
- Rider: avg_profile_score_12m, weighted_profile_score (pts-weighted), profile_score_std
- Race: target_avg_profile_score, target_max_profile_score, target_profile_score_std
- Match: profile_score_diff (rider avg vs race avg)

Configs tested:
- v4b baseline (49 features)
- v5a: replace P1-P5 pct features with continuous profile_score features
- v5b: add continuous features alongside P1-P5 (keep both)
- v5c: only continuous profile_score features (no P1-P5 pcts, no race pcts)

Usage:
    cd ml && python -m src.research_v5
"""

import os
from collections import defaultdict
from datetime import date

import numpy as np
import pandas as pd
from scipy.stats import spearmanr
from sklearn.ensemble import RandomForestRegressor

from .data import load_data
from .features import (
    FEATURE_COLS as V4B_FEATURE_COLS,
    _compute_rider_features,
    _compute_team_info,
    compute_race_profile,
)
from .points import get_points

# ── v5 Continuous Profile Features ──────────────────────────────────

RIDER_CONTINUOUS_PROFILE = [
    'avg_profile_score_12m',      # mean profile_score of stages where rider scored pts
    'weighted_profile_score_12m', # pts-weighted mean profile_score (emphasizes stages where rider did well)
    'profile_score_std_12m',      # std of profile_score (specialist=low, allrounder=high)
    'max_profile_score_12m',      # highest profile_score where rider got top10
]

RACE_CONTINUOUS_PROFILE = [
    'target_avg_profile_score',   # mean profile_score of target race stages
    'target_max_profile_score',   # hardest stage profile_score
    'target_profile_score_std',   # variety of profiles (mixed race=high, flat race=low)
]

MATCH_CONTINUOUS = [
    'profile_score_diff',         # rider avg - race avg (positive = rider prefers harder, negative = prefers easier)
]

ALL_V5_FEATURES = RIDER_CONTINUOUS_PROFILE + RACE_CONTINUOUS_PROFILE + MATCH_CONTINUOUS


def compute_rider_continuous_profile(rider_id, hist, d365):
    """Compute continuous profile_score features for a rider."""
    rh = hist[hist['rider_id'] == rider_id]
    rh_12m = rh[rh['race_date'] >= d365]

    stages = rh_12m[
        (rh_12m['category'] == 'stage') &
        (rh_12m['profile_score'].notna()) &
        (rh_12m['position'].notna())
    ] if 'profile_score' in rh_12m.columns else pd.DataFrame()

    feats = {}

    if len(stages) > 0 and stages['profile_score'].notna().sum() > 0:
        scores = stages['profile_score'].dropna()
        pts = stages.loc[scores.index, 'pts']

        feats['avg_profile_score_12m'] = scores.mean()
        feats['profile_score_std_12m'] = scores.std() if len(scores) > 1 else 0.0

        # Pts-weighted mean: emphasizes stages where rider scored well
        total_pts = pts.sum()
        if total_pts > 0:
            feats['weighted_profile_score_12m'] = (scores * pts).sum() / total_pts
        else:
            feats['weighted_profile_score_12m'] = scores.mean()

        # Max profile_score where rider got top10
        top10 = stages[stages['position'] <= 10]
        if len(top10) > 0 and top10['profile_score'].notna().sum() > 0:
            feats['max_profile_score_12m'] = top10['profile_score'].dropna().max()
        else:
            feats['max_profile_score_12m'] = 0.0
    else:
        feats['avg_profile_score_12m'] = 0.0
        feats['weighted_profile_score_12m'] = 0.0
        feats['profile_score_std_12m'] = 0.0
        feats['max_profile_score_12m'] = 0.0

    return feats


def compute_race_continuous_profile(results_df, race_slug, race_year):
    """Compute continuous profile_score features for a race."""
    stages = results_df[
        (results_df['race_slug'] == race_slug) &
        (results_df['year'] == race_year) &
        (results_df['category'] == 'stage') &
        (results_df['profile_score'].notna())
    ]
    distinct = stages.drop_duplicates(subset=['stage_number'])
    scores = distinct['profile_score'].dropna()

    if len(scores) == 0:
        return {
            'target_avg_profile_score': 0.0,
            'target_max_profile_score': 0.0,
            'target_profile_score_std': 0.0,
        }

    return {
        'target_avg_profile_score': scores.mean(),
        'target_max_profile_score': scores.max(),
        'target_profile_score_std': scores.std() if len(scores) > 1 else 0.0,
    }


# ── Feature extraction ──────────────────────────────────────────────

def extract_v5_features(results_df, startlists_df):
    """Build feature matrix with v4b + v5 continuous profile features."""
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

        # Race profiles (both categorical and continuous)
        rp_cat = compute_race_profile(results_df, race_slug, race_year)
        rp_cont = compute_race_continuous_profile(results_df, race_slug, race_year)

        for rider_id in sl_riders:
            # v4b features (40 base + 9 profile categorical)
            feats = _compute_rider_features(
                rider_id=rider_id, hist=hist, results_df=results_df,
                race_slug=race_slug, race_type=race_type,
                race_date=race_date, race_date_py=race_date_py,
                d365=d365, d180=d180, d90=d90, d30=d30, d14=d14,
                rider_team_info=rider_team_info,
            )
            # v4b categorical race profile
            feats['target_flat_pct'] = rp_cat.get('target_flat_pct', 0.0)
            feats['target_mountain_pct'] = rp_cat.get('target_mountain_pct', 0.0)
            feats['target_itt_pct'] = rp_cat.get('target_itt_pct', 0.0)

            # v5 NEW: Continuous profile features
            rider_cont = compute_rider_continuous_profile(rider_id, hist, d365)
            feats.update(rider_cont)
            feats.update(rp_cont)

            # Match feature
            feats['profile_score_diff'] = (
                rider_cont.get('avg_profile_score_12m', 0) -
                rp_cont.get('target_avg_profile_score', 0)
            )

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

    print(f"  {model_name:50s}  rho={mean_rho:.4f}  ({len(rhos)} races)")
    for t in sorted(type_rhos):
        print(f"    {t:15s} rho={np.mean(type_rhos[t]):.4f} ({len(type_rhos[t])})")

    return mean_rho, rhos, type_rhos


# ── Main ────────────────────────────────────────────────────────────

def main():
    db_url = os.environ.get('DATABASE_URL',
        'postgresql://cycling:cycling@localhost:5432/cycling_analyzer')

    print("=" * 70)
    print("  ML Scoring Research v5 — Continuous Profile Score Features")
    print("  Baseline: v4b (49 features, categorical P1-P5 profile)")
    print("=" * 70)

    print("\n[1/3] Loading data...")
    results_df, startlists_df = load_data(db_url)

    print("\n[2/3] Building features (v5)...")
    dataset = extract_v5_features(results_df, startlists_df)

    # Split
    train = dataset[dataset['race_year'].isin([2023, 2024])]
    test = dataset[dataset['race_year'] == 2025]
    print(f"\nTrain: {len(train):,} rows ({train['race_slug'].nunique()} races)")
    print(f"Test:  {len(test):,} rows ({test['race_slug'].nunique()} races)")

    RF_PARAMS = dict(n_estimators=500, max_depth=14, min_samples_leaf=5,
                     random_state=42, n_jobs=-1)

    # Feature configs
    # v4b categorical profile features
    v4b_profile = ['pct_pts_p1p2', 'pct_pts_p4p5', 'pct_pts_p3',
                   'itt_top10_rate', 'stage_wins_flat', 'stage_wins_mountain',
                   'target_flat_pct', 'target_mountain_pct', 'target_itt_pct']

    # Base features (v3 without any profile)
    base_40 = [f for f in V4B_FEATURE_COLS if f not in v4b_profile]

    configs = {
        'v4b baseline (49 feat, categorical)': V4B_FEATURE_COLS,
        'v5a: replace categorical with continuous': base_40 + ALL_V5_FEATURES,
        'v5b: both categorical + continuous': V4B_FEATURE_COLS + ALL_V5_FEATURES,
        'v5c: continuous only (no categorical)': base_40 + RIDER_CONTINUOUS_PROFILE + RACE_CONTINUOUS_PROFILE + MATCH_CONTINUOUS,
        'v5d: continuous + match only (minimal)': base_40 + ['avg_profile_score_12m', 'weighted_profile_score_12m', 'target_avg_profile_score', 'profile_score_diff'],
    }

    # ── Per-type models ──────────────────────────────────────────
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
            # Filter to features that exist in dataset
            available = [f for f in feature_cols if f in dataset.columns]
            X_tr = train_rt[available].fillna(0).values
            y_tr = train_rt['actual_pts'].values

            model = RandomForestRegressor(**RF_PARAMS)
            model.fit(X_tr, y_tr)
            rho, _, _ = evaluate(model, test_rt, available, config_name)
            results_table.append({
                'race_type': rtype,
                'config': config_name,
                'rho': rho,
                'n_features': len(available),
            })

    # ── Feature importance for best config ────────────────────────
    print(f"\n{'='*70}")
    print("  Feature Importance — v5b (categorical + continuous)")
    print(f"{'='*70}")

    v5b_cols = [f for f in (V4B_FEATURE_COLS + ALL_V5_FEATURES) if f in dataset.columns]
    for rtype in ['mini_tour', 'grand_tour']:
        train_rt = train[train['race_type'] == rtype]
        X_tr = train_rt[v5b_cols].fillna(0).values
        y_tr = train_rt['actual_pts'].values

        model = RandomForestRegressor(**RF_PARAMS)
        model.fit(X_tr, y_tr)

        imps = model.feature_importances_
        feat_imp = sorted(zip(v5b_cols, imps), key=lambda x: -x[1])

        print(f"\n  {rtype.upper()} — Top 25:")
        for i, (feat, imp) in enumerate(feat_imp[:25], 1):
            tag = ' ★NEW' if feat in ALL_V5_FEATURES else (' ★v4' if feat in v4b_profile else '')
            print(f"  {i:2d}. {feat:30s} {imp:.4f}{tag}")

        print(f"\n  v5 continuous feature ranks for {rtype}:")
        for feat in ALL_V5_FEATURES:
            if feat in v5b_cols:
                rank = [f for f, _ in feat_imp].index(feat) + 1
                imp_val = dict(feat_imp)[feat]
                print(f"    {feat:30s} rank={rank:2d}  importance={imp_val:.4f}")

    # ── Summary ──────────────────────────────────────────────────
    print(f"\n{'='*70}")
    print("  SUMMARY — v5 Continuous Profile Score Impact")
    print(f"{'='*70}")

    results_df_out = pd.DataFrame(results_table)
    for rtype in ['mini_tour', 'grand_tour']:
        subset = results_df_out[results_df_out['race_type'] == rtype]
        if len(subset) == 0:
            continue
        baseline = subset[subset['config'].str.contains('v4b')]['rho'].values
        baseline_rho = baseline[0] if len(baseline) > 0 else 0
        print(f"\n  {rtype.upper()}:")
        for _, row in subset.iterrows():
            delta = row['rho'] - baseline_rho
            marker = '←baseline' if 'v4b' in row['config'] else (
                '↑' if delta > 0.005 else ('↓' if delta < -0.005 else '≈'))
            print(f"    {row['config']:50s}  rho={row['rho']:.4f}  ({delta:+.4f}) {marker}")

    # Save report
    report_path = 'ml/results/report_v5.md'
    os.makedirs('ml/results', exist_ok=True)
    with open(report_path, 'w') as f:
        f.write("# ML Research v5 — Continuous Profile Score Features\n\n")
        f.write(f"**Date**: {date.today()}\n")
        f.write(f"**Baseline**: v4b (49 features, categorical P1-P5 profile)\n\n")
        f.write("## New features\n\n")
        for feat in ALL_V5_FEATURES:
            f.write(f"- `{feat}`\n")
        f.write(f"\n## Results\n\n")
        f.write("| Race Type | Config | Features | rho | vs v4b |\n|---|---|---|---|---|\n")
        for _, row in results_df_out.iterrows():
            bl = results_df_out[
                (results_df_out['race_type'] == row['race_type']) &
                (results_df_out['config'].str.contains('v4b'))
            ]['rho'].values
            bl_rho = bl[0] if len(bl) > 0 else 0
            f.write(f"| {row['race_type']} | {row['config']} | {row['n_features']} | {row['rho']:.4f} | {row['rho']-bl_rho:+.4f} |\n")

    print(f"\nReport: {report_path}")


if __name__ == '__main__':
    main()
