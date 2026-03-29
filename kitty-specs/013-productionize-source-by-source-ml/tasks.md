# Work Packages: Productionize Source-by-Source ML Pipeline

**Inputs**: Design documents from `/kitty-specs/013-productionize-source-by-source-ml/`
**Prerequisites**: plan.md (required), spec.md (user stories)

**Tests**: Include pytest for ML scoring logic (constitution: 100% coverage for scoring).

**Organization**: Fine-grained subtasks (`Txxx`) roll up into work packages (`WPxx`). Each work package must be independently deliverable and testable.

**Prompt Files**: Each work package references a matching prompt file in `/tasks/`.

---

## Work Package WP01: ML Training Pipeline (Priority: P0)

**Goal**: Train all source-by-source sub-models and save as joblib/JSON artifacts.
**Independent Test**: Running `python -m src.train_sources` produces all 9 model files + metadata.json in `ml/models/`.
**Prompt**: `/tasks/WP01-ml-training-pipeline.md`
**Estimated size**: ~400 lines

**Requirements Refs**: FR-006, FR-008

### Included Subtasks

- [ ] T001 Create `ml/src/train_sources.py` — train all sub-models from cached features
- [ ] T002 Generate `ml/models/metadata.json` — feature lists, thresholds, heuristic weights
- [ ] T003 Update `ml/src/retrain.py` — orchestrate full pipeline including stage caches
- [ ] T004 [P] Update `ml/docs/retraining-runbook.md` — add train_sources step
- [ ] T005 Verify: training produces correct artifacts and model_version.txt

### Implementation Notes

- Train logic extracted from benchmark_integrated.py into production-ready train_sources.py
- 7 trained models (joblib): gc_gate, stage_flat, stage_hilly, stage_mountain, stage_itt_gate, stage_itt_magnitude, mtn_final_gate, mtn_pass_capture, spr_inter_capture
- 2 heuristic configs stored in metadata.json: GC position weights, sprint_final contender weights
- retrain.py becomes: load data → glicko → cache → stage targets → stage features → cls features → train_sources → write version

### Parallel Opportunities

- T004 (docs) can proceed in parallel with T001-T003

### Dependencies

- None (starting package)

### Risks & Mitigations

- Training data must include all years with startlist data (2022+). Verify cache completeness before training.
- joblib file size — Ridge/LogReg models are small (<1MB each), no concern.

---

## Work Package WP02: Source-by-Source Prediction Logic (Priority: P0)

**Goal**: Replace the monolithic RF prediction with source-by-source predictions returning a 4-source breakdown.
**Independent Test**: POST to `/predict` returns `predicted_score` + `breakdown: {gc, stage, mountain, sprint}` for a known GT race.
**Prompt**: `/tasks/WP02-prediction-logic.md`
**Estimated size**: ~500 lines

**Requirements Refs**: FR-001, FR-002, FR-003, FR-004

### Included Subtasks

- [ ] T006 Create `ml/src/predict_sources.py` — orchestrate all sub-model predictions
- [ ] T007 Integrate supply estimation — historical average for mtn_pass/spr_inter
- [ ] T008 Update `ml/src/app.py` — extend /predict response with breakdown
- [ ] T009 Update model loading — load sub-model artifacts + metadata.json at startup
- [ ] T010 Update cache in app.py — persist and retrieve breakdown columns from ml_scores

### Implementation Notes

- predict_sources.py is the core orchestrator: loads artifacts → runs each sub-model → returns per-rider breakdown
- GC: load gc_gate → gate predict → rank contenders by heuristic score → assign GC pts + daily
- Stage: load 4 type models + ITT gate → predict per type → multiply by n_stages_race
- Mountain: load gate + capture model → gate × avg_pts + capture × estimated_supply
- Sprint: apply heuristic contender score → soft rank → capture × estimated_supply
- Supply estimation via supply_estimation.py (already committed)
- Cache: ml_scores table needs 4 extra columns (handled in WP03 migration, but write_cache updated here)

### Parallel Opportunities

- T007 (supply) and T009 (model loading) can proceed in parallel

### Dependencies

- Depends on WP01 (needs model artifacts to load)

### Risks & Mitigations

- Hot-reload must work with new multi-artifact structure: version check triggers reload of ALL models + metadata
- Lazy data loading must also load stage features and classification history (extend data_cache)
- Backward compatibility: old cached predictions (single score) should not break — check_cache returns null for old format

---

## Work Package WP03: Database & NestJS Integration (Priority: P1)

**Goal**: Extend database schema for breakdown storage and update NestJS adapter to consume the new response format.
**Independent Test**: NestJS API receives breakdown from ML service and stores it in database with 4 breakdown columns.
**Prompt**: `/tasks/WP03-db-nestjs-integration.md`
**Estimated size**: ~350 lines

**Requirements Refs**: FR-005, FR-009, FR-010

### Included Subtasks

- [ ] T011 Database migration — add gc_pts, stage_pts, mountain_pts, sprint_pts to ml_scores
- [ ] T012 Update Drizzle ORM schema — add breakdown columns
- [ ] T013 Update `MlPrediction` interface in `ml-scoring.port.ts` — add breakdown type
- [ ] T014 Update `MlScoringAdapter` — parse breakdown from ML service response
- [ ] T015 Update downstream consumers — propagate breakdown through analyze use cases

### Implementation Notes

- Migration: ALTER TABLE ml_scores ADD COLUMN gc_pts REAL DEFAULT 0, stage_pts, mountain_pts, sprint_pts
- MlPrediction gets readonly breakdown: { gc: number, stage: number, mountain: number, sprint: number }
- Adapter maps snake_case (Python) → camelCase (TypeScript)
- Fallback: if breakdown is missing in response (old model), default all to 0

### Parallel Opportunities

- T011-T012 (DB) and T013-T014 (TypeScript) can proceed in parallel

### Dependencies

- Depends on WP02 (needs to know the exact response format)

### Risks & Mitigations

- Migration on production DB: use ALTER TABLE with defaults (non-breaking, no downtime)
- Unique constraint on ml_scores may need updating if column set changes — verify

---

## Work Package WP04: Frontend Breakdown Display (Priority: P2)

**Goal**: Display ML-based per-source breakdown in the frontend for stage races. Rules-based for classics.
**Independent Test**: Viewing a GT rider shows breakdown from ML (gc/stage/mountain/sprint). Viewing a classic shows rules-based breakdown.
**Prompt**: `/tasks/WP04-frontend-breakdown.md`
**Estimated size**: ~300 lines

**Requirements Refs**: FR-009

### Included Subtasks

- [ ] T016 Update shared types — add MlBreakdown to shared-types package
- [ ] T017 Update rider score display component — render per-source ML breakdown
- [ ] T018 Conditional routing — ML breakdown for stage races, rules-based for classics
- [ ] T019 Verify visual consistency — breakdown renders for all race types

### Implementation Notes

- Shared types in packages/shared-types/src/api.ts
- Frontend consumes the breakdown from the API response
- For classics (race_type === 'classic'), keep existing rules-based display
- For stage races, show: GC | Stage | Mountain | Sprint with values

### Parallel Opportunities

- T016 (types) and T017-T018 (components) are sequential but T019 (verify) can happen alongside

### Dependencies

- Depends on WP03 (needs API to serve breakdown data)

### Risks & Mitigations

- Frontend rendering of 0-value sources: show "0" or hide? Decision: show all 4 always for consistency

---

## Work Package WP05: ADR & End-to-End Verification (Priority: P3)

**Goal**: Document the architecture decision and verify the full pipeline works end-to-end.
**Independent Test**: ADR committed, retrain → predict → API → frontend flow verified manually.
**Prompt**: `/tasks/WP05-adr-verification.md`
**Estimated size**: ~250 lines

**Requirements Refs**: FR-007, FR-008

### Included Subtasks

- [ ] T020 Write ADR for model architecture switch (RF monolithic → source-by-source)
- [ ] T021 [P] Update model-baseline.md with production artifact paths
- [ ] T022 End-to-end verification — retrain → predict → API → frontend

### Implementation Notes

- ADR format: YYYY-MM-DD-title.md in docs/adr/ (per constitution)
- ADR content: decision, context (feature 012 research), consequences, alternatives rejected
- E2E verification: run make retrain, then POST /predict, verify breakdown in response

### Parallel Opportunities

- T020 (ADR) and T021 (baseline update) can proceed in parallel

### Dependencies

- Depends on WP04 (full pipeline must be in place for E2E verification)

### Risks & Mitigations

- None significant — documentation work

---

## Dependency & Execution Summary

- **Sequence**: WP01 → WP02 → WP03 → WP04 → WP05
- **Parallelization**: Within each WP, marked [P] subtasks can proceed concurrently
- **MVP Scope**: WP01 + WP02 = ML service produces predictions with breakdown (no frontend yet, but API works)
- **Full delivery**: WP01 → WP05 (all 5 packages)

---

## Subtask Index (Reference)

| Subtask ID | Summary                       | Work Package | Priority | Parallel? |
| ---------- | ----------------------------- | ------------ | -------- | --------- |
| T001       | Create train_sources.py       | WP01         | P0       | No        |
| T002       | Generate metadata.json        | WP01         | P0       | No        |
| T003       | Update retrain.py             | WP01         | P0       | No        |
| T004       | Update retraining-runbook.md  | WP01         | P0       | Yes       |
| T005       | Verify training artifacts     | WP01         | P0       | No        |
| T006       | Create predict_sources.py     | WP02         | P0       | No        |
| T007       | Integrate supply estimation   | WP02         | P0       | Yes       |
| T008       | Update app.py response        | WP02         | P0       | No        |
| T009       | Update model loading          | WP02         | P0       | Yes       |
| T010       | Update cache read/write       | WP02         | P0       | No        |
| T011       | DB migration (breakdown cols) | WP03         | P1       | Yes       |
| T012       | Update Drizzle schema         | WP03         | P1       | Yes       |
| T013       | Update MlPrediction interface | WP03         | P1       | Yes       |
| T014       | Update MlScoringAdapter       | WP03         | P1       | Yes       |
| T015       | Update downstream consumers   | WP03         | P1       | No        |
| T016       | Update shared types           | WP04         | P2       | No        |
| T017       | Update rider score component  | WP04         | P2       | No        |
| T018       | Conditional ML/rules routing  | WP04         | P2       | No        |
| T019       | Verify visual consistency     | WP04         | P2       | No        |
| T020       | Write ADR                     | WP05         | P3       | Yes       |
| T021       | Update model-baseline.md      | WP05         | P3       | Yes       |
| T022       | E2E verification              | WP05         | P3       | No        |
