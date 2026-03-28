"""
DEPRECATED: use benchmark_canonical.py instead.

Benchmark v8 — Startlist-Aware Features Test

Tests two configurations:
  A) Startlist features only (Glicko used internally, not exposed to model)
  B) Startlist features + Glicko-2 direct (both)

Uses benchmark protocol from spec 011.

Usage:
    cd ml && python -m src.benchmark_v8_startlist
    cd ml && python -m src.benchmark_v8_startlist --config a   # startlist only
    cd ml && python -m src.benchmark_v8_startlist --config b   # startlist + glicko direct
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
from .startlist_features import (
    STARTLIST_FEATURE_COLS,
    build_rating_lookup,
    compute_all_startlist_features,
)
from .research_v6 import load_data_fast
from .benchmark_v8 import (
    FOLDS, TEAM_SIZE, DEFAULT_BUDGET, RANDOM_SEED,
    find_optimal_team, spearman_rho, precision_at_k, ndcg_at_k,
    bootstrap_ci, format_report, run_case_studies,
)
from .benchmark_v8_glicko import load_glicko_ratings

# Config A: baseline + startlist features (Glicko internal only)
GLICKO_DIRECT_FEATURES = ['gc_mu', 'gc_rd', 'stage_mu', 'stage_rd']

CONFIGS = {
    'a': {
        'name': 'v8a: baseline + startlist (Glicko indirect)',
        'features': list(FEATURE_COLS) + STARTLIST_FEATURE_COLS,
        'include_glicko_direct': False,
    },
    'b': {
        'name': 'v8b: baseline + startlist + Glicko direct',
        'features': list(FEATURE_COLS) + STARTLIST_FEATURE_COLS + GLICKO_DIRECT_FEATURES,
        'include_glicko_direct': True,
    },
}


def get_rider_rating_before_race(ratings_df, rider_id, race_date):
    """Get most recent Glicko-2 rating before race_date."""
    rider_ratings = ratings_df[
        (ratings_df['rider_id'] == rider_id) &
        (ratings_df['race_date'] < race_date)
    ]
    if len(rider_ratings) == 0:
        return {'gc_mu': 1500.0, 'gc_rd': 350.0, 'stage_mu': 1500.0, 'stage_rd': 350.0}
    latest = rider_ratings.iloc[-1]
    return {
        'gc_mu': latest['gc_mu'],
        'gc_rd': latest['gc_rd'],
        'stage_mu': latest['stage_mu'],
        'stage_rd': latest['stage_rd'],
    }


def extract_features_with_startlist(
    results_df, startlists_df, ratings_df, test_year,
    include_glicko_direct=False,
):
    """Extract baseline + startlist features for test year."""
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
    print(f"    Races ({test_year}): {len(test_races)}")

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

        # Race-level supply metrics (E07c)
        stage_count = actual[
            (actual['category'] == 'stage') & (actual['stage_number'].notna())
        ]['stage_number'].nunique()

        # Mountain pass and sprint intermediate point supply for this race
        mtn_pass_results = actual[actual['category'] == 'mountain_pass']
        mtn_pass_supply = mtn_pass_results['pts'].sum()  # total pts awarded across all riders
        spr_inter_results = actual[actual['category'].isin(['sprint_intermediate', 'regularidad_daily'])]
        spr_inter_supply = spr_inter_results['pts'].sum()

        # Build Glicko rating lookup for startlist features
        rating_lookup = build_rating_lookup(ratings_df, race_date)

        # Compute startlist features for all riders at once
        sl_features = compute_all_startlist_features(sl, rating_lookup)

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

            # Add startlist features
            sl_feat = sl_features.get(rider_id, {})
            for col in STARTLIST_FEATURE_COLS:
                feats[col] = sl_feat.get(col, 0.0)

            # Optionally add Glicko direct
            if include_glicko_direct:
                glicko = get_rider_rating_before_race(ratings_df, rider_id, race_date)
                feats.update(glicko)

            rider_actual = actual[actual['rider_id'] == rider_id]
            feats['actual_pts'] = rider_actual['pts'].sum()

            # Per-category targets (decomposed, E07)
            ra_cat = rider_actual.groupby('category')['pts'].sum()
            feats['actual_gc_pts'] = ra_cat.get('gc', 0) + ra_cat.get('gc_daily', 0)
            feats['actual_stage_pts'] = ra_cat.get('stage', 0)
            feats['actual_mountain_pts'] = ra_cat.get('mountain', 0) + ra_cat.get('mountain_pass', 0)
            feats['actual_sprint_pts'] = ra_cat.get('sprint', 0) + ra_cat.get('sprint_intermediate', 0) + ra_cat.get('regularidad_daily', 0)

            # Granular targets + positions (ordinal, E07b)
            feats['actual_gc_only_pts'] = ra_cat.get('gc', 0)
            feats['actual_gc_daily_pts'] = ra_cat.get('gc_daily', 0)
            feats['actual_mountain_final_pts'] = ra_cat.get('mountain', 0)
            feats['actual_mountain_pass_pts'] = ra_cat.get('mountain_pass', 0)
            feats['actual_sprint_final_pts'] = ra_cat.get('sprint', 0)
            feats['actual_sprint_inter_pts'] = ra_cat.get('sprint_intermediate', 0) + ra_cat.get('regularidad_daily', 0)

            # Classification final positions (for ordinal bucket models)
            gc_rows = rider_actual[rider_actual['category'] == 'gc']
            feats['gc_final_position'] = float(gc_rows.iloc[0]['position']) if len(gc_rows) > 0 and gc_rows.iloc[0]['position'] is not None else float('nan')
            mtn_rows = rider_actual[rider_actual['category'] == 'mountain']
            feats['mountain_final_position'] = float(mtn_rows.iloc[0]['position']) if len(mtn_rows) > 0 and mtn_rows.iloc[0]['position'] is not None else float('nan')
            spr_rows = rider_actual[rider_actual['category'] == 'sprint']
            feats['sprint_final_position'] = float(spr_rows.iloc[0]['position']) if len(spr_rows) > 0 and spr_rows.iloc[0]['position'] is not None else float('nan')

            feats['target_stage_count'] = stage_count
            feats['target_mtn_pass_supply'] = mtn_pass_supply
            feats['target_spr_inter_supply'] = spr_inter_supply

            # Stage top-10 count for count model (E07d)
            rider_stages = rider_actual[rider_actual['category'] == 'stage']
            feats['stage_top10_count'] = (rider_stages['position'] <= 10).sum() if len(rider_stages) > 0 else 0

            # Capture rates (fraction of available supply this rider captured)
            feats['mtn_pass_capture'] = feats['actual_mountain_pass_pts'] / mtn_pass_supply if mtn_pass_supply > 0 else 0.0
            feats['spr_inter_capture'] = feats['actual_sprint_inter_pts'] / spr_inter_supply if spr_inter_supply > 0 else 0.0

            feats['rider_id'] = rider_id
            feats['race_slug'] = race_slug
            feats['race_year'] = race_year
            feats['race_type'] = race_type
            feats['race_date'] = race_date_py
            all_rows.append(feats)

    df = pd.DataFrame(all_rows)
    print(f"    Matrix: {df.shape[0]:,} rows")
    return df


def evaluate_fold(fold_num, results_df, startlists_df, ratings_df, prices_df, config):
    """Run evaluation for one fold."""
    fold = FOLDS[fold_num]
    test_year = fold['test_year']
    train_end = fold['train_end']
    feature_cols = config['features']
    include_glicko = config['include_glicko_direct']

    print(f"\n  === Fold {fold_num}: train ≤{train_end}, test {test_year} ===")

    test_df = extract_features_with_startlist(
        results_df, startlists_df, ratings_df, test_year, include_glicko)

    train_dfs = []
    for yr in range(2019, train_end + 1):
        yr_df = extract_features_with_startlist(
            results_df, startlists_df, ratings_df, yr, include_glicko)
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

        X_train = train_rt[feature_cols].fillna(0).values
        y_train = train_rt['actual_pts'].values
        X_test = test_rt[feature_cols].fillna(0).values

        model = RandomForestRegressor(
            n_estimators=500, max_depth=14, min_samples_leaf=5,
            random_state=RANDOM_SEED, n_jobs=-1,
        )
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
        print(f"    {race_type}: rho={r['rho_mean']:.4f} ({r['n_races']})  p@15={r['p15_mean']:.3f}  {tc}")

        # Show startlist feature importances
        imp = sorted(zip(feature_cols, model.feature_importances_), key=lambda x: -x[1])
        sl_imps = [(f, i) for f, i in imp if f in STARTLIST_FEATURE_COLS]
        if sl_imps:
            print(f"    Startlist importances: {', '.join(f'{f}={i:.4f}' for f, i in sl_imps)}")
        print(f"    Top 5: {', '.join(f'{f}={i:.4f}' for f, i in imp[:5])}")

    return results


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', choices=['a', 'b'], default=None,
                        help='a=startlist only, b=startlist+glicko. Default: run both')
    args = parser.parse_args()

    db_url = os.environ.get(
        'DATABASE_URL',
        'postgresql://cycling:cycling@localhost:5432/cycling_analyzer',
    )

    configs_to_run = [args.config] if args.config else ['a', 'b']

    print("=" * 70)
    print("  Benchmark v8 — Startlist-Aware Features")
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
        print(f"  Features: {len(config['features'])}")
        print(f"{'='*70}")

        all_results = []
        for fold_num in [1, 2, 3]:
            result = evaluate_fold(fold_num, results_df, startlists_df, ratings_df, prices_df, config)
            all_results.append(result)

        report = format_report(all_results, config['name'])
        print(f"\n{report}")

        results_dir = os.path.join(os.path.dirname(__file__), '..', 'results')
        os.makedirs(results_dir, exist_ok=True)
        fname = f"benchmark_v8_startlist_{config_key}_{date.today()}.txt"
        with open(os.path.join(results_dir, fname), 'w') as f:
            f.write(report)

    print("\nDone.")


if __name__ == '__main__':
    main()
