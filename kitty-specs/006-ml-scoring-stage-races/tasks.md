# Work Packages: ML Scoring for Stage Races

**Inputs**: Design documents from `kitty-specs/006-ml-scoring-stage-races/`
**Prerequisites**: plan.md (required), spec.md (user stories), research.md, data-model.md, quickstart.md

**Tests**: Python tests included for ML pipeline (critical path). TypeScript test coverage for integration layer.

**Organization**: 45 fine-grained subtasks (`Txxx`) roll up into 7 work packages (`WPxx`). Each work package is independently deliverable and testable.

**Prompt Files**: Each work package references a matching prompt file in `tasks/`.

---

## Work Package WP01: Foundation — DB Schema, Python Scaffold, Docker (Priority: P0)

**Goal**: Establish the Python project structure, create the `ml_scores` database table via Drizzle, add Docker and Makefile infrastructure. No ML logic yet — pure scaffolding.
**Independent Test**: `make db-migrate` applies the new migration. `make ml-up` starts the ML service container (placeholder). Python venv installs cleanly.
**Prompt**: `tasks/WP01-foundation-db-python-docker.md`

**Requirements Refs**: FR-002, FR-005

### Included Subtasks

- [ ] T001 Create Python project structure (`ml/src/`, `ml/tests/`, `ml/models/.gitkeep`, `ml/requirements.txt`)
- [ ] T002 Create `ml_scores` Drizzle schema in `apps/api/src/infrastructure/database/schema/ml-scores.ts` + generate migration
- [ ] T003 Create `MlScore` entity in `apps/api/src/domain/ml-score/ml-score.entity.ts`
- [ ] T004 Create `MlScoreRepositoryPort` in `apps/api/src/domain/ml-score/ml-score.repository.port.ts`
- [ ] T005 Create `MlScoreRepositoryAdapter` in `apps/api/src/infrastructure/database/ml-score.repository.adapter.ts` + register in `DatabaseModule`
- [ ] T006 [P] Create `docker/Dockerfile.ml` + add `ml-service` to `docker-compose.yml`
- [ ] T007 [P] Add Makefile targets (`retrain`, `ml-up`, `ml-down`, `ml-logs`, `ml-restart`) + update `.gitignore` for `ml/models/`, `ml/venv/`

### Implementation Notes

- Drizzle schema follows existing patterns (see `schema/race-results.ts`, `schema/riders.ts`)
- Repository port follows existing pattern (see `race-result.repository.port.ts`)
- Dockerfile.ml is a placeholder FastAPI service (will be filled in WP03)
- requirements.txt: `scikit-learn`, `pandas`, `psycopg2-binary`, `joblib`, `fastapi`, `uvicorn`

### Parallel Opportunities

- T006 (Docker) and T007 (Makefile) can proceed in parallel with T002-T005 (schema/DDD)

### Dependencies

- None (starting package)

### Risks & Mitigations

- Drizzle migration generation may require running DB. Mitigation: ensure `make db-up` runs first.

---

## Work Package WP02: Python ML Core — Feature Extraction + Training (Priority: P1) 🎯 MVP

**Goal**: Refactor the 36-feature extraction from `research_v3.py` into production modules. Implement model training pipeline. `make retrain` trains RF models and saves them to disk.
**Independent Test**: `make retrain` completes successfully, producing `ml/models/model_mini_tour.joblib`, `model_grand_tour.joblib`, and `model_version.txt`.
**Prompt**: `tasks/WP02-python-ml-core.md`

**Requirements Refs**: FR-001, FR-002, FR-004, FR-011

### Included Subtasks

- [ ] T008 Create `ml/src/features.py` — refactor 36-feature extraction from `research_v3.py` into reusable module with `extract_race_features(results_df, startlists_df, race_slug, race_year, race_type, race_date)` function
- [ ] T009 Create `ml/src/train.py` — model training: load data → extract features for training set → train RF per race type → save models via joblib
- [ ] T010 Create `ml/src/retrain.py` — CLI entrypoint: parse args, connect to DB, call train.py, write `model_version.txt`
- [ ] T011 Create position-points helpers (shared `get_points()` function extracted from research)
- [ ] T012 Create data loading module — DB connection, SQL queries for results/startlists/riders (reusable by train and predict)
- [ ] T013 Verify end-to-end: `make retrain` against local DB with 210K results → models saved → version file written

### Implementation Notes

- `features.py` is the SINGLE SOURCE OF TRUTH for the 36-feature set. Both training and prediction use it.
- Feature columns must match `FEATURE_COLS` from research_v3.py exactly (36 features)
- RF hyperparameters from research: `n_estimators=500, max_depth=14, min_samples_leaf=5`
- Training uses ALL available data (no train/test split — that was research-only)
- Model version format: `YYYYMMDDTHHMMSS` (e.g., `20260320T030000`)

### Parallel Opportunities

- T011 (points helpers) and T012 (data loading) can proceed in parallel, both feed into T008

### Dependencies

- Depends on WP01 (Python project structure, requirements.txt)

### Risks & Mitigations

- Feature parity with research: validate feature column names and count match `FEATURE_COLS` exactly
- Training on all data (not 2023-2024 subset) may produce slightly different model weights vs research — expected and correct for production

---

## Work Package WP03: FastAPI ML Service — /predict and /health (Priority: P1) 🎯 MVP

**Goal**: Create the FastAPI microservice that loads trained models at startup and serves on-demand predictions. Predictions are cached in `ml_scores` table.
**Independent Test**: Start ML service via `make ml-up`, verify `GET /health` returns model info. Call `POST /predict` with a race_slug/year and verify predictions returned + cached in DB.
**Prompt**: `tasks/WP03-fastapi-ml-service.md`

**Requirements Refs**: FR-003, FR-004, FR-005, FR-012, FR-013

### Included Subtasks

- [ ] T014 Create `ml/src/predict.py` — prediction for a single race: load model, extract features for startlist riders, run `model.predict()`, return results
- [ ] T015 Create `ml/src/app.py` — FastAPI application with lifespan event for model loading at startup
- [ ] T016 Implement `GET /health` endpoint — return model status, version, loaded model types
- [ ] T017 Implement `POST /predict` endpoint — accept `{race_slug, year}`, check cache, extract features, predict, write cache to `ml_scores`, return predictions
- [ ] T018 Implement model version detection — check `model_version.txt` on each request, reload models if version changed (hot-reload after retrain)
- [ ] T019 Verify end-to-end: `make ml-up` → `curl /health` → `curl POST /predict` → check `ml_scores` table has cached entries

### Implementation Notes

- Model loaded ONCE at startup into global state (FastAPI lifespan context)
- `/predict` response shape: `{ predictions: [{ rider_id, predicted_score }], model_version }`
- `/health` response shape: `{ status: "healthy"|"no_model", model_version, models_loaded: ["mini_tour","grand_tour"] }`
- Cache write: INSERT INTO ml_scores for each rider prediction with current model_version
- Cache check: before predicting, check if ml_scores has entries for (race_slug, year, current model_version) — if yes, return cached
- Hot-reload: store model_version in memory, on each /predict check if file changed → reload

### Parallel Opportunities

- T016 (health) and T017 (predict) can proceed in parallel once T015 (app skeleton) is done

### Dependencies

- Depends on WP02 (trained models must exist for service to load them)

### Risks & Mitigations

- Model file not found at startup: service starts in "no_model" state, /predict returns 503
- DB connection failure in /predict: return 500 with clear error, don't crash service

---

## Work Package WP04: TypeScript API — Hybrid Scoring Integration (Priority: P1) 🎯 MVP

**Goal**: Modify the TypeScript API to call the ML service for stage races, read cached predictions, and return hybrid scores (rules + ML) in the analysis response. Graceful fallback when ML is unavailable.
**Independent Test**: Analyze a stage race via the API → response includes `scoringMethod: "hybrid"` and `mlPredictedScore`. Analyze a classic → `scoringMethod: "rules"`. Stop ML service → stage race falls back to rules-only.
**Prompt**: `tasks/WP04-typescript-hybrid-scoring.md`

**Requirements Refs**: FR-003, FR-005, FR-006, FR-007, FR-008, FR-013

### Included Subtasks

- [ ] T020 Create `MlScoringPort` in `apps/api/src/domain/scoring/ml-scoring.port.ts` — abstract interface: `predictRace(raceSlug, year): Promise<MlPrediction[] | null>`
- [ ] T021 Create `MlScoringAdapter` in `apps/api/src/infrastructure/ml/ml-scoring.adapter.ts` — HTTP client to ML service with timeout (5s), error handling, retry logic
- [ ] T022 Extend `AnalyzedRider` in `packages/shared-types/src/scoring.ts` — add `scoringMethod: "rules" | "hybrid"` and `mlPredictedScore: number | null`
- [ ] T023 Modify `AnalyzePriceListUseCase` — for stage races: check ml_scores cache → cache miss calls MlScoringPort → enrich response with ML score → set scoringMethod
- [ ] T024 Register `MlScoringPort` + `MlScoringAdapter` in DI (add to appropriate module, inject in use case)
- [ ] T025 Implement graceful degradation — ML service unavailable → log warning, return rules-based only, no user-facing error
- [ ] T026 Verify end-to-end: start ML service + API → analyze stage race → hybrid response → stop ML service → rules fallback

### Implementation Notes

- MlScoringAdapter uses native `fetch` or `got` HTTP client (check existing patterns in pcs-client.adapter.ts)
- ML_SERVICE_URL from environment variable (default: `http://localhost:8000`)
- Cache flow in use case: read ml_scores for (race_slug, year) → if cached with current model_version → use → else call ML service
- Model version: use case can call /health once on startup or first request to get current version
- Timeout: 5s for /predict call. If timeout → fallback to rules.

### Parallel Opportunities

- T020 (port), T021 (adapter), T022 (shared-types) can proceed in parallel
- T023 (use case modification) depends on all three

### Dependencies

- Depends on WP01 (MlScoreRepositoryPort for cache reads) and WP03 (ML service running)

### Risks & Mitigations

- Breaking existing scoring: rules-based scoring must remain unchanged for all race types. Only ADD mlPredictedScore, never modify totalProjectedPts.
- Race condition: concurrent requests for same uncached race → both call ML service → duplicate cache entries → UNIQUE constraint handles this (ON CONFLICT DO NOTHING)

---

## Work Package WP05: Optimizer ML Integration (Priority: P2)

**Goal**: Modify the team optimizer to use ML predicted score for stage races. Rules-based for classics. Fallback when ML unavailable.
**Independent Test**: Optimize team for a stage race with ML predictions → optimizer uses mlPredictedScore. Optimize classic → uses totalProjectedPts. Remove ML predictions → falls back to rules.
**Prompt**: `tasks/WP05-optimizer-ml-integration.md`

**Requirements Refs**: FR-009

### Included Subtasks

- [ ] T027 Modify `ScoredRider` type or optimize-team input to accept optional `mlPredictedScore`
- [ ] T028 Modify `AnalyzePriceListUseCase` or optimizer orchestration to pass ML score as primary ranking for stage races
- [ ] T029 Ensure optimizer fallback: if `mlPredictedScore` is null → use `totalProjectedPts`
- [ ] T030 Verify optimizer produces different team selections for stage races with ML vs rules-only

### Implementation Notes

- The knapsack optimizer already takes `ScoredRider[]` with `totalProjectedPts` — simplest approach: for stage races with ML, set the effective score to mlPredictedScore before passing to optimizer
- Alternative: add a new field to ScoredRider and let optimizer pick which to use
- Critical: do NOT change optimizer algorithm itself — only change the input score

### Parallel Opportunities

- None within this WP (sequential modifications)

### Dependencies

- Depends on WP04 (hybrid scoring must be working)

### Risks & Mitigations

- ML score scale mismatch with price: mlPredictedScore may have different scale than totalProjectedPts — verify composite score calculation still works

---

## Work Package WP06: Benchmark Suite 3-Column Comparison (Priority: P2)

**Goal**: Update `make benchmark-suite` to display three Spearman rho columns (rules, ML, hybrid) per race. Aggregate mean rho per method at bottom.
**Independent Test**: `make benchmark-suite` shows 3-column table. Stage race rows show distinct ML/hybrid values. Classic rows show "n/a" for ML.
**Prompt**: `tasks/WP06-benchmark-three-column.md`

**Requirements Refs**: FR-010

### Included Subtasks

- [ ] T031 Extend `BenchmarkResult` in `apps/api/src/domain/benchmark/benchmark-result.ts` — add `mlSpearmanRho`, `hybridSpearmanRho`, rename `spearmanRho` → `rulesSpearmanRho`
- [ ] T032 Modify `RunBenchmarkUseCase` — compute ML rho by calling ML service for predicted scores (alongside existing rules-based rho)
- [ ] T033 Compute hybrid rho — for stage races use ML predicted, for classics use rules predicted, compare both against actual
- [ ] T034 Modify `RunBenchmarkSuiteUseCase` — aggregate 3 mean rhos (rules, ML, hybrid) across all races
- [ ] T035 Update `BenchmarkCommand` CLI display — 3-column table with alignment, "n/a" for classics ML column
- [ ] T036 Verify benchmark output: stage race ML rho ~0.52-0.59 (matching research), hybrid improves over rules

### Implementation Notes

- ML rho computation: for each race, get ML predictions (from cache or service), rank riders by ML predicted score, compare against actual ranking
- Hybrid rho: use ML rank for stage races, rules rank for classics — this matches production behavior
- Display format: `race_name | type | rho(rules) | rho(ML) | rho(hybrid)`
- Rename existing `spearmanRho` field to `rulesSpearmanRho` — grep codebase for all usages

### Parallel Opportunities

- T031 (entity change) can proceed independently from T035 (CLI display)

### Dependencies

- Depends on WP04 (ML service integration for generating predictions)

### Risks & Mitigations

- Renaming `spearmanRho` is a breaking change within the codebase — find all references and update them

---

## Work Package WP07: ADR, Documentation, Polish (Priority: P3)

**Goal**: Create required ADR, finalize documentation, add Python tests for critical path, verify full end-to-end flow.
**Independent Test**: ADR exists. Python tests pass. Full workflow (retrain → ml-up → analyze → benchmark-suite) works end-to-end.
**Prompt**: `tasks/WP07-adr-docs-polish.md`

**Requirements Refs**: FR-001, FR-011

### Included Subtasks

- [ ] T037 Create ADR `docs/adr/2026-03-20-ml-scoring-python-addition.md` documenting Python addition rationale, hybrid scoring architecture, and microservice decision
- [ ] T038 Create `ml/tests/test_features.py` — unit tests for 36-feature extraction (verify feature count, column names, edge cases like zero-history riders)
- [ ] T039 Create `ml/tests/test_app.py` — FastAPI endpoint tests (health, predict with mock model)
- [ ] T040 Full end-to-end validation: `make retrain` → `make ml-up` → analyze stage race via API → `make benchmark-suite` → verify 3-column output
- [ ] T041 Update `ml/models/.gitignore` to ignore `*.joblib` and `model_version.txt` but keep `.gitkeep`
- [ ] T042 [P] Create TypeScript unit tests for `MlScoringAdapter` — mock fetch, verify timeout/error handling returns null
- [ ] T043 [P] Create TypeScript unit tests for `AnalyzePriceListUseCase` ML integration — mock ML port, verify hybrid enrichment + fallback
- [ ] T044 [P] Update README with ML setup instructions (Python prereqs, make targets, ML_SERVICE_URL env var)
- [ ] T045 [P] Create `ml/tests/test_predict.py` — unit tests for single-race prediction logic

### Implementation Notes

- ADR follows existing format (see `docs/adr/2026-03-15-scoring-engine-as-pure-domain-logic.md`)
- Python tests use pytest. Feature test should verify: correct number of features (36), known feature names match FEATURE_COLS, zero-history rider produces valid (all-zero) feature vector
- FastAPI tests use `TestClient` from `starlette.testclient`

### Parallel Opportunities

- T037 (ADR), T038-T039 (Python tests), T042-T043 (TS tests), T044 (README), T045 (predict tests) can all proceed in parallel

### Dependencies

- Depends on WP06 (all functionality must be in place for end-to-end validation)

### Risks & Mitigations

- E2E validation may surface integration issues — budget time for debugging

---

## Dependency & Execution Summary

```
WP01 (Foundation)
  └─→ WP02 (ML Core: features + training)
        └─→ WP03 (FastAPI service)
              └─→ WP04 (TypeScript hybrid scoring) ← MVP complete here
                    ├─→ WP05 (Optimizer integration)
                    └─→ WP06 (Benchmark 3-column)
                          └─→ WP07 (ADR + Polish)
```

- **Sequence**: WP01 → WP02 → WP03 → WP04 → WP05 ∥ WP06 → WP07
- **Parallelization**: WP05 and WP06 can proceed in parallel after WP04 completes
- **MVP Scope**: WP01 through WP04 deliver the core value — hybrid scoring for stage races with graceful fallback

---

## Subtask Index (Reference)

| Subtask | Summary                                    | WP   | Priority | Parallel? |
| ------- | ------------------------------------------ | ---- | -------- | --------- |
| T001    | Python project structure                   | WP01 | P0       | No        |
| T002    | ml_scores Drizzle schema + migration       | WP01 | P0       | No        |
| T003    | MlScore entity                             | WP01 | P0       | No        |
| T004    | MlScoreRepositoryPort                      | WP01 | P0       | No        |
| T005    | MlScoreRepositoryAdapter + DI registration | WP01 | P0       | No        |
| T006    | Dockerfile.ml + docker-compose             | WP01 | P0       | Yes       |
| T007    | Makefile targets + .gitignore              | WP01 | P0       | Yes       |
| T008    | features.py — 36-feature extraction        | WP02 | P1       | No        |
| T009    | train.py — RF model training               | WP02 | P1       | No        |
| T010    | retrain.py — CLI entrypoint                | WP02 | P1       | No        |
| T011    | Position-points helpers                    | WP02 | P1       | Yes       |
| T012    | Data loading module                        | WP02 | P1       | Yes       |
| T013    | Verify make retrain end-to-end             | WP02 | P1       | No        |
| T014    | predict.py — single-race prediction logic  | WP03 | P1       | No        |
| T015    | app.py — FastAPI application skeleton      | WP03 | P1       | No        |
| T016    | GET /health endpoint                       | WP03 | P1       | Yes       |
| T017    | POST /predict endpoint + cache write       | WP03 | P1       | Yes       |
| T018    | Model version hot-reload                   | WP03 | P1       | No        |
| T019    | Verify ML service end-to-end               | WP03 | P1       | No        |
| T020    | MlScoringPort (domain)                     | WP04 | P1       | Yes       |
| T021    | MlScoringAdapter (HTTP client)             | WP04 | P1       | Yes       |
| T022    | Extend AnalyzedRider shared-types          | WP04 | P1       | Yes       |
| T023    | Modify AnalyzePriceListUseCase             | WP04 | P1       | No        |
| T024    | DI registration for ML ports               | WP04 | P1       | No        |
| T025    | Graceful degradation                       | WP04 | P1       | No        |
| T026    | Verify hybrid scoring end-to-end           | WP04 | P1       | No        |
| T027    | Modify ScoredRider for ML score            | WP05 | P2       | No        |
| T028    | Optimizer uses ML score for stage races    | WP05 | P2       | No        |
| T029    | Optimizer fallback logic                   | WP05 | P2       | No        |
| T030    | Verify optimizer with ML scores            | WP05 | P2       | No        |
| T031    | Extend BenchmarkResult entity              | WP06 | P2       | Yes       |
| T032    | RunBenchmarkUseCase ML rho                 | WP06 | P2       | No        |
| T033    | Compute hybrid rho                         | WP06 | P2       | No        |
| T034    | RunBenchmarkSuiteUseCase 3 aggregates      | WP06 | P2       | No        |
| T035    | BenchmarkCommand 3-column display          | WP06 | P2       | Yes       |
| T036    | Verify benchmark matches research rhos     | WP06 | P2       | No        |
| T037    | Create ADR                                 | WP07 | P3       | Yes       |
| T038    | Python test_features.py                    | WP07 | P3       | Yes       |
| T039    | Python test_app.py                         | WP07 | P3       | Yes       |
| T040    | Full end-to-end validation                 | WP07 | P3       | No        |
| T041    | .gitignore for ml/models/                  | WP07 | P3       | Yes       |
| T042    | TS tests: MlScoringAdapter                 | WP07 | P3       | Yes       |
| T043    | TS tests: AnalyzePriceList ML integration  | WP07 | P3       | Yes       |
| T044    | Update README with ML setup                | WP07 | P3       | Yes       |
| T045    | Python test_predict.py                     | WP07 | P3       | Yes       |
