"""
Single-race prediction logic.

Loads trained RF models from disk, extracts features for one race,
and returns predicted scores per rider.
"""

from __future__ import annotations

import logging
import os
from typing import Optional

import joblib
import pandas as pd

from .data import get_race_info
from .features import FEATURE_COLS, extract_features_for_race

logger = logging.getLogger(__name__)

# Model file names by race type (classics excluded — NO-GO per research)
_MODEL_FILES = {
    'mini_tour': 'model_mini_tour.joblib',
    'grand_tour': 'model_grand_tour.joblib',
}


def load_models(model_dir: str) -> dict:
    """Load trained RF models from joblib files.

    Args:
        model_dir: Directory containing model_*.joblib files.

    Returns:
        Dict mapping race_type -> trained sklearn model.
        Missing files are silently skipped (partial dict or empty).
    """
    models: dict = {}
    for race_type, filename in _MODEL_FILES.items():
        path = os.path.join(model_dir, filename)
        if os.path.isfile(path):
            models[race_type] = joblib.load(path)
            logger.info("Loaded model: %s from %s", race_type, path)
        else:
            logger.warning("Model file not found: %s", path)
    return models


def get_model_version(model_dir: str) -> Optional[str]:
    """Read model_version.txt and return its contents, or None if missing.

    Args:
        model_dir: Directory containing model_version.txt.

    Returns:
        Version string (e.g. '20260320T030000') or None.
    """
    path = os.path.join(model_dir, 'model_version.txt')
    try:
        with open(path) as f:
            return f.read().strip() or None
    except FileNotFoundError:
        return None


def predict_race(
    race_slug: str,
    year: int,
    models: dict,
    results_df: pd.DataFrame,
    startlists_df: pd.DataFrame,
    db_url: str,
    race_profile: dict | None = None,
) -> list[dict]:
    """Generate predicted scores for all riders on a single race startlist.

    Steps:
        1. Look up race info (race_type, race_date) from the database.
        2. If classic -> return empty (not supported by ML models).
        3. Extract features per rider via extract_features_for_race().
        4. Select the appropriate model for the race_type.
        5. Run model.predict(X) where X = features[FEATURE_COLS].fillna(0).
        6. Return list of {rider_id, predicted_score} dicts.

    Args:
        race_slug: Race identifier (e.g. 'tour-de-france').
        year: Race year.
        models: Dict of {race_type: trained model} from load_models().
        results_df: Full results DataFrame (with pre-computed pts column).
        startlists_df: Full startlists DataFrame.
        db_url: PostgreSQL connection string (for get_race_info).
        race_profile: Optional dict with target_flat_pct, target_mountain_pct,
            target_itt_pct from PCS scrape. If None, computed from DB.

    Returns:
        List of {'rider_id': str, 'predicted_score': float} dicts.
        Empty list if race not found, is a classic, or has no startlist.
    """
    # 1. Get race info
    race_info = get_race_info(db_url, race_slug, year)
    if race_info is None:
        logger.warning("Race not found: %s/%d", race_slug, year)
        return []

    race_type = race_info['race_type']
    race_date = race_info['race_date']

    # 2. Classics not supported
    if race_type == 'classic':
        logger.info("Classic race %s — ML not supported, returning empty", race_slug)
        return []

    # 3. Check model availability for this race type
    if race_type not in models:
        logger.warning("No model loaded for race_type=%s", race_type)
        return []

    # 4. Extract features (with race profile for v4 features)
    features_df = extract_features_for_race(
        results_df=results_df,
        startlists_df=startlists_df,
        race_slug=race_slug,
        race_year=year,
        race_type=race_type,
        race_date=race_date,
        race_profile=race_profile,
    )

    if features_df.empty:
        logger.warning("No features extracted for %s/%d (no startlist?)", race_slug, year)
        return []

    # 5. Predict
    model = models[race_type]
    X = features_df[FEATURE_COLS].fillna(0).values
    predicted_scores = model.predict(X)

    # 6. Build result list
    rider_ids = features_df['rider_id'].values
    predictions = [
        {
            'rider_id': str(rider_ids[i]),
            'predicted_score': round(float(predicted_scores[i]), 2),
        }
        for i in range(len(predicted_scores))
    ]

    logger.info(
        "Predicted %d riders for %s/%d (race_type=%s)",
        len(predictions), race_slug, year, race_type,
    )
    return predictions
