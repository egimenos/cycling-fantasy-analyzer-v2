"""
Fast benchmark using cached features.

Loads pre-extracted features from parquet cache (built by cache_features.py).
Runs 3-fold expanding window CV with any model and feature subset in ~2 min.

Usage:
    cd ml && python -m src.cache_features            # build cache first (once)
    cd ml && python -m src.benchmark_fast             # RF baseline
    cd ml && python -m src.benchmark_fast --model lgbm  # LightGBM
    cd ml && python -m src.benchmark_fast --model lgbm --features all  # LightGBM + all features
"""

import argparse
import os
from datetime import date

import numpy as np
import pandas as pd
import psycopg2
from scipy.stats import spearmanr
from sklearn.ensemble import RandomForestRegressor

from .features import FEATURE_COLS
from .startlist_features import STARTLIST_FEATURE_COLS
from .cache_features import load_train_test, is_cached, FOLDS
from .benchmark_v8 import (
    RANDOM_SEED, find_optimal_team,
    spearman_rho, precision_at_k, ndcg_at_k, bootstrap_ci,
)

GLICKO_FEATURES = ['gc_mu', 'gc_rd', 'stage_mu', 'stage_rd']

FEATURE_SETS = {
    'baseline': list(FEATURE_COLS),                                          # 41
    'startlist': list(FEATURE_COLS) + STARTLIST_FEATURE_COLS,                # 46
    'glicko': list(FEATURE_COLS) + GLICKO_FEATURES,                          # 45
    'all': list(FEATURE_COLS) + STARTLIST_FEATURE_COLS + GLICKO_FEATURES,    # 50
}

RF_PARAMS = {
    'n_estimators': 500, 'max_depth': 14, 'min_samples_leaf': 5,
    'random_state': RANDOM_SEED, 'n_jobs': -1,
}

# Optuna-tuned LightGBM params
LGB_PARAMS = {
    'objective': 'regression', 'verbose': -1, 'n_jobs': -1, 'random_state': RANDOM_SEED,
    'n_estimators': 256, 'max_depth': 8, 'learning_rate': 0.0204,
    'num_leaves': 71, 'subsample': 0.957, 'colsample_bytree': 0.535,
    'min_child_samples': 48, 'reg_alpha': 0.000197, 'reg_lambda': 0.000548,
}


def make_model(model_type: str):
    if model_type == 'rf':
        return RandomForestRegressor(**RF_PARAMS)
    elif model_type == 'lgbm':
        import lightgbm as lgb
        return lgb.LGBMRegressor(**LGB_PARAMS)
    else:
        raise ValueError(f"Unknown model: {model_type}")


def evaluate_fold(fold_num, feature_cols, model_type, prices_df):
    """Evaluate one fold using cached features."""
    train_df, test_df = load_train_test(fold_num)
    available = [c for c in feature_cols if c in train_df.columns]

    fold_result = {'fold': fold_num, 'test_year': FOLDS[fold_num]['test_year'], 'per_type': {}}

    for rt in ['mini_tour', 'grand_tour']:
        tr = train_df[train_df['race_type'] == rt]
        te = test_df[test_df['race_type'] == rt]
        if len(tr) == 0 or len(te) == 0:
            continue

        model = make_model(model_type)
        model.fit(tr[available].fillna(0).values, tr['actual_pts'].values)
        preds = model.predict(te[available].fillna(0).values)
        te = te.copy()
        te['predicted'] = preds

        rhos, p15s, ndcgs, captures, overlaps = [], [], [], [], []

        for (slug, year), g in te.groupby(['race_slug', 'race_year']):
            if len(g) < 3:
                continue
            pred = g['predicted'].values
            actual = g['actual_pts'].values
            rho = spearman_rho(pred, actual)
            if np.isnan(rho):
                continue
            rhos.append(rho)
            p15s.append(precision_at_k(pred, actual, 15))
            ndcgs.append(ndcg_at_k(pred, actual, 20))

            # Team capture
            rp = prices_df[(prices_df['race_slug'] == slug) & (prices_df['year'] == year)]
            if len(rp) > 0:
                pm = dict(zip(rp['rider_id'], rp['price_hillios']))
                ids = g['rider_id'].tolist()
                am = dict(zip(g['rider_id'], g['actual_pts']))
                prm = dict(zip(g['rider_id'], g['predicted']))
                at = find_optimal_team(ids, am, pm)
                pt = find_optimal_team(ids, prm, pm)
                if at and pt:
                    ap = sum(am.get(r, 0) for r in at)
                    pp = sum(am.get(r, 0) for r in pt)
                    if ap > 0:
                        captures.append(pp / ap)
                    overlaps.append(len(set(at) & set(pt)) / len(at))

        fold_result['per_type'][rt] = {
            'n_races': len(rhos),
            'rho_mean': np.mean(rhos) if rhos else 0,
            'rho_values': rhos,
            'rho_ci': bootstrap_ci(rhos),
            'p15_mean': np.mean(p15s) if p15s else 0,
            'ndcg_mean': np.mean(ndcgs) if ndcgs else 0,
            'team_capture_mean': np.mean(captures) if captures else None,
            'team_overlap_mean': np.mean(overlaps) if overlaps else None,
            'n_priced_races': len(captures),
        }

    return fold_result


def print_results(all_results, label):
    """Print compact results table."""
    print(f"\n  {label}")
    print(f"  {'':15} {'Mini rho':>10} {'Mini TC%':>10} {'GT rho':>10} {'GT TC%':>10}")
    print(f"  {'':15} {'-'*10} {'-'*10} {'-'*10} {'-'*10}")

    for i, r in enumerate(all_results):
        if not r:
            continue
        mt = r.get('per_type', {}).get('mini_tour', {})
        gt = r.get('per_type', {}).get('grand_tour', {})
        mt_rho = f"{mt.get('rho_mean', 0):.4f}" if mt else "N/A"
        mt_tc = f"{mt.get('team_capture_mean', 0):.1%}" if mt.get('team_capture_mean') else "N/A"
        gt_rho = f"{gt.get('rho_mean', 0):.4f}" if gt else "N/A"
        gt_tc = f"{gt.get('team_capture_mean', 0):.1%}" if gt.get('team_capture_mean') else "N/A"
        print(f"  Fold {i+1:<10} {mt_rho:>10} {mt_tc:>10} {gt_rho:>10} {gt_tc:>10}")

    # Averages
    for rt_name, rt_key in [('Mini', 'mini_tour'), ('GT', 'grand_tour')]:
        rhos = [r['per_type'][rt_key]['rho_mean'] for r in all_results if rt_key in r.get('per_type', {})]
        tcs = [r['per_type'][rt_key]['team_capture_mean'] for r in all_results
               if rt_key in r.get('per_type', {}) and r['per_type'][rt_key].get('team_capture_mean')]
        if rhos:
            tc_str = f"{np.mean(tcs):.1%}" if tcs else "N/A"
            print(f"  {'Average ' + rt_name:<15} {np.mean(rhos):>10.4f} {tc_str:>10}")


def main():
    parser = argparse.ArgumentParser(description='Fast benchmark with cached features')
    parser.add_argument('--model', choices=['rf', 'lgbm'], default='rf')
    parser.add_argument('--features', choices=list(FEATURE_SETS.keys()), default='baseline')
    parser.add_argument('--all-combos', action='store_true', help='Run all model × feature combinations')
    args = parser.parse_args()

    if not is_cached():
        print("ERROR: Feature cache not found. Run: python -m src.cache_features")
        return

    db_url = os.environ.get('DATABASE_URL', 'postgresql://cycling:cycling@localhost:5432/cycling_analyzer')
    conn = psycopg2.connect(db_url)
    prices_df = pd.read_sql("SELECT rider_id, race_slug, year, price_hillios FROM rider_prices", conn)
    conn.close()
    print(f"Prices: {len(prices_df):,} entries")

    if args.all_combos:
        combos = [
            ('rf', 'baseline'), ('rf', 'all'),
            ('lgbm', 'baseline'), ('lgbm', 'all'),
        ]
    else:
        combos = [(args.model, args.features)]

    for model_type, feat_key in combos:
        feature_cols = FEATURE_SETS[feat_key]
        label = f"{model_type.upper()} / {feat_key} ({len(feature_cols)} features)"

        print(f"\n{'='*60}")
        print(f"  {label}")
        print(f"{'='*60}")

        all_results = []
        for fold_num in [1, 2, 3]:
            result = evaluate_fold(fold_num, feature_cols, model_type, prices_df)
            all_results.append(result)

        print_results(all_results, label)

    # Save
    results_dir = os.path.join(os.path.dirname(__file__), '..', 'results')
    os.makedirs(results_dir, exist_ok=True)
    print(f"\nDone. ({date.today()})")


if __name__ == '__main__':
    main()
