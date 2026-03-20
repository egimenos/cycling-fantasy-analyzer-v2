# Feature Specification: ML Scoring for Stage Races

**Feature Branch**: `006-ml-scoring-stage-races`
**Created**: 2026-03-20
**Status**: Draft
**Mission**: software-dev

## User Scenarios & Testing

### User Story 1 - Weekly Model Retraining (Priority: P1)

The system operator runs a single command (`make retrain`) that trains a Random Forest model using historical race data, saves the trained model with a version identifier, and automatically generates predictions for all stage races that have startlists available. The pipeline detects races with startlists but no predictions for the current model version and computes them without manual intervention.

**Why this priority**: Without a trained model and pre-computed predictions, no other part of the feature can function. This is the foundation of the entire ML scoring system.

**Independent Test**: Can be fully tested by running `make retrain` against the existing database with 210K results and verifying that a model file is saved and prediction records appear in the database for stage races with startlists.

**Acceptance Scenarios**:

1. **Given** a database with historical race results (2022-2026) and startlists for upcoming stage races, **When** the operator runs `make retrain`, **Then** a Random Forest model is trained using all available data, saved to disk with a version identifier, and predictions are written to the database for every stage race that has a startlist.
2. **Given** a previously trained model exists and new startlists have been scraped since the last retrain, **When** the operator runs `make retrain`, **Then** the new model replaces the previous one and predictions are generated for the newly discovered startlists as well as re-generated for existing ones with the new model version.
3. **Given** no startlists exist for any upcoming race, **When** the operator runs `make retrain`, **Then** the model is trained and saved successfully but no prediction records are written, and the command exits cleanly with a message indicating zero races to predict.

---

### User Story 2 - Hybrid Scoring in the API (Priority: P1)

When scoring riders for a race, the system provides both the rules-based score (with full category breakdown: gc, stage, mountain, sprint) and, for stage races, the ML predicted score. The response includes a `scoring_method` field and an `ml_predicted_score` field without breaking the existing `RiderScore` interface. For classics, only rules-based scoring is returned.

**Why this priority**: This is the core value delivery — users see ML predictions alongside rules-based scores for stage races, enabling better-informed team selection decisions.

**Independent Test**: Can be tested by requesting rider scores for a stage race (e.g., a mini tour) and verifying that both `totalProjectedPts` (rules-based) and `ml_predicted_score` are present in the response, while requesting scores for a classic returns only rules-based scores with no ML fields.

**Acceptance Scenarios**:

1. **Given** a mini tour or grand tour race with ML predictions in the database, **When** a user requests rider scores for that race, **Then** each rider's response includes the full rules-based breakdown (gc, stage, mountain, sprint, totalProjectedPts) plus `scoring_method: "hybrid"` and `ml_predicted_score` with the ML prediction.
2. **Given** a classic race, **When** a user requests rider scores, **Then** each rider's response includes only the rules-based breakdown with `scoring_method: "rules"` and no `ml_predicted_score` field (or null).
3. **Given** a stage race where ML predictions have not yet been generated (no startlist scraped, or retrain not yet run), **When** a user requests rider scores, **Then** the system falls back to rules-based scoring only with `scoring_method: "rules"`.

---

### User Story 3 - On-Demand Prediction for a Specific Race (Priority: P2)

The system operator can generate ML predictions for a single race by running `make predict RACE=<slug> YEAR=<year>`, using the most recently trained model. This supports the workflow of scraping a new startlist and immediately generating predictions without waiting for the weekly retrain.

**Why this priority**: Enables responsiveness when a new startlist becomes available mid-week. Depends on Story 1 (a trained model must exist).

**Independent Test**: Can be tested by running `make predict RACE=tour-de-suisse YEAR=2026` after a model has been trained, and verifying that prediction records appear in the database for riders on that race's startlist.

**Acceptance Scenarios**:

1. **Given** a trained model exists and a startlist has been scraped for a specific stage race, **When** the operator runs `make predict RACE=tour-de-suisse YEAR=2026`, **Then** predictions are generated for all riders on that startlist using the current model and written to the database.
2. **Given** no trained model exists, **When** the operator runs `make predict`, **Then** the command fails with a clear error message indicating that `make retrain` must be run first.
3. **Given** the specified race has no startlist in the database, **When** the operator runs `make predict`, **Then** the command fails with a clear error indicating no startlist is available for that race.

---

### User Story 4 - Team Optimizer Uses ML Score for Stage Races (Priority: P2)

The team optimizer (knapsack algorithm) uses the ML predicted score instead of the rules-based score when optimizing teams for stage races. For classics, the optimizer continues using the rules-based score. This produces better team recommendations for stage races where ML has demonstrated superior predictive power.

**Why this priority**: Directly improves the quality of team recommendations for stage races — the primary value proposition of the ML integration.

**Independent Test**: Can be tested by running the team optimizer for a stage race and verifying the selected riders differ from (and improve upon) a purely rules-based optimization.

**Acceptance Scenarios**:

1. **Given** a stage race with ML predictions available, **When** the optimizer runs, **Then** it uses `ml_predicted_score` as the scoring input for rider ranking and team selection.
2. **Given** a classic race, **When** the optimizer runs, **Then** it uses `totalProjectedPts` (rules-based) as the scoring input, ignoring ML predictions.
3. **Given** a stage race without ML predictions (model not yet trained or no startlist), **When** the optimizer runs, **Then** it falls back to rules-based scoring.

---

### User Story 5 - Benchmark Suite Compares All Scoring Methods (Priority: P2)

Running `make benchmark-suite` displays a single table with three Spearman rho columns — rules-based, ML, and hybrid — for each race. This provides a complete picture of scoring quality across methods in one view.

**Why this priority**: Essential for validating that ML scoring actually improves predictions and for monitoring model quality over time. Also useful for tracking model version regressions.

**Independent Test**: Can be tested by running `make benchmark-suite` and verifying the output table includes three rho columns, with ML rho values matching expectations from the research (rho ~0.52 mini tours, ~0.59 grand tours).

**Acceptance Scenarios**:

1. **Given** a database with historical results and ML predictions, **When** the operator runs `make benchmark-suite`, **Then** a table is displayed with columns: race name, race type, rho (rules), rho (ML), rho (hybrid), plus aggregate mean rho per method at the bottom.
2. **Given** a race in the benchmark suite is a classic (no ML scoring), **When** the benchmark runs, **Then** the ML column shows "n/a" and the hybrid column equals the rules column for that race.
3. **Given** a stage race in the suite has no ML predictions yet, **When** the benchmark runs, **Then** the ML column shows "n/a" and the hybrid column falls back to the rules value.

---

### Edge Cases

- What happens when a rider is on a startlist but has zero historical results? The model predicts based on all-zero features; the prediction will be low but valid.
- What happens when the database has results but no startlists for any race? `make retrain` trains the model successfully but generates zero predictions, and reports this clearly.
- What happens when the model file is corrupted or missing? `make predict` and the API gracefully fall back to rules-based scoring.
- What happens when a rider appears in `ml_scores` but was removed from the startlist? Stale predictions are ignored — the API joins `ml_scores` with the current startlist.
- What happens when `make retrain` is interrupted mid-execution? Predictions are written transactionally — partial writes are rolled back, and the previous model version remains valid.

## Requirements

### Functional Requirements

- **FR-001**: System MUST provide a `make retrain` command that trains a Random Forest model using all available historical race data and the 36-feature set from the research phase.
- **FR-002**: System MUST save trained models to disk with a version identifier (timestamp-based) and persist the model version in prediction records.
- **FR-003**: System MUST automatically detect stage races with startlists that lack predictions for the current model version and generate predictions for them during retrain.
- **FR-004**: System MUST write predictions to a persistent store keyed by (rider_id, race_slug, year, model_version).
- **FR-005**: System MUST provide a `make predict RACE=<slug> YEAR=<year>` command for on-demand prediction of a specific race using the latest trained model.
- **FR-006**: System MUST extend rider scoring responses to include `scoring_method` ("rules" or "hybrid") and `ml_predicted_score` (for stage races with ML predictions) without altering the existing score structure.
- **FR-007**: System MUST return both rules-based scores (with full category breakdown) and ML predicted scores for stage races in hybrid mode.
- **FR-008**: System MUST fall back to rules-based scoring when ML predictions are unavailable for a given race.
- **FR-009**: System MUST use ML predicted score as the ranking input for the team optimizer when optimizing for stage races with available predictions.
- **FR-010**: System MUST display three Spearman rho columns (rules, ML, hybrid) in the benchmark suite output.
- **FR-011**: System MUST support retraining on a weekly schedule via external cron without manual intervention.
- **FR-012**: System MUST extract the same 36 features used in the research phase (v3), maintaining parity with the validated model.

### Key Entities

- **ML Score**: A pre-computed prediction for a specific rider in a specific race, produced by a specific model version. Attributes: rider identity, race identity, year, predicted score, model version, creation timestamp.
- **Model Version**: An identifier (timestamp-based) representing a trained model snapshot. Used to track which predictions correspond to which training run.
- **Hybrid Score**: An enriched rider score that combines the existing rules-based breakdown with an optional ML predicted score and a method indicator.

## Success Criteria

### Measurable Outcomes

- **SC-001**: ML scoring for stage races achieves Spearman rho >= 0.50 in the benchmark suite, consistent with research findings (mini tours ~0.52, grand tours ~0.59).
- **SC-002**: The full retrain pipeline (train + predict all races) completes within 15 minutes on the production server.
- **SC-003**: Hybrid scoring improves aggregate Spearman rho over rules-based scoring alone across the full benchmark suite.
- **SC-004**: `make retrain` runs end-to-end without manual intervention, including auto-detection of new startlists.
- **SC-005**: Existing rules-based scoring for classics remains unchanged — no regression in classic race rho values.
- **SC-006**: The API serves hybrid scores for stage races with sub-second response time (reading pre-computed predictions).
