---
work_package_id: WP01
title: Rules-Based Baseline Benchmark
lane: 'done'
dependencies: []
base_branch: main
base_commit: 55de7dda50bbfae9c114d0b04dfc4b658e4a1c16
created_at: '2026-04-02T19:04:42.012599+00:00'
subtasks:
  - T001
  - T002
  - T003
  - T004
  - T005
  - T006
phase: Phase 1 - Baseline & Research Infrastructure
assignee: ''
agent: 'claude-opus'
shell_pid: '96975'
review_status: 'approved'
reviewed_by: 'egimenos'
history:
  - timestamp: '2026-04-02T16:48:30Z'
    lane: planned
    agent: system
    shell_pid: ''
    action: Prompt generated via /spec-kitty.tasks
requirement_refs:
  - FR-001
  - FR-002
  - FR-003
  - FR-004
  - FR-005
---

# Work Package Prompt: WP01 – Rules-Based Baseline Benchmark

## IMPORTANT: Review Feedback Status

**Read this first if you are implementing this task!**

- **Has review feedback?**: Check the `review_status` field above. If it says `has_feedback`, scroll to the **Review Feedback** section immediately.
- **Mark as acknowledged**: When you understand the feedback and begin addressing it, update `review_status: acknowledged`.

---

## Review Feedback

_[This section is empty initially. Reviewers will populate it if the work is returned from review.]_

---

## Implementation Command

```bash
spec-kitty implement WP01
```

---

## Objectives & Success Criteria

- Create `ml/src/benchmark_classics.py` that evaluates the rules-based scoring system on all classic races
- Produce a comprehensive baseline with 6 metrics: Spearman rho, NDCG@10, P@5, P@10, capture rate @15, team overlap @15
- All metrics must include 95% bootstrap confidence intervals
- Per-race breakdown must be available (each classic individually)
- Output saved as logbook JSON following existing schema

**Success**: Running `python src/benchmark_classics.py --mode rules-baseline` produces `ml/logbook/classics_rules_baseline.json` with valid metrics across 3 CV folds.

## Context & Constraints

- **Spec**: `kitty-specs/016-classics-ml-model/spec.md` — FR-001 through FR-005
- **Plan**: `kitty-specs/016-classics-ml-model/plan.md` — AD-5 (benchmark-first development)
- **Research**: `kitty-specs/016-classics-ml-model/research.md` — R4 (benchmark protocol)
- **Existing benchmark**: `ml/src/benchmark_v8.py` contains metric functions to reuse
- **Existing logbook**: `ml/src/logbook.py` contains logbook save/load utilities
- **Points table**: `ml/src/points.py` has `GC_CLASSIC = {1:200, 2:125, ...10:30}`
- **Data access**: `ml/src/data.py` has SQL queries for loading race results

**Key constraint**: This is a DECOUPLED pipeline. Do NOT modify any existing files. Create `benchmark_classics.py` as a new, standalone file.

## Subtasks & Detailed Guidance

### Subtask T001 – Create benchmark_classics.py scaffold

**Purpose**: Set up the file structure, imports, CLI interface, and fold definitions.

**Steps**:

1. Create `ml/src/benchmark_classics.py`
2. Import metric functions from `benchmark_v8.py`: `spearman_rho`, `ndcg_at_k`, `precision_at_k`, `bootstrap_ci`
3. Import logbook utilities from `logbook.py`: `save_logbook_entry`, `build_run_metadata`
4. Import `GC_CLASSIC` from `points.py`
5. Define fold constants:
   ```python
   FOLDS = {
       1: {'train_end': 2022, 'test_year': 2023},
       2: {'train_end': 2023, 'test_year': 2024},
       3: {'train_end': 2024, 'test_year': 2025},
   }
   RANDOM_SEED = 42
   ```
6. Add CLI with argparse:
   - `--mode`: "rules-baseline" or "ml" (ML mode used in WP04)
   - `--label`: Optional logbook label
   - `--features`: Feature set name (for ML mode, future use)
   - `--model`: Model type (for ML mode, future use)

**Files**: `ml/src/benchmark_classics.py` (new, ~50 lines for scaffold)

---

### Subtask T002 – Implement rules-based classic scoring function

**Purpose**: Given a rider's finish position in a classic, compute their predicted/expected points using the GC_CLASSIC table. This is the "rules-based" model.

**Steps**:

1. Create function `rules_based_score(position: int) -> float`:
   ```python
   def rules_based_score(position: int) -> float:
       """Rules-based classic scoring: position -> GC_CLASSIC points."""
       return float(GC_CLASSIC.get(position, 0))
   ```
2. Create function `compute_rules_baseline(riders_df: pd.DataFrame) -> pd.DataFrame`:
   - Takes a DataFrame with columns: `rider_id`, `position`, `actual_pts`
   - Adds column `predicted_score` using `rules_based_score(position)`
   - **IMPORTANT**: The rules-based "prediction" for the baseline uses the **actual position** to compute expected points. This establishes the ceiling for how well position-based scoring maps to actual fantasy points. For fair comparison with ML (which doesn't know positions), we need a different approach.
   - **Alternative (fairer baseline)**: Use historical average performance as prediction. For each rider, predict their score based on their historical average points in this classic (or all classics if no same-race history). This is what the rules-based system actually does in production — it uses past results to estimate future performance.
   - Implement BOTH: `rules_position_baseline()` (oracle, upper bound) and `rules_historical_baseline()` (realistic, what production uses)

3. For `rules_historical_baseline()`:
   - For each rider in test year, look up their historical classic results (from training years)
   - Compute weighted average of past GC_CLASSIC points (temporal decay: most_recent=1.0, -1yr=0.5, -2yr=0.25)
   - This matches the production `ScoringService` logic (temporal decay weights)
   - Riders with no history get score = 0

**Files**: `ml/src/benchmark_classics.py` (~60 lines)

**Notes**: The realistic baseline (historical) is the one to compare ML against. The position-based oracle is useful as an upper-bound reference.

---

### Subtask T003 – Implement data loading for classic races

**Purpose**: Load classic race results from the database, filtered and formatted for benchmarking.

**Steps**:

1. Create function `load_classic_results(conn) -> pd.DataFrame`:
   ```python
   def load_classic_results(conn) -> pd.DataFrame:
       query = """
       SELECT rr.rider_id, rr.race_slug, rr.race_name, rr.race_type,
              rr.race_class, rr.year, rr.position, rr.dnf, rr.race_date,
              rr.parcours_type, r.full_name, r.birth_date
       FROM race_results rr
       JOIN riders r ON rr.rider_id = r.id
       WHERE rr.race_type = 'classic'
         AND rr.category = 'gc'
         AND rr.dnf = false
         AND rr.position IS NOT NULL
       ORDER BY rr.year, rr.race_slug, rr.position
       """
       return pd.read_sql(query, conn)
   ```
2. Add `actual_pts` column using GC_CLASSIC table: `df['actual_pts'] = df['position'].map(lambda p: GC_CLASSIC.get(p, 0.0))`
3. Add data quality logging: count of races per year, riders per race, race slugs found
4. Validate expected races are present (cross-check with known UWT classic slugs)

**Files**: `ml/src/benchmark_classics.py` (~40 lines)

**Notes**: Use `psycopg2` connection from existing `ml/src/data.py` pattern. Filter `dnf=false` to exclude riders who didn't finish.

---

### Subtask T004 – Implement metric computation

**Purpose**: Compute all 6 benchmark metrics for a single classic race.

**Steps**:

1. Create function `compute_race_metrics(predicted, actual, k_ndcg=10, k_p5=5, k_p10=10, team_size=15) -> dict`:
   ```python
   def compute_race_metrics(predicted: np.ndarray, actual: np.ndarray,
                            k_ndcg=10, k_p5=5, k_p10=10, team_size=15) -> dict:
       return {
           'rho': spearman_rho(predicted, actual),
           'ndcg_10': ndcg_at_k(predicted, actual, k=k_ndcg),
           'p_at_5': precision_at_k(predicted, actual, k=k_p5),
           'p_at_10': precision_at_k(predicted, actual, k=k_p10),
           'team_capture': compute_team_capture(predicted, actual, team_size),
           'team_overlap': compute_team_overlap(predicted, actual, team_size),
       }
   ```
2. Implement `compute_team_capture()`: select top-K riders by predicted score, compute sum of their actual points / sum of actual top-K actual points
3. Implement `compute_team_overlap()`: intersection of predicted top-K and actual top-K riders, divided by K
4. Handle edge cases: races with <3 riders (skip), races where all actual_pts are 0 (skip rho), races with <K riders (reduce K)

**Files**: `ml/src/benchmark_classics.py` (~60 lines)

**Notes**: K values are smaller than stage races because classics have fewer scoring positions (top 10). P@5 catches "did you get the podium contenders right?", P@10 catches "did you get all scoring riders?"

---

### Subtask T005 – Per-race breakdown and cross-fold aggregation with bootstrap CI

**Purpose**: Run the benchmark across all 3 folds, compute per-race metrics, aggregate with confidence intervals.

**Steps**:

1. Create function `run_benchmark(mode='rules-baseline') -> dict`:
   - For each fold:
     - Split data by year (train years ≤ train_end, test year)
     - For test year: get all classic races
     - For each race: compute metrics (T004)
     - Collect per-race detail objects (race_slug, year, n_riders, metrics, per-rider predictions)
   - Aggregate across races per fold: mean of each metric
   - Aggregate across folds: mean of fold means, bootstrap CI on per-race metrics
2. Build result dict matching logbook schema:
   ```python
   result = {
       'version': '1.0',
       'metadata': build_run_metadata(mode, ...),
       'folds': [fold_1_result, fold_2_result, fold_3_result],
       'aggregate': {
           'classic': {
               'rho_mean': ..., 'rho_ci': [...],
               'ndcg10_mean': ..., 'p5_mean': ..., 'p10_mean': ...,
               'team_capture_mean': ..., 'team_overlap_mean': ...,
               'n_races': ...,
           }
       }
   }
   ```
3. Print summary table to console:
   ```
   Classic Baseline (rules-based historical)
   ──────────────────────────────────────────
   Metric          Fold1   Fold2   Fold3   Avg     95% CI
   Spearman rho    0.XXX   0.XXX   0.XXX   0.XXX   [0.XXX, 0.XXX]
   NDCG@10         0.XXX   0.XXX   0.XXX   0.XXX   [0.XXX, 0.XXX]
   P@5             0.XXX   0.XXX   0.XXX   0.XXX   [0.XXX, 0.XXX]
   P@10            0.XXX   0.XXX   0.XXX   0.XXX   [0.XXX, 0.XXX]
   Capture @15     0.XXX   0.XXX   0.XXX   0.XXX   [0.XXX, 0.XXX]
   Overlap @15     0.XXX   0.XXX   0.XXX   0.XXX   [0.XXX, 0.XXX]
   ```

**Files**: `ml/src/benchmark_classics.py` (~120 lines)

---

### Subtask T006 – Run baseline and save logbook entry

**Purpose**: Execute the benchmark, save the logbook JSON, and verify results.

**Steps**:

1. Add `main()` function that:
   - Parses CLI arguments
   - Connects to database
   - Calls `run_benchmark(mode='rules-baseline')`
   - Saves logbook entry via `save_logbook_entry(result, label='classics_rules_baseline')`
   - Prints summary table
2. Save to `ml/logbook/classics_rules_baseline.json`
3. Verify: logbook JSON is valid, contains all expected fields, per-race breakdowns are present
4. Log the total number of classic races evaluated per fold

**Files**: `ml/src/benchmark_classics.py` (~30 lines for main)

**Validation**:

- [ ] `python src/benchmark_classics.py --mode rules-baseline` runs without errors
- [ ] Logbook JSON saved with all 6 metrics for each fold
- [ ] Per-race breakdown includes individual classic race metrics
- [ ] Bootstrap CIs are computed for aggregated metrics
- [ ] Console output shows the summary table

---

## Risks & Mitigations

- **Risk**: Not all UWT classics may be in the database (some may not have been scraped). **Mitigation**: Log which races are found per year, warn if expected races are missing.
- **Risk**: Fantasy prices may not be available for classics (needed for capture rate). **Mitigation**: If prices missing, compute capture rate using points only (not price-weighted), note in logbook.
- **Risk**: Very few riders per classic race (some minor classics). **Mitigation**: Set minimum rider threshold (≥10) to skip very small races.

## Review Guidance

- Verify metric functions are correctly imported from `benchmark_v8.py`
- Check that GC_CLASSIC points are applied correctly (position 1 → 200 pts)
- Confirm expanding-window CV correctly splits train/test by year
- Ensure per-race breakdown includes enough detail for later analysis
- Check that the historical baseline uses proper temporal decay (not the position oracle)

## Activity Log

- 2026-04-02T16:48:30Z – system – lane=planned – Prompt created.
- 2026-04-02T19:04:42Z – claude-opus – shell_pid=86193 – lane=doing – Assigned agent via workflow command
- 2026-04-02T19:08:23Z – claude-opus – shell_pid=86193 – lane=for_review – Rules-based baseline complete. rho=0.3124, NDCG=0.4079, P@5=0.3180. 161 races across 3 folds.
- 2026-04-02T19:23:29Z – claude-opus – shell_pid=96975 – lane=doing – Started review via workflow command
- 2026-04-02T19:24:54Z – claude-opus – shell_pid=96975 – lane=done – Review passed: all FRs met, clean code, removed unused imports.
