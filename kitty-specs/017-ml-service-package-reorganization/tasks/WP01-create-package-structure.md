---
work_package_id: WP01
title: Create Package Structure + Move Files
lane: planned
dependencies: []
subtasks: [T001, T002, T003, T004, T005, T006]
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
requirement_refs: [FR-001, FR-004]
---

# Work Package Prompt: WP01 – Create Package Structure + Move Files

## Implementation Command

```bash
spec-kitty implement WP01
```

## Objectives & Success Criteria

- Create 6 subpackage directories under `ml/src/` with `__init__.py` files
- Move all 26 production files to new locations using `git mv` (preserves history)
- After this WP, `ls ml/src/` shows packages not loose files

## Context & Constraints

- **Plan**: `kitty-specs/017-ml-service-package-reorganization/plan.md` has the complete file rename map
- **CRITICAL**: Use `git mv`, NOT `mv`. This preserves file history in git.
- **DO NOT** update imports yet — that's WP02. Files will have broken imports after this WP, which is expected.
- Rename files to cleaner names as per the plan (e.g., `predict_sources.py` → `stage_races.py`)

## Subtasks & Detailed Guidance

### Subtask T001 – Create subpackage directories

**Purpose**: Create the target directory structure.

**Steps**:

```bash
cd ml/src
mkdir -p api prediction features domain data training
touch api/__init__.py prediction/__init__.py features/__init__.py \
      domain/__init__.py data/__init__.py training/__init__.py
```

Leave `__init__.py` files empty for now (WP02 adds re-exports).

**Files**: 6 new directories, 6 new `__init__.py`

---

### Subtask T002 – git mv API layer files

```bash
cd ml/src
git mv app.py api/app.py
git mv logging_config.py api/logging_config.py
git mv telemetry.py api/telemetry.py
git mv predict.py api/model_version.py
```

**Note**: `predict.py` renamed to `model_version.py` (clearer name — it only has `get_model_version()`).

---

### Subtask T003 – git mv prediction files

```bash
cd ml/src
git mv predict_sources.py prediction/stage_races.py
git mv predict_classics.py prediction/classics.py
git mv supply_estimation.py prediction/supply_estimation.py
```

---

### Subtask T004 – git mv feature files

```bash
cd ml/src
git mv features.py features/stage_race.py
git mv features_classics.py features/classics.py
git mv startlist_features.py features/startlist.py
git mv stage_features.py features/stage_type.py
git mv classification_history_features.py features/classification.py
git mv cache_features.py features/cache_stage.py
git mv cache_features_classics.py features/cache_classics.py
```

**Note**: Keep cache files separate (not merged) for now — merging is optional and can be done later.

---

### Subtask T005 – git mv domain files

```bash
cd ml/src
git mv points.py domain/points.py
git mv glicko2.py domain/glicko.py
git mv classic_taxonomy.py domain/classic_taxonomy.py
git mv stage_targets.py domain/stage_targets.py
```

---

### Subtask T006 – git mv data + training files

```bash
cd ml/src
git mv data.py data/loader.py
git mv retrain.py training/retrain.py
git mv train_sources.py training/train_sources.py
git mv train_classics.py training/train_classics.py
```

**Validation**:

- [ ] `ls ml/src/` shows: `__init__.py api/ data/ domain/ features/ prediction/ training/` (+ obsolete files still present — deleted in WP03)
- [ ] `git status` shows all moves as "renamed"
- [ ] `git log --follow ml/src/api/app.py` shows full history

## Risks & Mitigations

- **Risk**: `git mv` fails if files are modified. **Mitigation**: Ensure clean working tree before starting.
- **Risk**: Renaming breaks imports. **Mitigation**: Expected — WP02 fixes all imports.

## Activity Log

- 2026-04-02T22:16:11Z – system – lane=planned – Prompt created.
