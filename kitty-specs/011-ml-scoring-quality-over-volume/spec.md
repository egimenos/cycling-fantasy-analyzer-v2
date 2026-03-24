# Feature Specification: ML Scoring Quality-Over-Volume Redesign

**Feature Branch**: `011-ml-scoring-quality-over-volume`
**Created**: 2026-03-24
**Status**: Draft
**Mission**: software-dev

## User Scenarios & Testing

### User Story 1 - Accurate Rider Ranking for Stage Races (Priority: P1)

A fantasy cycling game player submits a race startlist for analysis. The ML model ranks riders by predicted fantasy points. The ranking should reflect actual rider quality: a Grand Tour winner should rank clearly above a rider who simply races more often but at lower levels.

**Why this priority**: This is the core value proposition. Today, Vingegaard (Vuelta winner, 2nd Tour) gets ML score 230 vs Almeida (many mini-tours) 221 — the model cannot distinguish quality from volume.

**Independent Test**: Run the benchmark suite on 2025 holdout races and verify Spearman rho improves over the v4b baseline (mini_tour: 0.479, grand_tour: 0.572 on train 2022-24 / test 2025 split).

**Acceptance Scenarios**:

1. **Given** a mini-tour startlist including both GT contenders and mini-tour regulars, **When** the model predicts scores, **Then** GT winners/podium riders rank proportionally higher than riders with more mini-tour volume but lower peak performance
2. **Given** two riders with similar total points but different race quality (UWT vs Pro), **When** scores are predicted, **Then** the rider with predominantly UWT results scores higher
3. **Given** a rider with no history in the specific race but strong GT results, **When** scores are predicted, **Then** the model does not penalize them vs a weaker rider with same-race history

---

### User Story 2 - Per-Category Prediction Accuracy (Priority: P2)

The model should accurately predict both GC-oriented and stage-oriented contributions separately, since different rider profiles excel at different scoring categories.

**Why this priority**: A single model predicting total points conflates GC consistency (Vingegaard) with stage-hunting ability (sprinters/breakaway riders). Decomposing the target allows each sub-model to learn cleaner signals.

**Independent Test**: Compare decomposed model (GC + Stage sub-predictions) against single-target model using Spearman rho on holdout data.

**Acceptance Scenarios**:

1. **Given** a GC contender (high GC history, low stage wins), **When** the decomposed model predicts, **Then** the GC sub-model assigns high GC points and the Stage sub-model assigns moderate stage points
2. **Given** a stage hunter (low GC, high stage wins), **When** the decomposed model predicts, **Then** the inverse pattern holds

---

### User Story 3 - Rider Strength Rating Independent of Volume (Priority: P2)

An Elo-like rating system provides a single "rider strength" number that encodes career quality, automatically updated after each race. This feature is orthogonal to all existing volume-based features.

**Why this priority**: All current features are derived from point sums, which are inherently volume-correlated. An Elo rating captures pairwise "who beats whom" — genuinely new information.

**Independent Test**: Add Elo as a feature, retrain, and measure rho improvement.

**Acceptance Scenarios**:

1. **Given** a rider who consistently finishes top-5 in major races, **When** Elo is computed, **Then** their Elo rating is in the top tier regardless of how many races they entered
2. **Given** a rider who races frequently but finishes mid-pack, **When** Elo is computed, **Then** their rating is moderate despite high race count

---

### User Story 4 - Robust Evaluation Framework (Priority: P3)

The benchmark suite uses expanding-window cross-validation and confidence intervals so that measured improvements are statistically meaningful, not noise.

**Why this priority**: Current single-split evaluation (train <2025, test 2025) has only 3 GTs and ~35 mini-tours in test — one anomalous race swings the mean. Bootstrap CIs and multi-fold evaluation improve confidence.

**Independent Test**: Run expanding-window CV and verify that confidence intervals are narrow enough to distinguish real improvements from noise.

**Acceptance Scenarios**:

1. **Given** a model change that improves rho by 0.02, **When** evaluated with expanding-window CV, **Then** the improvement is consistent across folds and the bootstrap 95% CI does not include zero delta

---

### Edge Cases

- What happens when a rider has zero race-days in the last 12 months? Per-raceday intensity features must default to 0, not NaN/infinity.
- How does Elo handle a rider's first-ever race? Initialize with a league-average rating.
- What happens when a race has no UWT riders (all Pro)? Class weighting still applies normally — all riders get the Pro discount equally, so relative ranking is preserved.
- What if birth_date scraping fails for some riders? Age features fall back to median defaults (28.0), as currently implemented.

## Requirements

### Functional Requirements

- **FR-001**: The feature extraction pipeline MUST normalize point-based features by race-days (distinct stages raced), not by race count
- **FR-002**: The data loading pipeline MUST apply race-class weighting to points before feature aggregation (UWT=1.0, Pro=0.7, other=0.5)
- **FR-003**: The feature `pts_same_type_12m` MUST include cross-type signal: GT results weighted at 0.6-0.8 when predicting mini-tour, and vice versa
- **FR-004**: The riders table MUST have birth_date populated for at least 80% of riders to activate age-based features
- **FR-005**: Redundant features MUST be pruned (target: 49 down to 35-40 features), removing linear combinations and constant-within-model features
- **FR-005b**: The feature set MUST include a scoring-table-aware feature that captures a rider's "expected points from position distribution" — applying the target race type's scoring table to the rider's historical GC finish positions, accounting for the non-linear reward structure (1st=150 vs 21st=0 in GT GC)
- **FR-005c**: The feature set MUST include per-category historical features for scoring categories currently invisible to the model. Specifically: historical regularidad_daily pts (sprinter consistency signal), sprint_intermediate pts (sprint contention signal), mountain_pass pts (climber signal), and gc_daily pts (GC consistency signal). These represent ~15-20% of total points for specialist riders (sprinters, climbers) and have no dedicated predictive features today.
- **FR-005d**: The feature set MUST include startlist-aware team role features computed from the SPECIFIC race startlist, not from global rider history. Key features: number of stronger teammates in this race (by Elo or pts), whether the rider is the top-ranked in their team for this specific startlist, and number of GC candidates on the same team. Example: McNulty finishes 1st GC when leading UAE alone, but 50th+ when Pogačar/Almeida are on the same startlist — current features cannot distinguish these scenarios.
- **FR-006**: The system MUST support XGBoost/LightGBM as an alternative model with automated hyperparameter tuning (Optuna)
- **FR-007**: The system MUST support target decomposition into GC sub-model and Stage sub-model, with combined prediction. The Stage sub-model must capture sprinter value (stage + sprint_intermediate + regularidad_daily) and the GC sub-model must capture climber/GC value (gc + gc_daily + mountain + mountain_pass)
- **FR-008**: The system MUST support target variable transformations: training on percentile-rank or log-transformed points instead of raw points, to better align the optimization objective with the ranking evaluation metric
- **FR-009**: An Elo rating system MUST be implementable as a preprocessing step, producing per-rider GC and Stage Elo ratings updated after each race
- **FR-010**: The benchmark suite MUST support expanding-window cross-validation across multiple train/test splits
- **FR-011**: The benchmark suite MUST report bootstrap confidence intervals on Spearman rho
- **FR-011b**: The benchmark suite MUST report fantasy-relevant metrics alongside Spearman rho: precision@15 (how many of the predicted top 15 are in the actual top 15), and NDCG@20 (ranking quality weighted by position, where getting the #1 rider right matters more than getting the #15 right). Spearman rho remains the primary metric but these complement it for practical fantasy team selection.
- **FR-012**: All model changes MUST be evaluated against the v4b baseline using the benchmark harness before production integration
- **FR-013**: Production model retraining MUST complete within 10 minutes
- **FR-014**: Features with missing data MUST use NaN (not fillna(0)) when using LightGBM, plus binary indicator flags (has_same_race_history, has_recent_form) to distinguish "no data" from "zero value". This prevents the model from confusing absence of data with a meaningful zero.
- **FR-015**: LightGBM MUST be tested with Tweedie/Poisson objective functions as an alternative to MSE, given the heavy-tailed distribution of fantasy points (most riders score 0-20, few score 100+)
- **FR-016**: The feature `days_since_last` MUST be complemented with a rest-days-optimality feature that captures the non-linear relationship between rest and performance (5-10 days optimal, 1 day = fatigue, 60+ days = lost rhythm)

- **FR-017**: Historical rider prices MUST be scraped from grandesminivueltas.com (pattern: `{year}/{month}/{day}/{race-slug}-equipos-y-elecciones/`) and stored in the database. Data available from 2023-2026, men's races only (filter out URLs containing womens/femenin/we-/donne/femmes). This enables the ultimate benchmark: comparing the predicted optimal team against the actually optimal team given real prices and budget constraints.
- **FR-017b**: The benchmark suite MUST include a fantasy-team-optimality metric: given historical prices and a budget of 2000 hillios, what percentage of the actually optimal team's total points does the model's predicted optimal team capture?

### Key Entities

- **RaceResult**: Historical result with pts, weighted pts (wpts), race_class, race_type, parcours_type, profile_score, category
- **Rider**: With birth_date (newly populated), Elo ratings (GC and Stage)
- **RiderPrice**: Historical price per rider per race (rider_id, race_slug, year, price_hillios), scraped from grandesminivueltas.com
- **FeatureVector**: Per-rider-per-race feature set (intensity-based, class-weighted, cross-type aware)
- **Model**: Per-race-type (mini_tour, grand_tour), optionally decomposed into GC and Stage sub-models

## Success Criteria

### Measurable Outcomes

- **SC-001**: Mini-tour Spearman rho on holdout data improves over v4b baseline (current: 0.479 on 2022-24/2025 split)
- **SC-002**: Grand-tour Spearman rho on holdout data improves over v4b baseline (current: 0.572 on 2022-24/2025 split)
- **SC-003**: In the Vingegaard vs Almeida case study, the score gap increases to reflect the domain-obvious quality difference
- **SC-004**: Model retraining completes within 10 minutes on production hardware
- **SC-005**: At least 80% of riders have birth_date populated, activating age-based features
- **SC-006**: Each phase is independently benchmarked, with results documented, before deciding on production integration

## Assumptions

- Training data spans 2019-2026 (~236K race results, ~3500 riders, 382+ races)
- The NO-GO decision for classics remains unchanged (inherently unpredictable one-day races)
- The hybrid scoring approach (ML for stage races, rules-based for classics) continues
- XGBoost and scikit-learn are available in the ML Python environment
- Weekly retraining via `make retrain` continues as the deployment model
- Phase integration decisions are made pragmatically based on measured results, with no pre-set rho threshold

## Known Limitations

- **Emerging talent blind spot**: The model only sees World Tour and Pro Tour results. Young riders who dominated sub-23 or continental categories appear as "low data" riders with few pro results. Per-raceday intensity and Elo partially mitigate this (high intensity from few but strong results), but the model cannot see pre-pro career history. PCS has this data — scraping lower categories is a potential future improvement but out of scope for this feature.
- **Classics remain unpredictable**: NO-GO decision stands. One-day races are too stochastic/tactical.
- **Price-awareness gap**: The ML model predicts points, not value (points/price). A cheap emerging talent at 50 hillios scoring 80 pts is better value than a star at 600 hillios scoring 1000 pts, but the model doesn't optimize for this. Value optimization happens in the separate optimizer layer.

## Research Artifacts (Pre-existing)

- `ml/src/research_v6.py`: Proved adding correlated features (pts_per_race, pts_uwt, pts_gt) does not improve RF rho
- `ml/src/research_v7.py`: Proved race-class weighting and cross-type signal alone don't improve rho; XGBoost with default params is worse than RF
- `ml/src/research_v6.py` also contains `compute_pts_vectorized()` — 100x faster data loading than the original `apply()` approach
- `ml/src/scrape_birth_dates.py`: Standalone script to populate rider birth_dates from PCS (in progress)
