"""
Benchmark script for feature 008 — Complete Fantasy Scoring.

Evaluates trained production models against 2025 holdout data using
Spearman rho. Used to measure before/after impact of expanded scoring
categories (daily GC, mountain passes, intermediate sprints, daily
regularidad).

Usage:
    cd ml && python -m src.benchmark_008 --phase before
    cd ml && python -m src.benchmark_008 --phase after
"""

import argparse
import os
import sys
from collections import defaultdict
from datetime import date, datetime

import joblib
import numpy as np
import pandas as pd
from scipy.stats import spearmanr

from .data import load_data
from .features import (
    FEATURE_COLS,
    _compute_rider_features,
    _compute_team_info,
    compute_race_profile,
)


def synthesize_startlists(results_df: pd.DataFrame) -> pd.DataFrame:
    """Derive startlists from race_results when startlist_entries is empty.

    Creates one startlist entry per distinct (rider_id, race_slug, year)
    from the results. Fallback for when startlist_entries table is empty.
    """
    sl = results_df[['race_slug', 'year', 'rider_id']].drop_duplicates()
    sl = sl.copy()
    sl['team_name'] = results_df.groupby('rider_id')['rider_team'].first().reindex(
        sl['rider_id']
    ).values
    sl['team_name'] = sl['team_name'].fillna('unknown')
    print(f"  Synthesized startlists: {len(sl):,} entries from race results")
    return sl


def load_production_models(model_dir: str) -> dict:
    """Load production models from disk."""
    models = {}
    for race_type in ['mini_tour', 'grand_tour']:
        path = os.path.join(model_dir, f'model_{race_type}.joblib')
        if os.path.isfile(path):
            models[race_type] = joblib.load(path)
            mtime = os.path.getmtime(path)
            print(f"  Loaded model: {race_type} ({datetime.fromtimestamp(mtime)})")
        else:
            print(f"  WARNING: Model not found: {path}")
    return models


def extract_test_features(
    results_df: pd.DataFrame,
    startlists_df: pd.DataFrame,
    test_year: int = 2025,
) -> pd.DataFrame:
    """Extract features ONLY for test-year races (much faster than full extraction).

    This avoids the expensive extraction of all training data which we don't
    need for benchmarking production models.

    Educational note: We still need to compute features from historical data
    (e.g., pts_total_12m uses results from the prior 12 months). But we only
    iterate over test-year races, not all 382 races.
    """
    races = startlists_df.drop_duplicates(subset=['race_slug', 'year']).merge(
        results_df[['race_slug', 'year', 'race_type', 'race_name', 'race_date']]
            .drop_duplicates(subset=['race_slug', 'year']),
        on=['race_slug', 'year'],
        how='inner',
    )

    # Filter to test year only
    test_races = races[races['year'] == test_year]
    print(f"  Test races ({test_year}): {len(test_races)}")

    all_rows = []
    processed = 0

    for _, race in test_races.iterrows():
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

            rider_actual = actual[actual['rider_id'] == rider_id]
            feats['actual_pts'] = rider_actual['pts'].sum()
            feats['rider_id'] = rider_id
            feats['race_slug'] = race_slug
            feats['race_year'] = race_year
            feats['race_type'] = race_type
            feats['race_date'] = race_date_py

            all_rows.append(feats)

        processed += 1
        if processed % 5 == 0:
            print(f"    [{processed}/{len(test_races)}] races...")

    df = pd.DataFrame(all_rows)
    print(f"  Test feature matrix: {df.shape[0]:,} rows x {df.shape[1]} cols")
    return df


def evaluate_models(models: dict, dataset: pd.DataFrame) -> dict:
    """Evaluate production models on holdout data using per-race Spearman rho."""
    all_rhos = []

    for race_type, model in models.items():
        test_rt = dataset[dataset['race_type'] == race_type]
        if len(test_rt) == 0:
            print(f"  No test data for {race_type}, skipping")
            continue

        X = test_rt[FEATURE_COLS].fillna(0).values
        preds = model.predict(X)
        test_rt = test_rt.copy()
        test_rt['predicted'] = preds

        for (slug, year), g in test_rt.groupby(['race_slug', 'race_year']):
            if len(g) < 3 or g['actual_pts'].std() == 0:
                continue
            rho, pval = spearmanr(g['predicted'].values, g['actual_pts'].values)
            if not np.isnan(rho):
                all_rhos.append({
                    'race': slug,
                    'year': year,
                    'type': race_type,
                    'rho': rho,
                    'pval': pval,
                    'n_riders': len(g),
                })

    type_rhos = defaultdict(list)
    for r in all_rhos:
        type_rhos[r['type']].append(r['rho'])

    return {
        'per_race': all_rhos,
        'per_type': {t: {'mean_rho': np.mean(rhos), 'n_races': len(rhos)}
                     for t, rhos in type_rhos.items()},
        'overall_mean_rho': np.mean([r['rho'] for r in all_rhos]) if all_rhos else 0.0,
    }


def sanity_check_actual_pts(results_df: pd.DataFrame) -> None:
    """Verify actual_pts includes new categories by checking raw data.

    Computes total points per rider per race directly from results_df,
    showing the contribution of each category. No feature extraction needed.
    """
    print("\n=== Sanity Check: Points breakdown for top riders ===")
    print("  Verifying that new categories (gc_daily, mountain_pass, etc.)")
    print("  contribute to the total actual_pts.\n")

    # Check TdF 2024 (GT) and a mini tour
    for race_slug, year in [('tour-de-france', 2024), ('tour-de-france', 2025)]:
        race = results_df[
            (results_df['race_slug'] == race_slug) &
            (results_df['year'] == year)
        ]
        if len(race) == 0:
            print(f"  {race_slug} {year}: no data\n")
            continue

        # Total pts per rider
        rider_totals = race.groupby(['rider_id', 'rider_name'])['pts'].sum().reset_index()
        rider_totals = rider_totals.sort_values('pts', ascending=False)

        print(f"  {race_slug} {year} — Top 5 riders by total pts:")
        for _, row in rider_totals.head(5).iterrows():
            rider_id = row['rider_id']
            name = row['rider_name']
            total = row['pts']

            # Breakdown by category
            cats = race[race['rider_id'] == rider_id].groupby('category')['pts'].sum()
            parts = []
            for cat in ['stage', 'gc', 'gc_daily', 'mountain', 'mountain_pass',
                        'sprint', 'sprint_intermediate', 'regularidad_daily']:
                if cat in cats.index and cats[cat] > 0:
                    parts.append(f"{cat}={cats[cat]:.0f}")
            breakdown = ', '.join(parts)
            print(f"    {name:<30} total={total:>6.0f}  ({breakdown})")

        # Category contribution summary
        cat_totals = race.groupby('category')['pts'].sum()
        print(f"  Category contribution (all riders):")
        for cat, pts in cat_totals.sort_values(ascending=False).items():
            pct = pts / cat_totals.sum() * 100
            print(f"    {cat:<25} {pts:>8,.0f} pts  ({pct:>5.1f}%)")
        print()


def format_results(results: dict, phase: str) -> str:
    """Format benchmark results as a readable text report."""
    lines = []
    lines.append(f"{'='*60}")
    lines.append(f"  Benchmark Results — {phase.upper()}")
    lines.append(f"  Date: {date.today()}")
    lines.append(f"  Feature: 008-complete-fantasy-scoring")
    lines.append(f"{'='*60}")
    lines.append("")

    lines.append("Per-type Spearman rho (2025 holdout):")
    lines.append(f"{'Race Type':<15} {'Mean rho':>10} {'N races':>10}")
    lines.append(f"{'-'*15} {'-'*10} {'-'*10}")
    for race_type in ['mini_tour', 'grand_tour']:
        if race_type in results['per_type']:
            info = results['per_type'][race_type]
            lines.append(f"{race_type:<15} {info['mean_rho']:>10.4f} {info['n_races']:>10}")
        else:
            lines.append(f"{race_type:<15} {'N/A':>10} {'0':>10}")

    lines.append("")
    lines.append(f"Overall mean rho: {results['overall_mean_rho']:.4f}")
    lines.append("")

    lines.append("Per-race detail:")
    lines.append(f"{'Race':<35} {'Year':>5} {'Type':<12} {'rho':>8} {'Riders':>7}")
    lines.append(f"{'-'*35} {'-'*5} {'-'*12} {'-'*8} {'-'*7}")
    for r in sorted(results['per_race'], key=lambda x: (x['type'], -x['rho'])):
        lines.append(
            f"{r['race']:<35} {r['year']:>5} {r['type']:<12} "
            f"{r['rho']:>8.4f} {r['n_riders']:>7}"
        )

    lines.append("")
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description='Benchmark for 008 scoring expansion')
    parser.add_argument('--phase', choices=['before', 'after'], required=True,
                        help='Benchmark phase: before or after retraining')
    parser.add_argument('--sanity-check', action='store_true',
                        help='Run sanity check on actual_pts values')
    args = parser.parse_args()

    db_url = os.environ.get(
        'DATABASE_URL',
        'postgresql://cycling:cycling@localhost:5432/cycling_analyzer',
    )
    model_dir = os.path.join(os.path.dirname(__file__), '..', 'models')
    results_dir = os.path.join(os.path.dirname(__file__), '..', 'results')
    os.makedirs(results_dir, exist_ok=True)

    print(f"Phase: {args.phase}")
    print(f"Model dir: {os.path.abspath(model_dir)}")

    # Load data
    print("\n[1/4] Loading data from DB...")
    results_df, startlists_df = load_data(db_url)

    # Fallback: synthesize startlists from race_results if table is empty
    if len(startlists_df) == 0:
        print("\n  WARNING: startlist_entries table is empty.")
        print("  Synthesizing startlists from race_results as fallback...")
        startlists_df = synthesize_startlists(results_df)

    # Show category distribution
    print("\nCategory distribution in loaded data:")
    cat_counts = results_df['category'].value_counts()
    for cat, count in cat_counts.items():
        pts_sum = results_df[results_df['category'] == cat]['pts'].sum()
        print(f"  {cat:<25} {count:>8,} rows  {pts_sum:>12,.0f} total pts")

    # Sanity check (uses raw data, no feature extraction needed)
    if args.sanity_check:
        sanity_check_actual_pts(results_df)

    # Extract features for 2025 test races only (fast)
    print("\n[2/4] Extracting features for 2025 test races...")
    dataset = extract_test_features(results_df, startlists_df, test_year=2025)

    if len(dataset) == 0:
        print("ERROR: No test data extracted. Check DB contents.")
        sys.exit(1)

    # Sanity check on extracted actual_pts
    print("\n[3/4] Sanity check: actual_pts in feature matrix")
    for race_type in ['mini_tour', 'grand_tour']:
        subset = dataset[dataset['race_type'] == race_type]
        if len(subset) > 0:
            top = subset.nlargest(3, 'actual_pts')
            print(f"  {race_type} — top 3 actual_pts:")
            for _, row in top.iterrows():
                print(f"    {row['race_slug']}: {row['actual_pts']:.0f} pts")

    # Load and evaluate models
    print(f"\n[4/4] Loading production models and evaluating...")
    models = load_production_models(model_dir)
    if not models:
        print("ERROR: No models found. Cannot run benchmark.")
        sys.exit(1)

    results = evaluate_models(models, dataset)

    # Format and save
    report = format_results(results, args.phase)
    print("\n" + report)

    output_file = os.path.join(results_dir, f'benchmark_{args.phase}_008.txt')
    with open(output_file, 'w') as f:
        f.write(report)
    print(f"Results saved to: {output_file}")


if __name__ == '__main__':
    main()
