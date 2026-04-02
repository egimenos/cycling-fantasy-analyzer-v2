"""
Classic race prediction — production pipeline.

Loads the trained classic model, extracts features on-demand for a
startlist, and returns per-rider predictions.

The response format mirrors stage-race predictions (gc/stage/mountain/sprint)
with stage/mountain/sprint always 0 for classics.
"""

from __future__ import annotations

import json
import logging
import os

import joblib
import numpy as np
import pandas as pd

from ..features.classics import compute_classic_features
from ..domain.points import GC_CLASSIC

logger = logging.getLogger(__name__)

MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "models", "classics")

TRANSFORMS = {
    "raw": (lambda y: y, lambda y: y),
    "sqrt": (lambda y: np.sqrt(np.maximum(y, 0)), lambda y: np.square(y)),
    "log1p": (lambda y: np.log1p(y), lambda y: np.expm1(y)),
}

# ── Model loading with hot-reload ────────────────────────────────────

_model = None
_metadata = None
_model_version = None


def _load_model():
    """Lazy-load model and metadata. Supports hot-reload via version check."""
    global _model, _metadata, _model_version

    meta_path = os.path.join(MODEL_DIR, "metadata.json")
    model_path = os.path.join(MODEL_DIR, "model.joblib")

    if not os.path.exists(meta_path) or not os.path.exists(model_path):
        return None, None

    with open(meta_path) as f:
        meta = json.load(f)

    current_version = meta.get("version", "unknown")
    if current_version != _model_version:
        _model = joblib.load(model_path)
        _metadata = meta
        _model_version = current_version
        logger.info("Classic model loaded", extra={"version": _model_version})

    return _model, _metadata


def is_model_available() -> bool:
    """Check if a trained classic model exists."""
    return os.path.exists(os.path.join(MODEL_DIR, "model.joblib"))


# ── Prediction ───────────────────────────────────────────────────────


def predict_classic_race(
    race_slug: str,
    year: int,
    race_date: pd.Timestamp,
    results_df: pd.DataFrame,
    rider_ids: list[str] | None = None,
) -> list[dict]:
    """Predict classic race scores for riders in the startlist.

    Args:
        race_slug: Classic race slug.
        year: Race year.
        race_date: Race date for feature cutoff.
        results_df: Full results DataFrame (all race types, with pts column).
        rider_ids: Optional filter to specific rider IDs.

    Returns:
        List of prediction dicts compatible with stage-race format:
        [{rider_id, predicted_score, breakdown: {gc, stage, mountain, sprint}}]
    """
    model, metadata = _load_model()
    if model is None:
        logger.warning("Classic model not available, returning empty predictions")
        return []

    feature_cols = metadata.get("feature_cols", [])
    transform = metadata.get("transform", "raw")
    _, inverse_fn = TRANSFORMS[transform]

    # Prepare classic results for feature extraction
    classic_mask = (results_df["race_type"] == "classic") & (results_df["category"] == "gc")
    all_classics = results_df[classic_mask].copy()
    all_classics["pts"] = all_classics["position"].map(lambda p: float(GC_CLASSIC.get(p, 0)))
    all_classics["race_date"] = pd.to_datetime(all_classics["race_date"])

    results_df = results_df.copy()
    results_df["race_date"] = pd.to_datetime(results_df["race_date"])

    # Determine riders to predict for
    race_riders = results_df[
        (results_df["race_slug"] == race_slug)
        & (results_df["year"] == year)
        & (results_df["category"] == "gc")
    ]
    if rider_ids:
        race_riders = race_riders[race_riders["rider_id"].isin(rider_ids)]

    if race_riders.empty:
        logger.warning("No riders found for %s/%s", race_slug, year)
        return []

    # Extract features for each rider
    classic_hist = all_classics[all_classics["race_date"] < race_date]
    rows = []
    for _, rider in race_riders.iterrows():
        rid = rider["rider_id"]
        rider_hist = results_df[
            (results_df["rider_id"] == rid)
            & (results_df["race_date"] < race_date)
        ]
        feats = compute_classic_features(
            rider_id=rid,
            race_slug=race_slug,
            race_date=race_date,
            rider_history=rider_hist,
            all_classic_results=classic_hist,
        )
        feats["rider_id"] = rid
        rows.append(feats)

    df = pd.DataFrame(rows)

    # Select and align features
    available = [c for c in feature_cols if c in df.columns]
    if not available:
        logger.warning("No matching features for classic prediction")
        return []

    X = df[available].fillna(0).values
    raw_preds = model.predict(X)
    preds = np.maximum(inverse_fn(raw_preds), 0)

    # Build response in stage-race-compatible format
    rider_names = dict(zip(race_riders["rider_id"], race_riders.get("rider_name", race_riders["rider_id"])))
    predictions = []
    for i, (_, row) in enumerate(df.iterrows()):
        rid = row["rider_id"]
        score = float(preds[i])
        predictions.append({
            "rider_id": rid,
            "predicted_score": round(score, 2),
            "breakdown": {
                "gc": round(score, 2),
                "stage": 0,
                "mountain": 0,
                "sprint": 0,
            },
        })

    predictions.sort(key=lambda x: -x["predicted_score"])
    return predictions
