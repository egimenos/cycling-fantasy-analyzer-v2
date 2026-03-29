---
work_package_id: WP02
title: Source-by-Source Prediction Logic
lane: planned
dependencies: [WP01]
subtasks:
  - T006
  - T007
  - T008
  - T009
  - T010
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
  - FR-001
  - FR-002
  - FR-003
  - FR-004
---

# Work Package Prompt: WP02 – Source-by-Source Prediction Logic

## Objectives & Success Criteria

- POST `/predict` returns `predicted_score` + `breakdown: {gc, stage, mountain, sprint}` per rider
- All 4 sources produce correct fantasy point predictions
- Supply estimation integrated for mountain_pass and sprint_inter
- Model hot-reload works with new multi-artifact structure
- Predictions cached in ml_scores with breakdown columns

## Context & Constraints

- **Plan D1**: Response format with backward-compatible breakdown
- **Plan D3**: GC position and sprint_final are heuristics, not ML models
- **Model baseline**: `ml/docs/model-baseline.md` for exact algorithms
- **Existing code to reference**: `ml/src/benchmark_integrated.py` contains the prediction logic to productionize
- **Supply estimation**: `ml/src/supply_estimation.py` already committed

**Implementation command**: `spec-kitty implement WP02 --base WP01`

## Subtasks & Detailed Guidance

### Subtask T006 – Create `ml/src/predict_sources.py`

**Purpose**: Core prediction orchestrator. Takes rider features and produces per-rider breakdown.

**Steps**:

1. Create `predict_sources.py` with function:

   ```python
   def predict_race_sources(
       race_slug, year, models, metadata, results_df, startlists_df,
       stage_features_df, db_url, race_profile=None, rider_ids=None, race_type_hint=None
   ) -> list[dict]:
   ```

   Returns list of `{rider_id, predicted_score, breakdown: {gc, stage, mountain, sprint}}`

2. Implement each source prediction (extract from benchmark_integrated.py):

   **GC Source**:
   - Run gc_gate on features → P(top-20)
   - For riders with P >= threshold (from metadata): rank by heuristic score
   - Heuristic: `conservative_mu + min(form * multiplier, cap)` (weights from metadata)
   - Assign GC pts from scoring table + gc_daily from heuristic
   - gc_breakdown = gc_pts + gc_daily_pts

   **Stage Source**:
   - For each type (flat, hilly, mountain): run Ridge model → inverse sqrt → clip to 0
   - For ITT: run gate → if scoreable, run magnitude → inverse sqrt → clip to 0
   - stage_breakdown = sum(pred_type × n_type_stages_race)

   **Mountain Source**:
   - Mountain final: run gate → P(score) × avg_pts (27.0 GT, 26.7 mini)
   - Mountain pass: run capture model → inverse sqrt → clip to 0 → × estimated_supply
   - mountain_breakdown = mtn_final + mtn_pass

   **Sprint Source**:
   - Sprint final: compute contender score (heuristic from metadata) → soft rank → decay pts
   - Sprint inter: run capture model → inverse sqrt → clip to 0 → × estimated_supply
   - sprint_breakdown = spr_final + spr_inter

3. Compute `predicted_score = gc + stage + mountain + sprint`

4. Handle edge cases:
   - Rider with no features: all zeros
   - Race with no historical supply: mountain_pass = 0, sprint_inter = 0
   - Classic race type: return empty list

**Files**: `ml/src/predict_sources.py` (new, ~300 lines)

### Subtask T007 – Integrate supply estimation

**Purpose**: Load historical supply estimates for mountain_pass and sprint_inter.

**Steps**:

1. In predict_sources.py, load supply history from cached features
2. Call `estimate_supply(race_slug, year, supply_history)` from `supply_estimation.py`
3. Pass estimated supply to mountain_pass and sprint_inter capture rate models
4. If no supply history (new race): set both to 0.0

**Files**: Part of `ml/src/predict_sources.py`
**Parallel**: Yes, can be developed alongside T009.

### Subtask T008 – Update `ml/src/app.py` response format

**Purpose**: Extend the `/predict` endpoint to return breakdown alongside predicted_score.

**Steps**:

1. Update the predict endpoint to call `predict_race_sources()` instead of `predict_race()`
2. Response format changes:
   ```python
   # Old
   {"rider_id": "uuid", "predicted_score": 285.0}
   # New
   {"rider_id": "uuid", "predicted_score": 285.0,
    "breakdown": {"gc": 165.0, "stage": 80.0, "mountain": 12.0, "sprint": 28.0}}
   ```
3. Keep `predicted_score` as sum of breakdown (backward compatible)
4. Update PredictRequest if needed (profile_summary already has stage counts)

**Files**: `ml/src/app.py` (modify)

### Subtask T009 – Update model loading at startup

**Purpose**: Load all sub-model artifacts + metadata.json instead of single RF model.

**Steps**:

1. Update `lifespan()` in app.py:
   ```python
   app.state.models = load_source_models(MODEL_DIR)  # loads all joblib + metadata
   ```
2. Create `load_source_models(model_dir)` function that returns a dict:
   ```python
   {
     "gc_gate": <LogReg>,
     "stage_flat": <Ridge>, "stage_hilly": <Ridge>, "stage_mountain": <Ridge>,
     "stage_itt_gate": <LogReg>, "stage_itt_magnitude": <Ridge>,
     "mtn_final_gate": <LogReg>, "mtn_pass_capture": <Ridge>,
     "spr_inter_capture": <Ridge>,
     "metadata": <dict from metadata.json>,
   }
   ```
3. Update `maybe_reload_models()` to reload ALL artifacts when version changes
4. Handle missing artifacts gracefully: log warning, return partial predictions

**Files**: `ml/src/predict_sources.py` or `ml/src/predict.py` (model loading), `ml/src/app.py` (startup)
**Parallel**: Yes, can be developed alongside T007.

### Subtask T010 – Update cache read/write for breakdown

**Purpose**: Persist breakdown columns in ml_scores cache table.

**Steps**:

1. Update `write_cache()` in app.py to store gc_pts, stage_pts, mountain_pts, sprint_pts
2. Update `check_cache()` to read breakdown columns and return them
3. Cached response must include breakdown (not just predicted_score)
4. Cache invalidation: existing cache entries without breakdown should be treated as miss (re-predict)

**Note**: The actual DB migration (adding columns) is in WP03. Here we update the Python code that reads/writes.
For now, handle the case where columns don't exist yet (graceful fallback).

**Files**: `ml/src/app.py` (modify cache functions)

## Risks & Mitigations

- **Data loading performance**: predict_sources needs stage_features_df in addition to results_df. Extend lazy data_cache to include these.
- **GT completion rates for sprint heuristic**: Need to compute from stage results in DB. Cache this alongside other lazy data.
- **Feature name ordering**: joblib models expect features in the same order as training. Use metadata.json feature lists to guarantee order.

## Review Guidance

- Verify each source prediction matches the logic in benchmark_integrated.py EXACTLY
- Verify supply estimation is called correctly (historical average, not actual)
- Verify breakdown sums to predicted_score
- Test with a known race (e.g., Tour de France 2025) and compare to benchmark output

## Activity Log

- 2026-03-29T18:00:50Z – system – lane=planned – Prompt created.
