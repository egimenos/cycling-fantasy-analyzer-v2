# Feature Specification: ML Service Package Reorganization

**Feature Branch**: `017-ml-service-package-reorganization`
**Created**: 2026-04-03
**Status**: Draft
**Input**: Refactor ml/src/ from flat 56-file structure to clean domain-based packages

## Background & Motivation

The ML service (`ml/`) has grown organically through iterative research and feature development. What started as a handful of scripts is now 56 Python files totaling ~20K lines, all dumped flat in a single `ml/src/` directory. Only 14 files are production code — the remaining 42 are dead benchmarks, abandoned research versions, scrapers, and sanity checks that create noise and make the codebase difficult to navigate.

Additionally, 64MB of data artifacts (old CSVs, experiment logbooks) are stored in the repository without being gitignored.

This refactor reorganizes the production code into a clear domain-based package structure, deletes obsolete code, and establishes a maintainable foundation for future ML development.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Navigate ML Codebase Confidently (Priority: P1)

As a developer working on the ML service, I can find any production file within 5 seconds by navigating a logical package hierarchy instead of scrolling through 56 alphabetically-sorted files.

**Why this priority**: This is the core value — making the codebase navigable.

**Independent Test**: A new developer can locate the prediction logic, feature extraction, or training pipeline by following the package structure without prior knowledge of the codebase.

**Acceptance Scenarios**:

1. **Given** the reorganized `ml/src/` directory, **When** a developer looks for prediction logic, **Then** they find it in `prediction/` without ambiguity.
2. **Given** the reorganized structure, **When** a developer searches for classic-specific code, **Then** all classic files are co-located in the relevant subpackages.
3. **Given** the reorganized structure, **When** a developer lists `ml/src/`, **Then** they see 6-7 domain packages instead of 56 loose files.

---

### User Story 2 - Service Behavior Unchanged (Priority: P1)

As a user of the fantasy cycling analyzer, all existing functionality continues to work identically after the refactor — same API endpoints, same predictions, same model outputs.

**Why this priority**: Zero regression is non-negotiable for a structural refactor.

**Independent Test**: All existing tests pass. The ML service accepts the same requests and returns identical responses for any given input.

**Acceptance Scenarios**:

1. **Given** the reorganized service, **When** a stage race prediction is requested, **Then** the response is identical to the pre-refactor response.
2. **Given** the reorganized service, **When** a classic race prediction is requested, **Then** the response is identical to the pre-refactor response.
3. **Given** the reorganized service, **When** `make retrain` is executed, **Then** the training pipeline completes successfully with the same model outputs.

---

### User Story 3 - Clean Repository (Priority: P2)

As a repository maintainer, the ML directory no longer contains dead code or heavy artifacts that bloat the repository.

**Why this priority**: Reduces noise and repo size but doesn't affect functionality.

**Independent Test**: `ml/src/` contains only production code. Git-tracked repo size decreases. `find ml/src -name "*.py" | wc -l` returns ~20 instead of ~56.

**Acceptance Scenarios**:

1. **Given** the cleanup, **When** counting Python files in `ml/src/`, **Then** there are approximately 20 files (down from 56).
2. **Given** the cleanup, **When** checking git status, **Then** `data/`, `logbook/`, and `cache/` directories are gitignored.
3. **Given** the cleanup, **When** reviewing the Dockerfile, **Then** only production code is copied into the container image.

---

### Edge Cases

- What happens when a benchmark script is needed again? It lives in git history and can be recovered with `git log --all --diff-filter=D -- ml/src/benchmark_*.py`.
- What happens when external tools import from `ml/src/` using old paths? Any CI or script using old import paths will fail immediately with ImportError — easy to detect and fix.
- What happens to the Docker container during the refactor? The container must be rebuilt after the refactor. No rolling deployment is needed (single-user tool).

## Requirements _(mandatory)_

### Functional Requirements

#### Phase 1: Package Structure

- **FR-001**: Production code MUST be organized into domain-based subpackages within `ml/src/`: `api/`, `prediction/`, `features/`, `domain/`, `data/`, `training/`.
- **FR-002**: Each subpackage MUST have an `__init__.py` that re-exports its public interface to minimize downstream import changes.
- **FR-003**: All internal imports MUST be updated to reflect the new package paths.
- **FR-004**: The FastAPI application entry point MUST remain accessible as `src.api.app:app` (or equivalent path update in Dockerfile CMD).

#### Phase 2: Cleanup

- **FR-005**: All obsolete benchmark files (20 files, ~10K lines) MUST be deleted from the repository.
- **FR-006**: All obsolete research version files (7 files, ~3.4K lines) MUST be deleted from the repository.
- **FR-007**: Scraper scripts (2 files) MUST be deleted or moved outside of `ml/src/`.
- **FR-008**: Sanity check scripts MUST be deleted.
- **FR-009**: The `ml/data/` directory (30MB of obsolete CSVs) MUST be added to `.gitignore`.
- **FR-010**: The `ml/logbook/` directory (34MB of experiment logs) MUST be added to `.gitignore`.

#### Phase 3: Test Consolidation

- **FR-011**: All test files MUST be consolidated into `ml/tests/` (not split between `src/` and `tests/`).
- **FR-012**: Test imports MUST be updated to match the new package structure.
- **FR-013**: All existing tests MUST pass after the reorganization.

#### Phase 4: Deployment

- **FR-014**: The Dockerfile MUST be updated to copy from the new package structure.
- **FR-015**: The `make retrain` command MUST work with the new module paths.
- **FR-016**: The Docker container MUST start and serve predictions identically after rebuild.

#### Phase 5: Benchmark Preservation

- **FR-017**: The 3 canonical benchmarks (benchmark_v8, benchmark_canonical, benchmark_classics) MUST be preserved in a `ml/benchmarks/` directory outside of `src/`.
- **FR-018**: The logbook utility MUST remain accessible to benchmarks.
- **FR-019**: Benchmarks MUST be runnable from the `ml/` directory after reorganization.

### Key Entities

- **Subpackage**: A Python package (directory with `__init__.py`) grouping related production modules by domain responsibility.
- **Obsolete File**: A Python file in `ml/src/` that is not imported by any production code path and is not one of the 3 canonical benchmarks.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: The number of Python files in `ml/src/` decreases from 56 to approximately 20 (one per production module plus `__init__.py` files).
- **SC-002**: All existing tests pass with zero modifications to test assertions (only import path changes).
- **SC-003**: The ML service Docker container starts and responds to `/health` and `/predict` endpoints identically.
- **SC-004**: `make retrain` completes successfully with the new module paths.
- **SC-005**: No production import references old flat paths (verified by grep).
- **SC-006**: Git-tracked artifacts in `ml/data/` and `ml/logbook/` are removed from tracking.

## Assumptions

- The refactor is purely structural — no logic changes, no new features, no algorithm modifications.
- The 3 canonical benchmarks are worth preserving; all other benchmarks/research scripts are deletable.
- The `research_v6.py` module's `load_data_fast` function (imported by benchmarks) will be preserved in the benchmark harness or replaced by the standard `data.py` loader.
- Test assertions do not depend on module paths or file locations (only on behavior).

## Scope Boundaries

**In scope**:

- Reorganizing `ml/src/` into domain-based subpackages
- Deleting 27+ obsolete files
- Updating all imports
- Updating Dockerfile and Makefile
- Consolidating tests
- Gitignoring heavy artifacts
- Preserving 3 canonical benchmarks in `ml/benchmarks/`

**Out of scope**:

- Changing any business logic, algorithms, or model behavior
- Adding new features or capabilities
- Refactoring the NestJS API (only the Python ML service)
- Changing the API contract between NestJS and the ML service
- Performance optimization
