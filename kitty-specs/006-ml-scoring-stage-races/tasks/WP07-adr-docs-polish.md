---
work_package_id: WP07
title: ADR, Documentation, Polish
lane: planned
dependencies: [WP06]
subtasks:
  - T037
  - T038
  - T039
  - T040
  - T041
  - T042
  - T043
  - T044
  - T045
phase: Phase 5 - Polish
assignee: ''
agent: ''
shell_pid: ''
review_status: ''
reviewed_by: ''
history:
  - timestamp: '2026-03-20T16:27:36Z'
    lane: planned
    agent: system
    shell_pid: ''
    action: Prompt generated via /spec-kitty.tasks
requirement_refs:
  - FR-001
  - FR-011
---

# Work Package Prompt: WP07 – ADR, Documentation, Polish

## ⚠️ IMPORTANT: Review Feedback Status

- **Has review feedback?**: Check `review_status` field above.

---

## Review Feedback

_[Empty initially.]_

---

## Implementation Command

```bash
spec-kitty implement WP07 --base WP06
```

---

## Objectives & Success Criteria

- ADR documenting Python addition and hybrid scoring architecture exists
- Python tests pass for feature extraction, prediction logic, and FastAPI endpoints
- TypeScript tests pass for ML integration layer (adapter, use case fallback)
- Full end-to-end workflow validates successfully
- README updated with ML setup instructions
- `.gitignore` properly excludes model files

## Context & Constraints

- **ADR format**: Follow existing ADRs in `docs/adr/` (e.g., `2026-03-15-scoring-engine-as-pure-domain-logic.md`)
- **Constitution rule**: "Scoring model changes: Any change to the scoring algorithm requires a 100% test coverage check and an ADR"
- **Python testing**: Use pytest. FastAPI tests use `starlette.testclient.TestClient`.

## Subtasks & Detailed Guidance

### Subtask T037 – Create ADR for ML scoring

- **Purpose**: Document the Python addition, hybrid scoring architecture, and microservice decision. Required by constitution.
- **Steps**:
  1. Create `docs/adr/2026-03-20-ml-scoring-python-addition.md`
  2. Follow existing ADR format:

     ```markdown
     # ML Scoring with Python Microservice

     **Date**: 2026-03-20
     **Status**: Accepted

     ## Context

     Feature 005 research proved ML (Random Forest) significantly improves scoring for stage races (ρ=0.52-0.59 vs baseline ρ=0.39). The constitution allows Python addition "if ML complexity warrants it."

     ## Decision

     - Add Python FastAPI microservice for ML scoring (internal, not public)
     - Hybrid scoring: ML for stage races, rules-based for classics
     - Pre-trained models loaded at service startup
     - Predictions cached in ml_scores DB table
     - Weekly retraining via make retrain (CLI)

     ## Rationale

     - Python required for scikit-learn ML pipeline (36-feature extraction validated in research)
     - Microservice avoids 2-3s subprocess cold start (model loaded once at startup)
     - Internal service (Docker network) — not a public API endpoint
     - Rules-based scoring unchanged for classics (ML showed no improvement)

     ## Consequences

     - New Python dependency in the project
     - Additional Docker service to manage
     - Weekly retraining operational requirement
     - Graceful degradation: API falls back to rules-based if ML service is down
     ```

  3. Reference Feature 005 research results and this feature's plan.md

- **Files**: `docs/adr/2026-03-20-ml-scoring-python-addition.md` (new)
- **Parallel?**: Yes

### Subtask T038 – Python tests for feature extraction

- **Purpose**: Verify the 36-feature extraction module works correctly.
- **Steps**:
  1. Create `ml/tests/test_features.py`
  2. Test cases:
     - `test_feature_cols_count`: assert `len(FEATURE_COLS) == 36`
     - `test_feature_cols_names`: assert all expected names present
     - `test_zero_history_rider`: rider with no historical results → all-zero feature vector (except defaults like age=28, team_rank=4)
     - `test_feature_extraction_basic`: mock results/startlists DataFrames, extract features, verify shape
     - `test_get_points`: verify position→points mapping for each category
  3. Use pytest with small mock DataFrames (don't need real DB for unit tests)
- **Files**: `ml/tests/test_features.py` (new, ~100 lines)
- **Parallel?**: Yes

### Subtask T039 – Python tests for FastAPI endpoints

- **Purpose**: Verify /health and /predict endpoints behave correctly.
- **Steps**:
  1. Create `ml/tests/test_app.py`
  2. Test cases:
     - `test_health_no_model`: startup without models → status "no_model"
     - `test_health_with_model`: mock models loaded → status "healthy", version, models_loaded
     - `test_predict_no_model`: POST /predict without models → 503
     - `test_predict_invalid_race`: POST /predict with nonexistent race → 404
  3. Use `TestClient` from `starlette.testclient`
  4. Mock model loading and DB connections for unit tests
- **Files**: `ml/tests/test_app.py` (new, ~80 lines)
- **Parallel?**: Yes

### Subtask T040 – Full end-to-end validation

- **Purpose**: Validate the complete workflow works together.
- **Steps**:
  1. Start from clean state: `make db-up && make db-migrate`
  2. Ensure data is seeded: `make seed` (if not already)
  3. Train model: `make retrain` → verify model files created
  4. Start ML service: `make ml-up` → verify `curl localhost:8000/health` shows "healthy"
  5. Start API: `make dev` → verify API starts without errors
  6. Analyze a stage race via API → verify hybrid response
  7. Run benchmark: `make benchmark-suite` → verify 3-column output
  8. Verify ML rho values are in expected range
  9. Stop ML service: `make ml-down` → analyze stage race → verify fallback
  10. Restart ML service: `make ml-up` → analyze same race → verify cache hit
- **Files**: No new files

### Subtask T041 – .gitignore for ml/models/

- **Purpose**: Ensure model files are not committed to git.
- **Steps**:
  1. Create or update `ml/models/.gitignore`:
     ```
     *.joblib
     model_version.txt
     !.gitkeep
     ```
  2. Verify: `git status` should not show model files after training
- **Files**: `ml/models/.gitignore`
- **Parallel?**: Yes

### Subtask T042 – TypeScript unit tests for MlScoringAdapter

- **Purpose**: Verify the HTTP client adapter handles ML service responses and failures correctly. Required by constitution (90% backend test coverage).
- **Steps**:
  1. Create `apps/api/src/infrastructure/ml/__tests__/ml-scoring.adapter.spec.ts`
  2. Test cases (mock `fetch`):
     - `predictRace` returns predictions on 200 response
     - `predictRace` returns null on timeout
     - `predictRace` returns null on connection refused
     - `predictRace` returns null on 503 (no model)
     - `getModelVersion` returns version string on healthy response
     - `getModelVersion` returns null on failure
     - `isHealthy` returns true/false based on response status
  3. Use Jest with mocked `fetch` (no real HTTP calls)
- **Files**: `apps/api/src/infrastructure/ml/__tests__/ml-scoring.adapter.spec.ts` (new, ~100 lines)
- **Parallel?**: Yes

### Subtask T043 – TypeScript unit tests for hybrid scoring integration

- **Purpose**: Verify the AnalyzePriceListUseCase correctly enriches responses with ML scores and falls back to rules-based. Required by constitution (scoring logic changes need test coverage).
- **Steps**:
  1. Create or extend test file for analyze-price-list use case
  2. Test cases (mock MlScoringPort and MlScoreRepositoryPort):
     - Stage race with ML available → response has `scoringMethod: "hybrid"` and `mlPredictedScore` values
     - Classic race → response has `scoringMethod: "rules"` and `mlPredictedScore: null`
     - Stage race with ML service down → falls back to `scoringMethod: "rules"`
     - Stage race with cache hit → MlScoringPort.predictRace NOT called
     - Stage race with cache miss → MlScoringPort.predictRace called
     - Existing rules-based scores unchanged in all scenarios (totalProjectedPts, categoryScores identical)
  3. Mock the ML port to return controlled predictions. Verify enrichment logic.
- **Files**: `apps/api/src/application/analyze/__tests__/analyze-price-list.use-case.spec.ts` (new or extend)
- **Parallel?**: Yes

### Subtask T044 – Update README with ML setup instructions

- **Purpose**: Constitution requires README update for features that change setup or user-facing behavior. This feature adds Python, Docker ml-service, and new Makefile targets.
- **Steps**:
  1. Add "ML Scoring" section to README covering:
     - Python 3.12+ prerequisite
     - `make retrain` — train ML models
     - `make ml-up` / `make ml-down` — manage ML service
     - `ML_SERVICE_URL` environment variable
     - Weekly retraining recommendation
  2. Add to existing "Getting Started" / setup section:
     - `cd ml && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt`
  3. Note that ML scoring is optional — API works without it (falls back to rules-based)
- **Files**: `README.md` (modify)
- **Parallel?**: Yes

### Subtask T045 – Python tests for prediction logic

- **Purpose**: Verify the single-race prediction module (predict.py) works correctly. This was listed in plan.md but missing from tasks.
- **Steps**:
  1. Create `ml/tests/test_predict.py`
  2. Test cases:
     - `test_predict_race_mini_tour`: mock model + data → returns predictions list with correct shape
     - `test_predict_race_classic_rejected`: classic race_type → returns empty (not supported)
     - `test_load_models`: mock joblib files → models loaded into dict
     - `test_load_models_missing_file`: missing model file → partial dict or empty
     - `test_get_model_version`: read from file, handle missing file
  3. Use pytest with mock DataFrames and mock models (sklearn `RandomForestRegressor` with fit on tiny data)
- **Files**: `ml/tests/test_predict.py` (new, ~80 lines)
- **Parallel?**: Yes

## Risks & Mitigations

- **E2E failures**: Integration issues may surface during T040. Budget time for debugging.
- **Test environment**: Python tests need a venv with dependencies installed. TypeScript tests need `make build` first.

## Review Guidance

- Verify ADR follows existing format and references constitution compliance
- Verify Python tests run with `cd ml && python -m pytest tests/`
- Verify full E2E workflow completes without manual intervention

## Activity Log

- 2026-03-20T16:27:36Z – system – lane=planned – Prompt created.
