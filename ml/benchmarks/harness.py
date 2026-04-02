"""
Definitive Fantasy Benchmark — v8

Evaluates ML models using the full benchmark protocol from spec 011:
1. Expanding window CV (3 folds: →2023, →2024, →2025)
2. Metrics: Spearman rho, precision@15, NDCG@20, team capture %, team overlap %
3. Case studies: Vingegaard/Almeida, McNulty, Philipsen
4. Standardized report format

Uses historical prices from rider_prices table to compute the ultimate metric:
what % of the actually optimal team's points does the predicted team capture?

Usage:
    cd ml && python -m src.benchmark_v8
    cd ml && python -m src.benchmark_v8 --fold 3      # only fold 3 (2025)
"""

import argparse
import os
from collections import defaultdict
from datetime import date

import joblib
import numpy as np
import pandas as pd
from scipy.stats import spearmanr

from src.features.stage_race import (
    FEATURE_COLS,
    _compute_rider_features,
    _compute_team_info,
    compute_race_profile,
)
from src.data.loader import load_data as load_data_fast

# ── Constants ────────────────────────────────────────────────────────

TEAM_SIZE = 9
DEFAULT_BUDGET = 2000
RANDOM_SEED = 42
BOOTSTRAP_N = 1000

FOLDS = {
    1: {'train_end': 2022, 'test_year': 2023},
    2: {'train_end': 2023, 'test_year': 2024},
    3: {'train_end': 2024, 'test_year': 2025},
}

# Case study rider IDs
VINGEGAARD_ID = '352cb964-42b0-4ac1-b278-1d5c18c6d62c'
ALMEIDA_ID = '46cb6c3f-2a9b-40ba-a702-4f150a7680f2'
MCNULTY_ID = None  # Will be resolved at runtime
PHILIPSEN_ID = '56ed721d-22d4-4526-bfc3-8d8b5724a2c2'


# ── Knapsack optimizer (mirrors TypeScript knapsack.service.ts) ──────

def find_optimal_team(
    rider_ids: list[str],
    scores: dict[str, float],
    prices: dict[str, int],
    budget: int = DEFAULT_BUDGET,
    team_size: int = TEAM_SIZE,
) -> list[str]:
    """0/1 Knapsack with cardinality constraint.

    Selects exactly team_size riders within budget maximizing total score.
    Returns list of selected rider_ids.

    Prices are scaled down by PRICE_SCALE to reduce DP state space.
    With PRICE_SCALE=5: budget 2000→400, O(n×400×9) instead of O(n×2000×9).
    """
    PRICE_SCALE = 5  # Scale factor — prices rounded up to preserve feasibility

    # Filter to riders that have both score and price
    valid = [r for r in rider_ids if r in scores and r in prices and prices[r] > 0]
    if len(valid) < team_size:
        return valid[:team_size] if valid else []

    n = len(valid)
    # Scale prices: ceil division to be conservative (never undercount cost)
    scaled_prices = {r: (prices[r] + PRICE_SCALE - 1) // PRICE_SCALE for r in valid}
    B = budget // PRICE_SCALE
    K = team_size

    # DP: dp[b][k] = max score with budget b and k riders
    size = (B + 1) * (K + 1)
    current = np.full(size, -1.0)
    for b in range(B + 1):
        current[b * (K + 1) + 0] = 0.0

    decisions = []

    for i in range(n):
        price = scaled_prices[valid[i]]
        score = scores[valid[i]]
        nxt = np.full(size, -1.0)
        dec = np.zeros(size, dtype=bool)

        for b in range(B + 1):
            for k in range(K + 1):
                idx = b * (K + 1) + k

                # Skip rider i
                if current[idx] >= 0 and current[idx] > nxt[idx]:
                    nxt[idx] = current[idx]
                    dec[idx] = False

                # Include rider i
                if k > 0 and b >= price:
                    prev_idx = (b - price) * (K + 1) + (k - 1)
                    if current[prev_idx] >= 0:
                        new_score = current[prev_idx] + score
                        if new_score > nxt[idx]:
                            nxt[idx] = new_score
                            dec[idx] = True

        current = nxt
        decisions.append(dec)

    # Find best
    best_score = -1
    best_budget = -1
    for b in range(B + 1):
        idx = b * (K + 1) + K
        if current[idx] > best_score:
            best_score = current[idx]
            best_budget = b

    if best_score < 0:
        return []

    # Backtrack
    selected = []
    rem_b = best_budget
    rem_k = K
    for i in range(n - 1, -1, -1):
        idx = rem_b * (K + 1) + rem_k
        if decisions[i][idx]:
            selected.append(valid[i])
            rem_b -= scaled_prices[valid[i]]
            rem_k -= 1

    return selected


# ── Metrics ──────────────────────────────────────────────────────────

def spearman_rho(predicted: np.ndarray, actual: np.ndarray) -> float:
    """Spearman rank correlation."""
    if len(predicted) < 3 or np.std(actual) == 0:
        return np.nan
    rho, _ = spearmanr(predicted, actual)
    return rho


def precision_at_k(predicted: np.ndarray, actual: np.ndarray, k: int = 15) -> float:
    """Of the predicted top-k, how many are in the actual top-k?"""
    if len(predicted) < k:
        k = len(predicted)
    pred_top = set(np.argsort(-predicted)[:k])
    actual_top = set(np.argsort(-actual)[:k])
    return len(pred_top & actual_top) / k


def ndcg_at_k(predicted: np.ndarray, actual: np.ndarray, k: int = 20) -> float:
    """Normalized Discounted Cumulative Gain at k."""
    if len(predicted) < 2:
        return 0.0
    k = min(k, len(predicted))

    # Get the actual scores ordered by predicted ranking
    pred_order = np.argsort(-predicted)[:k]
    dcg = sum(actual[pred_order[i]] / np.log2(i + 2) for i in range(k))

    # Ideal DCG: actual top-k in actual order
    ideal_order = np.argsort(-actual)[:k]
    idcg = sum(actual[ideal_order[i]] / np.log2(i + 2) for i in range(k))

    return dcg / idcg if idcg > 0 else 0.0


def bootstrap_ci(values: list[float], n_boot: int = BOOTSTRAP_N) -> tuple[float, float]:
    """Bootstrap 95% confidence interval."""
    rng = np.random.RandomState(RANDOM_SEED)
    if len(values) < 2:
        return (np.nan, np.nan)
    means = [np.mean(rng.choice(values, size=len(values), replace=True))
             for _ in range(n_boot)]
    return (np.percentile(means, 2.5), np.percentile(means, 97.5))


# ── Feature extraction for a single fold ─────────────────────────────

def extract_test_features(
    results_df: pd.DataFrame,
    startlists_df: pd.DataFrame,
    test_year: int,
) -> pd.DataFrame:
    """Extract features for test-year stage races only."""
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

            rider_actual = actual[actual['rider_id'] == rider_id]
            feats['actual_pts'] = rider_actual['pts'].sum()
            feats['rider_id'] = rider_id
            feats['race_slug'] = race_slug
            feats['race_year'] = race_year
            feats['race_type'] = race_type
            feats['race_date'] = race_date_py
            all_rows.append(feats)

    df = pd.DataFrame(all_rows)
    print(f"    Feature matrix: {df.shape[0]:,} rows")
    return df


# ── Main evaluation ──────────────────────────────────────────────────

def evaluate_fold(
    fold_num: int,
    results_df: pd.DataFrame,
    startlists_df: pd.DataFrame,
    prices_df: pd.DataFrame,
    model_type: str = 'production',
) -> dict:
    """Run full evaluation for one fold."""
    from sklearn.ensemble import RandomForestRegressor

    fold = FOLDS[fold_num]
    test_year = fold['test_year']
    train_end = fold['train_end']

    print(f"\n  === Fold {fold_num}: train ≤{train_end}, test {test_year} ===")

    # Extract test features
    print(f"  Extracting test features...")
    test_df = extract_test_features(results_df, startlists_df, test_year)
    if len(test_df) == 0:
        return {}

    # Extract train features
    print(f"  Extracting train features...")
    train_dfs = []
    for yr in range(2019, train_end + 1):
        yr_races = startlists_df.drop_duplicates(subset=['race_slug', 'year']).merge(
            results_df[['race_slug', 'year', 'race_type', 'race_date']]
                .drop_duplicates(subset=['race_slug', 'year']),
            on=['race_slug', 'year'],
            how='inner',
        )
        yr_races = yr_races[
            (yr_races['year'] == yr) &
            (yr_races['race_type'].isin(['mini_tour', 'grand_tour']))
        ]
        if len(yr_races) == 0:
            continue

        yr_df = extract_test_features(results_df, startlists_df, yr)
        if len(yr_df) > 0:
            train_dfs.append(yr_df)

    train_df = pd.concat(train_dfs, ignore_index=True) if train_dfs else pd.DataFrame()
    print(f"  Train: {len(train_df):,} rows, Test: {len(test_df):,} rows")

    if len(train_df) == 0:
        return {}

    # Train model per race type
    results = {'fold': fold_num, 'test_year': test_year, 'per_type': {}}

    for race_type in ['mini_tour', 'grand_tour']:
        train_rt = train_df[train_df['race_type'] == race_type]
        test_rt = test_df[test_df['race_type'] == race_type]

        if len(train_rt) == 0 or len(test_rt) == 0:
            continue

        X_train = train_rt[FEATURE_COLS].fillna(0).values
        y_train = train_rt['actual_pts'].values
        X_test = test_rt[FEATURE_COLS].fillna(0).values

        model = RandomForestRegressor(
            n_estimators=500, max_depth=14, min_samples_leaf=5,
            random_state=RANDOM_SEED, n_jobs=-1,
        )
        model.fit(X_train, y_train)
        preds = model.predict(X_test)

        test_rt = test_rt.copy()
        test_rt['predicted'] = preds

        # Per-race metrics
        race_rhos = []
        race_p15 = []
        race_ndcg = []
        team_captures = []
        team_overlaps = []

        for (slug, year), g in test_rt.groupby(['race_slug', 'race_year']):
            if len(g) < 3:
                continue

            pred = g['predicted'].values
            actual = g['actual_pts'].values

            rho = spearman_rho(pred, actual)
            if np.isnan(rho):
                continue

            p15 = precision_at_k(pred, actual, 15)
            ndcg = ndcg_at_k(pred, actual, 20)

            race_rhos.append(rho)
            race_p15.append(p15)
            race_ndcg.append(ndcg)

            # Team optimality (if prices available)
            race_prices = prices_df[
                (prices_df['race_slug'] == slug) &
                (prices_df['year'] == year)
            ]
            if len(race_prices) > 0:
                price_map = dict(zip(race_prices['rider_id'], race_prices['price_hillios']))
                rider_ids = g['rider_id'].tolist()
                actual_map = dict(zip(g['rider_id'], g['actual_pts']))
                pred_map = dict(zip(g['rider_id'], g['predicted']))

                # Optimal team by actual points
                actual_team = find_optimal_team(rider_ids, actual_map, price_map)
                # Predicted optimal team
                pred_team = find_optimal_team(rider_ids, pred_map, price_map)

                if actual_team and pred_team:
                    actual_team_pts = sum(actual_map.get(r, 0) for r in actual_team)
                    pred_team_actual_pts = sum(actual_map.get(r, 0) for r in pred_team)

                    if actual_team_pts > 0:
                        capture = pred_team_actual_pts / actual_team_pts
                        team_captures.append(capture)

                    overlap = len(set(actual_team) & set(pred_team)) / len(actual_team) if actual_team else 0
                    team_overlaps.append(overlap)

        # Aggregate
        rt_result = {
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
        results['per_type'][race_type] = rt_result

        print(f"    {race_type}: rho={rt_result['rho_mean']:.4f} ({rt_result['n_races']} races)"
              f"  p@15={rt_result['p15_mean']:.3f}  ndcg@20={rt_result['ndcg_mean']:.3f}"
              f"  team_capture={rt_result['team_capture_mean']:.1%}" if rt_result['team_capture_mean'] else
              f"    {race_type}: rho={rt_result['rho_mean']:.4f} ({rt_result['n_races']} races)"
              f"  p@15={rt_result['p15_mean']:.3f}  ndcg@20={rt_result['ndcg_mean']:.3f}"
              f"  (no price data)")

    return results


# ── Case studies ─────────────────────────────────────────────────────

def run_case_studies(results_df, startlists_df, prices_df):
    """Run the 3 mandatory case studies from the benchmark protocol."""
    print("\n  CASE STUDIES")
    print("  " + "=" * 60)

    # Resolve McNulty ID
    mcnulty = results_df[results_df['rider_name'].str.contains('McNulty', case=False, na=False)]
    mcnulty_id = mcnulty.iloc[0]['rider_id'] if len(mcnulty) > 0 else None

    for name, rid in [("Vingegaard", VINGEGAARD_ID), ("Almeida", ALMEIDA_ID),
                       ("McNulty", mcnulty_id), ("Philipsen", PHILIPSEN_ID)]:
        if rid is None:
            print(f"  {name}: ID not found")
            continue

        recent = results_df[
            (results_df['rider_id'] == rid) &
            (results_df['year'] >= 2024) &
            (results_df['race_type'].isin(['mini_tour', 'grand_tour']))
        ]
        by_race = recent.groupby(['race_slug', 'year', 'race_type']).agg(
            pts=('pts', 'sum')
        ).sort_values('pts', ascending=False)

        print(f"\n  {name} (recent stage races):")
        for (slug, yr, rt), row in by_race.head(5).iterrows():
            # Check if price exists
            price_row = prices_df[
                (prices_df['rider_id'] == rid) &
                (prices_df['race_slug'] == slug) &
                (prices_df['year'] == yr)
            ]
            price_str = f"  price={price_row.iloc[0]['price_hillios']}" if len(price_row) > 0 else ""
            print(f"    {slug} {yr}: {row['pts']:.0f} pts ({rt}){price_str}")


# ── Report ───────────────────────────────────────────────────────────

def format_report(all_results: list[dict], model_name: str) -> str:
    """Format results in the standardized report format."""
    lines = []
    lines.append("=" * 70)
    lines.append(f"  BENCHMARK REPORT — {model_name}")
    lines.append(f"  Date: {date.today()}")
    lines.append(f"  Protocol: Expanding Window CV, 3 folds")
    lines.append("=" * 70)

    # Per-fold results
    for rt in ['mini_tour', 'grand_tour']:
        lines.append(f"\n  {rt.upper()}")
        lines.append(f"  {'Metric':<20} {'Fold 1':>10} {'Fold 2':>10} {'Fold 3':>10} {'Average':>10}")
        lines.append(f"  {'-'*20} {'-'*10} {'-'*10} {'-'*10} {'-'*10}")

        for metric, fmt in [('rho_mean', '.4f'), ('p15_mean', '.3f'),
                            ('ndcg_mean', '.3f'), ('team_capture_mean', '.1%'),
                            ('team_overlap_mean', '.1%')]:
            vals = []
            for r in all_results:
                v = r.get('per_type', {}).get(rt, {}).get(metric)
                vals.append(v)

            metric_name = {'rho_mean': 'Spearman rho', 'p15_mean': 'Precision@15',
                          'ndcg_mean': 'NDCG@20', 'team_capture_mean': 'Team Capture %',
                          'team_overlap_mean': 'Team Overlap %'}[metric]

            val_strs = []
            valid_vals = []
            for v in vals:
                if v is not None:
                    val_strs.append(f"{v:{fmt}}")
                    valid_vals.append(v)
                else:
                    val_strs.append(f"{'N/A':>10}")

            avg = np.mean(valid_vals) if valid_vals else None
            avg_str = f"{avg:{fmt}}" if avg is not None else 'N/A'

            lines.append(f"  {metric_name:<20} {val_strs[0]:>10} {val_strs[1]:>10} {val_strs[2]:>10} {avg_str:>10}")

        # CI for rho
        all_rhos = []
        for r in all_results:
            rhos = r.get('per_type', {}).get(rt, {}).get('rho_values', [])
            all_rhos.extend(rhos)
        if all_rhos:
            ci = bootstrap_ci(all_rhos)
            lines.append(f"  {'Rho 95% CI':<20} {'':>10} {'':>10} {'':>10} [{ci[0]:.4f}, {ci[1]:.4f}]")

    lines.append("")
    return "\n".join(lines)


# ── Main ─────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='Definitive Fantasy Benchmark v8')
    parser.add_argument('--fold', type=int, choices=[1, 2, 3], help='Run only this fold')
    args = parser.parse_args()

    db_url = os.environ.get(
        'DATABASE_URL',
        'postgresql://cycling:cycling@localhost:5432/cycling_analyzer',
    )

    print("=" * 70)
    print("  Definitive Fantasy Benchmark v8")
    print("  Model: v4b Random Forest (49 features) — BASELINE")
    print("=" * 70)

    # Load data
    print("\n[1/4] Loading data...")
    results_df, startlists_df = load_data_fast(db_url)

    # Load prices
    import psycopg2
    conn = psycopg2.connect(db_url)
    prices_df = pd.read_sql("SELECT rider_id, race_slug, year, price_hillios FROM rider_prices", conn)
    conn.close()
    print(f"  Prices: {len(prices_df):,} entries across {prices_df[['race_slug', 'year']].drop_duplicates().shape[0]} races")

    # Run folds
    print("\n[2/4] Running expanding window CV...")
    folds_to_run = [args.fold] if args.fold else [1, 2, 3]
    all_results = []

    for fold_num in folds_to_run:
        result = evaluate_fold(fold_num, results_df, startlists_df, prices_df)
        all_results.append(result)

    # Pad missing folds with empty dicts for report
    if args.fold:
        padded = [{}, {}, {}]
        padded[args.fold - 1] = all_results[0]
        all_results = padded

    # Report
    print("\n[3/4] Results")
    report = format_report(all_results, 'v4b RF Baseline')
    print(report)

    # Case studies
    print("\n[4/4] Case studies")
    run_case_studies(results_df, startlists_df, prices_df)

    # Save
    results_dir = os.path.join(os.path.dirname(__file__), '..', 'results')
    os.makedirs(results_dir, exist_ok=True)
    output_file = os.path.join(results_dir, f'benchmark_v8_baseline_{date.today()}.txt')
    with open(output_file, 'w') as f:
        f.write(report)
    print(f"\n  Report saved to: {output_file}")


if __name__ == '__main__':
    main()
