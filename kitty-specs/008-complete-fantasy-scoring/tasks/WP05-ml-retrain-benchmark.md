---
work_package_id: WP05
title: ML Retrain & Benchmark
lane: 'for_review'
dependencies:
  - WP03
  - WP04
base_branch: 008-complete-fantasy-scoring-WP05-merge-base
base_commit: 8f67c4409d561d61fd308f6f796a15a1571b8143
created_at: '2026-03-21T22:53:48.621073+00:00'
subtasks:
  - T019 # done — verified actual_pts includes all 8 categories
  - T020 # done — saved benchmark_before_008.txt
  - T021 # done — retrained models (version 20260321T234503)
  - T022 # done — saved benchmark_after_008.txt
  - T023 # done — updated research.md and evidence-log.csv
phase: Phase 3 - Evaluation
assignee: ''
agent: 'claude-opus'
shell_pid: '92366'
review_status: ''
reviewed_by: ''
history:
  - timestamp: '2026-03-21T13:44:59Z'
    lane: planned
    agent: system
    shell_pid: ''
    action: Prompt generated via /spec-kitty.tasks
requirement_refs:
  - FR-010
  - FR-011
---

# Work Package Prompt: WP05 – ML Retrain & Benchmark

## ⚠️ IMPORTANT: Review Feedback Status

- **Has review feedback?**: Check the `review_status` field above.

---

## Review Feedback

_[This section is empty initially.]_

---

## Objectives & Success Criteria

- Update `actual_pts` in feature extraction to include ALL 8 scoring categories
- Retrain ML models with corrected training target
- Benchmark Spearman ρ improvement vs current production model
- Target: mini tour ρ ≥ 0.58 (from 0.53), grand tour ρ ≥ 0.65 (from 0.60)
- Document results in research report

## Context & Constraints

- **Prerequisite**: Database MUST be seeded with complete data (user runs `make seed` manually between WP03 and WP05)
- **Current model**: Random Forest, 49 features (v4b), trained on partial scoring data
- **Training script**: `ml/src/retrain.py` — reads from DB, extracts features, trains models
- **Benchmark**: `ml/src/research_v3.py` or the CLI benchmark command
- **Implementation command**: `spec-kitty implement WP05 --base WP04`

## Subtasks & Detailed Guidance

### Subtask T019 – Update `actual_pts` in features.py

- **Purpose**: The ML training target must sum ALL game scoring categories, not just the current 4.
- **Steps**:
  1. Open `ml/src/features.py`
  2. Find where `actual_pts` is computed — it's in `extract_features_for_race()` where it does:
     ```python
     feats['actual_pts'] = rider_actual['pts'].sum()
     ```
  3. This already sums the `pts` column from `data.py`. Since T016 (WP04) updated `data.py` to load and score new categories, `actual_pts` will automatically include the new points — **IF the data is in the DB**.
  4. Verify that the `pts` computation in `data.py` correctly handles all 8 categories by tracing the flow:
     - `data.py` loads all `race_results` rows (including new categories)
     - `data.py` applies `get_points()` to compute `pts` for each row
     - `features.py` sums `pts` per rider per race → `actual_pts`
  5. If the data flow is correct, this subtask may require NO code changes — just verification. But if there's any filtering that excludes new categories, fix it.
  6. Add a sanity check: print `actual_pts` for Pogačar in TdF 2024 before/after. It should increase by ~300 points (daily GC + passes).
- **Files**: `ml/src/features.py`, `ml/src/data.py` (verification)
- **Parallel?**: No

### Subtask T020 – Save baseline benchmark results

- **Purpose**: Capture current ρ values before retraining so we can compare.
- **Steps**:
  1. Run the existing benchmark on the CURRENT production model (before any retraining)
  2. Save results:
     - Mini tour ρ: expected ~0.53
     - Grand tour ρ: expected ~0.60
  3. Store as a JSON or text file: `ml/results/benchmark_before_008.txt`
  4. These are the "before" values for comparison
- **Files**: `ml/results/benchmark_before_008.txt`
- **Parallel?**: Yes — can be done before seed completes
- **Notes**: Run with `make benchmark-suite` or the CLI benchmark command

### Subtask T021 – Retrain models with corrected target

- **Purpose**: Train new RF models using the expanded training data.
- **Steps**:
  1. Ensure database has been seeded with complete data (all 8 categories) — this is done by the user running `make seed`
  2. Run `make retrain` which calls `python -m src.retrain`
  3. Verify output:
     - New model files in `ml/models/`: `model_mini_tour.joblib`, `model_grand_tour.joblib`
     - New version timestamp in `ml/models/model_version.txt`
     - Training log shows updated sample counts (more `actual_pts` per rider)
  4. Check that training data includes new categories by inspecting feature matrix shape
  5. Training should take ~5-10 minutes
- **Files**: No code changes — just execution of existing pipeline
- **Parallel?**: No — must have seeded data

### Subtask T022 – Run benchmark comparison

- **Purpose**: Measure ρ improvement on the 2025 holdout.
- **Steps**:
  1. Run `make benchmark-suite` with the retrained model
  2. Capture per-race-type Spearman ρ:
     - Mini tour ρ (target ≥ 0.58)
     - Grand tour ρ (target ≥ 0.65)
  3. Compare against baseline (T020):
     - Delta ρ per race type
     - Absolute improvement
  4. If possible, also run per-race breakdown to identify which races improved most
  5. Save results: `ml/results/benchmark_after_008.txt`
- **Files**: `ml/results/benchmark_after_008.txt`
- **Parallel?**: No — needs retrained model

### Subtask T023 – Document results in research report

- **Purpose**: Update research artifacts with findings.
- **Steps**:
  1. Update `kitty-specs/008-complete-fantasy-scoring/research.md`:
     - Update the "Current Baseline" table with new ρ values
     - Add a "Results" section with before/after comparison
     - Note which rider archetypes improved most (GC riders, climbers)
  2. Update evidence-log.csv with benchmark findings
  3. If ρ targets not met, document possible explanations and recommend next steps (A1-A6 axes)
  4. If ρ targets met, declare success and recommend shipping
- **Files**: `kitty-specs/008-complete-fantasy-scoring/research.md`, `kitty-specs/008-complete-fantasy-scoring/research/evidence-log.csv`
- **Parallel?**: No — needs benchmark results

## Risks & Mitigations

- **Risk**: ρ doesn't improve or gets worse → **Mitigation**: The scoring data is still correct regardless of ρ. If ρ drops, investigate whether the expanded target introduces noise. May need feature engineering (A3 axis) to capture new scoring patterns.
- **Risk**: Database not seeded when retrain runs → **Mitigation**: Document prerequisite clearly; retrain script should log data summary at start
- **Risk**: Training takes much longer with expanded data → **Mitigation**: Row count increases ~15% (35K new rows on 210K existing). Impact should be minimal.

## Review Guidance

- Verify `actual_pts` includes all 8 categories (spot-check a known rider)
- Verify benchmark comparison is apples-to-apples (same holdout set, same evaluation metric)
- Verify results documented with before/after numbers
- If ρ targets not met, verify reasonable explanation provided

## Activity Log

- 2026-03-21T13:44:59Z – system – lane=planned – Prompt created.
- 2026-03-21T22:53:49Z – claude-opus – shell_pid=92366 – lane=doing – Assigned agent via workflow command
- 2026-03-22T01:00:00Z – claude-opus – shell_pid=92366 – lane=for_review – All subtasks done. mini_tour rho 0.4950->0.6256, grand_tour rho 0.6564->0.7678. Both targets exceeded.
- 2026-03-21T23:57:47Z – claude-opus – shell_pid=92366 – lane=for_review – Moved to for_review
