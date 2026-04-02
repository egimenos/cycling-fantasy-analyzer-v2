---
work_package_id: WP04
title: Consolidate Tests
lane: planned
dependencies: [WP02]
subtasks: [T018, T019, T020]
phase: Phase 2 - Cleanup
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
requirement_refs: [FR-011, FR-012, FR-013]
---

# Work Package Prompt: WP04 – Consolidate Tests

## Implementation Command

```bash
spec-kitty implement WP04 --base WP02
```

## Objectives & Success Criteria

- All test files live in `ml/tests/`
- Test imports updated to new package paths
- `cd ml && python -m pytest tests/ -v` passes all tests

## Subtasks & Detailed Guidance

### Subtask T018 – Move in-tree test files to tests/

```bash
cd ml
git mv src/test_classic_taxonomy.py tests/test_classic_taxonomy.py
git mv src/test_features_classics.py tests/test_features_classics.py
```

Ensure `ml/tests/__init__.py` exists.

---

### Subtask T019 – Update all test imports

All test files need import updates to use new package paths:

```python
# Old (in tests that were in src/):
from .classic_taxonomy import get_classic_types, ...
from .features_classics import TIER1_FEATURE_COLS, ...
from .points import GC_CLASSIC

# New (in tests/ directory):
from src.domain.classic_taxonomy import get_classic_types, ...
from src.features.classics import TIER1_FEATURE_COLS, ...
from src.domain.points import GC_CLASSIC
```

Update ALL test files in `ml/tests/`:

- `test_app.py`
- `test_features.py`
- `test_features_classics.py`
- `test_classic_taxonomy.py`
- `test_points.py`
- `test_predict.py`
- `test_predict_sources.py`

---

### Subtask T020 – Run full test suite

```bash
cd ml && python -m pytest tests/ -v
```

**Validation**:

- [ ] All tests pass (same count as before refactor)
- [ ] No test file remains in `ml/src/`
- [ ] `ml/tests/` contains all test files

## Activity Log

- 2026-04-02T22:16:11Z – system – lane=planned – Prompt created.
