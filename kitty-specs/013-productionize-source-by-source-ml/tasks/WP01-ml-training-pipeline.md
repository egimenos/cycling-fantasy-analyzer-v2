---
work_package_id: WP01
title: ML Training Pipeline
lane: planned
dependencies: []
subtasks:
  - T001
  - T002
  - T003
  - T004
  - T005
phase: Phase 1 - Foundation
assignee: ''
agent: ''
shell_pid: ''
review_status: ''
reviewed_by: ''
history:
  - timestamp: '2026-03-29T18:00:50Z'
    lane: planned
    agent: system
    shell_pid: ''
    action: Prompt generated via /spec-kitty.tasks
requirement_refs:
  - FR-006
  - FR-008
---

# Work Package Prompt: WP01 – ML Training Pipeline

## Objectives & Success Criteria

- All source-by-source sub-models are trained from cached features and saved as joblib artifacts
- Heuristic configurations (GC position, sprint contender) saved in metadata.json
- `make retrain` runs the full pipeline end-to-end (glicko → cache → stage caches → train)
- Retraining runbook updated with new steps

## Context & Constraints

- **Spec**: `kitty-specs/013-productionize-source-by-source-ml/spec.md`
- **Plan**: `kitty-specs/013-productionize-source-by-source-ml/plan.md` (see D2, D3, D4)
- **Model Baseline**: `ml/docs/model-baseline.md` — definitive reference for architecture, features, thresholds
- **Research benchmarks**: `ml/src/benchmark_integrated.py` — the training logic to extract and productionize
- **Constitution**: scoring logic requires 100% test coverage

**Implementation command**: `spec-kitty implement WP01`

## Subtasks & Detailed Guidance

### Subtask T001 – Create `ml/src/train_sources.py`

**Purpose**: Train all sub-models from cached features and save as joblib artifacts. This is the production training entry point.

**Steps**:

1. Create `ml/src/train_sources.py` with a `train_all(model_dir, cache_dir, db_url)` function
2. Load cached features from parquet files (features_YYYY.parquet, stage_targets.parquet, stage_features.parquet, classification_history_features.parquet)
3. Join all data sources (same pattern as `_load_all_data()` in `benchmark_integrated.py`)
4. Train each sub-model using the EXACT same parameters as the frozen benchmarks:

   **GC Gate** (LogisticRegression):
   - Features: `gc_mu, gc_mu_delta_12m, same_race_gc_best, age, gc_pts_same_type`
   - Target: `(gc_final_position.notna() & gc_final_position <= 20).astype(int)`
   - Params: `C=0.1, class_weight="balanced", max_iter=2000`
   - Save: `gc_gate.joblib`

   **Stage models** (Ridge per type: flat, hilly, mountain):
   - Features per type: see `_stage_feats()` in benchmark_integrated.py (shared + type-specific + profile = 16 features)
   - Target: `sqrt({type}_pts_per_stage)` — train only on riders with `n_{type}_stages_ridden > 0`
   - Params: `Ridge(alpha=1.0)`, uniform sample weights (Config B)
   - Save: `stage_flat.joblib`, `stage_hilly.joblib`, `stage_mountain.joblib`

   **ITT Gate** (LogisticRegression):
   - Features: same as ITT stage features
   - Target: `scoreable_itt`
   - Params: `C=0.1, class_weight="balanced", max_iter=2000`
   - Save: `stage_itt_gate.joblib`

   **ITT Magnitude** (Ridge):
   - Features: same as ITT stage features, trained only on non-zero scorers
   - Target: `sqrt(itt_pts_per_stage)` where > 0
   - Save: `stage_itt_magnitude.joblib`

   **Mountain Final Gate** (LogisticRegression):
   - Features: see `MTN_FINAL_FEATS` in benchmark_secondary.py (15 features)
   - Target: `(actual_mountain_final_pts > 0).astype(int)`
   - Params: `C=0.1, class_weight="balanced", max_iter=2000`
   - Save: `mtn_final_gate.joblib`

   **Mountain Pass Capture** (Ridge):
   - Features: see `MTN_PASS_FEATS` (13 features)
   - Target: `sqrt(actual_mountain_pass_pts / target_mtn_pass_supply)` where supply > 0
   - Save: `mtn_pass_capture.joblib`

   **Sprint Inter Capture** (Ridge):
   - Features: see `SPR_INTER_FEATS` (14 features)
   - Target: `sqrt(actual_sprint_inter_pts / target_spr_inter_supply)` where supply > 0
   - Save: `spr_inter_capture.joblib`

5. Use ALL available training data (no train/test split — this is production training)
6. Print summary: number of training samples per model, artifact sizes

**Files**: `ml/src/train_sources.py` (new, ~250 lines)

### Subtask T002 – Generate `ml/models/metadata.json`

**Purpose**: Store non-ML configuration (feature lists, thresholds, heuristic weights) needed by the prediction logic.

**Steps**:

1. At the end of `train_all()`, generate metadata.json containing:

```json
{
  "model_version": "YYYYMMDDTHHMMSS",
  "trained_at": "ISO timestamp",
  "gc_gate_threshold": 0.40,
  "gc_position_weights": {
    "lambda_rd": 1.0,
    "form_cap": 100,
    "form_multiplier": 10
  },
  "sprint_contender_weights": {
    "sprinter": {"flat_strength_12m": 0.3, "flat_top10s_12m": 5.0, "stage_wins_flat": 15.0, "flat_top10_rate_12m": 50.0},
    "allround": {"hilly_pts_12m": 0.2, "pts_stage_12m": 0.05, "pct_pts_p3": 30.0, "stage_mu": 0.005},
    "survival_floor": 0.3,
    "survival_weight": 0.7,
    "flat_pct_clip": [0.2, 0.8]
  },
  "feature_lists": {
    "gc_gate": ["gc_mu", "gc_mu_delta_12m", ...],
    "stage_flat": [...],
    ...
  },
  "gt_rank_decay": {"1": 50, "2": 35, ...},
  "mini_rank_decay": {"1": 40, "2": 25, ...}
}
```

2. Save to `ml/models/metadata.json`

**Files**: Part of `ml/src/train_sources.py`

### Subtask T003 – Update `ml/src/retrain.py`

**Purpose**: The existing retrain.py runs the old RF pipeline. Update it to run the full source-by-source pipeline.

**Steps**:

1. Replace the existing 4-step flow with:
   - Step 1: Load data from DB
   - Step 2: Compute Glicko-2 ratings (`python -m src.glicko2` or call directly)
   - Step 3: Build feature cache (`cache_features.main()`)
   - Step 4: Build stage targets (`stage_targets.save_stage_targets()`)
   - Step 5: Build stage features (`stage_features.save_stage_features()`)
   - Step 6: Build classification history features
   - Step 7: Train all sub-models (`train_sources.train_all()`)
   - Step 8: Write model_version.txt

2. Keep backward compatibility: if old model files exist, don't delete them (hot-reload handles the switch)
3. Print progress for each step with timing

**Files**: `ml/src/retrain.py` (modify, ~100 lines)

### Subtask T004 – Update retraining runbook

**Purpose**: Keep runbook in sync with the new training pipeline.

**Steps**:

1. Update `ml/docs/retraining-runbook.md`:
   - Add Step 7 (was: verify): `python -m src.train_sources` (or note that retrain.py now does it)
   - Update the "Quick Reference" section
   - Update expected artifacts list (9 joblib files + metadata.json)

**Files**: `ml/docs/retraining-runbook.md` (modify)
**Parallel**: Yes, can be done alongside T001-T003.

### Subtask T005 – Verify training artifacts

**Purpose**: Ensure the training pipeline produces all expected artifacts.

**Steps**:

1. Run `python -m src.train_sources` (or `make retrain`)
2. Verify all files exist in `ml/models/`:
   - `gc_gate.joblib`
   - `stage_flat.joblib`, `stage_hilly.joblib`, `stage_mountain.joblib`
   - `stage_itt_gate.joblib`, `stage_itt_magnitude.joblib`
   - `mtn_final_gate.joblib`, `mtn_pass_capture.joblib`
   - `spr_inter_capture.joblib`
   - `metadata.json`
   - `model_version.txt`
3. Verify each model can be loaded with joblib.load()
4. Verify metadata.json is valid JSON with expected keys

**Files**: Verification only, no new code.

## Risks & Mitigations

- **Training on all data**: No train/test split means we can't validate in-training. Rely on benchmark_integrated.py for validation (separate concern).
- **Feature name mismatch**: Feature lists must match EXACTLY between train and predict. metadata.json serves as the contract.

## Review Guidance

- Verify feature lists match model-baseline.md exactly
- Verify model parameters match the frozen benchmark configs
- Verify retrain.py orchestrates all steps in correct order
- Check that metadata.json captures ALL heuristic weights (not just some)

## Activity Log

- 2026-03-29T18:00:50Z – system – lane=planned – Prompt created.
