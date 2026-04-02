---
work_package_id: WP09
title: Production Integration
lane: planned
dependencies: [WP08]
subtasks:
  - T044
  - T045
  - T046
  - T047
  - T048
phase: Phase 4 - Production Integration
assignee: ''
agent: ''
shell_pid: ''
review_status: ''
reviewed_by: ''
history:
  - timestamp: '2026-04-02T16:48:30Z'
    lane: planned
    agent: system
    shell_pid: ''
    action: Prompt generated via /spec-kitty.tasks
requirement_refs:
  - FR-027
  - FR-028
  - FR-029
  - FR-030
---

# Work Package Prompt: WP09 – Production Integration

## IMPORTANT: Review Feedback Status

- **Has review feedback?**: Check the `review_status` field above.

---

## Review Feedback

_[Empty initially.]_

---

## Implementation Command

```bash
spec-kitty implement WP09 --base WP08
```

---

## Objectives & Success Criteria

- Create `ml/src/predict_classics.py` for production prediction
- Integrate into existing pipeline: `predict_sources.py`, `app.py`, `ml-scoring.adapter.ts`
- Classic race requests return ML predictions instead of 404 / empty results
- Zero impact on existing stage-race predictions

**Success**: A POST request to the ML service for a classic race (e.g., `race_type: "classic"`) returns per-rider predicted scores with `scoringMethod: "ml"`.

**PREREQUISITE**: WP08 must have concluded with a GO decision. If NO-GO, this WP is skipped.

## Context & Constraints

- **Plan**: AD-1 (decoupled pipeline — only 3 existing files modified), AD-2 (single score, not 4-source)
- **Research**: R6 (integration points), R7 (model architecture)
- **Constitution**: DDD/Hexagonal compliance — ML adapter is infrastructure layer
- **Existing code to modify**:
  - `ml/src/predict_sources.py` line 135: `return []` → delegate to predict_classics
  - `ml/src/app.py` line 378: HTTPException 404 → call prediction
  - `apps/api/src/infrastructure/ml/ml-scoring.adapter.ts`: handle classic response
- **Model artifacts**: `ml/models/classics/model.joblib` + `ml/models/classics/metadata.json`

## Subtasks & Detailed Guidance

### Subtask T044 – Create predict_classics.py

**Purpose**: Production prediction module — loads model, extracts features for a startlist, and returns predictions.

**Steps**:

1. Create `ml/src/predict_classics.py`:

   ```python
   import joblib
   import json
   import pandas as pd
   import numpy as np
   from features_classics import compute_classic_features, load_classic_history
   from classic_taxonomy import resolve_slug

   MODEL_DIR = 'ml/models/classics'
   _model = None
   _metadata = None

   def _load_model():
       """Lazy-load model and metadata."""
       global _model, _metadata
       if _model is None:
           _model = joblib.load(f'{MODEL_DIR}/model.joblib')
           with open(f'{MODEL_DIR}/metadata.json') as f:
               _metadata = json.load(f)
       return _model, _metadata

   def predict_classic_race(
       race_slug: str,
       year: int,
       riders: list[dict],  # [{rider_id, rider_name, ...}]
       conn,
   ) -> list[dict]:
       """Predict classic race scores for all riders in the startlist.

       Returns: [
           {
               'rider_id': str,
               'rider_name': str,
               'predicted_score': float,
               'gc': float,      # Same as predicted_score (classics = GC only)
               'stage': 0.0,
               'mountain': 0.0,
               'sprint': 0.0,
           },
           ...
       ]
       """
       model, metadata = _load_model()
       feature_cols = metadata['feature_cols']
       transform = metadata.get('transform', 'raw')

       # Load historical data for feature extraction
       all_results = load_all_results(conn)
       classic_results = all_results[
           (all_results['race_type'] == 'classic') &
           (all_results['category'] == 'gc')
       ]

       # Extract features for each rider
       rows = []
       for rider in riders:
           hist = all_results[
               (all_results['rider_id'] == rider['rider_id']) &
               (all_results['race_date'] < race_date)
           ]
           feats = compute_classic_features(
               rider_id=rider['rider_id'],
               race_slug=race_slug,
               race_date=race_date,
               rider_history=hist,
               all_classic_results=classic_results,
           )
           feats['rider_id'] = rider['rider_id']
           feats['rider_name'] = rider.get('rider_name', '')
           rows.append(feats)

       df = pd.DataFrame(rows)
       X = df[feature_cols].fillna(0).values

       # Apply inverse transform
       _, inverse_fn = TRANSFORMS[transform]
       raw_preds = model.predict(X)
       preds = np.maximum(inverse_fn(raw_preds), 0)

       # Build response
       results = []
       for i, rider in enumerate(riders):
           results.append({
               'rider_id': rider['rider_id'],
               'rider_name': rider.get('rider_name', ''),
               'predicted_score': float(preds[i]),
               'gc': float(preds[i]),
               'stage': 0.0,
               'mountain': 0.0,
               'sprint': 0.0,
           })

       return sorted(results, key=lambda x: -x['predicted_score'])
   ```

**Files**: `ml/src/predict_classics.py` (new, ~100 lines)

**Notes**: Response format mirrors stage-race predictions (gc/stage/mountain/sprint breakdown) but with stage/mountain/sprint always 0 for classics. This ensures the API response format is consistent.

---

### Subtask T045 – Modify predict_sources.py delegation

**Purpose**: Replace the `return []` at line 135 with delegation to classic prediction.

**Steps**:

1. In `ml/src/predict_sources.py`, find line ~135:
   ```python
   if race_type == "classic":
       return []  # <-- CURRENT CODE
   ```
2. Replace with:
   ```python
   if race_type == "classic":
       from predict_classics import predict_classic_race
       return predict_classic_race(
           race_slug=race_slug,
           year=year,
           riders=riders,  # Pass startlist
           conn=conn,
       )
   ```
3. Ensure the function signature provides all needed parameters to `predict_classic_race`
4. This is the ONLY change to predict_sources.py — keep it minimal

**Files**: `ml/src/predict_sources.py` (modify ~3 lines)

---

### Subtask T046 – Modify app.py to remove 404

**Purpose**: Allow the ML service to accept and process classic race prediction requests.

**Steps**:

1. In `ml/src/app.py`, find line ~378:
   ```python
   if race_type == 'classic':
       raise HTTPException(
           status_code=404,
           detail=f"Classic race — ML not supported: {req.race_slug}",
       )
   ```
2. Remove this block entirely (or replace with a log statement)
3. The existing prediction flow downstream will now call `predict_race_sources()` which delegates to `predict_classics.py`
4. Verify the request schema supports classic race type (it should — `race_type` is a string field)

**Files**: `ml/src/app.py` (modify ~5 lines removed)

---

### Subtask T047 – Modify ml-scoring.adapter.ts

**Purpose**: Ensure the NestJS API sends classic race requests to the ML service and handles the response correctly.

**Steps**:

1. In `apps/api/src/infrastructure/ml/ml-scoring.adapter.ts`, find the classic race handling:
   - Currently: skips ML service call for classics, returns null/empty
   - Change to: send request to ML service, parse response
2. The response format is the same as stage races (gc/stage/mountain/sprint breakdown)
3. Map response to the domain model:
   ```typescript
   // For classics: gc = predicted_score, others = 0
   const mlScore: MlScoringResult = {
     gc: response.gc,
     stage: response.stage, // Always 0 for classics
     mountain: response.mountain, // Always 0 for classics
     sprint: response.sprint, // Always 0 for classics
     total: response.predicted_score,
     scoringMethod: 'ml',
   };
   ```
4. Handle fallback: if ML service is unavailable, fall back to rules-based scoring

**Files**: `apps/api/src/infrastructure/ml/ml-scoring.adapter.ts` (modify ~15 lines)
**Parallel?**: Yes — can be developed alongside T044.

---

### Subtask T048 – Model versioning and hot-reload

**Purpose**: Support updating the classic model without restarting the ML service container.

**Steps**:

1. Follow existing hot-reload pattern from stage-race models:
   - Model directory: `ml/models/classics/`
   - Metadata file: `ml/models/classics/metadata.json` with `version` field
   - On predict: check if metadata version changed → reload model
2. Add to `predict_classics.py`:

   ```python
   _model_version = None

   def _check_reload():
       global _model, _metadata, _model_version
       with open(f'{MODEL_DIR}/metadata.json') as f:
           meta = json.load(f)
       if meta.get('version') != _model_version:
           _model = joblib.load(f'{MODEL_DIR}/model.joblib')
           _metadata = meta
           _model_version = meta.get('version')
           logger.info("Classic model reloaded", version=_model_version)
   ```

3. Update `train_classics.py` to increment version in metadata on each training run
4. This enables weekly retraining (`make retrain`) to update classic model without restart

**Files**: `ml/src/predict_classics.py` (modify ~15 lines), `ml/src/train_classics.py` (modify ~5 lines)

**Validation**:

- [ ] Classic race request to ML service returns 200 with predictions (not 404)
- [ ] Response includes per-rider predicted scores sorted by score descending
- [ ] Response format is consistent with stage-race responses (gc/stage/mountain/sprint)
- [ ] Stage-race predictions are completely unaffected
- [ ] Model hot-reload works (change model file → next prediction uses new model)
- [ ] API adapter correctly maps classic ML response to domain model

---

## Risks & Mitigations

- **Risk**: Integration breaks stage-race predictions. **Mitigation**: Only 3 existing files touched with minimal changes; add integration test.
- **Risk**: Model file missing in production. **Mitigation**: Graceful fallback to rules-based scoring if model file not found.
- **Risk**: Feature extraction at prediction time is slow. **Mitigation**: Cache rider history; classic startlists are small (~150-200 riders).
- **Risk**: Memory increase from loading additional model. **Mitigation**: Classic model is small (~5MB); lazy loading prevents impact on startup.

## Review Guidance

- Verify predict_sources.py change is minimal (only the classic branch)
- Check that app.py 404 removal doesn't break error handling for other cases
- Confirm adapter.ts handles both classic and stage-race responses correctly
- Verify model hot-reload pattern matches existing stage-race convention
- Test that ML service still returns 404 for truly unsupported request types

## Activity Log

- 2026-04-02T16:48:30Z – system – lane=planned – Prompt created.
