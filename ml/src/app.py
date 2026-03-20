"""
Cycling ML Service — FastAPI application.

Serves on-demand predictions for stage races via POST /predict,
with model loading at startup, lazy data caching, and hot-reload
when models are retrained.

Internal service only — called by the TypeScript API on the Docker
internal network, never exposed to the internet.
"""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

import psycopg2
from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel

from .data import load_data
from .predict import get_model_version, load_models, predict_race

logger = logging.getLogger(__name__)

# ── Configuration ────────────────────────────────────────────────────

MODEL_DIR = os.environ.get(
    'MODEL_DIR',
    os.path.join(os.path.dirname(__file__), '..', 'models'),
)

DB_URL = os.environ.get(
    'DATABASE_URL',
    'postgresql://cycling:cycling@localhost:5432/cycling_analyzer',
)


# ── Lifespan (T015) ─────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load models into memory at startup.

    Data (results_df, startlists_df) is loaded lazily on the first
    /predict request to avoid long startup times and to allow the
    service to start even when the database is temporarily unavailable.
    """
    app.state.models = load_models(MODEL_DIR)
    app.state.model_version = get_model_version(MODEL_DIR)
    app.state.model_dir = MODEL_DIR
    app.state.data_cache = None  # Lazy-loaded on first predict
    logger.info(
        "Startup complete — models=%s, version=%s",
        list(app.state.models.keys()) if app.state.models else [],
        app.state.model_version,
    )
    yield


app = FastAPI(title="Cycling ML Service", lifespan=lifespan)


# ── Request model ────────────────────────────────────────────────────

class PredictRequest(BaseModel):
    race_slug: str
    year: int


# ── Model hot-reload (T018) ─────────────────────────────────────────

def maybe_reload_models(app_state) -> None:
    """Check model_version.txt and reload models if version has changed.

    Called on each /predict request. Reading one small file (~0.1 ms)
    is negligible overhead compared to feature extraction.

    Educational note: hot-reload avoids container restarts after
    `make retrain`. The version file acts as a cheap invalidation
    signal — a common pattern in ML serving (similar to how
    TensorFlow Serving watches model directories).
    """
    current = get_model_version(app_state.model_dir)
    if current and current != app_state.model_version:
        logger.info(
            "Model version changed: %s -> %s — reloading",
            app_state.model_version, current,
        )
        app_state.models = load_models(app_state.model_dir)
        app_state.model_version = current
        app_state.data_cache = None  # Invalidate cached DataFrames


# ── Cache functions (psycopg2 raw SQL) ───────────────────────────────

def check_cache(
    db_url: str,
    race_slug: str,
    year: int,
    model_version: str,
) -> list[dict] | None:
    """Check ml_scores for cached predictions.

    Args:
        db_url: PostgreSQL connection string.
        race_slug: Race identifier.
        year: Race year.
        model_version: Current model version string.

    Returns:
        List of {rider_id, predicted_score} dicts if cached, else None.
    """
    try:
        conn = psycopg2.connect(db_url)
        cur = conn.cursor()
        cur.execute(
            """
            SELECT rider_id::text, predicted_score
            FROM ml_scores
            WHERE race_slug = %s AND year = %s AND model_version = %s
            """,
            (race_slug, year, model_version),
        )
        rows = cur.fetchall()
        cur.close()
        conn.close()
    except Exception:
        logger.exception("Cache check failed")
        return None

    if not rows:
        return None

    return [
        {'rider_id': row[0], 'predicted_score': row[1]}
        for row in rows
    ]


def write_cache(
    db_url: str,
    predictions: list[dict],
    race_slug: str,
    year: int,
    model_version: str,
) -> None:
    """Write predictions to the ml_scores cache table.

    Uses INSERT ... ON CONFLICT DO NOTHING to handle concurrent
    requests for the same race gracefully — the UNIQUE constraint
    on (rider_id, race_slug, year, model_version) prevents duplicates.

    Args:
        db_url: PostgreSQL connection string.
        predictions: List of {rider_id, predicted_score} dicts.
        race_slug: Race identifier.
        year: Race year.
        model_version: Current model version string.
    """
    try:
        conn = psycopg2.connect(db_url)
        cur = conn.cursor()
        for pred in predictions:
            cur.execute(
                """
                INSERT INTO ml_scores (rider_id, race_slug, year, predicted_score, model_version)
                VALUES (%s::uuid, %s, %s, %s, %s)
                ON CONFLICT ON CONSTRAINT ml_scores_unique DO NOTHING
                """,
                (
                    pred['rider_id'],
                    race_slug,
                    year,
                    pred['predicted_score'],
                    model_version,
                ),
            )
        conn.commit()
        cur.close()
        conn.close()
        logger.info(
            "Cached %d predictions for %s/%d (version=%s)",
            len(predictions), race_slug, year, model_version,
        )
    except Exception:
        logger.exception("Cache write failed")


# ── Endpoints ────────────────────────────────────────────────────────

@app.get("/health")
def health(request: Request):
    """Health check — returns model status, version, and loaded types (T016).

    Used by Dokploy health checks and by the TypeScript API to verify
    ML service availability before calling /predict.
    """
    models = request.app.state.models
    version = request.app.state.model_version
    loaded = list(models.keys()) if models else []
    status = "healthy" if loaded else "no_model"
    return {"status": status, "model_version": version, "models_loaded": loaded}


@app.post("/predict")
def predict(req: PredictRequest, request: Request):
    """On-demand prediction for a single race (T017).

    Flow:
        1. Verify models are loaded (503 if not).
        2. Hot-reload models if version changed (T018).
        3. Check ml_scores cache — return immediately on hit.
        4. Cache miss: load data (lazy, cached in app.state),
           extract features, run prediction.
        5. Write predictions to ml_scores cache.
        6. Return predictions + model_version + cached flag.
    """
    state = request.app.state

    # 1. Check models loaded
    if not state.models:
        raise HTTPException(
            status_code=503,
            detail="No models loaded. Run make retrain first.",
        )

    # 2. Hot-reload if model version changed
    maybe_reload_models(state)

    model_version = state.model_version

    # 3. Check cache
    cached = check_cache(DB_URL, req.race_slug, req.year, model_version)
    if cached:
        return {
            "predictions": cached,
            "model_version": model_version,
            "cached": True,
        }

    # 4. Load data lazily (expensive ~2-3s, cached after first call)
    if state.data_cache is None:
        logger.info("Loading data from database (first request)...")
        results_df, startlists_df = load_data(DB_URL)
        state.data_cache = (results_df, startlists_df)
    else:
        results_df, startlists_df = state.data_cache

    # 5. Extract features and predict
    predictions = predict_race(
        race_slug=req.race_slug,
        year=req.year,
        models=state.models,
        results_df=results_df,
        startlists_df=startlists_df,
        db_url=DB_URL,
    )

    if not predictions:
        raise HTTPException(
            status_code=404,
            detail=f"No startlist or not a stage race: {req.race_slug}",
        )

    # 6. Write cache
    write_cache(DB_URL, predictions, req.race_slug, req.year, model_version)

    return {
        "predictions": predictions,
        "model_version": model_version,
        "cached": False,
    }
