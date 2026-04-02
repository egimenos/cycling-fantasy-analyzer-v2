# Data Model: Classics ML Model

**Feature**: 016-classics-ml-model
**Date**: 2026-04-02

## Entities

### Classic Type Taxonomy

A static lookup table mapping race slugs to one or more classic types.

- **race_slug** (string, PK): Race identifier from PCS (e.g., "ronde-van-vlaanderen")
- **types** (list of strings): Classic type tags from: flemish, cobbled, ardennes, puncheur, italian, sprint_classic, hilly, monument, special
- **name** (string): Human-readable race name
- **pipeline_group** (string, optional): Campaign sequence group (e.g., "flemish_spring", "ardennes_spring")
- **pipeline_order** (integer, optional): Position in the campaign sequence (1=first feeder, N=target monument)

### Classic Feature Vector

One row per (rider, race, year) combination. Used for training and prediction.

**Identity fields:**

- **rider_id** (UUID): Rider identifier
- **race_slug** (string): Classic race slug
- **year** (integer): Race year
- **race_type** (string): Always "classic"

**Tier 1 — Core features:**

- **same_race_best** (float): Best total points in any previous edition of this specific classic
- **same_race_mean** (float): Mean total points across all previous editions
- **same_race_count** (integer): Number of previous participations in this classic
- **has_same_race** (binary): 1 if rider has participated before, 0 otherwise
- **pts_classic_12m** (float): Total points from classic races in last 12 months
- **pts_classic_6m** (float): Total points from classic races in last 6 months
- **pts_classic_3m** (float): Total points from classic races in last 3 months
- **classic_top10_rate** (float): Fraction of classic starts finishing in top 10
- **classic_win_rate** (float): Fraction of classic starts with a win
- **age** (float): Rider age at race date
- **days_since_last** (integer): Days since last race of any type
- **pts_30d** (float): Total points from all races in last 30 days
- **pts_14d** (float): Total points from all races in last 14 days
- **team_rank** (integer): Team ranking in current season
- **is_leader** (binary): Whether rider is team leader for this race
- **prestige_pts_12m** (float): Points from prestigious (UWT) races in last 12 months

**Tier 2 — Domain features:**

- **classic*type_affinity*{type}** (float, one per type): Points from same-type classics in 24m
- **classic*type_top10_rate*{type}** (float, one per type): Top-10 rate within specific type
- **pipeline_feeder_pts** (float): Points from feeder classics earlier in current campaign
- **pipeline_trend** (float): Slope of points across campaign sequence (positive = building form)
- **specialist_ratio** (float): Fraction of career points from classics (0=pure stage racer, 1=pure specialist)
- **same_race_consistency** (float): Std dev of positions in same classic (lower = more consistent)
- **monument_podium_count** (integer): Career total monument podium finishes

**Tier 3 — Experimental features (added during research, A/B tested):**

- **classic_glicko_mu** (float): Glicko-2 skill rating from classic results only
- **classic_glicko_rd** (float): Rating deviation (uncertainty)
- **type*glicko_mu*{type}** (float): Type-specific Glicko rating
- Additional experimental features added as research progresses

**Target:**

- **actual_pts** (float): Actual GC_CLASSIC points scored (0-200)

### Experiment Logbook Entry

One JSON file per benchmark experiment. Extends existing logbook schema.

- **version** (string): Schema version
- **metadata**: model_type, model_params, feature_set, feature_count, feature_list, target_transform, git_sha, timestamp
- **folds** (array): Per-fold results, each containing:
  - **race_types.classic.aggregate**: n_races, rho_mean, rho_ci, p5_mean, p10_mean, ndcg10_mean, team_capture_mean, team_overlap_mean
  - **race_types.classic.races** (array): Per-race detail with per-rider predictions
- **aggregate.classic**: Cross-fold averages with CIs

## Relationships

- Classic Feature Vector → race_results (source data, via rider_id + race_slug + year)
- Classic Feature Vector → Classic Type Taxonomy (via race_slug, for type-aware features)
- Experiment Logbook Entry → Classic Feature Vector (evaluated on cached features)

## Notes

- No new database tables are created. All data lives in existing `race_results` + `riders` tables.
- Feature vectors are cached as parquet files (extending the existing cache pattern).
- The taxonomy is a Python dict, not a database table (small, static, version-controlled).
