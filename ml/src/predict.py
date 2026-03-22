"""
Single-race prediction logic.

Loads trained RF models from disk, extracts features for one race,
and returns predicted scores per rider.
"""

from __future__ import annotations

import logging
import os
from typing import Optional

from datetime import date

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
    rider_ids: list[str] | None = None,
    race_type_hint: str | None = None,
) -> list[dict]:
    """Generate predicted scores for riders in a race.

    Two modes:
    - rider_ids provided (frontend on-demand): use these riders directly,
      no DB startlist needed. Builds a synthetic startlist for feature extraction.
    - rider_ids is None (benchmark): use startlist from DB as before.

    Args:
        race_slug: Race identifier (e.g. 'tour-de-france').
        year: Race year.
        models: Dict of {race_type: trained model} from load_models().
        results_df: Full results DataFrame (with pre-computed pts column).
        startlists_df: Full startlists DataFrame.
        db_url: PostgreSQL connection string (for get_race_info).
        race_profile: Optional dict with target_flat_pct, target_mountain_pct,
            target_itt_pct from PCS scrape. If None, computed from DB.
        rider_ids: Optional list of rider UUIDs from frontend matching.
            If provided, used instead of DB startlist.
        race_type_hint: Optional race type from the caller (e.g. 'mini_tour').
            Used as fallback when the race is not yet in race_results (future races).

    Returns:
        List of {'rider_id': str, 'predicted_score': float} dicts.
        Empty list if race not found, is a classic, or has no startlist/riders.
    """
    # 1. Get race info (fallback to hint for future races not yet in DB)
    race_info = get_race_info(db_url, race_slug, year)
    if race_info is None:
        if race_type_hint and rider_ids:
            logger.info(
                "Race %s/%d not in DB — using race_type_hint=%s and today as race_date",
                race_slug, year, race_type_hint,
            )
            race_type = race_type_hint
            race_date = date.today()
        else:
            logger.warning("Race not found: %s/%d (no race_type_hint provided)", race_slug, year)
            return []
    else:
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
    # If rider_ids provided (frontend), build synthetic startlist so feature
    # extraction can find the riders without requiring DB startlist.
    effective_startlists = startlists_df
    if rider_ids:
        import pandas as _pd
        synthetic = _pd.DataFrame({
            'race_slug': race_slug,
            'year': year,
            'rider_id': rider_ids,
            'team_name': 'unknown',
        })
        effective_startlists = _pd.concat([startlists_df, synthetic], ignore_index=True)
        logger.info("Using %d rider_ids from frontend (synthetic startlist)", len(rider_ids))

    features_df = extract_features_for_race(
        results_df=results_df,
        startlists_df=effective_startlists,
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
