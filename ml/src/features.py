"""
Feature extraction module — single source of truth for the 36-feature set.

Refactored from research_v3.py extract_all_features().
Two entry points:
  - extract_features_for_race()  — features for ONE race (on-demand prediction)
  - extract_all_training_features() — features for ALL races (training, includes target)

Both share the same per-rider feature computation via _compute_rider_features().
"""

from collections import defaultdict

import numpy as np
import pandas as pd

# ── Feature columns (must match research_v3.py lines 317-334 exactly) ──

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

assert len(FEATURE_COLS) == 40, f"Expected 40 feature cols, got {len(FEATURE_COLS)}"  # noqa: S101

# Race type encoding lookup
_RACE_TYPE_ENC = {'classic': 0, 'mini_tour': 1, 'grand_tour': 2}


# ── Per-rider feature computation ────────────────────────────────────

def _compute_rider_features(
    rider_id,
    hist: pd.DataFrame,
    results_df: pd.DataFrame,
    race_slug: str,
    race_type: str,
    race_date,
    race_date_py,
    d365,
    d180,
    d90,
    d30,
    d14,
    rider_team_info: dict,
) -> dict:
    """Compute the 36 features for a single rider.

    This is the shared inner loop extracted from research_v3.py lines 176-293.

    Args:
        rider_id: The rider's database ID.
        hist: Historical results for this rider (before race_date).
        results_df: Full results DataFrame (used to look up birth_date).
        race_slug: The race being predicted.
        race_type: One of 'classic', 'mini_tour', 'grand_tour'.
        race_date: Race date as pandas Timestamp.
        race_date_py: Race date as Python date object.
        d365..d14: Pre-computed time window cutoffs.
        rider_team_info: Dict mapping rider_id -> team stats dict.

    Returns:
        Dict with all 36 feature values.
    """
    rh = hist[hist['rider_id'] == rider_id]
    rh_12m = rh[rh['race_date'] >= d365]
    rh_6m = rh[rh['race_date'] >= d180]
    rh_3m = rh[rh['race_date'] >= d90]
    rh_30d = rh[rh['race_date'] >= d30]
    rh_14d = rh[rh['race_date'] >= d14]

    feats = {}

    # ── V2 features ──────────────────────────────────────────────
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

    feats['race_type_enc'] = _RACE_TYPE_ENC.get(race_type, 0)

    feats['pts_trend_3m'] = feats['pts_total_3m'] - (feats['pts_total_6m'] - feats['pts_total_3m'])

    if race_type in ('mini_tour', 'grand_tour'):
        feats['stage_pts_12m'] = rh_12m[rh_12m['category'] == 'stage']['pts'].sum()
        feats['gc_pts_same_type'] = rh_12m[
            (rh_12m['category'] == 'gc') & (rh_12m['race_type'] == race_type)
        ]['pts'].sum()
    else:
        feats['stage_pts_12m'] = 0.0
        feats['gc_pts_same_type'] = 0.0

    # ── V3 NEW: Feature 1 — Micro-form ──────────────────────────
    feats['pts_30d'] = rh_30d['pts'].sum()
    feats['pts_14d'] = rh_14d['pts'].sum()
    feats['race_count_30d'] = rh_30d[['race_slug', 'year']].drop_duplicates().shape[0]

    # Last 3 races performance (most recent)
    if len(rh_12m) > 0:
        recent_race_pts = rh_12m.groupby(['race_slug', 'year']).agg(
            pts=('pts', 'sum'),
            date=('race_date', 'max'),
        ).sort_values('date', ascending=False)

        last_3 = recent_race_pts.head(3)['pts'].values
        feats['last_race_pts'] = last_3[0] if len(last_3) >= 1 else 0.0
        feats['last_3_mean_pts'] = np.mean(last_3) if len(last_3) >= 1 else 0.0
        feats['last_3_max_pts'] = np.max(last_3) if len(last_3) >= 1 else 0.0
    else:
        feats['last_race_pts'] = 0.0
        feats['last_3_mean_pts'] = 0.0
        feats['last_3_max_pts'] = 0.0

    # ── V3 NEW: Feature 2 — Age & trajectory ────────────────────
    rider_rows = results_df[results_df['rider_id'] == rider_id]
    rider_row = rider_rows.iloc[0] if len(rider_rows) > 0 else None
    birth_date_val = rider_row['rider_birth_date'] if rider_row is not None else None

    if birth_date_val is not None and not pd.isna(birth_date_val):
        bd = birth_date_val.date() if hasattr(birth_date_val, 'date') else birth_date_val
        age_days = (race_date_py - bd).days
        feats['age'] = age_days / 365.25
        feats['is_young'] = 1 if feats['age'] < 25 else 0
        feats['is_veteran'] = 1 if feats['age'] > 33 else 0
        career_years = max(1, feats['age'] - 18)
        feats['pts_per_career_year'] = feats['pts_total_alltime'] / career_years
    else:
        feats['age'] = 28.0  # default median age
        feats['is_young'] = 0
        feats['is_veteran'] = 0
        feats['pts_per_career_year'] = 0.0

    # ── V3 NEW: Feature 3 — Team leader signal ──────────────────
    ti = rider_team_info.get(rider_id, {})
    feats['team_rank'] = ti.get('team_rank', 4)
    feats['is_leader'] = ti.get('is_leader', 0)
    feats['team_size'] = ti.get('team_size', 7)
    feats['pct_of_team'] = ti.get('pct_of_team', 0)
    feats['team_total_pts'] = ti.get('team_total_pts', 0)

    return feats


# ── Team info computation (shared) ───────────────────────────────────

def _compute_team_info(
    sl: pd.DataFrame,
    sl_riders,
    hist: pd.DataFrame,
    d365,
) -> dict:
    """Compute team-level stats for rider ranking within their team.

    Args:
        sl: Startlist DataFrame for this race.
        sl_riders: Array of rider IDs on the startlist.
        hist: Historical results for all startlist riders (before race_date).
        d365: Cutoff date for 12-month window.

    Returns:
        Dict mapping rider_id -> team stats dict.
    """
    # Compute 12m total pts per rider
    team_rider_pts = {}
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
    for _team, members in team_groups.items():
        sorted_members = sorted(members, key=lambda x: -x[1])
        team_total = sum(p for _, p in sorted_members)
        for rank, (rid, pts) in enumerate(sorted_members, 1):
            rider_team_info[rid] = {
                'team_rank': rank,
                'team_size': len(sorted_members),
                'is_leader': 1 if rank == 1 else 0,
                'team_total_pts': team_total,
                'pct_of_team': pts / team_total if team_total > 0 else 0,
            }

    return rider_team_info


# ── Public API ───────────────────────────────────────────────────────

def extract_features_for_race(
    results_df: pd.DataFrame,
    startlists_df: pd.DataFrame,
    race_slug: str,
    race_year: int,
    race_type: str,
    race_date,
) -> pd.DataFrame:
    """Extract features for all riders on a single race's startlist.

    Used for on-demand prediction (WP03). Does NOT include actual_pts target.

    Args:
        results_df: Full results DataFrame with pre-computed `pts` column.
        startlists_df: Full startlists DataFrame.
        race_slug: Race identifier.
        race_year: Race year.
        race_type: One of 'classic', 'mini_tour', 'grand_tour'.
        race_date: Race date (pandas Timestamp or datetime).

    Returns:
        DataFrame with FEATURE_COLS + ['rider_id', 'race_slug', 'race_year', 'race_type'].
    """
    if pd.isna(race_date):
        return pd.DataFrame()

    race_date_py = race_date.date() if hasattr(race_date, 'date') else race_date

    # Startlist for this race
    sl = startlists_df[
        (startlists_df['race_slug'] == race_slug) &
        (startlists_df['year'] == race_year)
    ]

    if len(sl) == 0:
        return pd.DataFrame()

    sl_riders = sl['rider_id'].values

    # Historical results for all startlist riders before race date
    hist = results_df[
        (results_df['rider_id'].isin(sl_riders)) &
        (results_df['race_date'] < race_date)
    ]

    # Time windows
    d365 = race_date - pd.Timedelta(days=365)
    d180 = race_date - pd.Timedelta(days=180)
    d90 = race_date - pd.Timedelta(days=90)
    d30 = race_date - pd.Timedelta(days=30)
    d14 = race_date - pd.Timedelta(days=14)

    # Team info
    rider_team_info = _compute_team_info(sl, sl_riders, hist, d365)

    # Per-rider features
    rows = []
    for rider_id in sl_riders:
        feats = _compute_rider_features(
            rider_id=rider_id,
            hist=hist,
            results_df=results_df,
            race_slug=race_slug,
            race_type=race_type,
            race_date=race_date,
            race_date_py=race_date_py,
            d365=d365, d180=d180, d90=d90, d30=d30, d14=d14,
            rider_team_info=rider_team_info,
        )
        feats['rider_id'] = rider_id
        feats['race_slug'] = race_slug
        feats['race_year'] = race_year
        feats['race_type'] = race_type
        rows.append(feats)

    return pd.DataFrame(rows)


def extract_all_training_features(
    results_df: pd.DataFrame,
    startlists_df: pd.DataFrame,
) -> pd.DataFrame:
    """Extract features for ALL races — used for model training.

    Loops over every race that has both a startlist and results,
    computing features + actual_pts target for each rider.

    Args:
        results_df: Full results DataFrame with pre-computed `pts` column.
        startlists_df: Full startlists DataFrame.

    Returns:
        DataFrame with FEATURE_COLS + metadata columns + 'actual_pts'.
    """
    # Get distinct races from startlists with results
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

        # Startlist for this race
        sl = startlists_df[
            (startlists_df['race_slug'] == race_slug) &
            (startlists_df['year'] == race_year)
        ]

        sl_riders = sl['rider_id'].values

        # Historical results for all startlist riders before race date
        hist = results_df[
            (results_df['rider_id'].isin(sl_riders)) &
            (results_df['race_date'] < race_date)
        ]

        # Actual results for this race (for target)
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

        # Team info
        rider_team_info = _compute_team_info(sl, sl_riders, hist, d365)

        # Per-rider features
        for rider_id in sl_riders:
            feats = _compute_rider_features(
                rider_id=rider_id,
                hist=hist,
                results_df=results_df,
                race_slug=race_slug,
                race_type=race_type,
                race_date=race_date,
                race_date_py=race_date_py,
                d365=d365, d180=d180, d90=d90, d30=d30, d14=d14,
                rider_team_info=rider_team_info,
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
