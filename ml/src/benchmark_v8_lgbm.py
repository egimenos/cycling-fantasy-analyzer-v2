"""
Benchmark v8 — LightGBM Model Swap

Tests LightGBM vs RF baseline on clean features (41) and with
Glicko + startlist features (46/50).

Configs:
  A) LightGBM on clean 41 features (model swap only)
  B) LightGBM on 41 + startlist (46 features)
  C) LightGBM on 41 + startlist + Glicko direct (50 features)

Usage:
    cd ml && python -m src.benchmark_v8_lgbm
    cd ml && python -m src.benchmark_v8_lgbm --config a
"""

import argparse
import os
from datetime import date

import lightgbm as lgb
import numpy as np
import pandas as pd
import psycopg2
from scipy.stats import spearmanr

from .features import FEATURE_COLS
from .startlist_features import STARTLIST_FEATURE_COLS
from .research_v6 import load_data_fast
from .benchmark_v8 import (
    FOLDS, RANDOM_SEED,
    find_optimal_team, spearman_rho, precision_at_k, ndcg_at_k,
    bootstrap_ci, format_report, run_case_studies,
)
from .benchmark_v8_glicko import load_glicko_ratings
from .benchmark_v8_startlist import extract_features_with_startlist

GLICKO_DIRECT = ['gc_mu', 'gc_rd', 'stage_mu', 'stage_rd']

CONFIGS = {
    'a': {
        'name': 'LightGBM on clean 41 features',
        'features': list(FEATURE_COLS),
        'include_glicko_direct': False,
        'include_startlist': False,
    },
    'b': {
        'name': 'LightGBM + startlist (46 features)',
        'features': list(FEATURE_COLS) + STARTLIST_FEATURE_COLS,
        'include_glicko_direct': False,
        'include_startlist': True,
    },
    'c': {
        'name': 'LightGBM + startlist + Glicko (50 features)',
        'features': list(FEATURE_COLS) + STARTLIST_FEATURE_COLS + GLICKO_DIRECT,
        'include_glicko_direct': True,
        'include_startlist': True,
    },
}

# LightGBM params (tuned for small dataset, regularized)
LGB_PARAMS = {
    'objective': 'regression',
    'metric': 'rmse',
    'n_estimators': 800,
    'max_depth': 5,
    'learning_rate': 0.03,
    'num_leaves': 31,
    'subsample': 0.8,
    'colsample_bytree': 0.7,
    'min_child_samples': 10,
    'reg_alpha': 0.1,
    'reg_lambda': 1.0,
    'random_state': RANDOM_SEED,
    'verbose': -1,
    'n_jobs': -1,
}


def extract_features_for_config(
    results_df, startlists_df, ratings_df, year, config,
):
    """Extract features based on config."""
    if config['include_startlist'] or config['include_glicko_direct']:
        return extract_features_with_startlist(
            results_df, startlists_df, ratings_df, year,
            include_glicko_direct=config['include_glicko_direct'],
        )
    else:
        # Use the startlist extractor but without extras
        return extract_features_with_startlist(
            results_df, startlists_df, ratings_df, year,
            include_glicko_direct=False,
        )


def evaluate_fold(fold_num, results_df, startlists_df, ratings_df, prices_df, config):
    """Run evaluation for one fold with LightGBM."""
    fold = FOLDS[fold_num]
    test_year = fold['test_year']
    train_end = fold['train_end']
    feature_cols = config['features']

    print(f"\n  === Fold {fold_num}: train ≤{train_end}, test {test_year} ===")

    test_df = extract_features_for_config(
        results_df, startlists_df, ratings_df, test_year, config)

    train_dfs = []
    for yr in range(2019, train_end + 1):
        yr_df = extract_features_for_config(
            results_df, startlists_df, ratings_df, yr, config)
        if len(yr_df) > 0:
            train_dfs.append(yr_df)

    train_df = pd.concat(train_dfs, ignore_index=True) if train_dfs else pd.DataFrame()
    print(f"  Train: {len(train_df):,}, Test: {len(test_df):,}, Features: {len(feature_cols)}")

    if len(train_df) == 0 or len(test_df) == 0:
        return {}

    results = {'fold': fold_num, 'test_year': test_year, 'per_type': {}}

    for race_type in ['mini_tour', 'grand_tour']:
        train_rt = train_df[train_df['race_type'] == race_type]
        test_rt = test_df[test_df['race_type'] == race_type]
        if len(train_rt) == 0 or len(test_rt) == 0:
            continue

        # Use only features that exist in the dataframe
        available_cols = [c for c in feature_cols if c in train_rt.columns]

        X_train = train_rt[available_cols].fillna(0).values
        y_train = train_rt['actual_pts'].values
        X_test = test_rt[available_cols].fillna(0).values

        model = lgb.LGBMRegressor(**LGB_PARAMS)
        model.fit(X_train, y_train)
        preds = model.predict(X_test)

        test_rt = test_rt.copy()
        test_rt['predicted'] = preds

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

            race_prices = prices_df[
                (prices_df['race_slug'] == slug) & (prices_df['year'] == year)]
            if len(race_prices) > 0:
                pm = dict(zip(race_prices['rider_id'], race_prices['price_hillios']))
                ids = g['rider_id'].tolist()
                am = dict(zip(g['rider_id'], g['actual_pts']))
                prm = dict(zip(g['rider_id'], g['predicted']))
                at = find_optimal_team(ids, am, pm)
                pt = find_optimal_team(ids, prm, pm)
                if at and pt:
                    ap = sum(am.get(r, 0) for r in at)
                    pp = sum(am.get(r, 0) for r in pt)
                    if ap > 0:
                        team_captures.append(pp / ap)
                    team_overlaps.append(len(set(at) & set(pt)) / len(at))

        r = {
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
        results['per_type'][race_type] = r

        tc = f"tc={r['team_capture_mean']:.1%}" if r['team_capture_mean'] else "(no prices)"
        print(f"    {race_type}: rho={r['rho_mean']:.4f} ({r['n_races']})  "
              f"p@15={r['p15_mean']:.3f}  {tc}")

        # Top features
        imp = sorted(zip(available_cols, model.feature_importances_), key=lambda x: -x[1])
        print(f"    Top 5: {', '.join(f'{f}={i}' for f, i in imp[:5])}")

    return results


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', choices=['a', 'b', 'c'], default=None)
    args = parser.parse_args()

    db_url = os.environ.get(
        'DATABASE_URL',
        'postgresql://cycling:cycling@localhost:5432/cycling_analyzer',
    )

    configs_to_run = [args.config] if args.config else ['a', 'b', 'c']

    print("=" * 70)
    print("  Benchmark v8 — LightGBM Model Swap")
    print("=" * 70)

    print("\n[1] Loading data...")
    results_df, startlists_df = load_data_fast(db_url)
    ratings_df = load_glicko_ratings(db_url)
    conn = psycopg2.connect(db_url)
    prices_df = pd.read_sql("SELECT rider_id, race_slug, year, price_hillios FROM rider_prices", conn)
    conn.close()

    for config_key in configs_to_run:
        config = CONFIGS[config_key]
        print(f"\n\n{'='*70}")
        print(f"  CONFIG {config_key.upper()}: {config['name']}")
        print(f"{'='*70}")

        all_results = []
        for fold_num in [1, 2, 3]:
            result = evaluate_fold(
                fold_num, results_df, startlists_df, ratings_df, prices_df, config)
            all_results.append(result)

        report = format_report(all_results, config['name'])
        print(f"\n{report}")

        results_dir = os.path.join(os.path.dirname(__file__), '..', 'results')
        os.makedirs(results_dir, exist_ok=True)
        fname = f"benchmark_v8_lgbm_{config_key}_{date.today()}.txt"
        with open(os.path.join(results_dir, fname), 'w') as f:
            f.write(report)

    print("\nDone.")


if __name__ == '__main__':
    main()
