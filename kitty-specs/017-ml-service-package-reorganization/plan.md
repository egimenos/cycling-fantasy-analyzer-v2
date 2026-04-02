# Implementation Plan: ML Service Package Reorganization

**Branch**: `017-ml-service-package-reorganization` | **Date**: 2026-04-03 | **Spec**: [spec.md](spec.md)

## Summary

Reorganize `ml/src/` from 56 flat files to domain-based subpackages. Delete 27 obsolete files (~14K lines). Update all imports. Preserve 3 canonical benchmarks in `ml/benchmarks/`. Zero behavior change.

## Technical Context

**Language/Version**: Python 3.11
**Primary Dependencies**: FastAPI, scikit-learn, LightGBM, pandas, psycopg2
**Storage**: PostgreSQL (unchanged)
**Testing**: pytest
**Target Platform**: Docker container (same as before)
**Project Type**: Monorepo — only `ml/` affected
**Constraints**: Zero behavior change. All existing tests must pass.

## Constitution Check

| Gate                              | Status | Notes                            |
| --------------------------------- | ------ | -------------------------------- |
| ML Service: Python 3.11 + FastAPI | PASS   | No change                        |
| Testing: pytest                   | PASS   | Tests moved, not changed         |
| Docker sidecar                    | PASS   | Dockerfile updated for new paths |
| English only                      | PASS   |                                  |

## Project Structure

### Target Structure (after refactor)

```
ml/
├── src/
│   ├── __init__.py
│   ├── api/                    # FastAPI service layer
│   │   ├── __init__.py
│   │   ├── app.py
│   │   ├── logging_config.py
│   │   └── telemetry.py
│   ├── prediction/             # Inference logic
│   │   ├── __init__.py
│   │   ├── stage_races.py      # was predict_sources.py
│   │   ├── classics.py         # was predict_classics.py
│   │   └── supply_estimation.py
│   ├── features/               # Feature extraction
│   │   ├── __init__.py
│   │   ├── stage_race.py       # was features.py
│   │   ├── classics.py         # was features_classics.py
│   │   ├── startlist.py        # was startlist_features.py
│   │   ├── stage_type.py       # was stage_features.py
│   │   ├── classification.py   # was classification_history_features.py
│   │   └── cache.py            # was cache_features.py + cache_features_classics.py
│   ├── domain/                 # Domain knowledge & scoring
│   │   ├── __init__.py
│   │   ├── points.py
│   │   ├── glicko.py           # was glicko2.py
│   │   ├── classic_taxonomy.py
│   │   └── stage_targets.py
│   ├── data/                   # Database access
│   │   ├── __init__.py
│   │   └── loader.py           # was data.py
│   └── training/               # Training pipeline
│       ├── __init__.py
│       ├── retrain.py
│       ├── train_sources.py
│       └── train_classics.py
├── benchmarks/                 # Outside src/ — not in Docker
│   ├── __init__.py
│   ├── harness.py              # was benchmark_v8.py
│   ├── canonical.py            # was benchmark_canonical.py
│   ├── classics.py             # was benchmark_classics.py
│   └── logbook.py
├── tests/                      # All tests consolidated
│   ├── __init__.py
│   ├── test_app.py
│   ├── test_features.py
│   ├── test_features_classics.py
│   ├── test_classic_taxonomy.py
│   ├── test_points.py
│   ├── test_predict.py
│   └── test_predict_sources.py
├── models/                     # Model artifacts (gitignored except metadata)
├── cache/                      # Feature cache (gitignored)
├── docs/
│   └── model-baseline.md
├── requirements.txt
└── Dockerfile
```

### Files to DELETE (27 files, ~14K lines)

**Obsolete benchmarks (20 files)**:

- benchmark_008.py, benchmark_fast.py, benchmark_lambdamart.py
- benchmark_glicko_signal.py, benchmark_glicko_split.py
- benchmark_v8_glicko.py, benchmark_v8_lgbm.py, benchmark_v8_startlist.py
- benchmark_stage.py, benchmark_stage_ablation.py, benchmark_stage_hilly.py
- benchmark_secondary.py, benchmark_secondary_ab.py, benchmark_secondary_heuristic.py
- benchmark_integrated.py

**Research versions (7 files)**:

- research.py, research_v2.py, research_v3.py, research_v4.py, research_v5.py, research_v6.py, research_v7.py

**Scrapers (2 files)**:

- scrape_birth_dates.py, scrape_prices.py

**Sanity checks (1 file)**:

- sanity_stage.py

**EDA (1 file)**:

- eda_stage_source.py

### File Rename Map

| Old path                                 | New path                              |
| ---------------------------------------- | ------------------------------------- |
| `src/app.py`                             | `src/api/app.py`                      |
| `src/logging_config.py`                  | `src/api/logging_config.py`           |
| `src/telemetry.py`                       | `src/api/telemetry.py`                |
| `src/predict_sources.py`                 | `src/prediction/stage_races.py`       |
| `src/predict_classics.py`                | `src/prediction/classics.py`          |
| `src/supply_estimation.py`               | `src/prediction/supply_estimation.py` |
| `src/features.py`                        | `src/features/stage_race.py`          |
| `src/features_classics.py`               | `src/features/classics.py`            |
| `src/startlist_features.py`              | `src/features/startlist.py`           |
| `src/stage_features.py`                  | `src/features/stage_type.py`          |
| `src/classification_history_features.py` | `src/features/classification.py`      |
| `src/cache_features.py`                  | `src/features/cache.py`               |
| `src/cache_features_classics.py`         | (merged into `src/features/cache.py`) |
| `src/points.py`                          | `src/domain/points.py`                |
| `src/glicko2.py`                         | `src/domain/glicko.py`                |
| `src/classic_taxonomy.py`                | `src/domain/classic_taxonomy.py`      |
| `src/stage_targets.py`                   | `src/domain/stage_targets.py`         |
| `src/data.py`                            | `src/data/loader.py`                  |
| `src/retrain.py`                         | `src/training/retrain.py`             |
| `src/train_sources.py`                   | `src/training/train_sources.py`       |
| `src/train_classics.py`                  | `src/training/train_classics.py`      |
| `src/predict.py`                         | `src/api/model_version.py`            |
| `src/benchmark_v8.py`                    | `benchmarks/harness.py`               |
| `src/benchmark_canonical.py`             | `benchmarks/canonical.py`             |
| `src/benchmark_classics.py`              | `benchmarks/classics.py`              |
| `src/logbook.py`                         | `benchmarks/logbook.py`               |

## Architecture Decisions

### AD-1: `__init__.py` Re-exports

Each `__init__.py` re-exports the public interface so that imports can be done from the package level. This minimizes the number of import changes needed downstream.

```python
# src/domain/__init__.py
from .points import GC_CLASSIC, get_points
from .glicko import ...
from .classic_taxonomy import get_classic_types, ...
```

### AD-2: Benchmarks Outside src/

Benchmarks live in `ml/benchmarks/` (not `ml/src/benchmarks/`) because they should NOT be in the Docker image. They import from `src/` using the package path.

### AD-3: Single Cache Module

`cache_features.py` and `cache_features_classics.py` are merged into a single `src/features/cache.py` with clear function namespacing (`cache_stage_features()`, `cache_classic_features()`).

## Work Package Decomposition

### WP01: Create Package Structure + Move Files (P0)

**Goal**: Create all subpackages with `__init__.py`, move/rename files via `git mv`.
**Files**: All 26 production files moved to new locations. ~12 `__init__.py` created.
**Dependencies**: None
**Risk**: git mv preserves history; must be done before import updates.

### WP02: Update All Imports (P0)

**Goal**: Update every `from .module import X` to the new package paths. Update all cross-references.
**Files**: Every moved file needs import updates (~200 imports).
**Dependencies**: WP01
**Risk**: Missing an import causes ImportError. Mitigated by running tests + grep.

### WP03: Delete Obsolete Files (P1)

**Goal**: Delete 27 obsolete files. Update .gitignore for data/ and logbook/.
**Files**: 27 deletions, .gitignore update.
**Dependencies**: WP02 (ensure nothing imports deleted files first)

### WP04: Consolidate Tests + Verify (P1)

**Goal**: Move all tests to `ml/tests/`, update test imports, run full test suite.
**Files**: 7 test files consolidated, imports updated.
**Dependencies**: WP02

### WP05: Update Dockerfile + Deployment (P1)

**Goal**: Update Dockerfile CMD path, Makefile retrain path, verify container builds and serves.
**Files**: Dockerfile.ml, Makefile, retrain.py entry point.
**Dependencies**: WP02

### WP06: Move Benchmarks + Final Verification (P2)

**Goal**: Move 3 canonical benchmarks + logbook to `ml/benchmarks/`, update their imports, verify they run.
**Files**: 4 files moved, imports updated.
**Dependencies**: WP02

## Dependency Graph

```
WP01 (Move files) → WP02 (Update imports)
                         ├── WP03 (Delete obsolete)
                         ├── WP04 (Consolidate tests)
                         ├── WP05 (Dockerfile + deploy)
                         └── WP06 (Benchmarks)
```

WP03-WP06 can run in parallel after WP02.
