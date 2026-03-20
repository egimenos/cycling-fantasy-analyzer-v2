---
work_package_id: WP03
title: FastAPI ML Service — /predict and /health
lane: planned
dependencies: [WP02]
subtasks:
  - T014
  - T015
  - T016
  - T017
  - T018
  - T019
phase: Phase 2 - ML Service
assignee: ''
agent: ''
shell_pid: ''
review_status: ''
reviewed_by: ''
history:
  - timestamp: '2026-03-20T16:27:36Z'
    lane: planned
    agent: system
    shell_pid: ''
    action: Prompt generated via /spec-kitty.tasks
requirement_refs:
  - FR-003
  - FR-004
  - FR-005
  - FR-012
  - FR-013
---

# Work Package Prompt: WP03 – FastAPI ML Service — /predict and /health

## ⚠️ IMPORTANT: Review Feedback Status

- **Has review feedback?**: Check `review_status` field above.

---

## Review Feedback

_[Empty initially.]_

---

## Implementation Command

```bash
spec-kitty implement WP03 --base WP02
```

---

## Objectives & Success Criteria

- FastAPI service starts with models loaded into memory (zero cold start for predictions)
- `GET /health` returns model status, version, and loaded model types
- `POST /predict` accepts `{race_slug, year}`, extracts features, predicts, writes cache to `ml_scores`, returns predictions
- Cache hit: subsequent requests for same race + model version skip prediction
- Model hot-reload: service detects new `model_version.txt` and reloads models

## Context & Constraints

- **Data model**: See `data-model.md` — ML service endpoints and response shapes
- **ML service is internal only**: Not exposed to internet. Only called by TypeScript API on Docker internal network.
- **DB access**: ML service connects directly to PostgreSQL for feature extraction and cache writes
- **Model directory**: `ml/models/` mounted as volume in docker-compose (set up in WP01)

## Subtasks & Detailed Guidance

### Subtask T014 – Create predict.py — single-race prediction logic

- **Purpose**: Core prediction function used by the /predict endpoint. Loads model, extracts features for one race, runs prediction.
- **Steps**:
  1. Create `ml/src/predict.py`
  2. Implement `predict_race(race_slug, year, models, results_df, startlists_df) -> list[dict]`:
     - Get race info (race_type, race_date) from results_df
     - If race_type is 'classic': return empty (classics not supported)
     - Call `extract_features_for_race()` from features.py
     - Select correct model: `models[race_type]`
     - Run `model.predict(X)` where X = features[FEATURE_COLS].fillna(0)
     - Return list of `{'rider_id': str, 'predicted_score': float}` for each rider
  3. Implement `load_models(model_dir) -> dict`:
     - Load `model_mini_tour.joblib` and `model_grand_tour.joblib`
     - Return dict: `{'mini_tour': model_mt, 'grand_tour': model_gt}`
     - Handle missing files gracefully (return partial dict or empty)
  4. Implement `get_model_version(model_dir) -> str | None`:
     - Read `model_version.txt`, return contents or None if missing
- **Files**: `ml/src/predict.py` (new, ~80 lines)

### Subtask T015 – Create app.py — FastAPI application with model loading

- **Purpose**: FastAPI application that loads models at startup and serves predictions.
- **Steps**:
  1. Replace the placeholder `ml/src/app.py` from WP01 with full implementation
  2. Use FastAPI lifespan for model loading:

     ```python
     from contextlib import asynccontextmanager
     from fastapi import FastAPI
     import os

     MODEL_DIR = os.environ.get('MODEL_DIR', os.path.join(os.path.dirname(__file__), '..', 'models'))

     @asynccontextmanager
     async def lifespan(app: FastAPI):
         # Load models at startup
         app.state.models = load_models(MODEL_DIR)
         app.state.model_version = get_model_version(MODEL_DIR)
         app.state.model_dir = MODEL_DIR
         yield

     app = FastAPI(title="Cycling ML Service", lifespan=lifespan)
     ```

  3. Store models in `app.state` for access in endpoint handlers
  4. Load data (results_df, startlists_df) either at startup or lazily on first request — trade-off: startup time vs first-request latency. Recommendation: load lazily and cache.

- **Files**: `ml/src/app.py` (rewrite, ~100 lines)
- **Notes**: Lazy data loading is preferred — avoids long startup time and allows service to start even if DB is temporarily unavailable

### Subtask T016 – Implement GET /health endpoint

- **Purpose**: Health check for the ML service. Used by Dokploy and by the TypeScript API to check availability.
- **Steps**:
  1. Implement in `app.py`:
     ```python
     @app.get("/health")
     def health():
         models = app.state.models
         version = app.state.model_version
         loaded = list(models.keys()) if models else []
         status = "healthy" if loaded else "no_model"
         return {"status": status, "model_version": version, "models_loaded": loaded}
     ```
  2. Response shape: `{ status: "healthy"|"no_model", model_version: string|null, models_loaded: string[] }`
- **Files**: `ml/src/app.py`
- **Parallel?**: Yes — can be implemented alongside T017

### Subtask T017 – Implement POST /predict endpoint with cache

- **Purpose**: Core endpoint. Receives race info, checks cache, extracts features, predicts, caches, returns.
- **Steps**:
  1. Define request model:
     ```python
     from pydantic import BaseModel
     class PredictRequest(BaseModel):
         race_slug: str
         year: int
     ```
  2. Implement endpoint flow:

     ```python
     @app.post("/predict")
     def predict(req: PredictRequest):
         models = app.state.models
         version = app.state.model_version
         if not models:
             raise HTTPException(503, "No models loaded. Run make retrain first.")

         db_url = os.environ.get('DATABASE_URL', '...')

         # Check cache
         cached = check_cache(db_url, req.race_slug, req.year, version)
         if cached:
             return {"predictions": cached, "model_version": version, "cached": True}

         # Load data and predict
         results_df, startlists_df = load_data(db_url)  # or use cached data
         predictions = predict_race(req.race_slug, req.year, models, results_df, startlists_df)

         if not predictions:
             raise HTTPException(404, f"No startlist or not a stage race: {req.race_slug}")

         # Write cache
         write_cache(db_url, predictions, req.race_slug, req.year, version)

         return {"predictions": predictions, "model_version": version, "cached": False}
     ```

  3. Implement `check_cache(db_url, race_slug, year, model_version)` — SELECT from ml_scores
  4. Implement `write_cache(db_url, predictions, race_slug, year, model_version)` — INSERT INTO ml_scores with ON CONFLICT DO NOTHING
  5. Cache functions use psycopg2 directly (matching the Drizzle-defined schema)

- **Files**: `ml/src/app.py`
- **Parallel?**: Yes — can be implemented alongside T016
- **Notes**: Data loading is expensive (~2-3s). Consider caching the loaded DataFrames in app.state after first request. Invalidate on model version change.

### Subtask T018 – Model version detection and hot-reload

- **Purpose**: After `make retrain` produces a new model, the service should detect and reload without manual restart.
- **Steps**:
  1. On each `/predict` request, check if `model_version.txt` has changed:
     ```python
     def maybe_reload_models():
         current = get_model_version(app.state.model_dir)
         if current != app.state.model_version:
             app.state.models = load_models(app.state.model_dir)
             app.state.model_version = current
             app.state.data_cache = None  # Invalidate data cache too
     ```
  2. Call `maybe_reload_models()` at the start of `/predict` handler
  3. This is a simple file read (~0.1ms) — negligible overhead per request
  4. Also invalidate any cached DataFrames since the model was retrained with potentially new data
- **Files**: `ml/src/app.py`
- **Notes**: Alternative is `make ml-restart` which restarts the container. Hot-reload is more convenient.

### Subtask T019 – Verify ML service end-to-end

- **Purpose**: Validate the complete ML service against real data.
- **Steps**:
  1. Ensure model is trained: `make retrain`
  2. Start ML service: `make ml-up` (or run locally with uvicorn)
  3. Check health: `curl http://localhost:8000/health` → should show "healthy" with models
  4. Predict: `curl -X POST http://localhost:8000/predict -H "Content-Type: application/json" -d '{"race_slug":"tour-de-suisse","year":2025}'`
  5. Verify response contains predictions array with rider_id and predicted_score
  6. Verify cache: same curl → response has `"cached": true`
  7. Check DB: `make db-psql` → `SELECT COUNT(*) FROM ml_scores WHERE race_slug='tour-de-suisse'`
- **Files**: No new files — validation step

## Risks & Mitigations

- **Data loading latency**: First /predict call loads all data (~2-3s). Mitigation: cache DataFrames in app.state after first load.
- **Concurrent requests**: Two /predict calls for same race simultaneously → both extract features → both try to cache → UNIQUE constraint + ON CONFLICT DO NOTHING handles this.
- **Memory**: Models (~10 MB) + DataFrames (~50 MB) in memory. Total ~60 MB — trivial.

## Review Guidance

- Verify /health response shape matches data-model.md
- Verify /predict caches results and returns from cache on second call
- Verify model hot-reload works: retrain → next predict uses new version
- Verify classic race type is rejected (not predicted)

## Activity Log

- 2026-03-20T16:27:36Z – system – lane=planned – Prompt created.
