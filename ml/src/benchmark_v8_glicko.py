"""
Benchmark v8 — Glicko-2 Feature Test

Adds 4 Glicko-2 features to the v4b baseline and measures impact:
  gc_mu, gc_rd, stage_mu, stage_rd

Uses the exact same benchmark protocol as benchmark_v8.py (expanding window CV,
same metrics, same case studies) for direct comparison.

Usage:
    cd ml && python -m src.benchmark_v8_glicko
    cd ml && python -m src.benchmark_v8_glicko --fold 3
"""

import argparse
import os
from datetime import date

import numpy as np
import pandas as pd
import psycopg2
from scipy.stats import spearmanr
from sklearn.ensemble import RandomForestRegressor

from .features import (
    FEATURE_COLS,
    _compute_rider_features,
    _compute_team_info,
    compute_race_profile,
)
from .research_v6 import load_data_fast
from .benchmark_v8 import (
    FOLDS, TEAM_SIZE, DEFAULT_BUDGET, RANDOM_SEED,
    find_optimal_team, spearman_rho, precision_at_k, ndcg_at_k,
    bootstrap_ci, format_report, run_case_studies,
)

# Glicko-2 features added to v4b
GLICKO_FEATURES = ['gc_mu', 'gc_rd', 'stage_mu', 'stage_rd']
FEATURE_COLS_V8G = list(FEATURE_COLS) + GLICKO_FEATURES


def load_glicko_ratings(db_url: str) -> pd.DataFrame:
    """Load Glicko-2 rating snapshots from DB."""
    conn = psycopg2.connect(db_url)
    df = pd.read_sql("""
        SELECT rider_id, race_slug, year, race_date,
               gc_mu, gc_rd, gc_sigma, stage_mu, stage_rd, stage_sigma
        FROM rider_ratings
        ORDER BY race_date
    """, conn)
    conn.close()
    df['race_date'] = pd.to_datetime(df['race_date'])
    print(f"  Glicko-2 ratings: {len(df):,} snapshots")
    return df


def get_rider_rating_before_race(
    ratings_df: pd.DataFrame,
    rider_id: str,
    race_date,
) -> dict:
    """Get the most recent Glicko-2 rating for a rider before a given date.

    Returns dict with gc_mu, gc_rd, stage_mu, stage_rd.
    If no rating exists, returns initial values (1500, 350).
    """
    rider_ratings = ratings_df[
        (ratings_df['rider_id'] == rider_id) &
        (ratings_df['race_date'] < race_date)
    ]
    if len(rider_ratings) == 0:
        return {'gc_mu': 1500.0, 'gc_rd': 350.0, 'stage_mu': 1500.0, 'stage_rd': 350.0}

    latest = rider_ratings.iloc[-1]  # Already sorted by race_date
    return {
        'gc_mu': latest['gc_mu'],
        'gc_rd': latest['gc_rd'],
        'stage_mu': latest['stage_mu'],
        'stage_rd': latest['stage_rd'],
    }


def extract_test_features_with_glicko(
    results_df: pd.DataFrame,
    startlists_df: pd.DataFrame,
    ratings_df: pd.DataFrame,
    test_year: int,
) -> pd.DataFrame:
    """Extract v4b features + Glicko-2 for test-year stage races."""
    races = startlists_df.drop_duplicates(subset=['race_slug', 'year']).merge(
        results_df[['race_slug', 'year', 'race_type', 'race_name', 'race_date']]
            .drop_duplicates(subset=['race_slug', 'year']),
        on=['race_slug', 'year'],
        how='inner',
    )
    test_races = races[
        (races['year'] == test_year) &
        (races['race_type'].isin(['mini_tour', 'grand_tour']))
    ]
    print(f"    Test races ({test_year}): {len(test_races)}")

    all_rows = []
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

            # Add Glicko-2 features
            glicko = get_rider_rating_before_race(ratings_df, rider_id, race_date)
            feats.update(glicko)

            rider_actual = actual[actual['rider_id'] == rider_id]
            feats['actual_pts'] = rider_actual['pts'].sum()
            feats['rider_id'] = rider_id
            feats['race_slug'] = race_slug
            feats['race_year'] = race_year
            feats['race_type'] = race_type
            feats['race_date'] = race_date_py
            all_rows.append(feats)

    df = pd.DataFrame(all_rows)
    print(f"    Feature matrix: {df.shape[0]:,} rows, {len(FEATURE_COLS_V8G)} features")
    return df


def evaluate_fold(fold_num, results_df, startlists_df, ratings_df, prices_df):
    """Run evaluation for one fold with Glicko-2 features."""
    fold = FOLDS[fold_num]
    test_year = fold['test_year']
    train_end = fold['train_end']

    print(f"\n  === Fold {fold_num}: train ≤{train_end}, test {test_year} ===")

    # Test features
    print(f"  Extracting test features + Glicko...")
    test_df = extract_test_features_with_glicko(results_df, startlists_df, ratings_df, test_year)
    if len(test_df) == 0:
        return {}

    # Train features
    print(f"  Extracting train features + Glicko...")
    train_dfs = []
    for yr in range(2019, train_end + 1):
        yr_df = extract_test_features_with_glicko(results_df, startlists_df, ratings_df, yr)
        if len(yr_df) > 0:
            train_dfs.append(yr_df)

    train_df = pd.concat(train_dfs, ignore_index=True) if train_dfs else pd.DataFrame()
    print(f"  Train: {len(train_df):,}, Test: {len(test_df):,}")

    if len(train_df) == 0:
        return {}

    results = {'fold': fold_num, 'test_year': test_year, 'per_type': {}}

    for race_type in ['mini_tour', 'grand_tour']:
        train_rt = train_df[train_df['race_type'] == race_type]
        test_rt = test_df[test_df['race_type'] == race_type]

        if len(train_rt) == 0 or len(test_rt) == 0:
            continue

        X_train = train_rt[FEATURE_COLS_V8G].fillna(0).values
        y_train = train_rt['actual_pts'].values
        X_test = test_rt[FEATURE_COLS_V8G].fillna(0).values

        model = RandomForestRegressor(
            n_estimators=500, max_depth=14, min_samples_leaf=5,
            random_state=RANDOM_SEED, n_jobs=-1,
        )
        model.fit(X_train, y_train)
        preds = model.predict(X_test)

        test_rt = test_rt.copy()
        test_rt['predicted'] = preds

        # Per-race metrics
        race_rhos, race_p15, race_ndcg = [], [], []
        team_captures, team_overlaps = [], []

        for (slug, year), g in test_rt.groupby(['race_slug', 'race_year']):
            if len(g) < 3:
                continue
            pred = g['predicted'].values
            actual = g['actual_pts'].values

            rho = spearman_rho(pred, actual)
            if np.isnan(rho):
                continue

            race_rhos.append(rho)
            race_p15.append(precision_at_k(pred, actual, 15))
            race_ndcg.append(ndcg_at_k(pred, actual, 20))

            # Team optimality
            race_prices = prices_df[
                (prices_df['race_slug'] == slug) & (prices_df['year'] == year)
            ]
            if len(race_prices) > 0:
                price_map = dict(zip(race_prices['rider_id'], race_prices['price_hillios']))
                rider_ids = g['rider_id'].tolist()
                actual_map = dict(zip(g['rider_id'], g['actual_pts']))
                pred_map = dict(zip(g['rider_id'], g['predicted']))

                actual_team = find_optimal_team(rider_ids, actual_map, price_map)
                pred_team = find_optimal_team(rider_ids, pred_map, price_map)

                if actual_team and pred_team:
                    actual_pts = sum(actual_map.get(r, 0) for r in actual_team)
                    pred_pts = sum(actual_map.get(r, 0) for r in pred_team)
                    if actual_pts > 0:
                        team_captures.append(pred_pts / actual_pts)
                    overlap = len(set(actual_team) & set(pred_team)) / len(actual_team)
                    team_overlaps.append(overlap)

        results['per_type'][race_type] = {
            'n_races': len(race_rhos),
            'rho_mean': np.mean(race_rhos) if race_rhos else 0,
            'rho_values': race_rhos,
            'rho_ci': bootstrap_ci(race_rhos),
            'p15_mean': np.mean(race_p15) if race_p15 else 0,
            'ndcg_mean': np.mean(race_ndcg) if race_ndcg else 0,
            'team_capture_mean': np.mean(team_captures) if team_captures else None,
            'team_overlap_mean': np.mean(team_overlaps) if team_overlaps else None,
            'n_priced_races': len(team_captures),
        }

        r = results['per_type'][race_type]
        tc = f"team_capture={r['team_capture_mean']:.1%}" if r['team_capture_mean'] else "(no prices)"
        print(f"    {race_type}: rho={r['rho_mean']:.4f} ({r['n_races']} races)"
              f"  p@15={r['p15_mean']:.3f}  ndcg@20={r['ndcg_mean']:.3f}  {tc}")

        # Feature importances — show Glicko features
        imp = sorted(zip(FEATURE_COLS_V8G, model.feature_importances_), key=lambda x: -x[1])
        glicko_imps = [(f, i) for f, i in imp if f in GLICKO_FEATURES]
        print(f"    Glicko-2 feature importances: {', '.join(f'{f}={i:.4f}' for f, i in glicko_imps)}")
        print(f"    Top 5 overall: {', '.join(f'{f}={i:.4f}' for f, i in imp[:5])}")

    return results


def main():
    parser = argparse.ArgumentParser(description='Benchmark v8 — Glicko-2 features')
    parser.add_argument('--fold', type=int, choices=[1, 2, 3])
    args = parser.parse_args()

    db_url = os.environ.get(
        'DATABASE_URL',
        'postgresql://cycling:cycling@localhost:5432/cycling_analyzer',
    )

    print("=" * 70)
    print("  Benchmark v8 — v4b + Glicko-2 (53 features)")
    print("=" * 70)

    print("\n[1/4] Loading data...")
    results_df, startlists_df = load_data_fast(db_url)
    ratings_df = load_glicko_ratings(db_url)

    conn = psycopg2.connect(db_url)
    prices_df = pd.read_sql("SELECT rider_id, race_slug, year, price_hillios FROM rider_prices", conn)
    conn.close()

    print("\n[2/4] Running expanding window CV...")
    folds_to_run = [args.fold] if args.fold else [1, 2, 3]
    all_results = []

    for fold_num in folds_to_run:
        result = evaluate_fold(fold_num, results_df, startlists_df, ratings_df, prices_df)
        all_results.append(result)

    if args.fold:
        padded = [{}, {}, {}]
        padded[args.fold - 1] = all_results[0]
        all_results = padded

    print("\n[3/4] Results")
    report = format_report(all_results, 'v4b + Glicko-2 (53 features)')
    print(report)

    print("\n[4/4] Case studies")
    run_case_studies(results_df, startlists_df, prices_df)

    results_dir = os.path.join(os.path.dirname(__file__), '..', 'results')
    os.makedirs(results_dir, exist_ok=True)
    output_file = os.path.join(results_dir, f'benchmark_v8_glicko_{date.today()}.txt')
    with open(output_file, 'w') as f:
        f.write(report)
    print(f"\n  Report saved to: {output_file}")


if __name__ == '__main__':
    main()
