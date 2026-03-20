# Feature Specification: ML Scoring for Stage Races

**Feature Branch**: `006-ml-scoring-stage-races`
**Created**: 2026-03-20
**Status**: Draft
**Mission**: software-dev

## User Scenarios & Testing

### User Story 1 - Model Training Pipeline (Priority: P1)

The system operator runs a single command (`make retrain`) that trains Random Forest models using historical race data and the 36-feature set from research. The command saves trained models to disk with a version identifier. Training uses all available historical data. No predictions are generated during training — predictions happen on-demand when users request race analysis.

**Why this priority**: Without a trained model, no ML predictions can be served. This is the foundation of the entire ML scoring system.

**Independent Test**: Can be fully tested by running `make retrain` against the existing database with 210K results and verifying that model files are saved to disk with a version identifier.

**Acceptance Scenarios**:

1. **Given** a database with historical race results (2022-2026), **When** the operator runs `make retrain`, **Then** Random Forest models are trained (one per stage race type: mini tour, grand tour), saved to disk with a timestamp-based version identifier.
2. **Given** a previously trained model exists, **When** the operator runs `make retrain`, **Then** a new model is trained with the latest data and replaces the previous version. The old model file may be overwritten.
3. **Given** the database is empty or has insufficient data, **When** the operator runs `make retrain`, **Then** the command fails with a clear error message explaining the minimum data requirements.

---

### User Story 2 - On-Demand ML Predictions via Internal Service (Priority: P1)

When a user requests analysis of a stage race (uploads price list, selects race), the TypeScript API calls an internal Python ML service to generate predictions. The ML service extracts features for the race's startlist riders, runs the trained model, caches results in the database, and returns predictions. Subsequent requests for the same race and model version are served from cache. For classics, the ML service is not called — only rules-based scoring is used.

**Why this priority**: This is the core value delivery — users get ML-enhanced predictions for stage races as part of the normal analysis workflow, without any manual prediction step.

**Independent Test**: Can be tested by requesting analysis of a stage race and verifying that the ML service is called, predictions are generated and cached, and the response includes both rules-based breakdown and ML predicted score.

**Acceptance Scenarios**:

1. **Given** a trained model exists and a startlist is available for a stage race, **When** a user requests analysis for that race (first time), **Then** the API calls the ML service, which extracts features, generates predictions, caches them in the database, and the API returns both rules-based scores (with category breakdown) and `ml_predicted_score` with `scoring_method: "hybrid"`.
2. **Given** predictions are already cached for a race with the current model version, **When** a user requests analysis for the same race, **Then** the API reads cached predictions from the database without calling the ML service (cache hit).
3. **Given** a classic race, **When** a user requests analysis, **Then** the API returns only rules-based scores with `scoring_method: "rules"` and `ml_predicted_score: null`. The ML service is not called.
4. **Given** the ML service is unavailable or no trained model exists, **When** a user requests analysis for a stage race, **Then** the API falls back to rules-based scoring with `scoring_method: "rules"` and logs a warning.
5. **Given** a new model version has been trained (via `make retrain`) since the last cached predictions, **When** a user requests analysis for a previously cached race, **Then** the system detects the stale cache and re-predicts using the new model.

---

### User Story 3 - Hybrid Scoring in Analysis Results (Priority: P1)

The analysis response for stage races includes both the rules-based score (with full category breakdown: gc, stage, mountain, sprint) and the ML predicted score. The response includes `scoring_method` and `ml_predicted_score` fields without breaking the existing interface. The optimizer uses ML score for stage races when available.

**Why this priority**: Users need both scores visible for transparency and informed decision-making. The optimizer needs ML scores to produce better team recommendations.

**Independent Test**: Can be tested by verifying the API response shape includes both scoring methods for stage races and that the optimizer uses ML score for ranking when available.

**Acceptance Scenarios**:

1. **Given** a stage race with ML predictions available, **When** the optimizer runs, **Then** it uses `ml_predicted_score` as the ranking input for rider selection and team optimization.
2. **Given** a classic race, **When** the optimizer runs, **Then** it uses `totalProjectedPts` (rules-based) as the ranking input, ignoring ML predictions.
3. **Given** a stage race without ML predictions (service down or no model), **When** the optimizer runs, **Then** it falls back to rules-based scoring.

---

### User Story 4 - Benchmark Suite Compares All Scoring Methods (Priority: P2)

Running `make benchmark-suite` displays a single table with three Spearman rho columns — rules-based, ML, and hybrid — for each race. The benchmark generates ML predictions on-the-fly for historical races by calling the ML service. This provides a complete picture of scoring quality across methods in one view.

**Why this priority**: Essential for validating that ML scoring actually improves predictions and for monitoring model quality after each retrain.

**Independent Test**: Can be tested by running `make benchmark-suite` and verifying the output table includes three rho columns, with ML rho values matching expectations from the research (rho ~0.52 mini tours, ~0.59 grand tours).

**Acceptance Scenarios**:

1. **Given** a database with historical results and a trained model, **When** the operator runs `make benchmark-suite`, **Then** a table is displayed with columns: race name, race type, rho (rules), rho (ML), rho (hybrid), plus aggregate mean rho per method at the bottom.
2. **Given** a race in the benchmark suite is a classic (no ML scoring), **When** the benchmark runs, **Then** the ML column shows "n/a" and the hybrid column equals the rules column for that race.
3. **Given** the ML service is unavailable, **When** the benchmark runs, **Then** the ML and hybrid columns show "n/a" for all races and the rules column displays normally.

---

### User Story 5 - ML Service Health and Observability (Priority: P2)

The ML service exposes a health check endpoint that reports whether a trained model is loaded and ready. The API checks ML service health before attempting predictions and degrades gracefully when the service is down.

**Why this priority**: Operational reliability — the system must never fail completely because the ML service is down. Graceful degradation to rules-based scoring is essential.

**Independent Test**: Can be tested by stopping the ML service and verifying that the API still returns rules-based scores without errors.

**Acceptance Scenarios**:

1. **Given** the ML service is running with a loaded model, **When** its health endpoint is called, **Then** it responds with status "healthy" and the current model version.
2. **Given** the ML service is running but no model is loaded, **When** its health endpoint is called, **Then** it responds with status "no_model" indicating retraining is needed.
3. **Given** the ML service is down, **When** the API receives an analysis request for a stage race, **Then** the API returns rules-based scoring only and logs a warning about ML service unavailability.

---

### Edge Cases

- What happens when a rider is on a startlist but has zero historical results? The model predicts based on all-zero features; the prediction will be low but valid.
- What happens when the ML service receives a request for a classic race? It rejects the request (classics are filtered at the API layer, but the service validates too).
- What happens when the model file is corrupted or missing? The ML service fails its health check and the API falls back to rules-based scoring.
- What happens when a rider appears in cached `ml_scores` but was removed from the startlist? Stale predictions are ignored — the API joins `ml_scores` with the current startlist.
- What happens when the ML service is slow (> 5s)? The API applies a timeout and falls back to rules-based scoring for that request.
- What happens when `make retrain` is run while the ML service is serving requests? The service detects the new model version on the next request and reloads it (or requires a restart).

## Requirements

### Functional Requirements

- **FR-001**: System MUST provide a `make retrain` command that trains Random Forest models using all available historical race data and the 36-feature set from the research phase. Training only — no predictions generated.
- **FR-002**: System MUST save trained models to disk with a timestamp-based version identifier.
- **FR-003**: System MUST provide an internal ML service that accepts prediction requests for a given race and returns predicted scores for all riders on the startlist.
- **FR-004**: The ML service MUST extract the same 36 features used in the research phase (v3), maintaining parity with the validated model.
- **FR-005**: The ML service MUST cache predictions in a persistent store keyed by (rider_id, race_slug, year, model_version) and serve cached results for subsequent requests.
- **FR-006**: System MUST extend rider scoring responses to include `scoring_method` ("rules" or "hybrid") and `ml_predicted_score` (for stage races with ML predictions) without altering the existing score structure.
- **FR-007**: System MUST return both rules-based scores (with full category breakdown) and ML predicted scores for stage races in hybrid mode.
- **FR-008**: System MUST fall back to rules-based scoring when the ML service is unavailable, unhealthy, or when no trained model exists.
- **FR-009**: System MUST use ML predicted score as the ranking input for the team optimizer when optimizing for stage races with available predictions.
- **FR-010**: System MUST display three Spearman rho columns (rules, ML, hybrid) in the benchmark suite output.
- **FR-011**: System MUST support retraining on a weekly schedule via external cron without manual intervention.
- **FR-012**: The ML service MUST expose a health check endpoint reporting model load status and current version.
- **FR-013**: System MUST detect stale cached predictions (model version mismatch) and re-predict using the current model.

### Key Entities

- **ML Score (cache)**: A cached prediction for a specific rider in a specific race, produced by a specific model version. Attributes: rider identity, race identity, year, predicted score, model version, creation timestamp.
- **Model Version**: An identifier (timestamp-based) representing a trained model snapshot. Used to track which predictions correspond to which training run and to detect stale cache entries.
- **Hybrid Score**: An enriched rider score that combines the existing rules-based breakdown with an optional ML predicted score and a method indicator.

## Success Criteria

### Measurable Outcomes

- **SC-001**: ML scoring for stage races achieves Spearman rho >= 0.50 in the benchmark suite, consistent with research findings (mini tours ~0.52, grand tours ~0.59).
- **SC-002**: The full retrain pipeline (model training only) completes within 10 minutes on the production server.
- **SC-003**: Hybrid scoring improves aggregate Spearman rho over rules-based scoring alone across the full benchmark suite.
- **SC-004**: On-demand ML predictions for a race complete within 3 seconds (first request, cache miss) and within 100ms (cache hit).
- **SC-005**: Existing rules-based scoring for classics remains unchanged — no regression in classic race rho values.
- **SC-006**: The API degrades gracefully to rules-based scoring when the ML service is down, with no user-facing errors.
