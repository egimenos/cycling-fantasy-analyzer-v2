# Feature Specification: Classics ML Model

**Feature Branch**: `016-classics-ml-model`  
**Created**: 2026-04-02  
**Status**: Draft  
**Input**: Build an independent ML model for cycling classics prediction, replacing rules-based scoring

## Background & Motivation

The current system uses rules-based scoring for one-day classics races, achieving an estimated Spearman rho of ~0.31 (measured in Feature 005, March 2026). The first ML attempt failed because it reused stage-race features and architecture — the same model that works for Grand Tours and mini tours simply does not capture the unique dynamics of one-day racing.

Classics are a fundamentally different prediction domain:

- **One-day outcomes** vs. 3-week cumulative performance
- **Specialist groups** — Flemish cobble riders, Ardennes punchers, Roubaix cobble specialists form distinct, homogeneous clusters
- **Race identity matters** — past performance in a specific classic is one of the strongest predictors for future performance in that same classic
- **Seasonal pipelines** — riders build form through sequences of feeder races toward target monuments

This feature builds a **completely independent ML model** designed from scratch for the classics domain, with classic-specific features, a dedicated benchmark baseline, and systematic A/B experimentation.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Rigorous Classics Baseline (Priority: P1)

As a data scientist, I need to establish the true current performance of the rules-based classics scoring system using a comprehensive multi-metric benchmark, so that all future ML experiments have an honest baseline to beat.

**Why this priority**: Without a trustworthy baseline, we cannot evaluate whether any ML model genuinely improves prediction. The historical rho=0.31 figure is from an old research notebook and may not reflect the current rules-based system.

**Independent Test**: Run the benchmark suite against all available classic races in the dataset and produce a metrics report with confidence intervals.

**Acceptance Scenarios**:

1. **Given** the current rules-based scoring system and historical classic race data, **When** the benchmark suite runs on all classic races using expanding-window CV, **Then** a baseline report is produced with: Spearman rho, NDCG@10, Precision@5, Precision@10, capture rate (top-15 fantasy team), and team overlap — each with 95% bootstrap confidence intervals.
2. **Given** the baseline report, **When** a researcher reviews it, **Then** per-race breakdowns are available (each monument and UWT classic separately) to identify which classics are more/less predictable.

---

### User Story 2 - Classic-Specific Feature Engineering (Priority: P1)

As a data scientist, I need a feature engineering pipeline that extracts signals unique to the classics domain — classic type affinity, same-race history, seasonal form pipelines, and specialist profiles — so that the ML model has access to information the old stage-race features never captured.

**Why this priority**: The first ML attempt failed precisely because it used generic stage-race features. Domain-specific features are the core hypothesis of this new approach.

**Independent Test**: Feature extraction runs on the training dataset and produces a feature matrix for classic races. Features can be validated by spot-checking known specialist riders (e.g., Van der Poel's Flemish features should be high, Pogacar's Ardennes features should be high).

**Acceptance Scenarios**:

1. **Given** a rider with a strong history in Flemish classics, **When** features are extracted, **Then** their Flemish-type affinity score is significantly higher than their Ardennes-type affinity score.
2. **Given** a rider who has participated in the same classic 5+ times, **When** same-race history features are extracted, **Then** their best/mean/count features for that specific race are populated and non-null.
3. **Given** a rider who raced in "feeder" classics earlier in the spring campaign, **When** pipeline features are extracted for a target monument, **Then** feeder-race results are captured as predictive features.

---

### User Story 3 - ML Model Training with A/B Benchmark (Priority: P1)

As a data scientist, I need to train candidate ML models on classic-specific features and evaluate them against the rules-based baseline using the same benchmark protocol, so that every model variant is rigorously compared.

**Why this priority**: Systematic A/B comparison is the only way to know whether the model genuinely improves prediction or just overfits noise.

**Independent Test**: Train a model variant, run the benchmark, and compare all metrics against the baseline. The comparison must be reproducible.

**Acceptance Scenarios**:

1. **Given** a trained classics ML model, **When** it is evaluated on the same expanding-window CV as the baseline, **Then** a comparison report shows delta for every metric (rho, NDCG, P@K, capture rate) with statistical significance.
2. **Given** multiple model variants (different feature sets, hyperparameters), **When** the benchmark runs, **Then** results are logged in a structured experiment logbook enabling side-by-side comparison.
3. **Given** any model variant that improves rho by any amount over the baseline, **When** the improvement is consistent across CV folds, **Then** the model is flagged as a GO candidate.

---

### User Story 4 - Production Integration (Priority: P2)

As a user of the fantasy cycling analyzer, when I analyze a classic race, I want to see ML-powered predictions with per-rider scores, so that I can make better fantasy team selections for classics.

**Why this priority**: Depends on a successful GO from the research phase (P1 stories). Integration only makes sense once we have a model that beats the baseline.

**Independent Test**: Submit a classic race to the API and receive ML predictions with rider scores in the same format as stage-race predictions.

**Acceptance Scenarios**:

1. **Given** a classic race request to the API, **When** the ML model is deployed, **Then** the ML service returns per-rider predicted scores (instead of the current 404 / rules-only response).
2. **Given** a classic race prediction, **When** the response is returned, **Then** it includes `scoringMethod: "ml"` and a meaningful `mlPredictedScore` for each rider.
3. **Given** the production model, **When** it is evaluated on a held-out classic race, **Then** its metrics match or exceed the benchmarked performance from the research phase.

---

### User Story 5 - Benchmark Dashboard & Experiment Tracking (Priority: P3)

As a data scientist iterating on the model, I need structured experiment tracking so that each feature addition or hyperparameter change is logged with its impact on all metrics, enabling systematic improvement.

**Why this priority**: Supports the iterative research loop but not strictly required for a first viable model.

**Independent Test**: After running N experiments, a logbook file contains all experiment results in a queryable format.

**Acceptance Scenarios**:

1. **Given** a completed experiment, **When** it finishes, **Then** a logbook entry is created with: experiment ID, feature set, model type, all metrics, and delta vs baseline.
2. **Given** the logbook, **When** a researcher reviews it, **Then** they can identify which feature additions had the largest positive impact.

---

### Edge Cases

- What happens when a rider has never participated in any classic? Features should gracefully default to zero/null, and the model should still produce a prediction based on general riding quality.
- What happens when a new classic enters the calendar (no same-race history for anyone)? The model should fall back to classic-type affinity features rather than same-race history.
- What happens when a rider switches from stage racing to classics specialization mid-career? Recent form and trend features should capture this transition.
- What happens for the World Championship (different format, changes course yearly)? Needs special handling since same-race history is less meaningful when the course changes annually.

## Requirements _(mandatory)_

### Functional Requirements

#### Phase 1: Baseline & Research Infrastructure

- **FR-001**: System MUST compute a fresh rules-based baseline for classics using the current scoring system and all available classic race data.
- **FR-002**: Baseline MUST be evaluated using at minimum: Spearman rho, NDCG@10, Precision@5, Precision@10, top-15 capture rate, and top-15 team overlap.
- **FR-003**: All metrics MUST include 95% bootstrap confidence intervals.
- **FR-004**: Baseline MUST be computed per individual classic race as well as aggregated, to identify per-race predictability variation.
- **FR-005**: Benchmark MUST use expanding-window cross-validation consistent with the existing stage-race benchmark protocol.

#### Phase 2: Classic-Specific Feature Engineering

- **FR-006**: System MUST classify each classic race into one or more types using a lookup table (e.g., Flemish cobbled, Ardennes puncheur, monument, Italian, sprint-heavy).
- **FR-007**: System MUST extract same-race history features: best finish, mean finish, participation count, consistency (std dev), and recency of last participation — per rider per specific classic.
- **FR-008**: System MUST compute classic-type affinity features: performance aggregated across all classics of the same type (e.g., all Flemish classics combined).
- **FR-009**: System MUST extract seasonal pipeline features capturing performance in "feeder" classics that precede target monuments in the calendar (e.g., Omloop/E3/Gent-Wevelgem results as features for Ronde van Vlaanderen prediction).
- **FR-010**: System MUST compute a specialist profile: ratio of career/recent points from classics vs stage races, one-day race win rate, classic-specific top-10 rate.
- **FR-011**: System MUST extract recent classics form: points and results from classics in the current season and prior 12 months.

#### Phase 2b: Creative Feature Levers (Brainstormed)

These are additional feature ideas to explore systematically during the research phase. Each should be A/B tested independently:

- **FR-012**: **Classic-specific Glicko-2 rating** — A separate Elo/Glicko skill rating computed exclusively from classic results, potentially split by classic type (Flemish Glicko, Ardennes Glicko). Classic-to-classic form transfer is stronger within types.
- **FR-013**: **Parcours micro-affinity** — Beyond P1-P5 profile, capture cobble-specific, puncheur-specific, and long-distance (250km+) affinity. Milan-Sanremo (300km flat with a finale punch) is fundamentally different from Liege (250km mountain classic).
- **FR-014**: **"Monument gravity"** — Bayesian prior: riders who have podiumed a monument are disproportionately likely to podium it again. The "gravity" of a monument finish is sticky — Cancellara at Roubaix, Boonen at Ronde, Gilbert at Liege. Encode this as a prior.
- **FR-015**: **Spring campaign momentum** — Sequential form within the spring campaign: does a rider's trajectory across the Flemish campaign (Omloop → Kuurne → E3 → Gent-Wevelgem → Dwars → Ronde) predict their peak? Capture the slope/trend, not just the level.
- **FR-016**: **Team classics commitment** — Some teams stack for specific classics (Quick-Step at Ronde, UAE at Strade Bianche). Encode the number of protected riders per team in a given classic, historical team results in this classic.
- **FR-017**: **Age × classic-type interaction** — Classic specialists peak at different ages depending on type. Flemish cobble riders can peak early (power-based), Ardennes punchers often peak later (tactical maturity). Capture age relative to type-specific peak.
- **FR-018**: **Win style features** — Solo breakaway wins vs sprint finishes in past classics. A rider who wins solo has different characteristics from one who wins from a reduced group sprint.
- **FR-019**: **Cross-discipline signal** — Cyclocross background (CX points, CX ranking) correlates with Flemish classics success (Van der Poel, Van Aert, Pidcock). If available in the data, encode CX racing history.
- **FR-020**: **Calendar distance feature** — Days since last race, days since last classic, days until next classic. Captures freshness and motivation timing.
- **FR-021**: **Fantasy price as prior** — The GMV fantasy price itself encodes collective market expectations about a rider's chances. Using it as a feature leverages crowd wisdom as an additional signal.
- **FR-022**: **Head-to-head record** — In classics, small groups decide outcomes. Historical head-to-head results between riders who are both in the startlist could capture relative strength.

#### Phase 3: Model Training & Evaluation

- **FR-023**: System MUST train at least Random Forest and LightGBM models on the classic-specific feature set.
- **FR-024**: Every model variant MUST be evaluated using the same benchmark protocol as the baseline (same metrics, same CV folds, same race set).
- **FR-025**: System MUST log each experiment with: feature set used, model type, hyperparameters, all metrics, and delta vs baseline.
- **FR-026**: System MUST support ablation testing — adding/removing individual features to measure marginal impact.

#### Phase 4: Production Integration (conditional on GO)

- **FR-027**: ML service MUST accept classic race type and return per-rider predicted scores.
- **FR-028**: API MUST call the ML service for classics (removing the current 404 / skip behavior).
- **FR-029**: API response for classics MUST include `scoringMethod: "ml"` when ML predictions are available.
- **FR-030**: The classic ML model MUST be independently deployable and retrainable without affecting stage-race models.

### Key Entities

- **Classic Race**: A one-day cycling race with a type classification (Flemish, Ardennes, Italian, monument, sprint-heavy), parcours profile, calendar position, and historical results archive.
- **Classic Type**: A taxonomy category grouping classics by shared characteristics (profile, geography, rider archetype). A race can belong to multiple types.
- **Rider Classic Profile**: A rider's accumulated classic-specific features: type affinities, same-race histories, specialist score, seasonal form, and classic Glicko rating.
- **Experiment**: A benchmark run capturing model configuration, feature set, and multi-metric results for A/B comparison.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: The classics ML model achieves a Spearman rho statistically significantly higher than the rules-based baseline (any improvement over ~0.31 is meaningful).
- **SC-002**: The model achieves measurable improvement in at least 2 of the 5 additional metrics (NDCG@10, P@5, P@10, capture rate, team overlap) compared to the baseline.
- **SC-003**: Improvements are consistent across expanding-window CV folds (not driven by a single outlier year).
- **SC-004**: At least 3 classic-specific feature categories (from FR-006 through FR-022) demonstrate positive marginal impact in ablation testing.
- **SC-005**: Fantasy teams selected using ML predictions capture a higher percentage of actual optimal team points than rules-based teams (capture rate improvement).
- **SC-006**: Per-race analysis identifies which classic subtypes benefit most from ML, enabling targeted deployment even if some classics remain rules-based.

## Assumptions

- The existing race results database contains sufficient historical classic race data (at least 3-5 years of results per major classic) to train a meaningful model.
- Classic type classification can be reliably derived from a hardcoded lookup table of race slugs, since the set of UWT/monument classics is small and stable year-to-year.
- The expanding-window CV protocol used for stage races can be adapted for classics, though fold sizes will be smaller (fewer races per year).
- Cyclocross data (FR-019) may not be available in the current database — this feature is exploratory and can be skipped if data is absent.
- The World Championship requires special handling due to its annually changing course, but is included in scope.

## Scope Boundaries

**In scope**:

- All UWT one-day classics, monuments, and the World Championship road race
- Research phase: baseline, feature engineering, model training, A/B benchmarking
- Production integration: ML service and API changes to serve classic predictions
- Experiment tracking and structured logbook

**Out of scope**:

- Semi-classics or lower-tier one-day races (Pro Series, .1 category)
- Real-time features (weather, startlist changes on race day)
- Frontend changes (the existing UI already handles displaying predictions)
- Scraping new data sources — use only what is already in the database
