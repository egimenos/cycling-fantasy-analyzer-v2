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

import logging
import os
from contextlib import asynccontextmanager
from datetime import date

import numpy as np
import pandas as pd
import psycopg2
from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel

from .data import get_race_info, load_data
from .features import FEATURE_COLS, extract_features_for_race
from .predict import get_model_version
from .predict_sources import load_source_models, predict_race_sources
from .supply_estimation import build_supply_history

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

CACHE_DIR = os.environ.get(
    'CACHE_DIR',
    os.path.join(os.path.dirname(__file__), '..', 'cache'),
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
    else:
        loaded = []
        version = None

    logger.info("Startup complete — source models=%s, version=%s", loaded, version)
    yield


app = FastAPI(title="Cycling ML Service", lifespan=lifespan)


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
            "Model version changed: %s -> %s — reloading all source models",
            app_state.model_version, current,
        )
        app_state.models = load_source_models(app_state.model_dir)
        app_state.model_version = current
        app_state.data_cache = None  # Invalidate cached DataFrames


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
            logger.info("Startlist changed for %s/%d — cache invalidated", race_slug, year)
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
        logger.info("Cached %d predictions for %s/%d", len(predictions), race_slug, year)
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
        state.data_cache = (results_df, startlists_df, supply_hist, completion)
    else:
        results_df, startlists_df, supply_hist, completion = state.data_cache

    # Get race info — always use today as cutoff so predictions reflect
    # the latest available data (treat every race as "future").
    race_info = get_race_info(DB_URL, req.race_slug, req.year)
    race_date = date.today()

    if race_info is None:
        if req.race_type:
            race_type = req.race_type
        else:
            raise HTTPException(
                status_code=404,
                detail=f"Race not found: {req.race_slug}/{req.year}",
            )
    else:
        race_type = race_info['race_type']
    logger.info("Predicting %s/%d (type=%s) with cutoff=%s", req.race_slug, req.year, race_type, race_date)

    if race_type == 'classic':
        raise HTTPException(
            status_code=404,
            detail=f"Classic race — ML not supported: {req.race_slug}",
        )

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
        raise HTTPException(
            status_code=404,
            detail=f"No features for {req.race_slug}/{req.year} (no startlist?)",
        )

    # Enrich with Glicko ratings (gc_mu, gc_rd, stage_mu, stage_rd, gc_mu_delta_12m)
    features_df = _enrich_with_glicko(features_df, race_date)

    # Also load stage features for this race's riders
    features_df = _enrich_with_stage_features(features_df)

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
    )

    if not predictions:
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


def _enrich_with_glicko(features_df: pd.DataFrame, race_date) -> pd.DataFrame:
    """Add Glicko-2 ratings for each rider (gc_mu, gc_rd, stage_mu, stage_rd, gc_mu_delta_12m)."""
    try:
        conn = psycopg2.connect(DB_URL)
        cur = conn.cursor()
        cur.execute("""
            SELECT rider_id, race_date, gc_mu, gc_rd, stage_mu, stage_rd
            FROM rider_ratings
            ORDER BY race_date
        """)
        cols = [d[0] for d in cur.description]
        rows = cur.fetchall()
        cur.close()
        conn.close()

        if not rows:
            for col in ["gc_mu", "gc_rd", "stage_mu", "stage_rd", "gc_mu_delta_12m"]:
                if col not in features_df.columns:
                    features_df[col] = 1500.0 if "mu" in col else (350.0 if "rd" in col else 0.0)
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
                glicko_data.append({
                    "rider_id": rider_id,
                    "gc_mu": 1500.0, "gc_rd": 350.0,
                    "stage_mu": 1500.0, "stage_rd": 350.0,
                    "gc_mu_delta_12m": 0.0,
                })
            else:
                latest = rider_ratings.iloc[-1]
                older = rider_ratings[rider_ratings["race_date"] <= cutoff_12m]
                gc_mu_12m_ago = older.iloc[-1]["gc_mu"] if len(older) > 0 else 1500.0
                glicko_data.append({
                    "rider_id": rider_id,
                    "gc_mu": latest["gc_mu"],
                    "gc_rd": latest["gc_rd"],
                    "stage_mu": latest["stage_mu"],
                    "stage_rd": latest["stage_rd"],
                    "gc_mu_delta_12m": latest["gc_mu"] - gc_mu_12m_ago,
                })

        glicko_df = pd.DataFrame(glicko_data)

        # Drop existing glicko columns if any, then merge
        drop_cols = [c for c in ["gc_mu", "gc_rd", "stage_mu", "stage_rd", "gc_mu_delta_12m"]
                     if c in features_df.columns]
        if drop_cols:
            features_df = features_df.drop(columns=drop_cols)
        features_df = features_df.merge(glicko_df, on="rider_id", how="left")

        # Fill defaults
        features_df["gc_mu"] = features_df["gc_mu"].fillna(1500.0)
        features_df["gc_rd"] = features_df["gc_rd"].fillna(350.0)
        features_df["stage_mu"] = features_df["stage_mu"].fillna(1500.0)
        features_df["stage_rd"] = features_df["stage_rd"].fillna(350.0)
        features_df["gc_mu_delta_12m"] = features_df["gc_mu_delta_12m"].fillna(0.0)

        return features_df
    except Exception:
        logger.exception("Failed to enrich with Glicko ratings")
        for col in ["gc_mu", "gc_rd", "stage_mu", "stage_rd", "gc_mu_delta_12m"]:
            if col not in features_df.columns:
                features_df[col] = 1500.0 if "mu" in col else (350.0 if "rd" in col else 0.0)
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
        from .stage_features import compute_stage_features_ondemand
        rider_ids = features_df["rider_id"].tolist()
        ondemand = compute_stage_features_ondemand(rider_ids, date.today(), DB_URL)
        merged = features_df.merge(ondemand, on="rider_id", how="left")
        stage_cols = [c for c in ondemand.columns if c != "rider_id"]
        merged[stage_cols] = merged[stage_cols].fillna(0)
        return merged
    except Exception:
        logger.exception("Failed to compute stage features on-demand")
        return features_df
