---
work_package_id: WP06
title: Move Benchmarks + Final Verification
lane: planned
dependencies: [WP02]
subtasks: [T024, T025, T026, T027]
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
requirement_refs: [FR-017, FR-018, FR-019]
---

# Work Package Prompt: WP06 – Move Benchmarks + Final Verification

## Implementation Command

```bash
spec-kitty implement WP06 --base WP02
```

## Objectives & Success Criteria

- 3 canonical benchmarks + logbook moved to `ml/benchmarks/`
- Benchmarks can import from `src.*` packages
- `cd ml && python -m benchmarks.harness --help` works

## Context

The 3 canonical benchmarks (benchmark_v8, benchmark_canonical, benchmark_classics) and the logbook utility are preserved but moved OUT of `src/` so they're not in the Docker image. They live in `ml/benchmarks/` as a separate package.

**Important**: `benchmark_v8.py` imports `research_v6.load_data_fast`. Since research_v6 is deleted (WP03), the benchmark harness needs to either inline that function or import from `src.data.loader` instead.

## Subtasks & Detailed Guidance

### Subtask T024 – Move 4 benchmark files

```bash
cd ml
mkdir -p benchmarks
touch benchmarks/__init__.py
git mv src/benchmark_v8.py benchmarks/harness.py
git mv src/benchmark_canonical.py benchmarks/canonical.py
git mv src/benchmark_classics.py benchmarks/classics.py
git mv src/logbook.py benchmarks/logbook.py
```

---

### Subtask T025 – Update benchmark imports

All benchmarks need imports updated from `from .XXX` (flat sibling) to `from src.XXX` (absolute package):

```python
# benchmarks/harness.py (was benchmark_v8.py)
# Old:
from .features import FEATURE_COLS, _compute_rider_features, ...
from .research_v6 import load_data_fast

# New:
from src.features.stage_race import FEATURE_COLS, _compute_rider_features, ...
from src.data.loader import load_data  # Replace load_data_fast with load_data
```

```python
# benchmarks/canonical.py
# Old:
from .benchmark_v8 import spearman_rho, ndcg_at_k, ...
from .logbook import save_logbook_entry, ...
from .cache_features import ...

# New:
from benchmarks.harness import spearman_rho, ndcg_at_k, ...
from benchmarks.logbook import save_logbook_entry, ...
from src.features.cache_stage import ...
```

```python
# benchmarks/classics.py
# Old:
from .benchmark_v8 import spearman_rho, ...
from .logbook import ...
from .points import GC_CLASSIC
from .data import load_data

# New:
from benchmarks.harness import spearman_rho, ...
from benchmarks.logbook import ...
from src.domain.points import GC_CLASSIC
from src.data.loader import load_data
```

**Key**: Replace `load_data_fast` (from deleted research_v6) with `load_data` from `src.data.loader`. If `load_data_fast` had different behavior, inline that behavior in the harness.

---

### Subtask T026 – Verify benchmarks run

```bash
cd ml
python -c "from benchmarks.harness import spearman_rho; print('Harness OK')"
python -c "from benchmarks.logbook import save_logbook_entry; print('Logbook OK')"
```

**Validation**:

- [ ] All benchmark imports resolve without error
- [ ] No benchmark files remain in `ml/src/`
- [ ] `ml/benchmarks/` contains exactly: `__init__.py`, `harness.py`, `canonical.py`, `classics.py`, `logbook.py`
- [ ] Logbook is importable from both benchmarks and src (via re-export if needed)

---

### Subtask T027 – Create ml/README.md

**Purpose**: Document the new package structure so developers can navigate the codebase.

**Steps**: Create `ml/README.md` with:

- Overview of the ML service purpose
- Package structure diagram (the target structure from plan.md)
- How to run: `make dev` (service), `make retrain` (training), `cd ml && python -m pytest tests/` (tests), `cd ml && python -m benchmarks.canonical` (benchmarks)
- Key entry points: `src/api/app.py` (FastAPI), `src/training/retrain.py` (retraining)

Keep it concise — ~50-80 lines max.

**Files**: `ml/README.md` (new)

---

## Risks & Mitigations

- **Risk**: `load_data_fast` has different behavior than `load_data`. **Mitigation**: Check the function — if it's just `load_data` with different defaults, use `load_data` directly. If it has unique logic, inline it.
- **Risk**: Benchmarks need access to `src/` modules. **Mitigation**: Run benchmarks from `ml/` directory so `src` is on the Python path.

## Activity Log

- 2026-04-02T22:16:11Z – system – lane=planned – Prompt created.
