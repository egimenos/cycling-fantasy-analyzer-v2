---
work_package_id: WP02
title: Update All Imports
lane: planned
dependencies: [WP01]
subtasks: [T007, T008, T009, T010, T011, T012, T013]
phase: Phase 1 - Package Structure
assignee: ''
agent: ''
shell_pid: ''
review_status: ''
reviewed_by: ''
history:
  - timestamp: '2026-04-02T22:16:11Z'
    lane: planned
    agent: system
    shell_pid: ''
    action: Prompt generated via /spec-kitty.tasks
requirement_refs: [FR-002, FR-003]
---

# Work Package Prompt: WP02 – Update All Imports

## Implementation Command

```bash
spec-kitty implement WP02 --base WP01
```

## Objectives & Success Criteria

- Update every `from .module import X` to new package paths
- Create `__init__.py` re-exports for clean public API
- All production modules importable from their new paths

## Context & Constraints

- After WP01, all files are in their new locations but imports are broken
- Old pattern: `from .features import X` (flat sibling import)
- New pattern: `from .features.stage_race import X` or `from ..domain.points import X` (cross-package)
- **Strategy**: Use `__init__.py` re-exports to minimize changes. E.g., `from ..domain import GC_CLASSIC` instead of `from ..domain.points import GC_CLASSIC`

### Import Mapping Reference

| Old import                           | New import                                                                             |
| ------------------------------------ | -------------------------------------------------------------------------------------- |
| `from .features import ...`          | `from ..features.stage_race import ...` or `from ..features import ...` (via **init**) |
| `from .points import ...`            | `from ..domain.points import ...` or `from ..domain import ...`                        |
| `from .data import load_data`        | `from ..data.loader import load_data` or `from ..data import load_data`                |
| `from .predict_sources import ...`   | `from ..prediction.stage_races import ...`                                             |
| `from .glicko2 import ...`           | `from ..domain.glicko import ...`                                                      |
| `from .classic_taxonomy import ...`  | `from ..domain.classic_taxonomy import ...`                                            |
| `from .features_classics import ...` | `from ..features.classics import ...`                                                  |
| `from .predict_classics import ...`  | `from ..prediction.classics import ...`                                                |
| `from .supply_estimation import ...` | `from ..prediction.supply_estimation import ...`                                       |
| `from .logbook import ...`           | Benchmarks handle separately (WP06)                                                    |
| `from .logging_config import ...`    | `from .logging_config import ...` (same package)                                       |
| `from .telemetry import ...`         | `from .telemetry import ...` (same package)                                            |
| `from .predict import ...`           | `from .model_version import ...` (same package)                                        |
| `from .benchmark_v8 import ...`      | Benchmarks handle separately (WP06)                                                    |
| `from .research_v6 import ...`       | Benchmarks handle separately (WP06)                                                    |
| `from .cache_features import ...`    | `from ..features.cache_stage import ...`                                               |
| `from .train_sources import ...`     | `from .train_sources import ...` (same package)                                        |

## Subtasks & Detailed Guidance

### Subtask T007 – Update imports in api/app.py

**Purpose**: `app.py` is the most import-heavy file — it imports from nearly every other module.

**Steps**:

1. Read `ml/src/api/app.py` and identify all `from .XXX import` lines
2. Replace each with the correct cross-package import:

   ```python
   # Old:
   from .features import FEATURE_COLS, _compute_rider_features, ...
   from .points import get_points, GC_CLASSIC
   from .data import load_data
   from .predict_sources import predict_race_sources
   from .predict_classics import is_model_available, predict_classic_race
   from .logging_config import setup_logging
   from .telemetry import setup_telemetry
   from .predict import get_model_version

   # New:
   from ..features.stage_race import FEATURE_COLS, _compute_rider_features, ...
   from ..domain.points import get_points, GC_CLASSIC
   from ..data.loader import load_data
   from ..prediction.stage_races import predict_race_sources
   from ..prediction.classics import is_model_available, predict_classic_race
   from .logging_config import setup_logging  # Same package — no change
   from .telemetry import setup_telemetry      # Same package — no change
   from .model_version import get_model_version
   ```

3. Check for any lazy/dynamic imports inside functions (e.g., `from .predict_classics import ...` inside an `if` block)

---

### Subtask T008 – Update imports in prediction/ files

Update `prediction/stage_races.py`, `prediction/classics.py`, `prediction/supply_estimation.py`.

Key mappings:

- `from .points import ...` → `from ..domain.points import ...`
- `from .features_classics import ...` → `from ..features.classics import ...`
- `from .classic_taxonomy import ...` → `from ..domain.classic_taxonomy import ...`

---

### Subtask T009 – Update imports in features/ files

Update all 7 files in `features/`. These primarily import from `domain/` (points, taxonomy).

Key: `from .points import GC_CLASSIC` → `from ..domain.points import GC_CLASSIC`

---

### Subtask T010 – Update imports in domain/ files

Domain files (points, glicko, taxonomy, stage_targets) should have minimal cross-package imports. Check and fix any.

---

### Subtask T011 – Update imports in data/ and training/ files

- `data/loader.py`: imports from `domain/points.py`
- `training/retrain.py`: imports from multiple packages (data, features, training, domain)
- `training/train_sources.py`: imports from features, domain
- `training/train_classics.py`: imports from features

---

### Subtask T012 – Create **init**.py re-exports

**Purpose**: Each `__init__.py` re-exports the package's public interface so that other packages can do cleaner imports.

```python
# src/domain/__init__.py
from .points import GC_CLASSIC, get_points, gc_position_to_bucket, gc_bucket_expected_pts
from .glicko import main as glicko_main
from .classic_taxonomy import get_classic_types, get_feeders_for_race, is_monument, resolve_slug, get_all_types, get_races_by_type

# src/data/__init__.py
from .loader import load_data

# src/features/__init__.py
from .stage_race import FEATURE_COLS, extract_features_for_race
from .classics import TIER1_FEATURE_COLS, compute_classic_features

# src/prediction/__init__.py
from .stage_races import predict_race_sources
from .classics import predict_classic_race

# src/api/__init__.py
from .app import app

# src/training/__init__.py
# (no re-exports needed — training scripts are entry points)
```

---

### Subtask T013 – Import smoke test

```bash
cd ml
python -c "from src.api.app import app; print('API OK')"
python -c "from src.prediction.stage_races import predict_race_sources; print('Predict OK')"
python -c "from src.features.stage_race import FEATURE_COLS; print('Features OK')"
python -c "from src.domain.points import GC_CLASSIC; print('Domain OK')"
python -c "from src.data.loader import load_data; print('Data OK')"
python -c "from src.training.retrain import main; print('Training OK')"
```

All must succeed without ImportError.

**Validation**:

- [ ] All 6 smoke tests pass
- [ ] `grep -rn "from \.\(features\|points\|data\|predict\|glicko\|classic_taxonomy\|supply\|cache_features\|logbook\|benchmark\) " ml/src/ | grep -v __pycache__` returns zero results (no old flat imports remain)
- [ ] No circular import errors

## Risks & Mitigations

- **Risk**: Missing an import causes runtime ImportError. **Mitigation**: Grep for all old patterns, smoke test every package.
- **Risk**: Circular imports between packages. **Mitigation**: Use lazy imports in `__init__.py` if needed; domain/ should have zero cross-package imports.

## Activity Log

- 2026-04-02T22:16:11Z – system – lane=planned – Prompt created.
