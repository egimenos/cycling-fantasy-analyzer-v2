"""
Classic model training — trains RF/LightGBM on cached classic features.

Usage:
    cd ml
    python -m src.train_classics --model rf --transform raw
    python -m src.train_classics --model lgbm --transform sqrt --features tier1
"""

from __future__ import annotations

import argparse
import json
import os

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor

from .features_classics import (
    ALL_FEATURE_COLS,
    ALL_WITH_TIER3_COLS,
    PIPELINE_COLS,
    SPECIALIST_COLS,
    TIER1_FEATURE_COLS,
    TIER2_TYPE_COLS,
    TIER3_COLS,
    TYPE_AFFINITY_COLS,
    TYPE_TOP10_RATE_COLS,
)

MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "models", "classics")

RF_PARAMS = {
    "n_estimators": 500,
    "max_depth": 14,
    "min_samples_leaf": 5,
    "random_state": 42,
    "n_jobs": -1,
}

LGB_PARAMS = {
    "n_estimators": 256,
    "max_depth": 8,
    "learning_rate": 0.02,
    "num_leaves": 71,
    "subsample": 0.957,
    "colsample_bytree": 0.535,
    "random_state": 42,
    "verbose": -1,
}

TRANSFORMS = {
    "raw": (lambda y: y, lambda y: y),
    "sqrt": (lambda y: np.sqrt(np.maximum(y, 0)), lambda y: np.square(y)),
    "log1p": (lambda y: np.log1p(y), lambda y: np.expm1(y)),
}

# ── Feature sets ─────────────────────────────────────────────────────

FEATURE_SETS = {
    "tier1": list(TIER1_FEATURE_COLS),
    "tier1+type_affinity": list(TIER1_FEATURE_COLS) + TYPE_AFFINITY_COLS,
    "tier1+type_rates": list(TIER1_FEATURE_COLS) + TYPE_TOP10_RATE_COLS,
    "tier1+specialist": list(TIER1_FEATURE_COLS) + SPECIALIST_COLS,
    "tier1+monument": list(TIER1_FEATURE_COLS) + ["monument_podium_count"],
    "tier1+pipeline": list(TIER1_FEATURE_COLS) + PIPELINE_COLS,
    "tier1+all_tier2": list(ALL_FEATURE_COLS),
    "all": list(ALL_FEATURE_COLS),
    # Tier 3 experimental (each added to best tier2)
    "all+glicko": list(ALL_FEATURE_COLS) + ["classic_glicko_mu", "classic_glicko_rd"],
    "all+age_type": list(ALL_FEATURE_COLS) + ["age_type_delta"],
    "all+calendar": list(ALL_FEATURE_COLS) + ["days_since_last_classic", "classics_count_30d"],
    "all+parcours": list(ALL_FEATURE_COLS) + ["cobble_affinity", "punch_affinity", "long_distance_affinity"],
    "all+win_style": list(ALL_FEATURE_COLS) + ["classic_wins_total", "classic_win_pct"],
    "all_tier3": list(ALL_WITH_TIER3_COLS),
}


def get_feature_cols(name: str) -> list[str]:
    """Get feature columns by set name."""
    if name not in FEATURE_SETS:
        raise ValueError(f"Unknown feature set: {name}. Available: {list(FEATURE_SETS.keys())}")
    return FEATURE_SETS[name]


# ── Model creation ───────────────────────────────────────────────────


def make_model(model_type: str, params: dict | None = None):
    """Create a model instance."""
    if model_type == "rf":
        p = params or RF_PARAMS
        return RandomForestRegressor(**p)
    elif model_type == "lgbm":
        try:
            import lightgbm as lgb
        except ImportError:
            raise ImportError("LightGBM not installed. Install with: pip install lightgbm")
        p = params or LGB_PARAMS
        return lgb.LGBMRegressor(**p)
    else:
        raise ValueError(f"Unknown model type: {model_type}")


def train_classic_model(
    train_df: pd.DataFrame,
    feature_cols: list[str],
    model_type: str = "rf",
    transform: str = "raw",
    params: dict | None = None,
) -> tuple:
    """Train a classic prediction model.

    Returns: (model, metadata dict)
    """
    train_fn, _ = TRANSFORMS[transform]

    available = [c for c in feature_cols if c in train_df.columns]
    if not available:
        raise ValueError(f"No feature columns found in training data. Expected: {feature_cols[:5]}...")

    if model_type == "lgbm":
        X = train_df[available].values
    else:
        X = train_df[available].fillna(0).values

    y = train_fn(train_df["actual_pts"].values.astype(float))

    model = make_model(model_type, params)
    model.fit(X, y)

    metadata = {
        "model_type": model_type,
        "params": params or (RF_PARAMS if model_type == "rf" else LGB_PARAMS),
        "transform": transform,
        "feature_cols": available,
        "n_features": len(available),
        "n_train": len(train_df),
    }
    return model, metadata


def save_model(model, metadata: dict, path: str | None = None) -> str:
    """Save model and metadata to disk."""
    path = path or MODEL_DIR
    os.makedirs(path, exist_ok=True)

    model_path = os.path.join(path, "model.joblib")
    meta_path = os.path.join(path, "metadata.json")

    joblib.dump(model, model_path)
    with open(meta_path, "w") as f:
        json.dump(metadata, f, indent=2)

    print(f"  Model saved to {model_path}")
    return model_path


def load_model(path: str | None = None) -> tuple:
    """Load model and metadata from disk."""
    path = path or MODEL_DIR
    model = joblib.load(os.path.join(path, "model.joblib"))
    with open(os.path.join(path, "metadata.json")) as f:
        metadata = json.load(f)
    return model, metadata


# ── Feature importance ───────────────────────────────────────────────


def get_feature_importance(model, feature_cols: list[str], top_n: int = 15) -> list[tuple[str, float]]:
    """Get top-N feature importances from a trained model."""
    if hasattr(model, "feature_importances_"):
        importances = model.feature_importances_
    else:
        return []

    pairs = sorted(zip(feature_cols, importances), key=lambda x: -x[1])
    return pairs[:top_n]


def print_feature_importance(model, feature_cols: list[str], top_n: int = 15) -> None:
    """Print feature importance table."""
    pairs = get_feature_importance(model, feature_cols, top_n)
    if not pairs:
        return
    print(f"\n  Top {len(pairs)} feature importances:")
    for name, imp in pairs:
        bar = "█" * int(imp * 100)
        print(f"    {name:<25} {imp:.4f} {bar}")
