# Work Packages: ML Service Package Reorganization

**Inputs**: Design documents from `kitty-specs/017-ml-service-package-reorganization/`
**Prerequisites**: plan.md (file rename map), spec.md

**Organization**: 27 subtasks (`T001`–`T027`) rolled into 6 work packages (`WP01`–`WP06`).

---

## Work Package WP01: Create Package Structure + Move Files (Priority: P0)

**Goal**: Create all subpackage directories with `__init__.py` files, then `git mv` every production file to its new location per the rename map.
**Independent Test**: `ls ml/src/` shows 6 subpackages instead of 56 loose files. `git log --follow` preserves file history.
**Prompt**: `tasks/WP01-create-package-structure.md`

**Requirements Refs**: FR-001, FR-004

### Included Subtasks

- [ ] T001 Create subpackage directories with `__init__.py`: api/, prediction/, features/, domain/, data/, training/
- [ ] T002 `git mv` API layer files: app.py, logging_config.py, telemetry.py, predict.py → api/
- [ ] T003 `git mv` prediction files: predict_sources.py, predict_classics.py, supply_estimation.py → prediction/
- [ ] T004 `git mv` feature files: features.py, features_classics.py, startlist_features.py, stage_features.py, classification_history_features.py, cache_features.py, cache_features_classics.py → features/
- [ ] T005 `git mv` domain files: points.py, glicko2.py, classic_taxonomy.py, stage_targets.py → domain/
- [ ] T006 `git mv` data + training files: data.py → data/, retrain.py + train_sources.py + train_classics.py → training/

### Dependencies

- None (starting package)

---

## Work Package WP02: Update All Imports (Priority: P0)

**Goal**: Update every import statement across all moved files to reflect new package paths. Ensure `python -c "from src.api.app import app"` works.
**Independent Test**: `python -c "from src.api.app import app"` succeeds. `grep -r "from \..*import" ml/src/ | grep -v __pycache__` shows only valid new-path imports.
**Prompt**: `tasks/WP02-update-imports.md`

**Requirements Refs**: FR-002, FR-003

### Included Subtasks

- [ ] T007 Update imports in `src/api/app.py` (the most import-heavy file)
- [ ] T008 Update imports in `src/prediction/` files (stage_races.py, classics.py, supply_estimation.py)
- [ ] T009 Update imports in `src/features/` files (stage_race.py, classics.py, startlist.py, stage_type.py, classification.py, cache.py)
- [ ] T010 Update imports in `src/domain/` files (points.py, glicko.py, classic_taxonomy.py, stage_targets.py)
- [ ] T011 Update imports in `src/data/` and `src/training/` files
- [ ] T012 Create `__init__.py` re-exports for each subpackage (public API)
- [ ] T013 Verify: `python -c "from src.api.app import app"` and basic import smoke test

### Dependencies

- Depends on WP01

---

## Work Package WP03: Delete Obsolete Files + Gitignore (Priority: P1)

**Goal**: Delete 27 obsolete files. Add `data/` and `logbook/` to `.gitignore`. Remove tracked artifacts.
**Independent Test**: `find ml/src -name "*.py" | wc -l` returns ~20. `git status` shows no tracked files in `ml/data/` or `ml/logbook/`.
**Prompt**: `tasks/WP03-delete-obsolete-gitignore.md`

**Requirements Refs**: FR-005, FR-006, FR-007, FR-008, FR-009, FR-010

### Included Subtasks

- [ ] T014 Delete 15 obsolete benchmark files (benchmark_008, benchmark_fast, benchmark_lambdamart, etc.)
- [ ] T015 Delete 7 research version files (research.py through research_v7.py)
- [ ] T016 Delete scrapers (scrape_birth_dates.py, scrape_prices.py), sanity (sanity_stage.py), EDA (eda_stage_source.py)
- [ ] T017 Update `.gitignore`: add `ml/data/`, `ml/logbook/`, remove tracked artifacts with `git rm --cached`

### Dependencies

- Depends on WP02 (ensure no remaining imports reference deleted files)

---

## Work Package WP04: Consolidate Tests (Priority: P1)

**Goal**: Move all test files to `ml/tests/`, update their imports, run full test suite.
**Independent Test**: `cd ml && python -m pytest tests/ -v` passes all tests.
**Prompt**: `tasks/WP04-consolidate-tests.md`

**Requirements Refs**: FR-011, FR-012, FR-013

### Included Subtasks

- [ ] T018 Move in-tree test files from `src/` to `tests/` (test_classic_taxonomy.py, test_features_classics.py)
- [ ] T019 Update all test imports to use new package paths (e.g., `from src.domain.points import GC_CLASSIC`)
- [ ] T020 Run full test suite and verify all tests pass: `cd ml && python -m pytest tests/ -v`

### Dependencies

- Depends on WP02

---

## Work Package WP05: Update Dockerfile + Deployment (Priority: P1)

**Goal**: Update Dockerfile CMD, Makefile retrain path, verify container builds and serves predictions.
**Independent Test**: `docker compose build ml-service && docker compose up -d ml-service` succeeds. `curl localhost:8000/health` returns 200.
**Prompt**: `tasks/WP05-update-deployment.md`

**Requirements Refs**: FR-014, FR-015, FR-016

### Included Subtasks

- [ ] T021 Update `docker/Dockerfile.ml` CMD to new entry point path (`src.api.app:app`)
- [ ] T022 Update `Makefile` retrain command if module path changed
- [ ] T023 Verify Docker build + health check + predict endpoint

### Dependencies

- Depends on WP02

---

## Work Package WP06: Move Benchmarks + Final Verification (Priority: P2)

**Goal**: Move 3 canonical benchmarks + logbook to `ml/benchmarks/`, update their imports, verify they can run.
**Independent Test**: `cd ml && python -m benchmarks.harness --help` works. Benchmarks can import from `src/`.
**Prompt**: `tasks/WP06-move-benchmarks.md`

**Requirements Refs**: FR-017, FR-018, FR-019

### Included Subtasks

- [ ] T024 Move benchmark_v8.py → benchmarks/harness.py, benchmark_canonical.py → benchmarks/canonical.py, benchmark_classics.py → benchmarks/classics.py, logbook.py → benchmarks/logbook.py
- [ ] T025 Update benchmark imports to reference `src.*` package paths
- [ ] T026 Verify benchmarks can be invoked: `cd ml && python -m benchmarks.harness --help`
- [ ] T027 Create `ml/README.md` documenting new package structure and entry points

### Dependencies

- Depends on WP02

---

## Dependency & Execution Summary

```
WP01 (Move files) → WP02 (Update imports)
                         ├── WP03 (Delete obsolete)
                         ├── WP04 (Consolidate tests)
                         ├── WP05 (Update deployment)
                         └── WP06 (Move benchmarks)
```

- **Parallelization**: WP03, WP04, WP05, WP06 can all run in parallel after WP02.
- **MVP Scope**: WP01 + WP02 = core refactor. WP03-WP06 are cleanup/polish.

---

## Subtask Index (Reference)

| Subtask | Summary                             | WP   | Priority | Parallel? |
| ------- | ----------------------------------- | ---- | -------- | --------- |
| T001    | Create subpackage directories       | WP01 | P0       | No        |
| T002    | git mv API files                    | WP01 | P0       | Yes       |
| T003    | git mv prediction files             | WP01 | P0       | Yes       |
| T004    | git mv feature files                | WP01 | P0       | Yes       |
| T005    | git mv domain files                 | WP01 | P0       | Yes       |
| T006    | git mv data + training files        | WP01 | P0       | Yes       |
| T007    | Update imports in api/app.py        | WP02 | P0       | No        |
| T008    | Update imports in prediction/       | WP02 | P0       | Yes       |
| T009    | Update imports in features/         | WP02 | P0       | Yes       |
| T010    | Update imports in domain/           | WP02 | P0       | Yes       |
| T011    | Update imports in data/ + training/ | WP02 | P0       | Yes       |
| T012    | Create **init**.py re-exports       | WP02 | P0       | No        |
| T013    | Import smoke test                   | WP02 | P0       | No        |
| T014    | Delete 15 obsolete benchmarks       | WP03 | P1       | No        |
| T015    | Delete 7 research versions          | WP03 | P1       | No        |
| T016    | Delete scrapers, sanity, EDA        | WP03 | P1       | No        |
| T017    | Update .gitignore + remove tracked  | WP03 | P1       | No        |
| T018    | Move test files to tests/           | WP04 | P1       | No        |
| T019    | Update test imports                 | WP04 | P1       | No        |
| T020    | Run full test suite                 | WP04 | P1       | No        |
| T021    | Update Dockerfile CMD               | WP05 | P1       | No        |
| T022    | Update Makefile retrain             | WP05 | P1       | No        |
| T023    | Verify Docker build + health        | WP05 | P1       | No        |
| T024    | Move 4 benchmark files              | WP06 | P2       | No        |
| T025    | Update benchmark imports            | WP06 | P2       | No        |
| T026    | Verify benchmarks run               | WP06 | P2       | No        |
| T027    | Create ml/README.md                 | WP06 | P2       | Yes       |
