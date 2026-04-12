"""
Cycling ML Service — FastAPI application.

Serves on-demand source-by-source predictions for stage races via POST /predict,
with model loading at startup, lazy data caching, and hot-reload
when models are retrained.

Response includes per-rider breakdown: {gc, stage, mountain, sprint}.

Internal service only — called by the TypeScript API on the Docker
internal network, never exposed to the internet.
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from datetime import date

import numpy as np
import pandas as pd
import psycopg2
import structlog
from asgi_correlation_id import CorrelationIdMiddleware, correlation_id
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from ..data.loader import get_race_info, load_data, load_startlist_for_race
from ..features.stage_race import FEATURE_COLS, extract_features_for_race
from .logging_config import configure_logging
from .model_version import get_model_version
from ..prediction.stage_races import load_source_models, predict_race_sources
from ..prediction.supply_estimation import build_supply_history
from .telemetry import setup_telemetry

configure_logging()
logger = structlog.get_logger(__name__)

# ── Configuration ────────────────────────────────────────────────────

MODEL_DIR = os.environ.get(
    'MODEL_DIR',
    os.path.join(os.path.dirname(__file__), '..', '..', 'models'),
)

DB_URL = os.environ.get(
    'DATABASE_URL',
    'postgresql://cycling:cycling@localhost:5432/cycling_analyzer',
)

CACHE_DIR = os.environ.get(
    'CACHE_DIR',
    os.path.join(os.path.dirname(__file__), '..', '..', 'cache'),
)


# ── Lifespan ─────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load models into memory at startup.

    Data is loaded lazily on the first /predict request to avoid long
    startup times and to allow the service to start even when the
    database is temporarily unavailable.
    """
    source_models = load_source_models(MODEL_DIR)
    app.state.models = source_models
    app.state.model_version = get_model_version(MODEL_DIR)
    app.state.model_dir = MODEL_DIR
    app.state.data_cache = None  # Lazy-loaded on first predict

    if source_models:
        loaded = [k for k in source_models if k != "metadata"]
        version = source_models["metadata"].get("model_version", "?")
        logger.info(
            "Models loaded",
            models=loaded,
            version=version,
            model_dir=os.path.abspath(MODEL_DIR),
        )
    else:
        loaded = []
        version = None
        logger.warning(
            "No source models found at startup",
            model_dir=os.path.abspath(MODEL_DIR),
        )

    logger.info("Startup complete", source_models=loaded, version=version)
    yield


app = FastAPI(title="Cycling ML Service", lifespan=lifespan)

# Correlation ID: reads x-correlation-id from NestJS API, exposes via correlation_id.get()
app.add_middleware(CorrelationIdMiddleware, header_name="x-correlation-id")

# OpenTelemetry instrumentation
setup_telemetry(app)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Catch-all for unhandled exceptions — log structured error, return 500."""
    logger.exception(
        "Unhandled exception",
        path=request.url.path,
        method=request.method,
        exc_info=exc,
    )
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Internal server error",
            "correlation_id": correlation_id.get() or None,
        },
    )


# ── Request model ────────────────────────────────────────────────────

class ProfileSummary(BaseModel):
    """Race stage profile counts — mirrors the TypeScript ProfileSummary."""
    p1: int = 0
    p2: int = 0
    p3: int = 0
    p4: int = 0
    p5: int = 0
    itt: int = 0
    ttt: int = 0

    def to_race_profile(self) -> dict:
        total = self.p1 + self.p2 + self.p3 + self.p4 + self.p5
        if total == 0:
            return {'target_flat_pct': 0.0, 'target_mountain_pct': 0.0, 'target_itt_pct': 0.0}
        return {
            'target_flat_pct': (self.p1 + self.p2) / total,
            'target_mountain_pct': (self.p4 + self.p5) / total,
            'target_itt_pct': self.itt / total,
        }

    def to_stage_counts(self) -> dict[str, int]:
        return {
            'flat': self.p1 + self.p2,
            'hilly': self.p3,
            'mountain': self.p4 + self.p5,
            'itt': self.itt,
        }

    def total_stages(self) -> int:
        return self.p1 + self.p2 + self.p3 + self.p4 + self.p5 + self.itt + self.ttt


class PredictRequest(BaseModel):
    race_slug: str
    year: int
    profile_summary: ProfileSummary | None = None
    rider_ids: list[str] | None = None
    race_type: str | None = None


# ── Model hot-reload ─────────────────────────────────────────────────

def maybe_reload_models(app_state) -> None:
    """Check model_version.txt and reload all source models if version changed."""
    current = get_model_version(app_state.model_dir)
    if current and current != app_state.model_version:
        logger.info(
            "Model version changed — reloading all source models",
            old_version=app_state.model_version, new_version=current,
            model_dir=os.path.abspath(app_state.model_dir),
        )
        app_state.models = load_source_models(app_state.model_dir)
        app_state.model_version = current
        app_state.data_cache = None  # Invalidate cached DataFrames
        loaded = [k for k in app_state.models if k != "metadata"] if app_state.models else []
        logger.info(
            "Models reloaded",
            models=loaded,
            version=current,
            model_dir=os.path.abspath(app_state.model_dir),
        )


# ── Cache functions ──────────────────────────────────────────────────

def check_cache(
    db_url: str, race_slug: str, year: int, model_version: str,
) -> list[dict] | None:
    """Check ml_scores for cached predictions with breakdown."""
    try:
        conn = psycopg2.connect(db_url)
        cur = conn.cursor()

        # Try to read breakdown columns — graceful if they don't exist yet
        try:
            cur.execute(
                """
                SELECT rider_id::text, predicted_score,
                       COALESCE(gc_pts, 0), COALESCE(stage_pts, 0),
                       COALESCE(mountain_pts, 0), COALESCE(sprint_pts, 0)
                FROM ml_scores
                WHERE race_slug = %s AND year = %s AND model_version = %s
                """,
                (race_slug, year, model_version),
            )
        except Exception:
            # Fallback if breakdown columns don't exist yet
            conn.rollback()
            cur.execute(
                """
                SELECT rider_id::text, predicted_score
                FROM ml_scores
                WHERE race_slug = %s AND year = %s AND model_version = %s
                """,
                (race_slug, year, model_version),
            )

        rows = cur.fetchall()
        if not rows:
            cur.close()
            conn.close()
            return None

        # Validate startlist hasn't changed
        cur.execute(
            "SELECT rider_id::text FROM startlist_entries WHERE race_slug = %s AND year = %s",
            (race_slug, year),
        )
        startlist_ids = {row[0] for row in cur.fetchall()}
        cached_ids = {row[0] for row in rows}
        cur.close()
        conn.close()

        if startlist_ids and cached_ids != startlist_ids:
            logger.info("Startlist changed — cache invalidated", race_slug=race_slug, year=year)
            return None

        # Check if we have breakdown data
        has_breakdown = len(rows[0]) > 2

        if has_breakdown:
            # Only return cache if breakdown values are non-zero (not stale old format)
            has_nonzero_breakdown = any(
                row[2] > 0 or row[3] > 0 or row[4] > 0 or row[5] > 0
                for row in rows
            )
            if not has_nonzero_breakdown:
                return None  # Stale cache without breakdown — re-predict

            return [
                {
                    'rider_id': row[0],
                    'predicted_score': row[1],
                    'breakdown': {
                        'gc': row[2], 'stage': row[3],
                        'mountain': row[4], 'sprint': row[5],
                    },
                }
                for row in rows
            ]
        else:
            return None  # Old format without breakdown — re-predict

    except Exception:
        logger.exception("Cache check failed")
        return None


def write_cache(
    db_url: str, predictions: list[dict],
    race_slug: str, year: int, model_version: str,
) -> None:
    """Write predictions with breakdown to ml_scores cache."""
    try:
        conn = psycopg2.connect(db_url)
        cur = conn.cursor()

        for pred in predictions:
            breakdown = pred.get('breakdown', {})
            try:
                cur.execute(
                    """
                    INSERT INTO ml_scores
                        (rider_id, race_slug, year, predicted_score, model_version,
                         gc_pts, stage_pts, mountain_pts, sprint_pts)
                    VALUES (%s::uuid, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT ON CONSTRAINT ml_scores_unique DO NOTHING
                    """,
                    (
                        pred['rider_id'], race_slug, year,
                        pred['predicted_score'], model_version,
                        breakdown.get('gc', 0), breakdown.get('stage', 0),
                        breakdown.get('mountain', 0), breakdown.get('sprint', 0),
                    ),
                )
            except Exception:
                # Fallback if breakdown columns don't exist yet
                conn.rollback()
                cur.execute(
                    """
                    INSERT INTO ml_scores
                        (rider_id, race_slug, year, predicted_score, model_version)
                    VALUES (%s::uuid, %s, %s, %s, %s)
                    ON CONFLICT ON CONSTRAINT ml_scores_unique DO NOTHING
                    """,
                    (pred['rider_id'], race_slug, year,
                     pred['predicted_score'], model_version),
                )

        conn.commit()
        cur.close()
        conn.close()
        logger.info("Cached predictions", count=len(predictions), race_slug=race_slug, year=year)
    except Exception:
        logger.exception("Cache write failed")


# ── Endpoints ────────────────────────────────────────────────────────

@app.get("/health")
def health(request: Request):
    """Health check — returns model status, version, and loaded models."""
    models = request.app.state.models
    version = request.app.state.model_version
    if models:
        loaded = [k for k in models if k != "metadata"]
        status = "healthy"
    else:
        loaded = []
        status = "no_model"
    return {"status": status, "model_version": version, "models_loaded": loaded}


@app.post("/predict")
def predict(req: PredictRequest, request: Request):
    """Source-by-source prediction with 4-source breakdown.

    Flow:
        1. Verify source models are loaded (503 if not).
        2. Hot-reload if version changed.
        3. Check cache — return on hit (with breakdown).
        4. Cache miss: load data, extract features, run source predictions.
        5. Write predictions + breakdown to cache.
        6. Return predictions with breakdown.
    """
    state = request.app.state

    # 1. Check models loaded
    if not state.models:
        logger.error(
            "No source models loaded",
            race_slug=req.race_slug,
            year=req.year,
            model_dir=os.path.abspath(MODEL_DIR),
        )
        raise HTTPException(
            status_code=503,
            detail="No source models loaded. Run make retrain first.",
        )

    # 2. Hot-reload
    maybe_reload_models(state)
    model_version = state.model_version

    # 3. No cache in ML service — NestJS handles caching via ml_scores table.
    #    ML service is stateless: always compute fresh predictions.

    # 4. Load data lazily
    if state.data_cache is None:
        logger.info("Loading data from database (first request)...")
        results_df, startlists_df = load_data(DB_URL)
        # Build supply history from cached features
        supply_hist = _load_supply_history()
        # Load GT completion rates for sprint heuristic
        completion = _load_completion_rates()
        # Load 2-year sprint classification pedigree
        sprint_ped = _load_sprint_pedigree()
        state.data_cache = (results_df, startlists_df, supply_hist, completion, sprint_ped)
    else:
        results_df, startlists_df, supply_hist, completion, sprint_ped = state.data_cache

    # Refresh the startlist for the requested race on-demand.
    # The cached `startlists_df` is a snapshot taken at the first request and is
    # never invalidated afterwards, so freshly-scraped startlists (e.g. the API
    # persists a new startlist for an upcoming race right before this call) are
    # invisible to predictions. Query the DB for this specific (race_slug, year)
    # and merge it into the cached DataFrame if we don't already have it.
    has_startlist = not startlists_df[
        (startlists_df["race_slug"] == req.race_slug)
        & (startlists_df["year"] == req.year)
    ].empty
    if not has_startlist:
        fresh_sl = load_startlist_for_race(DB_URL, req.race_slug, req.year)
        if not fresh_sl.empty:
            logger.info(
                "Loaded fresh startlist for race not in cache",
                race_slug=req.race_slug,
                year=req.year,
                rider_count=len(fresh_sl),
            )
            startlists_df = pd.concat([startlists_df, fresh_sl], ignore_index=True)
            # Persist back into the cache so subsequent requests for the same
            # race don't re-query the DB.
            state.data_cache = (
                results_df,
                startlists_df,
                supply_hist,
                completion,
                sprint_ped,
            )

    # Get race info — always use today as cutoff so predictions reflect
    # the latest available data (treat every race as "future").
    race_info = get_race_info(DB_URL, req.race_slug, req.year)
    race_date = date.today()

    if race_info is None:
        if req.race_type:
            race_type = req.race_type
            logger.info(
                "Race not found in DB — using race_type from request",
                race_slug=req.race_slug,
                year=req.year,
                race_type=race_type,
            )
        else:
            logger.warning(
                "Race not found in DB and no race_type fallback provided",
                race_slug=req.race_slug,
                year=req.year,
            )
            raise HTTPException(
                status_code=404,
                detail=f"Race not found: {req.race_slug}/{req.year}",
            )
    else:
        race_type = race_info['race_type']
    logger.info("Predicting", race_slug=req.race_slug, year=req.year, race_type=race_type, cutoff=str(race_date))

    if race_type == 'classic':
        from ..prediction.classics import is_model_available, predict_classic_race
        if not is_model_available():
            logger.error(
                "Classic model not available",
                race_slug=req.race_slug,
                year=req.year,
            )
            raise HTTPException(
                status_code=404,
                detail=f"Classic model not available for {req.race_slug}",
            )
        predictions = predict_classic_race(
            race_slug=req.race_slug,
            year=req.year,
            race_date=race_date,
            results_df=results_df,
            startlists_df=startlists_df,
            rider_ids=req.rider_ids,
        )
        if not predictions:
            logger.error(
                "No predictions produced for classic race",
                race_slug=req.race_slug,
                year=req.year,
                rider_count=len(req.rider_ids) if req.rider_ids else None,
            )
            raise HTTPException(
                status_code=404,
                detail=f"No predictions for classic {req.race_slug}/{req.year}",
            )
        return {"predictions": predictions, "model_version": "classics-v1", "cached": False}

    # Extract features using existing pipeline
    effective_startlists = startlists_df
    if req.rider_ids:
        synthetic = pd.DataFrame({
            'race_slug': req.race_slug,
            'year': req.year,
            'rider_id': req.rider_ids,
            'team_name': 'unknown',
        })
        effective_startlists = pd.concat([startlists_df, synthetic], ignore_index=True)

    race_profile = req.profile_summary.to_race_profile() if req.profile_summary else None
    features_df = extract_features_for_race(
        results_df=results_df,
        startlists_df=effective_startlists,
        race_slug=req.race_slug,
        race_year=req.year,
        race_type=race_type,
        race_date=race_date,
        race_profile=race_profile,
    )

    if features_df.empty:
        logger.warning(
            "Empty features — no startlist or rider data for race",
            race_slug=req.race_slug,
            year=req.year,
            race_type=race_type,
            rider_count=len(req.rider_ids) if req.rider_ids else None,
        )
        raise HTTPException(
            status_code=404,
            detail=f"No features for {req.race_slug}/{req.year} (no startlist?)",
        )

    # Enrich with Glicko ratings (gc_mu, gc_rd, stage_mu, stage_rd, gc_mu_delta_12m)
    features_df = _enrich_with_glicko(features_df, race_date)

    # Also load stage features for this race's riders
    features_df = _enrich_with_stage_features(features_df)

    # Classification history (sprint/mountain 24m repeat-performer signal)
    features_df = _enrich_with_classification_history(features_df, race_date)

    # Stage counts
    if req.profile_summary:
        stage_counts = req.profile_summary.to_stage_counts()
        n_stages = req.profile_summary.total_stages()
    else:
        # Estimate from race profile
        n_stages = 21 if race_type == "grand_tour" else 7
        flat_pct = features_df["target_flat_pct"].iloc[0] if "target_flat_pct" in features_df.columns else 0.4
        mtn_pct = features_df["target_mountain_pct"].iloc[0] if "target_mountain_pct" in features_df.columns else 0.3
        itt_pct = features_df["target_itt_pct"].iloc[0] if "target_itt_pct" in features_df.columns else 0.1
        stage_counts = {
            "flat": round(flat_pct * n_stages),
            "mountain": round(mtn_pct * n_stages),
            "itt": round(itt_pct * n_stages),
            "hilly": n_stages - round(flat_pct * n_stages) - round(mtn_pct * n_stages) - round(itt_pct * n_stages),
        }

    # 5. Run source-by-source prediction
    predictions = predict_race_sources(
        race_slug=req.race_slug,
        year=req.year,
        models=state.models,
        features_df=features_df,
        race_type=race_type,
        n_stages=n_stages,
        stage_counts=stage_counts,
        supply_history=supply_hist,
        completion_rates=completion,
        sprint_pedigree=sprint_ped,
    )

    if not predictions:
        logger.error(
            "Prediction failed — predict_race_sources returned no results",
            race_slug=req.race_slug,
            year=req.year,
            race_type=race_type,
            rider_count=len(features_df),
        )
        raise HTTPException(
            status_code=404,
            detail=f"Prediction failed for {req.race_slug}/{req.year}",
        )

    # 6. Return (no write_cache — NestJS handles caching via ml_scores table)
    return {"predictions": predictions, "model_version": model_version, "cached": False}


# ── Helper functions ─────────────────────────────────────────────────

def _load_supply_history() -> pd.DataFrame | None:
    """Load supply history from cached feature files."""
    try:
        cache_dfs = []
        for yr in range(2019, 2027):
            path = os.path.join(CACHE_DIR, f"features_{yr}.parquet")
            if os.path.isfile(path):
                cache_dfs.append(pd.read_parquet(path))
        if cache_dfs:
            return build_supply_history(cache_dfs)
    except Exception:
        logger.exception("Failed to load supply history")
    return None


def _load_sprint_pedigree() -> dict[str, float]:
    """Load 2-year sprint classification pedigree per rider.

    Weighted count of sprint classification top finishes: GT top-5
    finishes count triple (winning a green jersey is elite-level
    evidence), mini-tour top-3 count single.
    """
    try:
        conn = psycopg2.connect(DB_URL)
        cur = conn.cursor()
        cur.execute("""
            SELECT rider_id,
                   SUM(CASE WHEN race_type = 'grand_tour' THEN 3 ELSE 1 END) as score
            FROM race_results
            WHERE category = 'sprint'
              AND position > 0
              AND race_date IS NOT NULL
              AND race_date >= CURRENT_DATE - INTERVAL '2 years'
              AND (
                  (race_type = 'grand_tour' AND position <= 5)
                  OR (race_type = 'mini_tour' AND position <= 3)
              )
            GROUP BY rider_id
        """)
        pedigree = {str(row[0]): float(row[1]) for row in cur.fetchall()}
        cur.close()
        conn.close()
        logger.info("Loaded sprint pedigree", rider_count=len(pedigree))
        return pedigree
    except Exception:
        logger.exception("Failed to load sprint pedigree")
        return {}


def _load_completion_rates() -> dict[str, float]:
    """Load GT completion rates from database with Bayesian shrinkage.

    Raw completion rates are unreliable for riders with few GTs (e.g.,
    2/2 = 100% says nothing). Shrink toward a prior so small samples
    don't dominate the survival bonus in sprint predictions.
    """
    # Bayesian prior: equivalent to 3 GTs at 70% completion
    PRIOR_N = 3
    PRIOR_RATE = 0.7

    try:
        conn = psycopg2.connect(DB_URL)
        cur = conn.cursor()
        cur.execute("""
            SELECT rider_id,
                   AVG(CASE WHEN last_stage >= total_stages * 0.95 THEN 1.0 ELSE 0.0 END) as rate,
                   COUNT(*) as n_gts
            FROM (
                SELECT rider_id, race_slug, year,
                       MAX(stage_number) as last_stage,
                       (SELECT COUNT(DISTINCT rr2.stage_number)
                        FROM race_results rr2
                        WHERE rr2.race_slug = rr.race_slug AND rr2.year = rr.year
                          AND rr2.category = 'stage') as total_stages
                FROM race_results rr
                WHERE race_type = 'grand_tour' AND category = 'stage'
                  AND race_date IS NOT NULL
                GROUP BY rider_id, race_slug, year
            ) sub
            GROUP BY rider_id
        """)
        rates = {}
        for row in cur.fetchall():
            rid, raw_rate, n_gts = str(row[0]), float(row[1]), int(row[2])
            rates[rid] = (n_gts * raw_rate + PRIOR_N * PRIOR_RATE) / (n_gts + PRIOR_N)
        cur.close()
        conn.close()
        return rates
    except Exception:
        logger.exception("Failed to load completion rates")
        return {}


_GLICKO_COLS = [
    "gc_mu", "gc_rd", "stage_mu", "stage_rd",
    "stage_flat_mu", "stage_flat_rd",
    "stage_hilly_mu", "stage_hilly_rd",
    "stage_mountain_mu", "stage_mountain_rd",
    "stage_itt_mu", "stage_itt_rd",
]


def _glicko_default(col: str) -> float:
    if "mu" in col:
        return 1500.0
    if "rd" in col:
        return 350.0
    return 0.0


def _enrich_with_glicko(features_df: pd.DataFrame, race_date) -> pd.DataFrame:
    """Add Glicko-2 ratings for each rider (unified + 4-track split)."""
    all_cols = _GLICKO_COLS + ["gc_mu_delta_12m"]
    try:
        conn = psycopg2.connect(DB_URL)
        cur = conn.cursor()
        cur.execute("""
            SELECT rider_id, race_date, gc_mu, gc_rd, stage_mu, stage_rd,
                   stage_flat_mu, stage_flat_rd,
                   stage_hilly_mu, stage_hilly_rd,
                   stage_mountain_mu, stage_mountain_rd,
                   stage_itt_mu, stage_itt_rd
            FROM rider_ratings
            ORDER BY race_date
        """)
        cols = [d[0] for d in cur.description]
        rows = cur.fetchall()
        cur.close()
        conn.close()

        if not rows:
            for col in all_cols:
                if col not in features_df.columns:
                    features_df[col] = _glicko_default(col)
            return features_df

        ratings_df = pd.DataFrame(rows, columns=cols)
        ratings_df["race_date"] = pd.to_datetime(ratings_df["race_date"])
        race_dt = pd.Timestamp(race_date)
        cutoff_12m = race_dt - pd.Timedelta(days=365)

        glicko_data = []
        for rider_id in features_df["rider_id"].unique():
            rider_ratings = ratings_df[
                (ratings_df["rider_id"] == rider_id) &
                (ratings_df["race_date"] < race_dt)
            ]
            if len(rider_ratings) == 0:
                entry = {"rider_id": rider_id, "gc_mu_delta_12m": 0.0}
                for col in _GLICKO_COLS:
                    entry[col] = _glicko_default(col)
                glicko_data.append(entry)
            else:
                latest = rider_ratings.iloc[-1]
                older = rider_ratings[rider_ratings["race_date"] <= cutoff_12m]
                gc_mu_12m_ago = older.iloc[-1]["gc_mu"] if len(older) > 0 else 1500.0
                entry = {
                    "rider_id": rider_id,
                    "gc_mu_delta_12m": latest["gc_mu"] - gc_mu_12m_ago,
                }
                for col in _GLICKO_COLS:
                    entry[col] = latest.get(col, _glicko_default(col))
                glicko_data.append(entry)

        glicko_df = pd.DataFrame(glicko_data)

        # Drop existing glicko columns if any, then merge
        drop_cols = [c for c in all_cols if c in features_df.columns]
        if drop_cols:
            features_df = features_df.drop(columns=drop_cols)
        features_df = features_df.merge(glicko_df, on="rider_id", how="left")

        # Fill defaults
        for col in all_cols:
            features_df[col] = features_df[col].fillna(_glicko_default(col))

        return features_df
    except Exception:
        logger.exception("Failed to enrich with Glicko ratings")
        for col in all_cols:
            if col not in features_df.columns:
                features_df[col] = _glicko_default(col)
        return features_df


def _enrich_with_classification_history(features_df: pd.DataFrame, race_date) -> pd.DataFrame:
    """Add sprint/mountain classification history features (24m window)."""
    try:
        conn = psycopg2.connect(DB_URL)
        cur = conn.cursor()
        race_dt = pd.Timestamp(race_date)
        cutoff_24m = race_dt - pd.Timedelta(days=730)

        from ..domain.points import FINAL_CLASS_GT, FINAL_CLASS_MINI

        cur.execute("""
            SELECT rr.rider_id, rr.category, rr.race_type, rr.position, rr.race_date
            FROM race_results rr
            WHERE rr.category IN ('mountain', 'sprint')
              AND rr.race_type IN ('grand_tour', 'mini_tour')
              AND rr.position > 0 AND rr.race_date IS NOT NULL
              AND rr.race_date >= %s AND rr.race_date < %s
        """, (cutoff_24m.date(), race_dt.date()))
        rows = cur.fetchall()
        cur.close()
        conn.close()

        if not rows:
            for col in ["sprint_cls_pts_24m", "sprint_cls_top3_count_24m", "sprint_cls_best_pos_24m"]:
                features_df[col] = 0.0 if "pts" in col or "count" in col else 99.0
            return features_df

        hist = pd.DataFrame(rows, columns=["rider_id", "category", "race_type", "position", "race_date"])

        cls_data = []
        for rider_id in features_df["rider_id"].unique():
            rh = hist[hist["rider_id"] == rider_id]
            entry = {"rider_id": rider_id}
            for cls_type in ["sprint", "mountain"]:
                ch = rh[rh["category"] == cls_type]
                if len(ch) == 0:
                    entry[f"{cls_type}_cls_pts_24m"] = 0.0
                    entry[f"{cls_type}_cls_top3_count_24m"] = 0
                    entry[f"{cls_type}_cls_best_pos_24m"] = 99.0
                else:
                    pts = ch.apply(
                        lambda r: float(
                            (FINAL_CLASS_GT if r["race_type"] == "grand_tour" else FINAL_CLASS_MINI)
                            .get(int(r["position"]), 0)
                        ), axis=1,
                    ).sum()
                    entry[f"{cls_type}_cls_pts_24m"] = pts
                    entry[f"{cls_type}_cls_top3_count_24m"] = int((ch["position"] <= 3).sum())
                    entry[f"{cls_type}_cls_best_pos_24m"] = float(ch["position"].min())
            cls_data.append(entry)

        cls_df = pd.DataFrame(cls_data)
        drop_cols = [c for c in cls_df.columns if c != "rider_id" and c in features_df.columns]
        if drop_cols:
            features_df = features_df.drop(columns=drop_cols)
        features_df = features_df.merge(cls_df, on="rider_id", how="left")

        for col in cls_df.columns:
            if col == "rider_id":
                continue
            default = 99.0 if "best_pos" in col else 0.0
            features_df[col] = features_df[col].fillna(default)

        return features_df
    except Exception:
        logger.exception("Failed to enrich with classification history")
        for col in ["sprint_cls_pts_24m", "sprint_cls_top3_count_24m", "sprint_cls_best_pos_24m"]:
            if col not in features_df.columns:
                features_df[col] = 0.0 if "pts" in col or "count" in col else 99.0
        return features_df


def _enrich_with_stage_features(features_df: pd.DataFrame) -> pd.DataFrame:
    """Add stage-specific features, always computed on-demand with cutoff=today.

    Every prediction is treated as a fresh/future race: stage features are
    computed from the rider's history up to today, not from the training cache.
    """
    year_col = "race_year" if "race_year" in features_df.columns else "year"
    if year_col == "race_year":
        features_df = features_df.rename(columns={"race_year": "year"})

    try:
        from ..features.stage_type import compute_stage_features_ondemand
        rider_ids = features_df["rider_id"].tolist()
        ondemand = compute_stage_features_ondemand(rider_ids, date.today(), DB_URL)
        merged = features_df.merge(ondemand, on="rider_id", how="left")
        stage_cols = [c for c in ondemand.columns if c != "rider_id"]
        merged[stage_cols] = merged[stage_cols].fillna(0)
        return merged
    except Exception:
        logger.exception("Failed to compute stage features on-demand")
        return features_df
