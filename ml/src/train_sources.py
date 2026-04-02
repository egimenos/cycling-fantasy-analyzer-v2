"""
Production training for source-by-source ML pipeline (Feature 013, WP01).

Trains all sub-models from cached features and saves as joblib artifacts.
Heuristic configurations stored in metadata.json.

9 trained models + 1 metadata file:
  - gc_gate.joblib (LogisticRegression)
  - stage_flat.joblib, stage_hilly.joblib, stage_mountain.joblib (Ridge)
  - stage_itt_gate.joblib (LogisticRegression)
  - stage_itt_magnitude.joblib (Ridge)
  - mtn_final_gate.joblib (LogisticRegression)
  - mtn_pass_capture.joblib (Ridge)
  - spr_inter_capture.joblib (Ridge)
  - metadata.json (feature lists, thresholds, heuristic weights, metrics)

Usage:
    cd ml && python -m src.train_sources
"""

from __future__ import annotations

import json
import logging
import os
import time
from datetime import datetime, timezone

import joblib
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression, RidgeCV

logger = logging.getLogger(__name__)

CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", "cache")
MODEL_DIR = os.environ.get(
    "MODEL_DIR",
    os.path.join(os.path.dirname(__file__), "..", "models"),
)

# ── Feature definitions (frozen from benchmark_integrated.py) ────────

# Type-specific shared features: each stage model gets the Glicko track
# matching its stage type instead of the unified (type-agnostic) stage_mu.
SHARED_FEATURES_BY_TYPE = {
    "flat": ["stage_flat_mu", "stage_flat_rd", "age"],
    "hilly": ["stage_hilly_mu", "stage_hilly_rd", "age"],
    "mountain": ["stage_mountain_mu", "stage_mountain_rd", "age"],
    "itt": ["stage_itt_mu", "stage_itt_rd", "age"],
}
PROFILE_FEATURES = [
    "pct_pts_p1p2", "pct_pts_p4p5", "pct_pts_p3",
    "itt_top10_rate",
]

STAGE_RAW_TEMPLATE = [
    "{t}_pts_12m", "{t}_top10_rate_12m",
    "{t}_starts_12m",
]
STAGE_STRENGTH_TEMPLATE = ["{t}_strength_12m"]

GC_GATE_FEATURES = [
    "gc_mu", "gc_mu_delta_12m", "same_race_gc_best",
    "age", "gc_pts_same_type",
]

MTN_FINAL_FEATURES = [
    "gc_mu", "gc_rd", "stage_mountain_mu", "pct_pts_p4p5", "stage_wins_mountain",
    "mountain_pts_12m", "mountain_pts_6m", "mountain_strength_12m",
    "mountain_top10_rate_12m", "mountain_top10s_12m",
    "gc_mu_delta_12m", "pts_gc_12m", "sr_gc_top10_rate",
    "target_mountain_pct", "age",
]

MTN_PASS_FEATURES = [
    "pct_pts_p4p5", "stage_wins_mountain",
    "mountain_pts_12m", "mountain_pts_6m", "mountain_strength_12m",
    "mountain_top10_rate_12m", "mountain_top10s_12m", "mountain_starts_12m",
    "stage_mountain_mu", "gc_mu", "pts_stage_12m", "target_mountain_pct", "age",
]

SPR_INTER_FEATURES = [
    "pct_pts_p1p2", "stage_wins_flat",
    "flat_pts_12m", "flat_pts_6m", "flat_strength_12m",
    "flat_top10_rate_12m", "flat_top10s_12m",
    "hilly_pts_12m", "hilly_top10_rate_12m", "pct_pts_p3",
    "stage_flat_mu", "pts_stage_12m", "target_flat_pct", "age",
    "sprint_cls_pts_24m", "sprint_cls_top3_count_24m", "sprint_cls_best_pos_24m",
]

STAGE_TYPES = ["flat", "hilly", "mountain", "itt"]

# Heuristic weights (frozen from research)
GC_POSITION_WEIGHTS = {
    "lambda_rd": 1.0,
    "form_cap": 100,
    "form_multiplier": 10,
}

SPRINT_CONTENDER_WEIGHTS = {
    "sprinter": {
        "flat_strength_12m": 0.3, "flat_top10s_12m": 5.0,
        "stage_wins_flat": 15.0, "flat_top10_rate_12m": 50.0,
    },
    "allround": {
        "hilly_pts_12m": 0.2, "pts_stage_12m": 0.05,
        "pct_pts_p3": 30.0, "stage_flat_mu": 0.005,
    },
    "survival_floor": 0.3,
    "survival_weight": 0.7,
    "flat_pct_clip": [0.2, 0.8],
    "pedigree_floor": 1.0,
    "pedigree_per_finish": 0.10,
    "pedigree_cap": 2.0,
}

GT_RANK_DECAY = {
    "1": 50, "2": 35, "3": 25, "4": 15, "5": 10,
    "6": 4, "7": 2, "8": 1, "9": 0.5, "10": 0.2,
}
MINI_RANK_DECAY = {
    "1": 40, "2": 25, "3": 15,
    "4": 5, "5": 2, "6": 1, "7": 0.5,
}


def _stage_features(stage_type: str) -> list[str]:
    """Build the feature list for a stage type model."""
    shared = SHARED_FEATURES_BY_TYPE[stage_type]
    raw = [f.format(t=stage_type) for f in STAGE_RAW_TEMPLATE]
    strength = [f.format(t=stage_type) for f in STAGE_STRENGTH_TEMPLATE]
    return shared + raw + strength + PROFILE_FEATURES


def _load_training_data(cache_dir: str) -> pd.DataFrame:
    """Load and join all cached data for training."""
    cache_dfs = []
    for yr in range(2022, 2026):
        path = os.path.join(cache_dir, f"features_{yr}.parquet")
        if os.path.exists(path):
            cache_dfs.append(pd.read_parquet(path))

    if not cache_dfs:
        raise FileNotFoundError(f"No feature cache files found in {cache_dir}")

    cache = pd.concat(cache_dfs, ignore_index=True)
    if "race_year" in cache.columns:
        cache = cache.rename(columns={"race_year": "year"})

    stage_feats_path = os.path.join(cache_dir, "stage_features.parquet")
    stage_targets_path = os.path.join(cache_dir, "stage_targets.parquet")

    if not os.path.exists(stage_feats_path):
        raise FileNotFoundError(f"Stage features not found: {stage_feats_path}")
    if not os.path.exists(stage_targets_path):
        raise FileNotFoundError(f"Stage targets not found: {stage_targets_path}")

    stage_feats = pd.read_parquet(stage_feats_path)
    stage_targets = pd.read_parquet(stage_targets_path)

    # Select relevant columns from stage_targets
    target_cols = ["rider_id", "race_slug", "year"] + [
        c for c in stage_targets.columns
        if c.endswith("_pts_per_stage") or c.endswith("_stages_race")
        or c.endswith("_stages_ridden") or c.startswith("scoreable_")
        or c == "actual_stage_pts_typed"
    ]

    df = cache.merge(stage_feats, on=["rider_id", "race_slug", "year"], how="left")
    df = df.merge(stage_targets[target_cols], on=["rider_id", "race_slug", "year"], how="left")

    # Merge classification history features (sprint/mountain classification history)
    cls_path = os.path.join(cache_dir, "classification_history_features.parquet")
    if os.path.exists(cls_path):
        cls_feats = pd.read_parquet(cls_path)
        df = df.merge(cls_feats, on=["rider_id", "race_slug", "year"], how="left")

    # Fill NaN for stage-related and classification columns
    fill_cols = [c for c in df.columns if any(
        c.startswith(p) for p in ["flat_", "hilly_", "mountain_", "itt_",
                                   "n_flat", "n_hilly", "n_mountain", "n_itt",
                                   "scoreable_", "sprint_cls_", "mountain_cls_",
                                   "gt_sprint_", "gt_mountain_", "mini_sprint_",
                                   "mini_mountain_", "same_race_sprint_",
                                   "same_race_mountain_"]
    )]
    df[fill_cols] = df[fill_cols].fillna(0)

    # Build secondary targets
    df["scoreable_mtn_final"] = (df["actual_mountain_final_pts"] > 0).astype(int)
    df["mtn_pass_capture_target"] = np.where(
        df["target_mtn_pass_supply"] > 0,
        df["actual_mountain_pass_pts"] / df["target_mtn_pass_supply"], 0.0,
    )
    df["spr_inter_capture_target"] = np.where(
        df["target_spr_inter_supply"] > 0,
        df["actual_sprint_inter_pts"] / df["target_spr_inter_supply"], 0.0,
    )

    df = df[df["year"] >= 2022].copy()
    logger.info("Training data: %d rows, years %s", len(df), sorted(df["year"].unique()))
    return df


def _available(features: list[str], df: pd.DataFrame) -> list[str]:
    """Filter feature list to columns present in the DataFrame."""
    return [f for f in features if f in df.columns]


def _train_and_save(
    name: str, model, X: pd.DataFrame, y: np.ndarray,
    model_dir: str, weights: np.ndarray | None = None,
) -> str:
    """Train a model and save to joblib. Returns artifact path."""
    t0 = time.time()
    if weights is not None:
        model.fit(X.fillna(0), y, sample_weight=weights)
    else:
        model.fit(X.fillna(0), y)
    path = os.path.join(model_dir, f"{name}.joblib")
    joblib.dump(model, path)
    elapsed = time.time() - t0
    logger.info("  %s: %d samples, saved to %s (%.1fs)", name, len(X), path, elapsed)
    return path


def train_all(
    model_dir: str | None = None,
    cache_dir: str | None = None,
) -> dict:
    """Train all source-by-source sub-models and save artifacts.

    Args:
        model_dir: Directory to save model artifacts. Defaults to ml/models/.
        cache_dir: Directory with cached feature parquets. Defaults to ml/cache/.

    Returns:
        Dict with artifact paths and training metadata.
    """
    model_dir = model_dir or MODEL_DIR
    cache_dir = cache_dir or CACHE_DIR
    os.makedirs(model_dir, exist_ok=True)

    print("=" * 60)
    print("  Source-by-Source Model Training")
    print("=" * 60)

    df = _load_training_data(cache_dir)
    artifacts = {}
    feature_lists = {}

    # ── 1. GC Gate ───────────────────────────────────────────────────
    print("\n[1/9] GC Gate (LogisticRegression)...")
    gc_feats = _available(GC_GATE_FEATURES, df)
    gc_target = (df["gc_final_position"].notna() & (df["gc_final_position"] <= 20)).astype(int)
    gc_gate = LogisticRegression(C=0.1, class_weight="balanced", max_iter=2000)
    artifacts["gc_gate"] = _train_and_save("gc_gate", gc_gate, df[gc_feats], gc_target, model_dir)
    feature_lists["gc_gate"] = gc_feats

    # ── 2-4. Stage models (flat, hilly, mountain) ────────────────────
    for i, st in enumerate(["flat", "hilly", "mountain"], start=2):
        print(f"\n[{i}/9] Stage {st} (Ridge+sqrt)...")
        feats = _available(_stage_features(st), df)
        exposure_col = f"n_{st}_stages_ridden"
        target_col = f"{st}_pts_per_stage"
        train_data = df[df[exposure_col] > 0]
        model = RidgeCV(alphas=[0.01, 0.1, 1.0, 10.0, 100.0])
        y = np.sqrt(train_data[target_col].values)
        artifacts[f"stage_{st}"] = _train_and_save(
            f"stage_{st}", model, train_data[feats], y, model_dir,
        )
        logger.info("  %s: selected alpha=%.3f", f"stage_{st}", model.alpha_)
        feature_lists[f"stage_{st}"] = feats

    # ── 5. Stage ITT Gate ────────────────────────────────────────────
    print("\n[5/9] Stage ITT Gate (LogisticRegression)...")
    itt_feats = _available(_stage_features("itt"), df)
    itt_exposed = df[df["n_itt_stages_ridden"] > 0]
    itt_gate = LogisticRegression(C=0.1, class_weight="balanced", max_iter=2000)
    artifacts["stage_itt_gate"] = _train_and_save(
        "stage_itt_gate", itt_gate, itt_exposed[itt_feats],
        itt_exposed["scoreable_itt"].values, model_dir,
    )
    feature_lists["stage_itt_gate"] = itt_feats

    # ── 6. Stage ITT Magnitude ───────────────────────────────────────
    print("\n[6/9] Stage ITT Magnitude (Ridge+sqrt)...")
    itt_nonzero = itt_exposed[itt_exposed["itt_pts_per_stage"] > 0]
    itt_mag = RidgeCV(alphas=[0.01, 0.1, 1.0, 10.0, 100.0])
    y_itt = np.sqrt(itt_nonzero["itt_pts_per_stage"].values)
    artifacts["stage_itt_magnitude"] = _train_and_save(
        "stage_itt_magnitude", itt_mag, itt_nonzero[itt_feats], y_itt, model_dir,
    )
    logger.info("  %s: selected alpha=%.3f", "stage_itt_magnitude", itt_mag.alpha_)
    feature_lists["stage_itt_magnitude"] = itt_feats

    # ── 7. Mountain Final Gate ───────────────────────────────────────
    print("\n[7/9] Mountain Final Gate (LogisticRegression)...")
    mtn_feats = _available(MTN_FINAL_FEATURES, df)
    mtn_gate = LogisticRegression(C=0.1, class_weight="balanced", max_iter=2000)
    artifacts["mtn_final_gate"] = _train_and_save(
        "mtn_final_gate", mtn_gate, df[mtn_feats],
        df["scoreable_mtn_final"].values, model_dir,
    )
    feature_lists["mtn_final_gate"] = mtn_feats

    # ── 8. Mountain Pass Capture ─────────────────────────────────────
    print("\n[8/9] Mountain Pass Capture (Ridge+sqrt)...")
    mp_feats = _available(MTN_PASS_FEATURES, df)
    mp_data = df[df["target_mtn_pass_supply"] > 0]
    mp_model = RidgeCV(alphas=[0.01, 0.1, 1.0, 10.0, 100.0])
    y_mp = np.sqrt(mp_data["mtn_pass_capture_target"].values)
    artifacts["mtn_pass_capture"] = _train_and_save(
        "mtn_pass_capture", mp_model, mp_data[mp_feats], y_mp, model_dir,
    )
    logger.info("  %s: selected alpha=%.3f", "mtn_pass_capture", mp_model.alpha_)
    feature_lists["mtn_pass_capture"] = mp_feats

    # ── 9. Sprint Inter Capture ──────────────────────────────────────
    print("\n[9/9] Sprint Inter Capture (Ridge+sqrt)...")
    si_feats = _available(SPR_INTER_FEATURES, df)
    si_data = df[df["target_spr_inter_supply"] > 0]
    si_model = RidgeCV(alphas=[0.01, 0.1, 1.0, 10.0, 100.0])
    y_si = np.sqrt(si_data["spr_inter_capture_target"].values)
    artifacts["spr_inter_capture"] = _train_and_save(
        "spr_inter_capture", si_model, si_data[si_feats], y_si, model_dir,
    )
    logger.info("  %s: selected alpha=%.3f", "spr_inter_capture", si_model.alpha_)
    feature_lists["spr_inter_capture"] = si_feats

    # ── Write metadata.json ──────────────────────────────────────────
    version = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
    metadata = {
        "model_version": version,
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "training_rows": len(df),
        "training_years": sorted(int(y) for y in df["year"].unique()),
        "gc_gate_threshold": 0.40,
        "gc_position_weights": GC_POSITION_WEIGHTS,
        "sprint_contender_weights": SPRINT_CONTENDER_WEIGHTS,
        "gt_rank_decay": GT_RANK_DECAY,
        "mini_rank_decay": MINI_RANK_DECAY,
        "feature_lists": feature_lists,
        "artifacts": {k: os.path.basename(v) for k, v in artifacts.items()},
    }

    meta_path = os.path.join(model_dir, "metadata.json")
    with open(meta_path, "w") as f:
        json.dump(metadata, f, indent=2)

    # Write model_version.txt (for hot-reload)
    version_path = os.path.join(model_dir, "model_version.txt")
    with open(version_path, "w") as f:
        f.write(version)

    print(f"\n{'=' * 60}")
    print(f"  Training complete — {len(artifacts)} models + metadata.json")
    print(f"  Version: {version}")
    print(f"  Artifacts: {model_dir}")
    print(f"{'=' * 60}")

    return metadata


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    train_all()
