"""
ML Scoring Feasibility Research
Feature 005 — Cycling Analyzer v2

Extracts features from PostgreSQL, trains gradient boosting model,
evaluates with Spearman rho against rules-based baseline (rho ~0.38).
Go threshold: rho > 0.50.
"""

import os
import sys
from collections import defaultdict
from datetime import date

import numpy as np
import pandas as pd
import psycopg2
from scipy.stats import spearmanr
from sklearn.linear_model import LinearRegression
from sklearn.ensemble import RandomForestRegressor
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


def get_points(category: str, position: int | None, race_type: str) -> float:
    """Compute fantasy points for a position in a category/race type."""
    if position is None or position < 1:
        return 0.0
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


def compute_actual_pts(results: list[dict]) -> float:
    """Sum fantasy points from actual race results for one rider in one race."""
    total = 0.0
    for r in results:
        total += get_points(r['category'], r['position'], r['race_type'])
    return total


# ── Data loading ─────────────────────────────────────────────────────

def load_data(db_url: str) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Load race results and startlists from PostgreSQL."""
    conn = psycopg2.connect(db_url)

    results_df = pd.read_sql("""
        SELECT rr.rider_id, rr.race_slug, rr.race_name, rr.race_type, rr.race_class,
               rr.year, rr.category, rr.position, rr.stage_number, rr.dnf,
               rr.race_date, rr.parcours_type, rr.is_itt, rr.is_ttt,
               r.full_name as rider_name, r.pcs_slug
        FROM race_results rr
        JOIN riders r ON rr.rider_id = r.id
        WHERE rr.race_date IS NOT NULL
        ORDER BY rr.race_date
    """, conn)

    startlists_df = pd.read_sql("""
        SELECT se.race_slug, se.year, se.rider_id, r.full_name as rider_name
        FROM startlist_entries se
        JOIN riders r ON se.rider_id = r.id
    """, conn)

    conn.close()
    print(f"Loaded {len(results_df)} results, {len(startlists_df)} startlist entries")
    return results_df, startlists_df


# ── Feature extraction ───────────────────────────────────────────────

def extract_features_for_race(
    rider_id: str,
    race_slug: str,
    race_year: int,
    race_type: str,
    race_date: date,
    historical: pd.DataFrame,
) -> dict:
    """Extract features for a (rider, race) pair using only pre-race data."""

    # Filter to this rider's historical results before race_date
    rider_hist = historical[
        (historical['rider_id'] == rider_id) &
        (historical['race_date'] < race_date)
    ]

    features = {}

    # F1-F4: Total points by category in last 12 months
    twelve_months_ago = race_date.replace(year=race_date.year - 1) if race_date.month > 2 else \
        race_date.replace(year=race_date.year - 1, month=race_date.month, day=min(race_date.day, 28))
    recent = rider_hist[rider_hist['race_date'] >= twelve_months_ago]

    for cat in ['gc', 'stage', 'mountain', 'sprint']:
        cat_results = recent[recent['category'] == cat]
        pts = sum(get_points(cat, row['position'], row['race_type'])
                  for _, row in cat_results.iterrows())
        features[f'pts_{cat}_12m'] = pts

    # F5: Total points (all categories) in last 12 months
    features['pts_total_12m'] = sum(features[f'pts_{c}_12m'] for c in ['gc', 'stage', 'mountain', 'sprint'])

    # F6: Points in same race type
    same_type = recent[recent['race_type'] == race_type]
    features['pts_same_type_12m'] = sum(
        get_points(row['category'], row['position'], row['race_type'])
        for _, row in same_type.iterrows()
    )

    # F7: Number of races in last 12 months
    recent_races = recent.drop_duplicates(subset=['race_slug', 'year'])
    features['race_count_12m'] = len(recent_races)

    # F8: Top-10 rate (GC results only)
    gc_recent = recent[(recent['category'] == 'gc') & (recent['position'].notna())]
    if len(gc_recent) > 0:
        top10 = len(gc_recent[gc_recent['position'] <= 10])
        features['top10_rate'] = top10 / len(gc_recent)
    else:
        features['top10_rate'] = 0.0

    # F9: Win rate (GC position == 1)
    if len(gc_recent) > 0:
        wins = len(gc_recent[gc_recent['position'] == 1])
        features['win_rate'] = wins / len(gc_recent)
    else:
        features['win_rate'] = 0.0

    # F10: Best single-race total points in last 12 months
    if len(recent) > 0:
        race_pts = defaultdict(float)
        for _, row in recent.iterrows():
            key = f"{row['race_slug']}_{row['year']}"
            race_pts[key] += get_points(row['category'], row['position'], row['race_type'])
        features['best_race_pts_12m'] = max(race_pts.values()) if race_pts else 0.0
    else:
        features['best_race_pts_12m'] = 0.0

    # F11: Days since last race
    if len(rider_hist) > 0:
        last_race_date = rider_hist['race_date'].max()
        features['days_since_last_race'] = (race_date - last_race_date).days
    else:
        features['days_since_last_race'] = 365  # no history

    # F12: Historical performance in this specific race
    same_race = rider_hist[(rider_hist['race_slug'] == race_slug)]
    if len(same_race) > 0:
        same_race_pts = defaultdict(float)
        for _, row in same_race.iterrows():
            key = row['year']
            same_race_pts[key] += get_points(row['category'], row['position'], row['race_type'])
        features['same_race_avg_pts'] = np.mean(list(same_race_pts.values()))
        features['same_race_editions'] = len(same_race_pts)
    else:
        features['same_race_avg_pts'] = 0.0
        features['same_race_editions'] = 0

    # F13-F14: Race context (encoded)
    type_map = {'classic': 0, 'mini_tour': 1, 'grand_tour': 2}
    class_map = {'UWT': 1.0, 'Pro': 0.5, '1': 0.3}
    features['race_type_enc'] = type_map.get(race_type, 0)

    # F15: Points trend — compare last 3 races vs previous 3
    if len(recent_races) >= 6:
        sorted_races = recent.sort_values('race_date')
        race_keys = sorted_races.drop_duplicates(subset=['race_slug', 'year'])[['race_slug', 'year']].values.tolist()
        recent_3_keys = set(tuple(k) for k in race_keys[-3:])
        prev_3_keys = set(tuple(k) for k in race_keys[-6:-3])

        recent_3_pts = sum(
            get_points(row['category'], row['position'], row['race_type'])
            for _, row in sorted_races.iterrows()
            if (row['race_slug'], row['year']) in recent_3_keys
        )
        prev_3_pts = sum(
            get_points(row['category'], row['position'], row['race_type'])
            for _, row in sorted_races.iterrows()
            if (row['race_slug'], row['year']) in prev_3_keys
        )
        features['pts_trend'] = recent_3_pts - prev_3_pts
    else:
        features['pts_trend'] = 0.0

    # F16: All-time total points (broader signal)
    features['pts_total_alltime'] = sum(
        get_points(row['category'], row['position'], row['race_type'])
        for _, row in rider_hist.iterrows()
    )

    return features


def build_dataset(results_df: pd.DataFrame, startlists_df: pd.DataFrame) -> pd.DataFrame:
    """Build feature matrix for all (rider, race) pairs that have startlists."""

    # Get distinct races from startlists
    races = startlists_df.drop_duplicates(subset=['race_slug', 'year'])
    print(f"Building features for {len(races)} races with startlists...")

    rows = []
    for idx, (_, race) in enumerate(races.iterrows()):
        race_slug = race['race_slug']
        race_year = race['year']

        # Get race metadata from results
        race_results = results_df[
            (results_df['race_slug'] == race_slug) &
            (results_df['year'] == race_year)
        ]
        if len(race_results) == 0:
            continue

        race_type = race_results.iloc[0]['race_type']
        race_date_val = race_results['race_date'].min()
        if pd.isna(race_date_val):
            continue
        race_date_py = race_date_val.date() if hasattr(race_date_val, 'date') else race_date_val

        # Get startlist riders
        sl = startlists_df[
            (startlists_df['race_slug'] == race_slug) &
            (startlists_df['year'] == race_year)
        ]

        for _, rider in sl.iterrows():
            rider_id = rider['rider_id']

            # Extract features
            feats = extract_features_for_race(
                rider_id, race_slug, race_year, race_type, race_date_py, results_df
            )

            # Compute actual points (target variable)
            rider_race_results = race_results[race_results['rider_id'] == rider_id]
            actual_pts = compute_actual_pts(rider_race_results.to_dict('records'))

            feats['rider_id'] = rider_id
            feats['race_slug'] = race_slug
            feats['race_year'] = race_year
            feats['race_type'] = race_type
            feats['race_date'] = race_date_py
            feats['actual_pts'] = actual_pts

            rows.append(feats)

        if (idx + 1) % 10 == 0:
            print(f"  [{idx+1}/{len(races)}] races processed...")

    df = pd.DataFrame(rows)
    print(f"Feature matrix: {len(df)} rows x {len(df.columns)} columns")
    return df


# ── Evaluation ───────────────────────────────────────────────────────

FEATURE_COLS = [
    'pts_gc_12m', 'pts_stage_12m', 'pts_mountain_12m', 'pts_sprint_12m',
    'pts_total_12m', 'pts_same_type_12m', 'race_count_12m',
    'top10_rate', 'win_rate', 'best_race_pts_12m',
    'days_since_last_race', 'same_race_avg_pts', 'same_race_editions',
    'race_type_enc', 'pts_trend', 'pts_total_alltime',
]


def evaluate_model(model, test_df: pd.DataFrame, model_name: str) -> dict:
    """Evaluate a model computing per-race Spearman rho."""
    X_test = test_df[FEATURE_COLS].values
    predictions = model.predict(X_test)
    test_df = test_df.copy()
    test_df['predicted'] = predictions

    # Per-race Spearman rho
    rhos = []
    race_details = []
    for (slug, year), group in test_df.groupby(['race_slug', 'race_year']):
        if len(group) < 3:
            continue
        actual = group['actual_pts'].values
        pred = group['predicted'].values

        # Skip if all actual are zero (no variance)
        if np.std(actual) == 0:
            continue

        rho, _ = spearmanr(pred, actual)
        if not np.isnan(rho):
            rhos.append(rho)
            race_type = group.iloc[0]['race_type']
            race_details.append({
                'race': slug, 'year': year, 'type': race_type,
                'riders': len(group), 'rho': rho
            })

    mean_rho = np.mean(rhos) if rhos else 0.0

    # By race type
    type_rhos = defaultdict(list)
    for d in race_details:
        type_rhos[d['type']].append(d['rho'])

    print(f"\n{'='*60}")
    print(f"  {model_name}")
    print(f"{'='*60}")
    print(f"  Mean Spearman ρ: {mean_rho:.4f}  ({len(rhos)} races)")
    for rtype, rs in sorted(type_rhos.items()):
        print(f"    {rtype:12s}: ρ = {np.mean(rs):.4f}  ({len(rs)} races)")

    return {
        'model': model_name,
        'mean_rho': mean_rho,
        'n_races': len(rhos),
        'type_rhos': {t: np.mean(rs) for t, rs in type_rhos.items()},
        'details': race_details,
    }


# ── Main ─────────────────────────────────────────────────────────────

def main():
    db_url = os.environ.get('DATABASE_URL',
        'postgresql://cycling:cycling@localhost:5432/cycling_analyzer')

    print("=" * 60)
    print("  ML Scoring Feasibility Research")
    print("  Baseline: rules-based rho ≈ 0.38")
    print("  Go threshold: rho > 0.50")
    print("=" * 60)

    # 1. Load data
    print("\n[1/4] Loading data...")
    results_df, startlists_df = load_data(db_url)

    # 2. Build feature matrix
    print("\n[2/4] Building feature matrix...")
    dataset = build_dataset(results_df, startlists_df)
    dataset.to_csv('ml/data/features.csv', index=False)
    print(f"Saved to ml/data/features.csv")

    # 3. Train/test split: 2024 = train, 2025+2026 = test
    train = dataset[dataset['race_year'] == 2024]
    test = dataset[dataset['race_year'] >= 2025]
    print(f"\nTrain: {len(train)} rows ({train['race_slug'].nunique()} races, year=2024)")
    print(f"Test:  {len(test)} rows ({test['race_slug'].nunique()} races, year=2025+2026)")

    X_train = train[FEATURE_COLS].values
    y_train = train['actual_pts'].values
    X_test = test[FEATURE_COLS].values
    y_test = test['actual_pts'].values

    # 4. Train and evaluate models
    print("\n[3/4] Training models...")

    results = []

    # Model 1: Linear Regression (sanity check baseline)
    lr = LinearRegression()
    lr.fit(X_train, y_train)
    results.append(evaluate_model(lr, test, "Linear Regression"))

    # Model 2: Random Forest
    rf = RandomForestRegressor(n_estimators=200, max_depth=10, random_state=42, n_jobs=-1)
    rf.fit(X_train, y_train)
    results.append(evaluate_model(rf, test, "Random Forest"))

    # Model 3: XGBoost (primary candidate)
    xgb = XGBRegressor(
        n_estimators=300, max_depth=6, learning_rate=0.1,
        subsample=0.8, colsample_bytree=0.8,
        random_state=42, n_jobs=-1,
        verbosity=0,
    )
    xgb.fit(X_train, y_train)
    results.append(evaluate_model(xgb, test, "XGBoost"))

    # 5. Feature importance (from XGBoost)
    print(f"\n{'='*60}")
    print("  Feature Importance (XGBoost)")
    print(f"{'='*60}")
    importances = xgb.feature_importances_
    feat_imp = sorted(zip(FEATURE_COLS, importances), key=lambda x: -x[1])
    for feat, imp in feat_imp:
        bar = '█' * int(imp * 100)
        print(f"  {feat:25s} {imp:.4f} {bar}")

    # 6. Summary
    print(f"\n{'='*60}")
    print("  SUMMARY — Go/No-Go Decision")
    print(f"{'='*60}")
    print(f"  Rules-based baseline:     ρ ≈ 0.3833")
    best = max(results, key=lambda r: r['mean_rho'])
    print(f"  Best ML model:            {best['model']} → ρ = {best['mean_rho']:.4f}")
    delta = best['mean_rho'] - 0.3833
    pct = (delta / 0.3833) * 100
    print(f"  Improvement:              {delta:+.4f} ({pct:+.1f}%)")
    print()
    if best['mean_rho'] > 0.60:
        print("  ✅ STRONG GO — ML significantly outperforms rules-based")
    elif best['mean_rho'] > 0.50:
        print("  ✅ GO — ML meaningfully beats baseline")
    elif best['mean_rho'] > 0.42:
        print("  ⚠️  MARGINAL — Some improvement but below go threshold")
    else:
        print("  ❌ NO-GO — ML does not beat baseline significantly")

    # Save detailed results
    report = {
        'baseline_rho': 0.3833,
        'models': [{
            'name': r['model'],
            'mean_rho': r['mean_rho'],
            'n_races': r['n_races'],
            'by_type': r['type_rhos'],
        } for r in results],
        'best_model': best['model'],
        'best_rho': best['mean_rho'],
        'feature_importance': feat_imp,
    }

    # Write report
    with open('ml/results/report.md', 'w') as f:
        f.write("# ML Scoring Feasibility — Results Report\n\n")
        f.write(f"**Date**: {date.today()}\n")
        f.write(f"**Baseline**: ρ = 0.3833 (rules-based, 206 races)\n\n")
        f.write("## Model Comparison\n\n")
        f.write("| Model | Mean ρ | Races | Classic | Mini Tour | Grand Tour |\n")
        f.write("|-------|--------|-------|---------|-----------|------------|\n")
        for r in results:
            classic = r['type_rhos'].get('classic', 0)
            mini = r['type_rhos'].get('mini_tour', 0)
            gt = r['type_rhos'].get('grand_tour', 0)
            f.write(f"| {r['model']} | {r['mean_rho']:.4f} | {r['n_races']} | "
                    f"{classic:.4f} | {mini:.4f} | {gt:.4f} |\n")
        f.write(f"\n## Feature Importance (XGBoost)\n\n")
        f.write("| Rank | Feature | Importance |\n")
        f.write("|------|---------|------------|\n")
        for i, (feat, imp) in enumerate(feat_imp, 1):
            f.write(f"| {i} | {feat} | {imp:.4f} |\n")
        f.write(f"\n## Decision\n\n")
        f.write(f"Best: **{best['model']}** with ρ = {best['mean_rho']:.4f}\n\n")
        if best['mean_rho'] > 0.50:
            f.write("**GO** — Proceed with ML implementation.\n")
        else:
            f.write("**NO-GO** — Keep rules-based approach.\n")

    print(f"\nReport saved to ml/results/report.md")


if __name__ == '__main__':
    main()
