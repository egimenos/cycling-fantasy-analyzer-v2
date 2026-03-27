"""
DEPRECATED: use benchmark_canonical.py instead.

Benchmark: LambdaMART (XGBRanker) — optimizes ranking directly.

Instead of minimizing MSE on predicted points, LambdaMART optimizes
pairwise ranking accuracy. Aligns with our evaluation metric (Spearman rho).

Usage:
    cd ml && python -m src.benchmark_lambdamart
"""

import numpy as np
import pandas as pd
import psycopg2
from xgboost import XGBRanker
from scipy.stats import spearmanr

from .cache_features import load_train_test, FOLDS
from .features import FEATURE_COLS
from .startlist_features import STARTLIST_FEATURE_COLS
from .benchmark_v8 import (
    RANDOM_SEED, find_optimal_team, spearman_rho, precision_at_k, ndcg_at_k,
)

GLICKO_MU = ['gc_mu', 'stage_mu']
ALL_FEATURES = list(FEATURE_COLS) + STARTLIST_FEATURE_COLS + GLICKO_MU


def build_groups(df, race_type):
    """Build group sizes array for XGBRanker.

    XGBRanker needs to know which rows belong to the same "query" (race).
    Returns (sorted_df, groups) where groups[i] = number of riders in race i.
    """
    rt_df = df[df['race_type'] == race_type].copy()
    if len(rt_df) == 0:
        return rt_df, []

    # Sort by race so riders in same race are contiguous
    rt_df = rt_df.sort_values(['race_slug', 'race_year', 'rider_id']).reset_index(drop=True)

    groups = []
    for (slug, year), g in rt_df.groupby(['race_slug', 'race_year']):
        groups.append(len(g))

    return rt_df, groups


def main():
    db_url = 'postgresql://cycling:cycling@localhost:5432/cycling_analyzer'
    conn = psycopg2.connect(db_url)
    prices_df = pd.read_sql("SELECT rider_id, race_slug, year, price_hillios FROM rider_prices", conn)
    conn.close()

    print("=" * 70)
    print("  LambdaMART (XGBRanker) Benchmark")
    print("=" * 70)

    print(f"\n{'Config':<30} {'Mini rho':>10} {'Mini TC%':>10} {'GT rho':>10} {'GT TC%':>10}")
    print("-" * 75)

    # Compare LambdaMART vs LGBM+sqrt
    import lightgbm as lgb
    LGB = {
        'objective': 'regression', 'verbose': -1, 'n_jobs': -1, 'random_state': 42,
        'n_estimators': 256, 'max_depth': 8, 'learning_rate': 0.0204,
        'num_leaves': 71, 'subsample': 0.957, 'colsample_bytree': 0.535,
        'min_child_samples': 48, 'reg_alpha': 0.000197, 'reg_lambda': 0.000548,
    }

    configs = {
        'LGBM+sqrt (current best)': 'lgbm_sqrt',
        'LambdaMART pairwise': 'lambdamart_pairwise',
        'LambdaMART ndcg': 'lambdamart_ndcg',
    }

    for config_name, config_type in configs.items():
        all_mr, all_mt, all_gr, all_gt = [], [], [], []

        for fold in [1, 2, 3]:
            train_df, test_df = load_train_test(fold)
            avail = [c for c in ALL_FEATURES if c in train_df.columns]

            for rt in ['mini_tour', 'grand_tour']:
                tr = train_df[train_df['race_type'] == rt]
                te = test_df[test_df['race_type'] == rt]
                if len(tr) == 0 or len(te) == 0:
                    continue

                if config_type == 'lgbm_sqrt':
                    model = lgb.LGBMRegressor(**LGB)
                    model.fit(tr[avail].fillna(0).values, np.sqrt(tr['actual_pts'].values))
                    preds = np.clip(model.predict(te[avail].fillna(0).values), 0, None) ** 2

                elif config_type.startswith('lambdamart'):
                    objective = 'rank:pairwise' if 'pairwise' in config_type else 'rank:ndcg'

                    # Build train groups
                    tr_sorted, tr_groups = build_groups(train_df, rt)
                    te_sorted = te.sort_values(['race_slug', 'race_year', 'rider_id']).reset_index(drop=True)

                    if not tr_groups:
                        continue

                    model = XGBRanker(
                        objective=objective,
                        n_estimators=300,
                        max_depth=6,
                        learning_rate=0.05,
                        subsample=0.8,
                        colsample_bytree=0.7,
                        random_state=RANDOM_SEED,
                        n_jobs=-1,
                    )
                    model.fit(
                        tr_sorted[avail].fillna(0).values,
                        tr_sorted['actual_pts'].values,
                        group=tr_groups,
                    )
                    preds = model.predict(te_sorted[avail].fillna(0).values)
                    te = te_sorted

                te = te.copy()
                te['predicted'] = preds

                rhos, caps = [], []
                for (s, y), g in te.groupby(['race_slug', 'race_year']):
                    if len(g) < 3:
                        continue
                    rho = spearman_rho(g['predicted'].values, g['actual_pts'].values)
                    if np.isnan(rho):
                        continue
                    rhos.append(rho)

                    rp = prices_df[(prices_df['race_slug'] == s) & (prices_df['year'] == y)]
                    if len(rp) > 0:
                        pm = dict(zip(rp['rider_id'], rp['price_hillios']))
                        am = dict(zip(g['rider_id'], g['actual_pts']))
                        prm = dict(zip(g['rider_id'], g['predicted']))
                        at = find_optimal_team(g['rider_id'].tolist(), am, pm)
                        pt = find_optimal_team(g['rider_id'].tolist(), prm, pm)
                        if at and pt:
                            ap = sum(am.get(r, 0) for r in at)
                            pp = sum(am.get(r, 0) for r in pt)
                            if ap > 0:
                                caps.append(pp / ap)

                if rt == 'mini_tour':
                    all_mr.extend(rhos)
                    all_mt.extend(caps)
                else:
                    all_gr.extend(rhos)
                    all_gt.extend(caps)

        mr = np.mean(all_mr) if all_mr else 0
        mt = np.mean(all_mt) if all_mt else 0
        gr = np.mean(all_gr) if all_gr else 0
        gt = np.mean(all_gt) if all_gt else 0
        print(f"  {config_name:<28} {mr:>10.4f} {mt:>9.1%} {gr:>10.4f} {gt:>9.1%}")

    print("\nDone.")


if __name__ == '__main__':
    main()
