---
work_package_id: WP04
title: ML Scoring Tables
lane: planned
dependencies: [WP01]
subtasks:
  - T014
  - T015
  - T016
  - T017
  - T018
phase: Phase 2 - ML Pipeline
assignee: ''
agent: ''
shell_pid: ''
review_status: ''
reviewed_by: ''
history:
  - timestamp: '2026-03-21T13:44:59Z'
    lane: planned
    agent: system
    shell_pid: ''
    action: Prompt generated via /spec-kitty.tasks
requirement_refs:
  - FR-008
  - FR-010
---

# Work Package Prompt: WP04 – ML Scoring Tables

## ⚠️ IMPORTANT: Review Feedback Status

- **Has review feedback?**: Check the `review_status` field above.

---

## Review Feedback

_[This section is empty initially.]_

---

## Objectives & Success Criteria

- Add all missing game scoring tables to `ml/src/points.py`
- Update `get_points()` to handle new categories with correct routing
- Update `data.py` to load new categories from the database
- Handle multi-sprint detection for reduced point values
- 100% test coverage on scoring logic (constitution requirement)

## Context & Constraints

- **Codebase**: Python ML service in `ml/src/`
- **Existing file**: `ml/src/points.py` has `STAGE_POINTS`, `GC_CLASSIC`, `GC_MINI_TOUR`, `GC_GRAND_TOUR`, `FINAL_CLASS_MINI`, `FINAL_CLASS_GT` and `get_points(category, position, race_type)`
- **Game rules source**: `https://grandesminivueltas.com/index.php/normas/` — verified in research
- **Constitution**: Scoring logic requires 100% test coverage
- **Key decision from plan**: `get_points()` gains an optional `climb_category` parameter for mountain passes
- **Parallelization**: This WP can proceed in parallel with WP02/WP03 (different codebase: Python vs TypeScript)
- **Implementation command**: `spec-kitty implement WP04 --base WP01`

## Subtasks & Detailed Guidance

### Subtask T014 – Add scoring tables to points.py

- **Purpose**: Define all missing game scoring tables as Python dicts.
- **Steps**:
  1. Open `ml/src/points.py`
  2. Add these tables after the existing ones:

     ```python
     GC_DAILY = {
         1: 15, 2: 10, 3: 8, 4: 7, 5: 6,
         6: 5, 7: 4, 8: 3, 9: 2, 10: 1,
     }

     MOUNTAIN_PASS_HC = {1: 12, 2: 8, 3: 6, 4: 5, 5: 4, 6: 3, 7: 2, 8: 1}
     MOUNTAIN_PASS_CAT1 = {1: 8, 2: 6, 3: 4, 4: 2, 5: 1}
     MOUNTAIN_PASS_CAT2 = {1: 5, 2: 3, 3: 1}
     MOUNTAIN_PASS_CAT3 = {1: 3, 2: 2}
     MOUNTAIN_PASS_CAT4 = {1: 1}

     SPRINT_INTERMEDIATE_SINGLE = {1: 6, 2: 4, 3: 2}
     SPRINT_INTERMEDIATE_MULTI = {1: 3, 2: 2, 3: 1}

     REGULARIDAD_DAILY = {1: 6, 2: 4, 3: 2}
     ```

  3. Values are verified against the official game rules page

- **Files**: `ml/src/points.py`
- **Parallel?**: Yes — can work alongside T016

### Subtask T015 – Update `get_points()` routing

- **Purpose**: Extend the function to handle new categories.
- **Steps**:
  1. Update function signature:
     ```python
     def get_points(category: str, position, race_type: str, climb_category: str | None = None, sprint_count: int = 1) -> float:
     ```
  2. Add routing for new categories:

     ```python
     if category == 'gc_daily':
         return float(GC_DAILY.get(position, 0))

     if category == 'mountain_pass':
         tbl = {
             'HC': MOUNTAIN_PASS_HC,
             '1': MOUNTAIN_PASS_CAT1,
             '2': MOUNTAIN_PASS_CAT2,
             '3': MOUNTAIN_PASS_CAT3,
             '4': MOUNTAIN_PASS_CAT4,
         }
         return float(tbl.get(climb_category or '', {}).get(position, 0))

     if category == 'sprint_intermediate':
         tbl = SPRINT_INTERMEDIATE_SINGLE if sprint_count <= 1 else SPRINT_INTERMEDIATE_MULTI
         return float(tbl.get(position, 0))

     if category == 'regularidad_daily':
         return float(REGULARIDAD_DAILY.get(position, 0))
     ```

  3. Existing categories must remain unchanged (backward compatible)

- **Files**: `ml/src/points.py`
- **Parallel?**: Yes — can work alongside T016

### Subtask T016 – Update data.py SQL query

- **Purpose**: Load the new categories from the database so they're available for feature extraction.
- **Steps**:
  1. Open `ml/src/data.py`
  2. The existing query selects from `race_results`. It should already load all categories since it doesn't filter by category. Verify this.
  3. If there IS a category filter, remove or expand it to include new values
  4. Add `climb_category` to the SELECT columns:
     ```sql
     SELECT rr.rider_id, rr.race_slug, ..., rr.climb_category, ...
     ```
  5. After loading, apply `get_points()` to compute the `pts` column. For new categories, pass `climb_category` and compute sprint count:
     ```python
     # For mountain_pass rows, pass climb_category
     # For sprint_intermediate rows, compute sprint_count per stage
     ```
  6. The `sprint_count` computation needs a helper (T017)
- **Files**: `ml/src/data.py`
- **Parallel?**: Yes — different file from T014/T015

### Subtask T017 – Sprint count detection helper

- **Purpose**: Determine if a stage has single or multiple intermediate sprints (affects point values).
- **Steps**:
  1. Create a helper function in `ml/src/points.py` or `ml/src/data.py`:
     ```python
     def get_sprint_count_per_stage(df: pd.DataFrame) -> dict[tuple[str, int, int], int]:
         """Returns {(race_slug, year, stage_number): sprint_count}"""
         sprint_rows = df[df['category'] == 'sprint_intermediate']
         # Count distinct sprints per stage (group by race/year/stage/sprint_name, count unique sprint_names)
         counts = sprint_rows.groupby(['race_slug', 'year', 'stage_number'])['sprint_name'].nunique()
         return counts.to_dict()
     ```
  2. Use this when computing `pts` for sprint_intermediate rows:
     - If sprint_count == 1: use SPRINT_INTERMEDIATE_SINGLE
     - If sprint_count >= 2: use SPRINT_INTERMEDIATE_MULTI
  3. If `sprint_name` is not loaded from DB, use a heuristic: count distinct position-1 rows per stage (each sprint has exactly one rider at position 1)
- **Files**: `ml/src/data.py` or `ml/src/points.py`
- **Parallel?**: No — depends on T016

### Subtask T018 – Tests for scoring logic (100% coverage)

- **Purpose**: Constitution mandates 100% coverage on scoring logic.
- **Steps**:
  1. Create or extend test file: `ml/tests/test_points.py`
  2. Test each new table:
     - `GC_DAILY`: position 1 → 15, position 10 → 1, position 11 → 0
     - `MOUNTAIN_PASS_HC`: position 1 → 12, position 8 → 1, position 9 → 0
     - `MOUNTAIN_PASS_CAT1`: position 1 → 8, position 5 → 1, position 6 → 0
     - `MOUNTAIN_PASS_CAT2`: position 1 → 5, position 3 → 1, position 4 → 0
     - `MOUNTAIN_PASS_CAT3`: position 1 → 3, position 2 → 2, position 3 → 0
     - `MOUNTAIN_PASS_CAT4`: position 1 → 1, position 2 → 0
     - `SPRINT_INTERMEDIATE_SINGLE`: positions 1-3 → 6/4/2, position 4 → 0
     - `SPRINT_INTERMEDIATE_MULTI`: positions 1-3 → 3/2/1, position 4 → 0
     - `REGULARIDAD_DAILY`: positions 1-3 → 6/4/2, position 4 → 0
  3. Test `get_points()` routing:
     - `get_points('gc_daily', 1, 'grand_tour')` → 15
     - `get_points('mountain_pass', 1, 'grand_tour', climb_category='HC')` → 12
     - `get_points('mountain_pass', 1, 'grand_tour', climb_category='4')` → 1
     - `get_points('sprint_intermediate', 1, 'grand_tour', sprint_count=1)` → 6
     - `get_points('sprint_intermediate', 1, 'grand_tour', sprint_count=2)` → 3
     - `get_points('regularidad_daily', 1, 'grand_tour')` → 6
  4. Test backward compatibility: existing categories unchanged
  5. Test edge cases: None position, NaN position, position < 1, unknown category
  6. Verify 100% coverage: `pytest --cov=src.points --cov-report=term-missing`
- **Files**: `ml/tests/test_points.py`
- **Parallel?**: No — needs T014-T017 complete

## Risks & Mitigations

- **Risk**: Multi-sprint detection heuristic incorrect → **Mitigation**: Validate against known races (TdF 2024 stage 15 has 1 sprint, verify count=1)
- **Risk**: `climb_category` column not loaded from DB → **Mitigation**: T016 explicitly adds it to SELECT; test with actual DB query after WP01 migration
- **Risk**: Backward compatibility break → **Mitigation**: Tests verify existing categories return same values

## Review Guidance

- Verify all point values match the official game rules at grandesminivueltas.com/index.php/normas/
- Verify 100% test coverage report
- Verify backward compatibility (existing `get_points` calls unchanged)
- Verify multi-sprint logic is correct

## Activity Log

- 2026-03-21T13:44:59Z – system – lane=planned – Prompt created.
