# Feature Specification: Productionize Source-by-Source ML Pipeline

**Feature Branch**: `013-productionize-source-by-source-ml`
**Created**: 2026-03-29
**Status**: Draft
**Mission**: software-dev
**Input**: Integrate frozen source-by-source ML models into production pipeline with per-source breakdown

**Model Baseline Reference**: [`ml/docs/model-baseline.md`](../../ml/docs/model-baseline.md)
**Retraining Runbook**: [`docs/runbooks/retraining-runbook.md`](../../docs/runbooks/retraining-runbook.md)

## User Scenarios & Testing

### User Story 1 - ML predictions with source breakdown for upcoming race (Priority: P1)

A fantasy cycling player opens the app before a Grand Tour. For each rider on the startlist, they see a predicted total score AND a breakdown by source (GC, stage, mountain, sprint). This helps them understand WHY a rider is valuable — not just how much they might score.

**Why this priority**: This is the core value proposition. Without this, the ML model has no user-facing output.

**Independent Test**: Given a race with a published startlist, the system produces per-rider predictions with 4-source breakdown. Predictions are consistent with benchmark metrics (GT ρ > 0.50).

**Acceptance Scenarios**:

1. **Given** a race startlist is available, **When** predictions are triggered, **Then** each rider gets a predicted_total and breakdown {gc, stage, mountain, sprint} in fantasy points
2. **Given** a Grand Tour with mountain-heavy profile, **When** predictions are generated, **Then** climbers/GC riders have higher mountain and GC breakdown values than sprinters
3. **Given** a race that has never been run before, **When** predictions are generated, **Then** mountain_pass and sprint_inter predictions are 0 (no supply history), but other sources still produce predictions

---

### User Story 2 - ML replaces rules-based scoring for stage races (Priority: P2)

The frontend currently shows a score breakdown from a rules-based model. For stage races (GTs and mini tours), the ML source-by-source breakdown replaces this. For classics, the rules-based model continues to be used.

**Why this priority**: Consistency — users should see one source of truth, not two competing scoring systems.

**Independent Test**: Navigate to a stage race rider detail and verify the breakdown comes from ML. Navigate to a classic and verify it still uses rules-based.

**Acceptance Scenarios**:

1. **Given** a stage race (GT or mini tour), **When** a user views rider scores, **Then** the breakdown shown is from the ML pipeline, not rules-based
2. **Given** a classic race, **When** a user views rider scores, **Then** the breakdown shown is from the rules-based model
3. **Given** the ML service is unavailable, **When** a user views a stage race, **Then** the system falls back gracefully (shows rules-based or indicates predictions unavailable)

---

### User Story 3 - Retraining after new race results (Priority: P2)

After a race is scraped, the model can be retrained to incorporate the latest results. The process is documented and reproducible.

**Why this priority**: The model must stay current with recent results to maintain prediction quality.

**Independent Test**: Follow the retraining runbook end-to-end and verify benchmark metrics remain within acceptable range.

**Acceptance Scenarios**:

1. **Given** new race results have been scraped, **When** the retraining process is executed, **Then** all caches are rebuilt and the model produces updated predictions
2. **Given** the retraining runbook, **When** followed step by step, **Then** the process completes without errors and benchmark metrics are within acceptable range (GT ρ > 0.50, team capture > 50%)

---

### User Story 4 - Model artifacts persist for serving (Priority: P3)

Trained models are saved as artifacts (joblib/pickle) so the prediction endpoint can load them without retraining on every request.

**Why this priority**: Without persistence, predictions require full training on each request, which is too slow.

**Independent Test**: Train models, save artifacts, restart the ML service, and verify predictions work from loaded artifacts.

**Acceptance Scenarios**:

1. **Given** models have been trained and saved, **When** the ML service restarts, **Then** it loads the saved models and can serve predictions immediately
2. **Given** a new model version is trained, **When** artifacts are saved, **Then** a version identifier is recorded so we know which model is currently serving

---

### Edge Cases

- What happens when a rider is on the startlist but has zero historical data? Prediction defaults to 0 for all sources.
- What happens when supply estimation returns 0 for a race? Mountain_pass and sprint_inter predictions are 0; other sources still work.
- What happens when the ML service is down? The API falls back to rules-based scoring or returns a clear "predictions unavailable" state.
- What happens when prices are not yet available for a race? Predictions are still generated (they don't depend on prices). Team selection is unavailable until prices arrive.

## Requirements

### Functional Requirements

- **FR-001**: ML service MUST produce predictions with a 4-source breakdown (gc, stage, mountain, sprint) for any stage race with a startlist
- **FR-002**: Each source in the breakdown MUST be in fantasy points (directly comparable to actual game scoring)
- **FR-003**: Stage predictions MUST be conditioned on the race route profile (number of flat/hilly/mountain/ITT stages)
- **FR-004**: Mountain_pass and sprint_inter supply MUST be estimated from the historical average of prior editions of the same race
- **FR-005**: The API MUST use ports & adapters pattern — ML adapter for stage races, rules-based adapter for classics
- **FR-006**: Trained model artifacts MUST be persisted to disk and loadable without retraining
- **FR-007**: The retraining process MUST be documented in a runbook with step-by-step commands
- **FR-008**: The model baseline document MUST be updated whenever the model architecture or metrics change
- **FR-009**: The frontend MUST display the ML breakdown for stage races and rules-based breakdown for classics
- **FR-010**: The system MUST handle graceful fallback when ML predictions are unavailable

### Key Entities

- **RiderPrediction**: predicted_total, gc_pts, stage_pts, mountain_pts, sprint_pts, rider_id, race_slug, year
- **ModelVersion**: version_id, trained_at, metrics (ρ_total, team_capture) — stored in metadata.json alongside model artifacts
- **SupplyEstimate**: estimated_mtn_supply, estimated_spr_supply — computed on-the-fly from historical race data, not persisted as a separate entity

## Success Criteria

### Measurable Outcomes

- **SC-001**: GT predictions maintain ρ_total > 0.50 (current baseline: 0.571)
- **SC-002**: GT team capture > 50% with correct fantasy prices (current baseline: 59.4%)
- **SC-003**: Predictions for a 176-rider GT startlist complete in under 30 seconds
- **SC-004**: Retraining process completes in under 15 minutes following the runbook
- **SC-005**: All stage race riders in the frontend show ML-based breakdown instead of rules-based

## Assumptions

- Fantasy scoring tables in `ml/src/points.py` are correct and up to date
- The ports & adapters pattern in the NestJS backend already supports swapping scoring adapters
- The Docker sidecar deployment model (ML service as internal container) is maintained
- Retraining frequency and deployment method (local train + upload vs VPS cron) will be decided during implementation based on deployment infrastructure
