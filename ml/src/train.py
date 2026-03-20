"""
Model training module.

Trains Random Forest models per race type (mini_tour, grand_tour).
Classics are excluded (research showed NO-GO for that race type).
"""

import os

import joblib
import pandas as pd
from sklearn.ensemble import RandomForestRegressor

from .features import FEATURE_COLS

# Race types to train models for (classics excluded — NO-GO per research)
TRAINABLE_RACE_TYPES = ['mini_tour', 'grand_tour']

# Hyperparameters matching research_v3.py
RF_PARAMS = {
    'n_estimators': 500,
    'max_depth': 14,
    'min_samples_leaf': 5,
    'random_state': 42,
    'n_jobs': -1,
}


def train_models(dataset: pd.DataFrame, output_dir: str) -> dict:
    """Train Random Forest models per race type and save to disk.

    Trains on ALL available data (no train/test split). This is
    production training, not research evaluation.

    Args:
        dataset: Training DataFrame with FEATURE_COLS + 'actual_pts' + 'race_type'.
        output_dir: Directory to save model files (e.g. 'ml/models/').

    Returns:
        Dict with training metrics per race type.
    """
    os.makedirs(output_dir, exist_ok=True)
    metrics = {}

    for race_type in TRAINABLE_RACE_TYPES:
        subset = dataset[dataset['race_type'] == race_type]

        if len(subset) == 0:
            print(f"  WARNING: No data for {race_type}, skipping")
            continue

        X = subset[FEATURE_COLS].fillna(0).values
        y = subset['actual_pts'].values

        print(f"  Training {race_type}: {len(subset):,} samples, {len(FEATURE_COLS)} features")

        model = RandomForestRegressor(**RF_PARAMS)
        model.fit(X, y)

        model_path = os.path.join(output_dir, f'model_{race_type}.joblib')
        joblib.dump(model, model_path)
        print(f"  Saved: {model_path}")

        metrics[f'{race_type}_samples'] = len(subset)
        metrics[f'{race_type}_features'] = len(FEATURE_COLS)

    return metrics
