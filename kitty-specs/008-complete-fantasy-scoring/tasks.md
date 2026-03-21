# Work Packages: Complete Fantasy Game Scoring Pipeline

**Inputs**: Design documents from `kitty-specs/008-complete-fantasy-scoring/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md

**Tests**: Include tests for parsers and scoring tables (critical path per constitution).

---

## Work Package WP01: DB Schema Migration (Priority: P0)

**Goal**: Extend `race_results` table with new category values and nullable metadata columns for mountain passes and sprints.
**Independent Test**: Migration applies cleanly; new columns exist in DB; existing data unaffected.
**Prompt**: `tasks/WP01-db-schema-migration.md`
**Estimated size**: ~250 lines

**Requirements Refs**: FR-004, FR-005, FR-006, FR-007

### Included Subtasks

- [x] T001 Add new columns to race_results Drizzle schema (`climb_category`, `climb_name`, `sprint_name`, `km_marker`)
- [x] T002 Add new category enum values (`gc_daily`, `mountain_pass`, `sprint_intermediate`, `regularidad_daily`)
- [x] T003 Generate and apply Drizzle migration

### Implementation Notes

- Columns are nullable (existing rows unaffected)
- No data migration needed — new rows will use new columns

### Parallel Opportunities

- None — foundation WP, must complete first.

### Dependencies

- None (starting package).

### Risks & Mitigations

- Migration must be backward-compatible (all new columns nullable). Verify with `db-push` before generating migration file.

---

## Work Package WP02: Stage Classification Parsers (Priority: P1) 🎯 MVP

**Goal**: Parse hidden `div.resTab` tabs from PCS stage pages to extract daily GC, mountain passes, intermediate sprints, and daily regularidad.
**Independent Test**: Feed a saved PCS HTML fixture through parsers; verify correct rider/position/category extraction.
**Prompt**: `tasks/WP02-stage-classification-parsers.md`
**Estimated size**: ~500 lines

**Requirements Refs**: FR-001, FR-002, FR-003

### Included Subtasks

- [x] T004 Create tab coordinator that iterates hidden `div.resTab` elements and dispatches to type-specific parsers
- [x] T005 Implement `parseDailyGC()` — Tab 1: extract top 10 GC standings after stage
- [x] T006 Implement `parseMountainPasses()` — Tab 3: regex extract category (HC/1/2/3/4), name, km from headings; parse rider positions per pass
- [x] T007 Implement `parseIntermediateSprints()` — Tab 2: match `"Sprint | Location"` headings, skip `"Points at finish"`; detect single vs multi-sprint stages
- [x] T008 [P] Save PCS HTML fixtures for TdF 2024 stage 15 (mountain) and Paris-Nice 2026 stage 1 (flat) for testing
- [x] T009 Unit tests for all parsers using saved fixtures

### Implementation Notes

- Parsers live in `apps/api/src/infrastructure/scraping/parsers/` following existing pattern
- Each parser returns an array of `{ riderSlug, position, category, stageNumber, climbCategory?, climbName?, sprintName?, kmMarker? }`
- Coordinator identifies tab type by header content (not index — indexes may vary)
- Mountain pass regex: `/KOM Sprint \((HC|[1-4])\)\s+(.+?)\s*\((\d+(?:\.\d+)?)\s*km\)/`
- Sprint detection: heading starts with `"Sprint |"`, NOT `"Points at finish"`

### Parallel Opportunities

- T008 (save fixtures) can proceed in parallel with T004-T007 development.

### Dependencies

- Depends on WP01 (need schema types for category values).

### Risks & Mitigations

- PCS HTML structure may vary for older races → test with fixtures from different years
- Heading format may have edge cases → regex should be lenient, log warnings on mismatches

---

## Work Package WP03: Seed Pipeline Integration (Priority: P1)

**Goal**: Wire new parsers into the existing seed-database CLI flow so all new categories are persisted when scraping stage pages.
**Independent Test**: Run seed for a single race (e.g., Paris-Nice 2026); verify DB contains rows for all 8 categories.
**Prompt**: `tasks/WP03-seed-pipeline-integration.md`
**Estimated size**: ~350 lines

**Requirements Refs**: FR-004, FR-005, FR-006, FR-007, FR-009

### Included Subtasks

- [x] T010 Extend scraping use case to call tab coordinator for each stage page already fetched
- [x] T011 Map parser output to `race_results` entity and persist via repository (match `riderSlug` → `rider_id`)
- [x] T012 Handle edge cases: missing tabs (old races), cancelled stages, TTT stages, empty classifications
- [x] T013 Integration test: seed one race end-to-end, assert all category types present with plausible row counts

### Implementation Notes

- The existing seed flow already fetches stage HTML — extend the processing step, don't duplicate fetching
- Rider slug → UUID matching must use the same matcher as existing stage results
- For `gc_daily`, only persist top 10; for `regularidad_daily`, top 3; for mountain passes and sprints, persist all scoring positions per game rules

### Parallel Opportunities

- None — sequential with WP02.

### Dependencies

- Depends on WP02 (parsers must exist).

### Risks & Mitigations

- Rider slug matching failures → log warnings, skip unmatched riders (same pattern as existing scraper)
- Old races may lack hidden tabs → graceful fallback with warning, don't crash seed

---

## Work Package WP04: ML Scoring Tables (Priority: P1)

**Goal**: Add new point tables to `ml/src/points.py` matching all game scoring categories, and update `data.py` to load the expanded data.
**Independent Test**: `get_points('gc_daily', 1, 'grand_tour')` returns 15; `get_points('mountain_pass', 1, 'grand_tour')` with `climb_category='HC'` returns 12.
**Prompt**: `tasks/WP04-ml-scoring-tables.md`
**Estimated size**: ~400 lines

**Requirements Refs**: FR-008, FR-010

### Included Subtasks

- [x] T014 Add scoring tables to `ml/src/points.py`: `GC_DAILY`, `MOUNTAIN_PASS_HC`, `MOUNTAIN_PASS_CAT1-4`, `SPRINT_INTERMEDIATE_SINGLE`, `SPRINT_INTERMEDIATE_MULTI`, `REGULARIDAD_DAILY`
- [x] T015 Update `get_points()` to route new categories to correct tables; handle `climb_category` param for mountain passes; handle single/multi sprint detection
- [x] T016 Update `ml/src/data.py` SQL query to load new categories from `race_results`
- [x] T017 Add `sprint_count_per_stage` helper to detect multi-sprint stages from data
- [x] T018 Tests for all new scoring logic — 100% coverage on scoring tables per constitution

### Implementation Notes

- `get_points()` signature may need a new optional param for `climb_category`
- Multi-sprint detection: count `sprint_intermediate` rows per (race_slug, year, stage_number) — if >3 riders, it's multi-sprint (single sprint has max 3 scoring positions)
- Keep backward compatibility: existing categories (`stage`, `gc`, `mountain`, `sprint`) unchanged

### Parallel Opportunities

- T014-T015 (scoring tables) can proceed in parallel with T016 (data loading) since they touch different files.

### Dependencies

- Depends on WP01 (needs to know category values and column names).
- Can proceed in parallel with WP02/WP03 (different codebase: Python vs TypeScript).

### Risks & Mitigations

- Multi-sprint detection heuristic may have edge cases → validate against known races with 1 and 2+ sprints
- Constitution requires 100% scoring logic coverage → write tests first

---

## Work Package WP05: ML Retrain & Benchmark (Priority: P2)

**Goal**: Update ML feature extraction to include all scoring categories in `actual_pts`, retrain models, and benchmark Spearman ρ improvement.
**Independent Test**: Benchmark report shows ρ comparison before/after; retrained model files generated in `ml/models/`.
**Prompt**: `tasks/WP05-ml-retrain-benchmark.md`
**Estimated size**: ~350 lines

**Requirements Refs**: FR-010, FR-011

### Included Subtasks

- [ ] T019 Update `ml/src/features.py` `actual_pts` calculation to sum ALL 8 categories (not just 4)
- [ ] T020 Save current model benchmark results as "before" baseline
- [ ] T021 Retrain models with corrected target (`make retrain`)
- [ ] T022 Run benchmark suite on 2025 holdout, compare ρ per race type (mini_tour, grand_tour)
- [ ] T023 Document results in `kitty-specs/008-complete-fantasy-scoring/research.md` — update baseline table

### Implementation Notes

- Before retraining, the database must be seeded with complete data (user runs `make seed` manually)
- The `actual_pts` change is in `extract_features_for_race()` where it sums `pts` column — now it will include more rows per rider per race
- Benchmark comparison: save old ρ values, run same benchmark script, compare
- Target: mini tour ρ ≥ 0.58 (from 0.53), grand tour ρ ≥ 0.65 (from 0.60)

### Parallel Opportunities

- T020 (save baseline) can proceed before seed is complete.

### Dependencies

- Depends on WP03 (seed pipeline must work) + WP04 (scoring tables must be correct).
- User must run `make seed` between WP03 completion and WP05 execution.

### Risks & Mitigations

- ρ targets are aspirational — improvement depends on how much missing data explains current error
- If ρ doesn't improve significantly, the scoring data capture is still valuable for rules-based accuracy
- Retrain time ~5-10 min — acceptable

---

## Dependency & Execution Summary

```
WP01 (DB Migration)
  │
  ├──→ WP02 (Parsers) ──→ WP03 (Seed Integration) ──┐
  │                                                     │
  └──→ WP04 (ML Scoring) [parallel with WP02/WP03] ──┤
                                                        │
                                               User: make seed
                                                        │
                                                        ▼
                                               WP05 (Retrain + Benchmark)
```

- **Parallelization**: WP04 (Python/ML) can run in parallel with WP02+WP03 (TypeScript/API) since they touch different codebases.
- **MVP Scope**: WP01 + WP02 + WP03 = complete data capture. WP04 + WP05 = ML improvement.
- **User action required**: `make seed` between WP03 and WP05.

---

## Subtask Index (Reference)

| Subtask ID | Summary                           | Work Package | Priority | Parallel? |
| ---------- | --------------------------------- | ------------ | -------- | --------- |
| T001       | Add new columns to Drizzle schema | WP01         | P0       | No        |
| T002       | Add new category enum values      | WP01         | P0       | No        |
| T003       | Generate Drizzle migration        | WP01         | P0       | No        |
| T004       | Tab coordinator for hidden resTab | WP02         | P1       | No        |
| T005       | parseDailyGC()                    | WP02         | P1       | No        |
| T006       | parseMountainPasses()             | WP02         | P1       | No        |
| T007       | parseIntermediateSprints()        | WP02         | P1       | No        |
| T008       | Save PCS HTML fixtures            | WP02         | P1       | Yes       |
| T009       | Parser unit tests                 | WP02         | P1       | No        |
| T010       | Extend scraping use case          | WP03         | P1       | No        |
| T011       | Map parser output to DB entities  | WP03         | P1       | No        |
| T012       | Handle edge cases                 | WP03         | P1       | No        |
| T013       | Integration test seed             | WP03         | P1       | No        |
| T014       | Add scoring tables to points.py   | WP04         | P1       | Yes       |
| T015       | Update get_points() routing       | WP04         | P1       | Yes       |
| T016       | Update data.py SQL query          | WP04         | P1       | Yes       |
| T017       | Sprint count detection helper     | WP04         | P1       | No        |
| T018       | Scoring logic tests (100%)        | WP04         | P1       | No        |
| T019       | Update actual_pts in features.py  | WP05         | P2       | No        |
| T020       | Save baseline benchmark           | WP05         | P2       | Yes       |
| T021       | Retrain with corrected target     | WP05         | P2       | No        |
| T022       | Run benchmark comparison          | WP05         | P2       | No        |
| T023       | Document results                  | WP05         | P2       | No        |
