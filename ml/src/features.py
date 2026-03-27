"""
Feature extraction module — single source of truth for the feature set.

v8 cleanup: 49 → 38 features. Removed broken/redundant features:
  - pts_total_alltime, pts_per_career_year (volume bias, broken with partial data)
  - race_type_enc (constant within per-type models)
  - is_young, is_veteran (redundant with continuous age)
  - stage_pts_12m (duplicate of pts_stage_12m)
  - same_race_editions (replaced by has_same_race flag)
  - top5_rate, podium_rate (correlated with top10_rate, win_rate)

Two entry points:
  - extract_features_for_race()  — features for ONE race (on-demand prediction)
  - extract_all_training_features() — features for ALL races (training, includes target)

Both share the same per-rider feature computation via _compute_rider_features().
"""

from collections import defaultdict

import numpy as np
import pandas as pd

FEATURE_COLS = [
    # V2: Points by category (12-month window)
    'pts_gc_12m', 'pts_stage_12m', 'pts_mountain_12m', 'pts_sprint_12m',
    'pts_total_12m', 'pts_total_6m', 'pts_total_3m',
    'pts_same_type_12m', 'race_count_12m', 'race_count_6m',
    # V2: GC performance rates
    'top10_rate', 'win_rate',
    # V2: Race quality
    'best_race_pts_12m', 'median_race_pts_12m',
    # V2: Race familiarity
    'days_since_last',
    'same_race_best', 'same_race_mean', 'has_same_race',
    # V2: Trend
    'pts_trend_3m',
    'gc_pts_same_type',
    # V3: Micro-form
    'pts_30d', 'pts_14d', 'race_count_30d',
    'last_race_pts', 'last_3_mean_pts', 'last_3_max_pts',
    # V3: Age (birth_date required)
    'age',
    # V3: Team (startlist-based)
    'team_rank', 'is_leader', 'team_size', 'pct_of_team', 'team_total_pts',
    # V4: Rider profile specialization
    'pct_pts_p1p2', 'pct_pts_p4p5', 'pct_pts_p3',
    'itt_top10_rate', 'stage_wins_flat', 'stage_wins_mountain',
    # V4: Race profile distribution
    'target_flat_pct', 'target_mountain_pct', 'target_itt_pct',
]

# Removed in v8 cleanup:
# - pts_total_alltime: volume bias, penalizes young riders
# - pts_per_career_year: broken (divides by full career but only has data since 2019)
# - race_type_enc: constant within per-type models
# - is_young, is_veteran: redundant with continuous age
# - stage_pts_12m: exact duplicate of pts_stage_12m
# - same_race_editions: redundant with has_same_race flag
# - top5_rate, podium_rate: highly correlated with top10_rate and win_rate

assert len(FEATURE_COLS) == 41, f"Expected 41 feature cols, got {len(FEATURE_COLS)}"  # noqa: S101

# E01: Missingness indicators (Phase B)
E01_MISSINGNESS_COLS = [
    'has_recent_form',      # raced in last 30 days (distinguishes "no data" from "bad form")
    'has_gc_history',       # has GC results in 12m
    'has_stage_history',    # has stage results in 12m
]

# E03: Non-linear rest buckets (Phase B)
E03_REST_BUCKET_COLS = [
    'rest_1_10d',           # came off a race recently
    'rest_11_21d',          # normal prep window
    'rest_22_45d',          # planned rest / block training
    'rest_46_plus',         # long break (injury, off-season, GT taper)
]

# E02: Intensity features — quality over volume (Phase B)
E02_INTENSITY_COLS = [
    'pts_per_race_12m',             # total pts / races raced (productivity per start)
    'gc_pts_per_gc_race_12m',       # GC pts / GC races (GC specialist quality)
    'stage_pts_per_stage_day_12m',  # stage pts / stage days (daily scoring rate)
    'top10_gc_per_gc_race_12m',     # top-10 GC finishes / GC races (consistency at top)
]

# Stage-race decontaminated features (fix for classic specialist leakage)
SR_GC_COLS = [
    'sr_gc_top10_rate',       # top-10 rate in stage race GCs only
    'sr_gc_win_rate',         # win rate in stage race GCs only
    'sr_gc_pts_per_race',     # GC pts per stage race
    'sr_best_race_pts_12m',   # best stage race performance (not classic)
    'sr_median_race_pts_12m', # median stage race (filters classic noise)
    'sr_pts_per_race_12m',    # productivity in stage races only
    'sr_race_pct',            # % of races that are stage races (rider type)
]

# E04: Race prestige features — not all races are equal (Phase B)
E04_PRESTIGE_COLS = [
    'prestige_pts_12m',     # class-weighted points (UWT=1.0, Pro=0.7)
    'gt_pts_12m',           # points from grand tours only
    'gt_gc_pts_12m',        # GC points from grand tours only
    'gt_race_count_12m',    # how many GTs raced in 12m
    'best_gt_pts_12m',      # best single GT performance
    'gt_pts_per_race_12m',  # average pts per GT
    'gt_gc_top10_rate',     # % of GT GCs finishing top 10
    'uwt_pts_12m',          # UWT-only points (filters Pro noise)
    'uwt_pts_per_race_12m', # productivity in UWT races only
]


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
    """Compute the 38 features for a single rider.

    v8 cleanup: removed broken/redundant features, added has_same_race flag.

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

    # ── Scoring-table-aware expected GC points (FR-005b) ────────
    # Apply the target race type's GC scoring table to the rider's
    # historical GC finish positions. Captures the non-linear reward
    # structure: 1st=150 vs 21st=0 in GT.
    _GC_TABLES = {
        'mini_tour': {1: 100, 2: 80, 3: 65, 4: 55, 5: 45, 6: 40, 7: 35, 8: 30, 9: 25, 10: 20,
                      11: 18, 12: 16, 13: 14, 14: 12, 15: 10},
        'grand_tour': {1: 150, 2: 125, 3: 100, 4: 80, 5: 60, 6: 50, 7: 45, 8: 40, 9: 35, 10: 30,
                       11: 28, 12: 26, 13: 24, 14: 22, 15: 20, 16: 18, 17: 16, 18: 14, 19: 12, 20: 10},
    }
    gc_finishes = rh_12m[
        (rh_12m['category'] == 'gc') &
        (rh_12m['position'].notna()) &
        (rh_12m['position'] > 0) &
        (rh_12m['race_type'].isin(['mini_tour', 'grand_tour']))
    ]['position'].values
    gc_table = _GC_TABLES.get(race_type, _GC_TABLES['mini_tour'])
    if len(gc_finishes) > 0:
        expected = np.mean([gc_table.get(int(p), 0) for p in gc_finishes])
        feats['expected_gc_pts'] = expected
    else:
        feats['expected_gc_pts'] = 0.0

    # ── V2 features ──────────────────────────────────────────────
    for cat in ['gc', 'stage', 'mountain', 'sprint']:
        feats[f'pts_{cat}_12m'] = rh_12m[rh_12m['category'] == cat]['pts'].sum()

    # Per-category "invisible" points (FR-005c)
    for cat in ['gc_daily', 'mountain_pass', 'sprint_intermediate', 'regularidad_daily']:
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
    feats['win_rate'] = (gc_12m['position'] == 1).sum() / n_gc if n_gc > 0 else 0.0

    # Stage-race-only GC results (excludes classics where "gc" = final result)
    # This prevents classics specialists (VdP, Pogačar's Flanders) from
    # inflating GC metrics used for stage race prediction.
    gc_sr = rh_12m[
        (rh_12m['category'] == 'gc') &
        (rh_12m['position'].notna()) &
        (rh_12m['race_type'].isin(['mini_tour', 'grand_tour']))
    ]
    n_gc_sr = len(gc_sr)
    feats['sr_gc_top10_rate'] = (gc_sr['position'] <= 10).sum() / n_gc_sr if n_gc_sr > 0 else float('nan')
    feats['sr_gc_win_rate'] = (gc_sr['position'] == 1).sum() / n_gc_sr if n_gc_sr > 0 else float('nan')
    feats['sr_gc_pts_per_race'] = gc_sr['pts'].sum() / n_gc_sr if n_gc_sr > 0 else float('nan')

    # Stage-race filtered versions of general quality features.
    # Without these, classic specialists (VdP, Alaphilippe) get inflated
    # quality scores from one-day race wins that don't transfer to GTs.
    rh_sr = rh_12m[rh_12m['race_type'].isin(['mini_tour', 'grand_tour'])]
    if len(rh_sr) > 0:
        sr_race_pts = rh_sr.groupby(['race_slug', 'year'])['pts'].sum()
        n_sr_races = len(sr_race_pts)
        feats['sr_best_race_pts_12m'] = sr_race_pts.max()
        feats['sr_median_race_pts_12m'] = sr_race_pts.median()
        feats['sr_pts_per_race_12m'] = sr_race_pts.mean()
    else:
        feats['sr_best_race_pts_12m'] = float('nan')
        feats['sr_median_race_pts_12m'] = float('nan')
        feats['sr_pts_per_race_12m'] = float('nan')

    # What fraction of racing is stage races vs classics — rider type signal
    total_races = feats['race_count_12m']
    feats['sr_race_pct'] = len(rh_sr[['race_slug', 'year']].drop_duplicates()) / total_races if total_races > 0 else float('nan')

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
        feats['has_same_race'] = 1
    else:
        feats['same_race_best'] = 0.0
        feats['same_race_mean'] = 0.0
        feats['has_same_race'] = 0

    feats['pts_trend_3m'] = feats['pts_total_3m'] - (feats['pts_total_6m'] - feats['pts_total_3m'])

    if race_type in ('mini_tour', 'grand_tour'):
        feats['gc_pts_same_type'] = rh_12m[
            (rh_12m['category'] == 'gc') & (rh_12m['race_type'] == race_type)
        ]['pts'].sum()
    else:
        feats['gc_pts_same_type'] = 0.0

    # ── V3 NEW: Feature 1 — Micro-form ──────────────────────────
    # NaN semantics: when a rider hasn't raced in a window, the feature
    # is NaN (unknown), not 0 (raced, scored nothing).  RF sees 0 via
    # fillna(0); LightGBM can learn a native missing-value split.
    n_races_30d = rh_30d[['race_slug', 'year']].drop_duplicates().shape[0]
    n_races_14d = rh_14d[['race_slug', 'year']].drop_duplicates().shape[0]
    feats['race_count_30d'] = n_races_30d

    feats['pts_30d'] = rh_30d['pts'].sum() if n_races_30d > 0 else float('nan')
    feats['pts_14d'] = rh_14d['pts'].sum() if n_races_14d > 0 else float('nan')

    # Last 3 races performance (most recent)
    if len(rh_12m) > 0:
        recent_race_pts = rh_12m.groupby(['race_slug', 'year']).agg(
            pts=('pts', 'sum'),
            date=('race_date', 'max'),
        ).sort_values('date', ascending=False)

        last_3 = recent_race_pts.head(3)['pts'].values
        feats['last_race_pts'] = last_3[0] if len(last_3) >= 1 else float('nan')
        feats['last_3_mean_pts'] = np.mean(last_3) if len(last_3) >= 1 else float('nan')
        feats['last_3_max_pts'] = np.max(last_3) if len(last_3) >= 1 else float('nan')
    else:
        feats['last_race_pts'] = float('nan')
        feats['last_3_mean_pts'] = float('nan')
        feats['last_3_max_pts'] = float('nan')

    # ── E01: Missingness indicators ──────────────────────────────
    # Binary signals: "has data" vs "no data" — lets the model
    # distinguish "chose not to race" from "raced and scored poorly".
    feats['has_recent_form'] = 1 if n_races_30d > 0 else 0
    feats['has_gc_history'] = 1 if n_gc > 0 else 0
    feats['has_stage_history'] = 1 if (rh_12m['category'] == 'stage').any() else 0

    # ── E03: Non-linear rest buckets ─────────────────────────────
    # days_since_last is unlikely to be linear:
    #   - 1-10d  = came off a race (possibly fatigued)
    #   - 11-21d = normal prep window
    #   - 22-45d = planned rest / block training
    #   - 46+    = long break (injury? off-season? GT taper?)
    dsl = feats['days_since_last']
    feats['rest_1_10d'] = 1 if dsl <= 10 else 0
    feats['rest_11_21d'] = 1 if 11 <= dsl <= 21 else 0
    feats['rest_22_45d'] = 1 if 22 <= dsl <= 45 else 0
    feats['rest_46_plus'] = 1 if dsl > 45 else 0

    # ── E02: Intensity features (quality over volume) ────────────
    # "Points per opportunity" — separates a rider who scores 300
    # in 3 races (elite) from one who scores 300 in 10 (volume).
    n_races = feats['race_count_12m']
    n_gc = len(gc_12m)
    n_stage_days = len(rh_12m[rh_12m['category'] == 'stage'])

    feats['pts_per_race_12m'] = feats['pts_total_12m'] / n_races if n_races > 0 else float('nan')
    # Use stage-race GC only (n_gc_sr) — classics "gc" results are a different signal
    feats['gc_pts_per_gc_race_12m'] = gc_sr['pts'].sum() / n_gc_sr if n_gc_sr > 0 else float('nan')
    feats['stage_pts_per_stage_day_12m'] = feats['pts_stage_12m'] / n_stage_days if n_stage_days > 0 else float('nan')
    feats['top10_gc_per_gc_race_12m'] = (gc_12m['position'] <= 10).sum() / n_gc if n_gc > 0 else float('nan')

    # ── E04: Race prestige features ──────────────────────────────
    # Not all races are equal: Tour de France >> Luxembourg.
    # Separate GT signal from mini-tour signal, and weight by class.
    _CLASS_WEIGHT = {'UWT': 1.0, 'Pro': 0.7, '1': 0.5}

    # Prestige-weighted total points (UWT pts count more than Pro)
    if len(rh_12m) > 0 and 'race_class' in rh_12m.columns:
        weights = rh_12m['race_class'].map(_CLASS_WEIGHT).fillna(0.5)
        feats['prestige_pts_12m'] = (rh_12m['pts'] * weights).sum()
    else:
        feats['prestige_pts_12m'] = 0.0

    # Grand Tour specific history (the strongest signal for GT prediction)
    rh_gt = rh_12m[rh_12m['race_type'] == 'grand_tour']
    feats['gt_pts_12m'] = rh_gt['pts'].sum()
    gc_gt = rh_gt[(rh_gt['category'] == 'gc') & (rh_gt['position'].notna()) & (rh_gt['position'] > 0)]
    feats['gt_gc_pts_12m'] = rh_gt[rh_gt['category'] == 'gc']['pts'].sum()
    n_gt_races = rh_gt[['race_slug', 'year']].drop_duplicates().shape[0]
    feats['gt_race_count_12m'] = n_gt_races
    if n_gt_races > 0:
        gt_race_pts = rh_gt.groupby(['race_slug', 'year'])['pts'].sum()
        feats['best_gt_pts_12m'] = gt_race_pts.max()
        feats['gt_pts_per_race_12m'] = gt_race_pts.mean()
    else:
        feats['best_gt_pts_12m'] = float('nan')
        feats['gt_pts_per_race_12m'] = float('nan')
    feats['gt_gc_top10_rate'] = (gc_gt['position'] <= 10).sum() / len(gc_gt) if len(gc_gt) > 0 else float('nan')

    # UWT-only aggregation (filters out noise from Pro/1-class races)
    rh_uwt = rh_12m[rh_12m['race_class'] == 'UWT'] if 'race_class' in rh_12m.columns else rh_12m.iloc[0:0]
    feats['uwt_pts_12m'] = rh_uwt['pts'].sum()
    n_uwt = rh_uwt[['race_slug', 'year']].drop_duplicates().shape[0]
    feats['uwt_pts_per_race_12m'] = feats['uwt_pts_12m'] / n_uwt if n_uwt > 0 else float('nan')

    # ── V3: Age (only continuous age, no derived features) ────────
    rider_rows = results_df[results_df['rider_id'] == rider_id]
    rider_row = rider_rows.iloc[0] if len(rider_rows) > 0 else None
    birth_date_val = rider_row['rider_birth_date'] if rider_row is not None else None

    if birth_date_val is not None and not pd.isna(birth_date_val):
        bd = birth_date_val.date() if hasattr(birth_date_val, 'date') else birth_date_val
        age_days = (race_date_py - bd).days
        feats['age'] = age_days / 365.25
    else:
        feats['age'] = 28.0  # default median age

    # ── V3: Feature 3 — Team leader signal ───────────────────────
    ti = rider_team_info.get(rider_id, {})
    feats['team_rank'] = ti.get('team_rank', 4)
    feats['is_leader'] = ti.get('is_leader', 0)
    feats['team_size'] = ti.get('team_size', 7)
    feats['pct_of_team'] = ti.get('pct_of_team', 0)
    feats['team_total_pts'] = ti.get('team_total_pts', 0)

    # ── V4: Rider profile specialization ───────────────────────
    stages = rh_12m[
        (rh_12m['category'] == 'stage') &
        (rh_12m['parcours_type'].notna()) &
        (rh_12m['position'].notna())
    ] if 'parcours_type' in rh_12m.columns else pd.DataFrame()

    total_stage_pts = stages['pts'].sum() if len(stages) > 0 else 0
    if total_stage_pts > 0:
        flat_pts = stages[stages['parcours_type'].isin(['p1', 'p2'])]['pts'].sum()
        mtn_pts = stages[stages['parcours_type'].isin(['p4', 'p5'])]['pts'].sum()
        p3_pts = stages[stages['parcours_type'] == 'p3']['pts'].sum()
        feats['pct_pts_p1p2'] = flat_pts / total_stage_pts
        feats['pct_pts_p4p5'] = mtn_pts / total_stage_pts
        feats['pct_pts_p3'] = p3_pts / total_stage_pts
    else:
        feats['pct_pts_p1p2'] = 0.0
        feats['pct_pts_p4p5'] = 0.0
        feats['pct_pts_p3'] = 0.0

    itt_results = rh_12m[
        (rh_12m.get('is_itt', pd.Series(dtype=bool)) == True) &
        (rh_12m['position'].notna())
    ] if 'is_itt' in rh_12m.columns else pd.DataFrame()
    n_itt = len(itt_results)
    feats['itt_top10_rate'] = (itt_results['position'] <= 10).sum() / n_itt if n_itt > 0 else 0.0

    feats['stage_wins_flat'] = len(stages[
        (stages['parcours_type'].isin(['p1', 'p2'])) & (stages['position'] == 1)
    ]) if len(stages) > 0 else 0
    feats['stage_wins_mountain'] = len(stages[
        (stages['parcours_type'].isin(['p4', 'p5'])) & (stages['position'] == 1)
    ]) if len(stages) > 0 else 0

    # V4: Race profile features are set by the caller (not here)
    # They're passed as race_profile_feats and merged externally
    # Default to 0 if not provided
    feats.setdefault('target_flat_pct', 0.0)
    feats.setdefault('target_mountain_pct', 0.0)
    feats.setdefault('target_itt_pct', 0.0)

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


# ── Race profile computation ─────────────────────────────────────────

def compute_race_profile(results_df: pd.DataFrame, race_slug: str, race_year: int) -> dict:
    """Compute profile distribution for a race from its stage results in DB.

    Used during training to derive the target race's profile. For on-demand
    prediction, the profile can be provided externally (from PCS scrape).

    Returns:
        Dict with 'target_flat_pct', 'target_mountain_pct', 'target_itt_pct'.
    """
    stages = results_df[
        (results_df['race_slug'] == race_slug) &
        (results_df['year'] == race_year) &
        (results_df['category'] == 'stage') &
        (results_df['parcours_type'].notna())
    ]
    distinct = stages.drop_duplicates(subset=['stage_number'])
    total = len(distinct)
    if total == 0:
        return {'target_flat_pct': 0.0, 'target_mountain_pct': 0.0, 'target_itt_pct': 0.0}

    p_counts = distinct['parcours_type'].value_counts().to_dict()
    itt_count = distinct['is_itt'].sum() if 'is_itt' in distinct.columns else 0

    return {
        'target_flat_pct': (p_counts.get('p1', 0) + p_counts.get('p2', 0)) / total,
        'target_mountain_pct': (p_counts.get('p4', 0) + p_counts.get('p5', 0)) / total,
        'target_itt_pct': int(itt_count) / total,
    }


# ── Public API ───────────────────────────────────────────────────────

def extract_features_for_race(
    results_df: pd.DataFrame,
    startlists_df: pd.DataFrame,
    race_slug: str,
    race_year: int,
    race_type: str,
    race_date,
    race_profile: dict | None = None,
) -> pd.DataFrame:
    """Extract features for all riders on a single race's startlist.

    Used for on-demand prediction. Does NOT include actual_pts target.

    Args:
        results_df: Full results DataFrame with pre-computed `pts` column.
        startlists_df: Full startlists DataFrame.
        race_slug: Race identifier.
        race_year: Race year.
        race_type: One of 'classic', 'mini_tour', 'grand_tour'.
        race_date: Race date (pandas Timestamp or datetime).
        race_profile: Optional dict with target_flat_pct, target_mountain_pct,
            target_itt_pct. If None, computed from DB stage results.

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

    # Race profile (v4): from caller or computed from DB
    rp = race_profile if race_profile else compute_race_profile(results_df, race_slug, race_year)

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
        # Set race profile features (v4)
        feats['target_flat_pct'] = rp.get('target_flat_pct', 0.0)
        feats['target_mountain_pct'] = rp.get('target_mountain_pct', 0.0)
        feats['target_itt_pct'] = rp.get('target_itt_pct', 0.0)

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

        # Race profile (v4): computed from DB stage results
        rp = compute_race_profile(results_df, race_slug, race_year)

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
            # Set race profile features (v4)
            feats['target_flat_pct'] = rp.get('target_flat_pct', 0.0)
            feats['target_mountain_pct'] = rp.get('target_mountain_pct', 0.0)
            feats['target_itt_pct'] = rp.get('target_itt_pct', 0.0)

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
