---
work_package_id: WP03
title: Delete Obsolete Files + Gitignore
lane: planned
dependencies: [WP02]
subtasks: [T014, T015, T016, T017]
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
requirement_refs: [FR-005, FR-006, FR-007, FR-008, FR-009, FR-010]
---

# Work Package Prompt: WP03 – Delete Obsolete Files + Gitignore

## Implementation Command

```bash
spec-kitty implement WP03 --base WP02
```

## Objectives & Success Criteria

- Delete 27 obsolete files (~14K lines of dead code)
- Gitignore `ml/data/` and `ml/logbook/` (64MB of artifacts)
- After this WP, `ml/src/` only contains production code

## Subtasks & Detailed Guidance

### Subtask T014 – Delete 15 obsolete benchmark files

**Steps**:

```bash
cd ml/src
git rm benchmark_008.py benchmark_fast.py benchmark_lambdamart.py
git rm benchmark_glicko_signal.py benchmark_glicko_split.py
git rm benchmark_v8_glicko.py benchmark_v8_lgbm.py benchmark_v8_startlist.py
git rm benchmark_stage.py benchmark_stage_ablation.py benchmark_stage_hilly.py
git rm benchmark_secondary.py benchmark_secondary_ab.py benchmark_secondary_heuristic.py
git rm benchmark_integrated.py
```

**Note**: The 3 canonical benchmarks (benchmark_v8, benchmark_canonical, benchmark_classics) and logbook.py are NOT deleted here — they're moved in WP06.

---

### Subtask T015 – Delete 7 research version files

```bash
cd ml/src
git rm research.py research_v2.py research_v3.py research_v4.py research_v5.py research_v6.py research_v7.py
```

**Note**: `research_v6.py` has `load_data_fast()` imported by benchmarks. WP06 will handle this by inlining or replacing the function in the benchmark harness.

---

### Subtask T016 – Delete scrapers, sanity, EDA

```bash
cd ml/src
git rm scrape_birth_dates.py scrape_prices.py
git rm sanity_stage.py
git rm eda_stage_source.py
```

---

### Subtask T017 – Update .gitignore + remove tracked artifacts

**Steps**:

1. Add to `ml/.gitignore` (create if not exists):
   ```
   data/
   logbook/
   cache/
   *.parquet
   ```
2. Remove tracked artifacts:
   ```bash
   git rm -r --cached ml/data/ 2>/dev/null || true
   git rm -r --cached ml/logbook/ 2>/dev/null || true
   ```

**Validation**:

- [ ] `find ml/src -name "*.py" -not -path "*__pycache__*" | wc -l` returns ~20-25
- [ ] `git status` shows no tracked files in `ml/data/` or `ml/logbook/`
- [ ] No remaining file in `ml/src/` starts with `benchmark_`, `research`, `scrape_`, `sanity_`, or `eda_`

## Activity Log

- 2026-04-02T22:16:11Z – system – lane=planned – Prompt created.
