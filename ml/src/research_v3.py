"""
ML Scoring Feasibility Research — v3
Feature 005 — Cycling Analyzer v2

Improvements over v2:
- Feature 1: Micro-form (pts in last 30/14 days, last 3 race trend)
- Feature 2: Age + trajectory (birth_date scraped from PCS)
- Feature 3: Team leader signal (is this rider the best on their team's startlist?)
- Separate models per race type
- Train 2023-2024, test full 2025
"""

import os
from collections import defaultdict
from datetime import date

import numpy as np
import pandas as pd
import psycopg2
from scipy.stats import spearmanr
from sklearn.ensemble import RandomForestRegressor
from xgboost import XGBRegressor

# ── Position points tables ───────────────────────────────────────────

STAGE_POINTS = {1:40,2:25,3:22,4:19,5:17,6:15,7:14,8:13,9:12,10:11,
                11:10,12:9,13:8,14:7,15:6,16:5,17:4,18:3,19:2,20:1}
GC_CLASSIC = {1:200,2:125,3:100,4:80,5:60,6:50,7:45,8:40,9:35,10:30}
GC_MINI_TOUR = {1:100,2:80,3:65,4:55,5:45,6:40,7:35,8:30,9:25,10:20,
                11:18,12:16,13:14,14:12,15:10}
GC_GRAND_TOUR = {1:150,2:125,3:100,4:80,5:60,6:50,7:45,8:40,9:35,10:30,
                 11:28,12:26,13:24,14:22,15:20,16:18,17:16,18:14,19:12,20:10}
FINAL_CLASS_MINI = {1:40,2:25,3:15}
FINAL_CLASS_GT = {1:50,2:35,3:25,4:15,5:10}


def get_points(category, position, race_type):
    if position is None or (isinstance(position, float) and np.isnan(position)) or position < 1:
        return 0.0
    position = int(position)
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


# ── Data loading ─────────────────────────────────────────────────────

def load_data(db_url):
    conn = psycopg2.connect(db_url)
    results_df = pd.read_sql("""
        SELECT rr.rider_id, rr.race_slug, rr.race_name, rr.race_type, rr.race_class,
               rr.year, rr.category, rr.position, rr.stage_number, rr.dnf,
               rr.race_date,
               r.full_name as rider_name, r.birth_date as rider_birth_date,
               r.current_team as rider_team
        FROM race_results rr
        JOIN riders r ON rr.rider_id = r.id
        WHERE rr.race_date IS NOT NULL
        ORDER BY rr.race_date
    """, conn)

    startlists_df = pd.read_sql("""
        SELECT se.race_slug, se.year, se.rider_id, se.team_name
        FROM startlist_entries se
    """, conn)

    conn.close()

    # Pre-compute points
    results_df['pts'] = results_df.apply(
        lambda r: get_points(r['category'], r['position'], r['race_type']), axis=1
    )

    birth_dates = results_df[['rider_id', 'rider_birth_date']].drop_duplicates()
    n_with_bd = birth_dates['rider_birth_date'].notna().sum()
    print(f"Loaded {len(results_df):,} results, {len(startlists_df):,} startlist entries")
    print(f"Riders with birth_date: {n_with_bd}/{len(birth_dates)}")

    return results_df, startlists_df


# ── Feature extraction ───────────────────────────────────────────────

def extract_all_features(results_df, startlists_df):
    """Build feature matrix with v3 features: micro-form, age, team leader."""

    # Get distinct races from startlists with results
    races = startlists_df.drop_duplicates(subset=['race_slug', 'year']).merge(
        results_df[['race_slug', 'year', 'race_type', 'race_name', 'race_date']]
            .drop_duplicates(subset=['race_slug', 'year']),
        on=['race_slug', 'year'],
        how='inner'
    )
    print(f"Races with both startlist and results: {len(races)}")

    # Pre-compute per-rider all-time pts for team leader feature
    # (will be computed per-race within temporal cutoff)

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

        # Startlist for this race
        sl = startlists_df[
            (startlists_df['race_slug'] == race_slug) &
            (startlists_df['year'] == race_year)
        ]

        # Historical results for all startlist riders before race date
        sl_riders = sl['rider_id'].values
        hist = results_df[
            (results_df['rider_id'].isin(sl_riders)) &
            (results_df['race_date'] < race_date)
        ]

        # Actual results for this race
        actual = results_df[
            (results_df['race_slug'] == race_slug) &
            (results_df['year'] == race_year)
        ]

        # Time windows
        d365 = race_date - pd.Timedelta(days=365)
        d180 = race_date - pd.Timedelta(days=180)
        d90 = race_date - pd.Timedelta(days=90)
        d30 = race_date - pd.Timedelta(days=30)
        d14 = race_date - pd.Timedelta(days=14)

        # ── FEATURE 3 PREP: Compute team-level stats ────────────
        # For each team in the startlist, compute total 12m pts per rider
        # to determine who is the "team leader"
        team_rider_pts = {}  # rider_id -> 12m total pts
        for rider_id in sl_riders:
            rh_12m = hist[(hist['rider_id'] == rider_id) & (hist['race_date'] >= d365)]
            team_rider_pts[rider_id] = rh_12m['pts'].sum()

        # Group riders by team from startlist
        team_groups = defaultdict(list)  # team_name -> [(rider_id, pts)]
        for _, sr in sl.iterrows():
            team = sr.get('team_name', '') or 'unknown'
            team_groups[team].append((sr['rider_id'], team_rider_pts.get(sr['rider_id'], 0)))

        # Per rider: rank within team, team max, is_leader
        rider_team_info = {}
        for team, members in team_groups.items():
            sorted_members = sorted(members, key=lambda x: -x[1])
            team_max = sorted_members[0][1] if sorted_members else 0
            team_total = sum(p for _, p in sorted_members)
            for rank, (rid, pts) in enumerate(sorted_members, 1):
                rider_team_info[rid] = {
                    'team_rank': rank,
                    'team_size': len(sorted_members),
                    'is_leader': 1 if rank == 1 else 0,
                    'team_max_pts': team_max,
                    'team_total_pts': team_total,
                    'pct_of_team': pts / team_total if team_total > 0 else 0,
                }

        # ── Per-rider features ──────────────────────────────────
        for rider_id in sl_riders:
            rh = hist[hist['rider_id'] == rider_id]
            rh_12m = rh[rh['race_date'] >= d365]
            rh_6m = rh[rh['race_date'] >= d180]
            rh_3m = rh[rh['race_date'] >= d90]
            rh_30d = rh[rh['race_date'] >= d30]
            rh_14d = rh[rh['race_date'] >= d14]

            feats = {}

            # ── V2 features (kept) ──────────────────────────────
            for cat in ['gc', 'stage', 'mountain', 'sprint']:
                feats[f'pts_{cat}_12m'] = rh_12m[rh_12m['category'] == cat]['pts'].sum()

            feats['pts_total_12m'] = rh_12m['pts'].sum()
            feats['pts_total_6m'] = rh_6m['pts'].sum()
            feats['pts_total_3m'] = rh_3m['pts'].sum()
            feats['pts_same_type_12m'] = rh_12m[rh_12m['race_type'] == race_type]['pts'].sum()

            feats['race_count_12m'] = rh_12m[['race_slug', 'year']].drop_duplicates().shape[0]
            feats['race_count_6m'] = rh_6m[['race_slug', 'year']].drop_duplicates().shape[0]

            gc_12m = rh_12m[(rh_12m['category'] == 'gc') & (rh_12m['position'].notna())]
            n_gc = len(gc_12m)
            feats['top10_rate'] = (gc_12m['position'] <= 10).sum() / n_gc if n_gc > 0 else 0.0
            feats['top5_rate'] = (gc_12m['position'] <= 5).sum() / n_gc if n_gc > 0 else 0.0
            feats['win_rate'] = (gc_12m['position'] == 1).sum() / n_gc if n_gc > 0 else 0.0
            feats['podium_rate'] = (gc_12m['position'] <= 3).sum() / n_gc if n_gc > 0 else 0.0

            if len(rh_12m) > 0:
                race_pts = rh_12m.groupby(['race_slug', 'year'])['pts'].sum()
                feats['best_race_pts_12m'] = race_pts.max()
                feats['median_race_pts_12m'] = race_pts.median()
            else:
                feats['best_race_pts_12m'] = 0.0
                feats['median_race_pts_12m'] = 0.0

            if len(rh) > 0:
                feats['days_since_last'] = (race_date - rh['race_date'].max()).days
            else:
                feats['days_since_last'] = 365

            same_race = rh[rh['race_slug'] == race_slug]
            if len(same_race) > 0:
                sr_pts = same_race.groupby('year')['pts'].sum()
                feats['same_race_best'] = sr_pts.max()
                feats['same_race_mean'] = sr_pts.mean()
                feats['same_race_editions'] = len(sr_pts)
            else:
                feats['same_race_best'] = 0.0
                feats['same_race_mean'] = 0.0
                feats['same_race_editions'] = 0

            feats['pts_total_alltime'] = rh['pts'].sum()

            type_map = {'classic': 0, 'mini_tour': 1, 'grand_tour': 2}
            feats['race_type_enc'] = type_map.get(race_type, 0)

            feats['pts_trend_3m'] = feats['pts_total_3m'] - (feats['pts_total_6m'] - feats['pts_total_3m'])

            if race_type in ('mini_tour', 'grand_tour'):
                feats['stage_pts_12m'] = rh_12m[rh_12m['category'] == 'stage']['pts'].sum()
                feats['gc_pts_same_type'] = rh_12m[
                    (rh_12m['category'] == 'gc') & (rh_12m['race_type'] == race_type)
                ]['pts'].sum()
            else:
                feats['stage_pts_12m'] = 0.0
                feats['gc_pts_same_type'] = 0.0

            # ── NEW: Feature 1 — Micro-form ────────────────────
            feats['pts_30d'] = rh_30d['pts'].sum()
            feats['pts_14d'] = rh_14d['pts'].sum()
            feats['race_count_30d'] = rh_30d[['race_slug', 'year']].drop_duplicates().shape[0]

            # Last 3 races performance (most recent)
            if len(rh_12m) > 0:
                recent_race_pts = rh_12m.groupby(['race_slug', 'year']).agg(
                    pts=('pts', 'sum'),
                    date=('race_date', 'max')
                ).sort_values('date', ascending=False)

                last_3 = recent_race_pts.head(3)['pts'].values
                feats['last_race_pts'] = last_3[0] if len(last_3) >= 1 else 0.0
                feats['last_3_mean_pts'] = np.mean(last_3) if len(last_3) >= 1 else 0.0
                feats['last_3_max_pts'] = np.max(last_3) if len(last_3) >= 1 else 0.0
            else:
                feats['last_race_pts'] = 0.0
                feats['last_3_mean_pts'] = 0.0
                feats['last_3_max_pts'] = 0.0

            # ── NEW: Feature 2 — Age & trajectory ──────────────
            rider_row = results_df[results_df['rider_id'] == rider_id].iloc[0] if len(
                results_df[results_df['rider_id'] == rider_id]) > 0 else None
            birth_date_val = rider_row['rider_birth_date'] if rider_row is not None else None

            if birth_date_val is not None and not pd.isna(birth_date_val):
                bd = birth_date_val.date() if hasattr(birth_date_val, 'date') else birth_date_val
                age_days = (race_date_py - bd).days
                feats['age'] = age_days / 365.25
                # Is the rider young and improving? (under 25 with increasing pts)
                feats['is_young'] = 1 if feats['age'] < 25 else 0
                feats['is_veteran'] = 1 if feats['age'] > 33 else 0
                # Age-weighted performance: pts per year of career
                career_years = max(1, feats['age'] - 18)
                feats['pts_per_career_year'] = feats['pts_total_alltime'] / career_years
            else:
                feats['age'] = 28.0  # default median age
                feats['is_young'] = 0
                feats['is_veteran'] = 0
                feats['pts_per_career_year'] = 0.0

            # ── NEW: Feature 3 — Team leader signal ─────────────
            ti = rider_team_info.get(rider_id, {})
            feats['team_rank'] = ti.get('team_rank', 4)
            feats['is_leader'] = ti.get('is_leader', 0)
            feats['team_size'] = ti.get('team_size', 7)
            feats['pct_of_team'] = ti.get('pct_of_team', 0)
            feats['team_total_pts'] = ti.get('team_total_pts', 0)

            # ── Target + metadata ───────────────────────────────
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


# ── Feature columns ──────────────────────────────────────────────────

FEATURE_COLS = [
    # V2 features
    'pts_gc_12m', 'pts_stage_12m', 'pts_mountain_12m', 'pts_sprint_12m',
    'pts_total_12m', 'pts_total_6m', 'pts_total_3m',
    'pts_same_type_12m', 'race_count_12m', 'race_count_6m',
    'top10_rate', 'top5_rate', 'win_rate', 'podium_rate',
    'best_race_pts_12m', 'median_race_pts_12m',
    'days_since_last', 'same_race_best', 'same_race_mean', 'same_race_editions',
    'pts_total_alltime', 'race_type_enc', 'pts_trend_3m',
    'stage_pts_12m', 'gc_pts_same_type',
    # V3 NEW: Micro-form
    'pts_30d', 'pts_14d', 'race_count_30d',
    'last_race_pts', 'last_3_mean_pts', 'last_3_max_pts',
    # V3 NEW: Age
    'age', 'is_young', 'is_veteran', 'pts_per_career_year',
    # V3 NEW: Team leader
    'team_rank', 'is_leader', 'team_size', 'pct_of_team', 'team_total_pts',
]


# ── Evaluation ───────────────────────────────────────────────────────

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

    print(f"  {model_name:35s}  rho={mean_rho:.4f}  ({len(rhos)} races)")
    for t in sorted(type_rhos):
        print(f"    {t:15s} rho={np.mean(type_rhos[t]):.4f} ({len(type_rhos[t])})")

    return mean_rho, rhos, type_rhos


# ── Main ─────────────────────────────────────────────────────────────

def main():
    db_url = os.environ.get('DATABASE_URL',
        'postgresql://cycling:cycling@localhost:5432/cycling_analyzer')

    print("=" * 60)
    print("  ML Scoring Research v3")
    print("  + Micro-form + Age + Team leader")
    print("  Baseline: rho ~0.39 (rules-based)")
    print("=" * 60)

    # Load
    print("\n[1/4] Loading data...")
    results_df, startlists_df = load_data(db_url)

    # Build features
    print("\n[2/4] Building features (v3 — 36 features)...")
    dataset = extract_all_features(results_df, startlists_df)
    dataset.to_csv('ml/data/features_v3.csv', index=False)

    # Split
    train = dataset[dataset['race_year'].isin([2023, 2024])]
    test = dataset[dataset['race_year'] == 2025]
    print(f"\nTrain: {len(train):,} rows ({train['race_slug'].nunique()} races, 2023-2024)")
    print(f"Test:  {len(test):,} rows ({test['race_slug'].nunique()} races, 2025)")

    X_train = train[FEATURE_COLS].fillna(0).values
    y_train = train['actual_pts'].values

    # ── Global models ────────────────────────────────────────
    print(f"\n{'='*60}")
    print("  GLOBAL MODELS (all race types)")
    print(f"{'='*60}")

    models = {
        'Random Forest': RandomForestRegressor(
            n_estimators=500, max_depth=14, min_samples_leaf=5,
            random_state=42, n_jobs=-1),
        'XGBoost': XGBRegressor(
            n_estimators=600, max_depth=7, learning_rate=0.03,
            subsample=0.8, colsample_bytree=0.7, reg_alpha=1.0, reg_lambda=2.0,
            min_child_weight=5, random_state=42, n_jobs=-1, verbosity=0),
    }

    global_results = {}
    trained_models = {}
    for name, model in models.items():
        model.fit(X_train, y_train)
        rho, details, type_rhos = evaluate(model, test, FEATURE_COLS, name)
        global_results[name] = {'rho': rho, 'type_rhos': type_rhos}
        trained_models[name] = model

    # ── Per-type models ──────────────────────────────────────
    print(f"\n{'='*60}")
    print("  PER-TYPE MODELS")
    print(f"{'='*60}")

    per_type_results = {}
    for rtype in ['classic', 'mini_tour', 'grand_tour']:
        train_rt = train[train['race_type'] == rtype]
        test_rt = test[test['race_type'] == rtype]

        if len(train_rt) < 50 or len(test_rt) < 20:
            print(f"\n  {rtype}: insufficient data, skip")
            continue

        X_tr = train_rt[FEATURE_COLS].fillna(0).values
        y_tr = train_rt['actual_pts'].values

        print(f"\n  --- {rtype} ({len(train_rt):,} train, {len(test_rt):,} test) ---")

        for mname, cls in [
            ('RF', RandomForestRegressor(n_estimators=500, max_depth=14,
                min_samples_leaf=5, random_state=42, n_jobs=-1)),
            ('XGB', XGBRegressor(n_estimators=600, max_depth=7, learning_rate=0.03,
                subsample=0.8, colsample_bytree=0.7, reg_alpha=1.0, reg_lambda=2.0,
                min_child_weight=5, random_state=42, n_jobs=-1, verbosity=0)),
        ]:
            cls.fit(X_tr, y_tr)
            rho, _, _ = evaluate(cls, test_rt, FEATURE_COLS, f"{rtype}/{mname}")
            per_type_results[f"{rtype}/{mname}"] = rho

    # ── Feature importance ───────────────────────────────────
    print(f"\n{'='*60}")
    print("  Feature Importance (Global XGBoost)")
    print(f"{'='*60}")
    xgb = trained_models.get('XGBoost')
    if xgb:
        imps = xgb.feature_importances_
        feat_imp = sorted(zip(FEATURE_COLS, imps), key=lambda x: -x[1])
        for feat, imp in feat_imp[:20]:
            bar = '█' * int(imp * 80)
            src = ''
            if feat in ('pts_30d', 'pts_14d', 'race_count_30d', 'last_race_pts',
                        'last_3_mean_pts', 'last_3_max_pts'):
                src = ' [NEW:micro-form]'
            elif feat in ('age', 'is_young', 'is_veteran', 'pts_per_career_year'):
                src = ' [NEW:age]'
            elif feat in ('team_rank', 'is_leader', 'team_size', 'pct_of_team', 'team_total_pts'):
                src = ' [NEW:team]'
            print(f"  {feat:25s} {imp:.4f} {bar}{src}")

    # ── Summary ──────────────────────────────────────────────
    print(f"\n{'='*60}")
    print("  SUMMARY — v3 vs v2 vs baseline")
    print(f"{'='*60}")
    print(f"  Rules-based baseline:          rho = 0.3872")
    print(f"  v2 best global (RF):           rho = 0.3973")
    best_name = max(global_results, key=lambda k: global_results[k]['rho'])
    best_rho = global_results[best_name]['rho']
    print(f"  v3 best global ({best_name}):  rho = {best_rho:.4f} ({best_rho - 0.3872:+.4f})")

    print(f"\n  Per-type (v3):")
    for key, rho in sorted(per_type_results.items()):
        print(f"    {key:25s} rho = {rho:.4f}")

    print()
    if best_rho > 0.50:
        print("  ✅ GO — ML meaningfully beats baseline")
    elif best_rho > 0.42:
        print("  ⚠️  MARGINAL")
    else:
        print("  ❌ NO-GO")

    # Save report
    with open('ml/results/report_v3.md', 'w') as f:
        f.write("# ML Research v3 — Results\n\n")
        f.write(f"**Date**: {date.today()}\n\n")
        f.write("## New features in v3\n")
        f.write("- **Micro-form**: pts in last 30/14 days, last 3 race performance\n")
        f.write("- **Age**: rider age, young/veteran flags, pts per career year\n")
        f.write("- **Team leader**: rank within team startlist, leader flag, % of team pts\n\n")
        f.write("## Global results\n\n")
        f.write("| Model | rho | vs baseline |\n|---|---|---|\n")
        f.write(f"| Rules-based | 0.3872 | — |\n")
        f.write(f"| v2 RF | 0.3973 | +0.0101 |\n")
        for name, r in global_results.items():
            f.write(f"| v3 {name} | {r['rho']:.4f} | {r['rho']-0.3872:+.4f} |\n")
        f.write(f"\n## Per-type results\n\n")
        f.write("| Type/Model | rho |\n|---|---|\n")
        for key, rho in sorted(per_type_results.items()):
            f.write(f"| {key} | {rho:.4f} |\n")
        if xgb:
            f.write(f"\n## Top 20 features\n\n")
            f.write("| Rank | Feature | Importance | Source |\n|---|---|---|---|\n")
            for i, (feat, imp) in enumerate(feat_imp[:20], 1):
                src = 'v2'
                if feat in ('pts_30d','pts_14d','race_count_30d','last_race_pts',
                            'last_3_mean_pts','last_3_max_pts'):
                    src = 'NEW:micro-form'
                elif feat in ('age','is_young','is_veteran','pts_per_career_year'):
                    src = 'NEW:age'
                elif feat in ('team_rank','is_leader','team_size','pct_of_team','team_total_pts'):
                    src = 'NEW:team'
                f.write(f"| {i} | {feat} | {imp:.4f} | {src} |\n")

    print(f"\nReport: ml/results/report_v3.md")


if __name__ == '__main__':
    main()
