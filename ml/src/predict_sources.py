"""
Source-by-source prediction orchestrator (Feature 013, WP02).

Given trained models + metadata, produces per-rider predictions with
a 4-source breakdown: {gc, stage, mountain, sprint}.

Each source uses the architecture defined in model-baseline.md:
  - GC: gate + heuristic position ranking
  - Stage: type-split regression (flat/hilly/mountain) + ITT gate+magnitude
  - Mountain: gate for final + capture rate for pass
  - Sprint: heuristic contender for final + capture rate for inter+reg

Usage (from app.py):
    from .predict_sources import predict_race_sources, load_source_models
    models = load_source_models(model_dir)
    predictions = predict_race_sources(race_slug, year, models, ...)
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any

import joblib
import numpy as np
import pandas as pd

from .points import (
    GC_GRAND_TOUR, GC_MINI_TOUR,
    GC_DAILY,
    STAGE_POINTS,
    FINAL_CLASS_GT, FINAL_CLASS_MINI,
    estimate_gc_daily_pts,
)
from .supply_estimation import build_supply_history, estimate_supply

logger = logging.getLogger(__name__)

# Expected model artifact names
_MODEL_FILES = [
    "gc_gate", "stage_flat", "stage_hilly", "stage_mountain",
    "stage_itt_gate", "stage_itt_magnitude",
    "mtn_final_gate", "mtn_pass_capture", "spr_inter_capture",
]

_GT_FINAL_AVG = sum(FINAL_CLASS_GT.values()) / len(FINAL_CLASS_GT)
_MINI_FINAL_AVG = sum(FINAL_CLASS_MINI.values()) / len(FINAL_CLASS_MINI)


def load_source_models(model_dir: str) -> dict[str, Any] | None:
    """Load all sub-model artifacts + metadata from model_dir.

    Returns a dict with model names as keys and loaded models as values,
    plus a 'metadata' key with the parsed metadata.json.
    Returns None if critical files are missing.
    """
    meta_path = os.path.join(model_dir, "metadata.json")
    if not os.path.isfile(meta_path):
        logger.warning("metadata.json not found in %s — source models not available", model_dir)
        return None

    with open(meta_path) as f:
        metadata = json.load(f)

    models: dict[str, Any] = {"metadata": metadata}
    missing = []

    for name in _MODEL_FILES:
        path = os.path.join(model_dir, f"{name}.joblib")
        if os.path.isfile(path):
            models[name] = joblib.load(path)
        else:
            missing.append(name)

    if missing:
        logger.warning("Missing model files: %s — some sources will be skipped", missing)

    logger.info(
        "Loaded %d/%d source models + metadata (version=%s)",
        len(models) - 1, len(_MODEL_FILES), metadata.get("model_version", "?"),
    )
    return models


def predict_race_sources(
    race_slug: str,
    year: int,
    models: dict[str, Any],
    features_df: pd.DataFrame,
    race_type: str,
    n_stages: int,
    stage_counts: dict[str, int],
    supply_history: pd.DataFrame | None = None,
    completion_rates: dict[str, float] | None = None,
) -> list[dict]:
    """Generate per-rider predictions with 4-source breakdown.

    Args:
        race_slug: Race identifier.
        year: Race year.
        models: Output of load_source_models().
        features_df: DataFrame with one row per rider, containing all features.
            Must have 'rider_id' column.
        race_type: 'grand_tour' or 'mini_tour'.
        n_stages: Total number of stages in the race.
        stage_counts: Dict with keys 'flat', 'hilly', 'mountain', 'itt' → count.
        supply_history: For mountain_pass/sprint_inter supply estimation.
            If None, those predictions will be 0.
        completion_rates: Dict rider_id → GT completion rate (0-1).
            For sprint_final heuristic. If None, uses 0.5 default.

    Returns:
        List of dicts: {rider_id, predicted_score, breakdown: {gc, stage, mountain, sprint}}
    """
    if race_type == "classic":
        return []

    metadata = models.get("metadata", {})
    rider_ids = features_df["rider_id"].values
    n_riders = len(features_df)

    # Initialize per-source predictions
    gc_pts = np.zeros(n_riders)
    gc_daily_pts = np.zeros(n_riders)
    stage_pts = np.zeros(n_riders)
    mtn_final_pts = np.zeros(n_riders)
    mtn_pass_pts = np.zeros(n_riders)
    spr_final_pts = np.zeros(n_riders)
    spr_inter_pts = np.zeros(n_riders)

    # ── GC Source ────────────────────────────────────────────────────
    gc_pts, gc_daily_pts = _predict_gc(
        models, metadata, features_df, race_type, n_stages,
    )

    # ── Stage Source ─────────────────────────────────────────────────
    stage_pts = _predict_stage(
        models, metadata, features_df, stage_counts,
    )

    # ── Mountain Source ──────────────────────────────────────────────
    mtn_final_pts, mtn_pass_pts = _predict_mountain(
        models, metadata, features_df, race_type,
        race_slug, year, supply_history,
    )

    # ── Sprint Source ────────────────────────────────────────────────
    spr_final_pts, spr_inter_pts = _predict_sprint(
        models, metadata, features_df, race_type,
        race_slug, year, supply_history, completion_rates,
    )

    # ── Normalize to real supply ────────────────────────────────────
    gc_total = gc_pts + gc_daily_pts
    mtn_total = mtn_final_pts + mtn_pass_pts
    spr_total = spr_final_pts + spr_inter_pts

    # Compute supply per source for this race
    supplies = _compute_race_supply(
        race_type, n_stages, race_slug, year, supply_history,
    )

    # ── Per-source calibration (each source has different needs) ────
    #
    # GC: predictions come from scoring table lookup — already calibrated.
    #     Do NOT normalize. Sum < supply is expected (gate misses riders 11-20).
    #
    # Stage: model predicts per-rider independently → sum inflated.
    #     Scale to supply (preserves ranking, fixes magnitude).
    #
    # Mountain/Sprint: capture rates are diffuse (Ridge regresses to mean).
    #     Sharpen to concentrate, then scale to supply.

    # GC: leave as-is (already in fantasy points from table lookup)

    # Stage: scale to supply
    stage_pts = _scale_to_supply(stage_pts, supplies["stage"])

    # Mountain: sharpen then scale
    mtn_total = _sharpen(mtn_total, power=2.0, zero_percentile=60)
    mtn_total = _scale_to_supply(mtn_total, supplies["mountain"])

    # Sprint: sharpen then scale
    spr_total = _sharpen(spr_total, power=1.5, zero_percentile=50)
    spr_total = _scale_to_supply(spr_total, supplies["sprint"])

    # ── Build output ────────────────────────────────────────────────
    predictions = []
    for i in range(n_riders):
        gc_val = round(float(gc_total[i]), 1)
        stage_val = round(float(stage_pts[i]), 1)
        mtn_val = round(float(mtn_total[i]), 1)
        spr_val = round(float(spr_total[i]), 1)
        total = round(gc_val + stage_val + mtn_val + spr_val, 1)

        predictions.append({
            "rider_id": str(rider_ids[i]),
            "predicted_score": total,
            "breakdown": {
                "gc": gc_val,
                "stage": stage_val,
                "mountain": mtn_val,
                "sprint": spr_val,
            },
        })

    logger.info(
        "Predicted %d riders for %s/%d — gc/stage/mtn/spr sources",
        n_riders, race_slug, year,
    )
    return predictions


# ── GC prediction ────────────────────────────────────────────────────

def _predict_gc(
    models: dict, metadata: dict, df: pd.DataFrame,
    race_type: str, n_stages: int,
) -> tuple[np.ndarray, np.ndarray]:
    """GC gate + heuristic position ranking."""
    n = len(df)
    gc_pts = np.zeros(n)
    daily_pts = np.zeros(n)

    gc_gate = models.get("gc_gate")
    if gc_gate is None:
        return gc_pts, daily_pts

    feats = metadata.get("feature_lists", {}).get("gc_gate", [])
    avail = [f for f in feats if f in df.columns]
    if not avail:
        return gc_pts, daily_pts

    X = df[avail].fillna(0).values
    probs = gc_gate.predict_proba(X)[:, 1]

    # Heuristic position score
    weights = metadata.get("gc_position_weights", {})
    lam = weights.get("lambda_rd", 1.0)
    form_cap = weights.get("form_cap", 100)
    form_mult = weights.get("form_multiplier", 10)

    gc_mu = df["gc_mu"].fillna(1500).values if "gc_mu" in df.columns else np.full(n, 1500)
    gc_rd = df["gc_rd"].fillna(200).values if "gc_rd" in df.columns else np.full(n, 200)
    form = df["recent_gc_form_score"].fillna(0).values if "recent_gc_form_score" in df.columns else np.zeros(n)

    conservative_mu = gc_mu - lam * gc_rd
    scores = conservative_mu + np.minimum(form * form_mult, form_cap)

    # Gate threshold
    threshold = metadata.get("gc_gate_threshold", 0.40)
    gc_table = GC_GRAND_TOUR if race_type == "grand_tour" else GC_MINI_TOUR
    max_pos = max(gc_table.keys())

    # Rank contenders by score
    contender_mask = probs >= threshold
    if contender_mask.sum() > 0:
        contender_indices = np.where(contender_mask)[0]
        contender_scores = scores[contender_indices]
        rank_order = np.argsort(-contender_scores)

        for pos_rank, idx in enumerate(rank_order, 1):
            rider_idx = contender_indices[idx]
            if pos_rank <= max_pos:
                gc_pts[rider_idx] = gc_table.get(pos_rank, 0)
                daily_pts[rider_idx] = estimate_gc_daily_pts(pos_rank, n_stages, race_type)

    return gc_pts, daily_pts


# ── Stage prediction ─────────────────────────────────────────────────

def _predict_stage(
    models: dict, metadata: dict, df: pd.DataFrame,
    stage_counts: dict[str, int],
) -> np.ndarray:
    """Type-split stage prediction: regression for flat/hilly/mountain, gate+mag for ITT."""
    n = len(df)
    total = np.zeros(n)
    feat_lists = metadata.get("feature_lists", {})

    for st in ["flat", "hilly", "mountain"]:
        model = models.get(f"stage_{st}")
        if model is None:
            continue
        feats = feat_lists.get(f"stage_{st}", [])
        avail = [f for f in feats if f in df.columns]
        if not avail:
            continue

        X = df[avail].fillna(0).values
        pred = np.maximum(np.square(model.predict(X)), 0)  # inverse sqrt
        n_stages = stage_counts.get(st, 0)
        total += pred * n_stages

    # ITT: gate + magnitude
    itt_gate = models.get("stage_itt_gate")
    itt_mag = models.get("stage_itt_magnitude")
    if itt_gate is not None and itt_mag is not None:
        feats = feat_lists.get("stage_itt_gate", [])
        avail = [f for f in feats if f in df.columns]
        if avail:
            X = df[avail].fillna(0).values
            gate_pred = itt_gate.predict(X)
            mag_pred = np.maximum(np.square(itt_mag.predict(X)), 0)
            itt_pts = np.where(gate_pred == 1, mag_pred, 0.0)
            n_itt = stage_counts.get("itt", 0)
            total += itt_pts * n_itt

    return total


# ── Mountain prediction ──────────────────────────────────────────────

def _predict_mountain(
    models: dict, metadata: dict, df: pd.DataFrame,
    race_type: str, race_slug: str, year: int,
    supply_history: pd.DataFrame | None,
) -> tuple[np.ndarray, np.ndarray]:
    """Mountain final (gate) + mountain pass (capture rate)."""
    n = len(df)
    final_pts = np.zeros(n)
    pass_pts = np.zeros(n)
    feat_lists = metadata.get("feature_lists", {})

    # Mountain final: P(score) × avg_pts
    mtn_gate = models.get("mtn_final_gate")
    if mtn_gate is not None:
        feats = feat_lists.get("mtn_final_gate", [])
        avail = [f for f in feats if f in df.columns]
        if avail:
            X = df[avail].fillna(0).values
            probs = mtn_gate.predict_proba(X)[:, 1]
            avg_pts = _GT_FINAL_AVG if race_type == "grand_tour" else _MINI_FINAL_AVG
            final_pts = probs * avg_pts

    # Mountain pass: capture rate × estimated supply
    mtn_cap = models.get("mtn_pass_capture")
    if mtn_cap is not None and supply_history is not None:
        est_mtn, _ = estimate_supply(race_slug, year, supply_history)
        if est_mtn > 0:
            feats = feat_lists.get("mtn_pass_capture", [])
            avail = [f for f in feats if f in df.columns]
            if avail:
                X = df[avail].fillna(0).values
                capture = np.maximum(np.square(mtn_cap.predict(X)), 0)
                pass_pts = capture * est_mtn

    return final_pts, pass_pts


# ── Sprint prediction ────────────────────────────────────────────────

def _predict_sprint(
    models: dict, metadata: dict, df: pd.DataFrame,
    race_type: str, race_slug: str, year: int,
    supply_history: pd.DataFrame | None,
    completion_rates: dict[str, float] | None,
) -> tuple[np.ndarray, np.ndarray]:
    """Sprint final (heuristic contender) + sprint inter (capture rate)."""
    n = len(df)
    final_pts = np.zeros(n)
    inter_pts = np.zeros(n)

    # Sprint final: heuristic contender score + soft rank
    weights = metadata.get("sprint_contender_weights", {})
    if weights:
        rank_decay = _get_rank_decay(metadata, race_type)
        final_pts = _sprint_final_heuristic(df, race_type, weights, rank_decay, completion_rates)

    # Sprint inter: capture rate × estimated supply
    spr_cap = models.get("spr_inter_capture")
    if spr_cap is not None and supply_history is not None:
        _, est_spr = estimate_supply(race_slug, year, supply_history)
        if est_spr > 0:
            feat_lists = metadata.get("feature_lists", {})
            feats = feat_lists.get("spr_inter_capture", [])
            avail = [f for f in feats if f in df.columns]
            if avail:
                X = df[avail].fillna(0).values
                capture = np.maximum(np.square(spr_cap.predict(X)), 0)
                inter_pts = capture * est_spr

    return final_pts, inter_pts


def _sprint_final_heuristic(
    df: pd.DataFrame, race_type: str,
    weights: dict, rank_decay: dict[int, float],
    completion_rates: dict[str, float] | None,
) -> np.ndarray:
    """Compute sprint final pts via heuristic contender score + soft rank."""
    sw = weights.get("sprinter", {})
    aw = weights.get("allround", {})

    sprinter = sum(
        df.get(feat, pd.Series(0, index=df.index)).fillna(0) * w
        for feat, w in sw.items()
    )
    allround = sum(
        df.get(feat, pd.Series(0, index=df.index)).fillna(0) * w
        for feat, w in aw.items()
    )

    clip = weights.get("flat_pct_clip", [0.2, 0.8])
    flat_pct = df.get("target_flat_pct", pd.Series(0.4, index=df.index)).fillna(0.4).clip(clip[0], clip[1])
    score = flat_pct * sprinter + (1 - flat_pct) * allround

    # Survival bonus
    floor = weights.get("survival_floor", 0.3)
    surv_w = weights.get("survival_weight", 0.7)
    if completion_rates:
        survival = df["rider_id"].map(completion_rates).fillna(0.5)
    else:
        survival = pd.Series(0.5, index=df.index)
    score = score * (floor + surv_w * survival)

    # Soft rank → points
    ranks = score.rank(ascending=False, method="min").astype(int)
    pts = ranks.map(rank_decay).fillna(0.0)
    return pts.values


def _get_rank_decay(metadata: dict, race_type: str) -> dict[int, float]:
    """Get rank decay table from metadata."""
    key = "gt_rank_decay" if race_type == "grand_tour" else "mini_rank_decay"
    raw = metadata.get(key, {})
    return {int(k): v for k, v in raw.items()}


# ── Supply normalization ─────────────────────────────────────────────

def _compute_race_supply(
    race_type: str, n_stages: int,
    race_slug: str, year: int,
    supply_history: pd.DataFrame | None,
) -> dict[str, float]:
    """Compute the real fantasy point supply per source for a race.

    Returns dict with keys: gc, stage, mountain, sprint (total supply).
    """
    is_gt = race_type == "grand_tour"
    final_table = FINAL_CLASS_GT if is_gt else FINAL_CLASS_MINI

    # Stage: top-20 score per stage × n_stages
    stage_supply = sum(STAGE_POINTS.values()) * n_stages

    # Mountain: final classification + estimated pass points
    mtn_final_supply = sum(final_table.values())
    est_mtn_pass = 0.0
    if supply_history is not None:
        est_mtn_pass, _ = estimate_supply(race_slug, year, supply_history)
    mtn_supply = mtn_final_supply + est_mtn_pass

    # Sprint: final classification + estimated inter + regularidad
    spr_final_supply = sum(final_table.values())
    est_spr_inter = 0.0
    if supply_history is not None:
        _, est_spr_inter = estimate_supply(race_slug, year, supply_history)
    spr_supply = spr_final_supply + est_spr_inter

    return {
        "stage": stage_supply,
        "mountain": max(mtn_supply, 1.0),
        "sprint": max(spr_supply, 1.0),
    }


def _sharpen(
    predictions: np.ndarray, power: float = 2.0, zero_percentile: float = 60,
) -> np.ndarray:
    """Sharpen a flat prediction distribution by zeroing noise and amplifying signal.

    The Ridge/LogReg models know the ranking but underestimate concentration.
    This corrects for mean-regression: a rider predicted at 20 vs 10 becomes
    400 vs 100 after squaring — much more separated.

    Args:
        predictions: Raw predictions (non-negative).
        power: Exponent > 1 amplifies differences. 2.0 = square.
        zero_percentile: Bottom N% of non-zero predictions set to 0.
    """
    result = predictions.copy()
    nonzero = result[result > 0]
    if len(nonzero) == 0:
        return result

    # Zero out bottom percentile (noise, not signal)
    threshold = np.percentile(nonzero, zero_percentile)
    result[result <= threshold] = 0.0

    # Power transform on remaining (amplify differences)
    mask = result > 0
    if mask.sum() > 0:
        result[mask] = np.power(result[mask], power)

    return result


def _scale_to_supply(predictions: np.ndarray, supply: float) -> np.ndarray:
    """Scale predictions so they sum to the real supply.

    Simple proportional scaling — preserves relative ranking and distribution
    shape. No per-rider caps (those caused compression artifacts).
    """
    total = predictions.sum()
    if total <= 0:
        return predictions
    return np.maximum(predictions * (supply / total), 0.0)
