"""
Type-specific stage features for the stage source (Feature 012, Step 3).

Computes per-rider, per-race features split by stage type, using vectorized
groupby operations instead of per-rider iteration.

Features per type (flat, hilly, mountain, itt) × window (12m, 6m):
  - {type}_pts_{window}: total stage pts from that type
  - {type}_top10s_{window}: count of top-10 finishes in that type
  - {type}_top10_rate_{window}: top-10 rate in that type
  - {type}_strength_{window}: class-weighted pts (GT=1.0, UWT=0.7, Pro=0.4)
  - {type}_starts_{window}: number of stages of that type ridden (denominator)

Usage:
    from ml.src.stage_features import build_stage_features
    feats_df = build_stage_features(db_url)
"""

from __future__ import annotations

import os

import numpy as np
import pandas as pd
import psycopg2

from .stage_targets import STAGE_TYPE_MAP, STAGE_TYPES

DB_URL = os.environ.get(
    "DATABASE_URL", "postgresql://cycling:cycling@localhost:5432/cycling_analyzer"
)

# Race-class weights for strength features
CLASS_WEIGHTS = {
    "UWT": 1.0,
    "Pro": 0.7,
    "1": 0.5,
}

WINDOWS = {"12m": 365, "6m": 182}


def _load_stage_history(db_url: str) -> pd.DataFrame:
    """Load all stage results + classic results with type classification.

    Includes one-day races (classics) so that sprint/climb ability signals
    from races like Scheldeprijs (flat) or Liège (mountain) are captured.
    """
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()
    cur.execute("""
        SELECT rr.rider_id, rr.race_slug, rr.race_type, rr.race_class,
               rr.year, rr.position, rr.stage_number, rr.dnf,
               rr.parcours_type, rr.is_itt, rr.race_date
        FROM race_results rr
        WHERE rr.race_date IS NOT NULL
          AND rr.dnf = false
          AND (
              (rr.category = 'stage' AND rr.race_type IN ('grand_tour', 'mini_tour'))
              OR
              (rr.category = 'gc' AND rr.race_type = 'classic')
          )
        ORDER BY rr.race_date
    """)
    cols = [desc[0] for desc in cur.description]
    rows = cur.fetchall()
    cur.close()
    conn.close()
    df = pd.DataFrame(rows, columns=cols)

    # Classify stage type (vectorized)
    df["stage_type"] = np.where(
        df["is_itt"], "itt", df["parcours_type"].map(STAGE_TYPE_MAP)
    )
    df = df[df["stage_type"].notna()].copy()

    # Pre-compute useful columns
    df["race_date"] = pd.to_datetime(df["race_date"])
    df["is_top10"] = df["position"].le(10).astype(int)
    df["class_weight"] = df["race_class"].map(CLASS_WEIGHTS).fillna(0.5)

    # Fantasy stage pts
    from .points import STAGE_POINTS
    df["stage_pts"] = df["position"].map(pd.Series(STAGE_POINTS)).fillna(0.0)
    df["weighted_pts"] = df["stage_pts"] * df["class_weight"]

    return df


def _load_race_dates(db_url: str) -> pd.DataFrame:
    """Load the minimum race_date per (race_slug, year) as the race start."""
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()
    cur.execute("""
        SELECT race_slug, year, MIN(race_date) as race_start
        FROM race_results
        WHERE race_date IS NOT NULL
          AND category = 'stage'
          AND race_type IN ('grand_tour', 'mini_tour')
        GROUP BY race_slug, year
    """)
    cols = [desc[0] for desc in cur.description]
    rows = cur.fetchall()
    cur.close()
    conn.close()
    df = pd.DataFrame(rows, columns=cols)
    df["race_start"] = pd.to_datetime(df["race_start"])
    return df


def build_stage_features(db_url: str | None = None) -> pd.DataFrame:
    """Build type-specific stage features per rider per race.

    For each rider × target_race, looks back 12m and 6m at the rider's
    stage history (before the target race date) and computes per-type features.

    Returns a DataFrame joinable on (rider_id, race_slug, year).
    """
    url = db_url or DB_URL

    print("Loading stage history for features...")
    history = _load_stage_history(url)
    race_dates = _load_race_dates(url)
    print(f"  {len(history):,} stage results, {len(race_dates)} races")

    # Load stage targets to get the rider×race universe
    targets = pd.read_parquet(
        os.path.join(os.path.dirname(__file__), "..", "cache", "stage_targets.parquet")
    )
    target_keys = targets[["rider_id", "race_slug", "year"]].drop_duplicates()
    target_keys = target_keys.merge(
        race_dates, on=["race_slug", "year"], how="left"
    )
    print(f"  {len(target_keys):,} rider×race combinations to featurize")

    # Pre-sort history for efficient lookback
    history = history.sort_values("race_date").reset_index(drop=True)

    # Build features using vectorized merge + filter approach
    # For each target race, we need the rider's history BEFORE that race date.
    # Strategy: cross-join target_keys with history on rider_id, then filter
    # by date window. This is memory-intensive but fast.
    #
    # For 30K targets × ~200 historical results per rider, the cross join
    # would be ~6M rows — manageable.

    print("Computing type-specific features (vectorized)...")

    # Merge: for each target row, find all historical stage results for that rider
    merged = target_keys.merge(
        history[["rider_id", "race_date", "stage_type", "stage_pts",
                 "weighted_pts", "is_top10", "position"]],
        on="rider_id",
        suffixes=("", "_hist"),
    )
    print(f"  Merged shape: {len(merged):,}")

    # Filter: only history BEFORE the target race
    merged = merged[merged["race_date"] < merged["race_start"]].copy()
    print(f"  After date filter: {len(merged):,}")

    # Compute days_before for window filtering
    merged["days_before"] = (merged["race_start"] - merged["race_date"]).dt.days

    # Build features per window and type
    all_features = []

    for window_name, window_days in WINDOWS.items():
        windowed = merged[merged["days_before"] <= window_days]

        for st in STAGE_TYPES:
            st_data = windowed[windowed["stage_type"] == st]

            # Group by target (rider_id, race_slug, year)
            grouped = st_data.groupby(["rider_id", "race_slug", "year"]).agg(
                pts=("stage_pts", "sum"),
                weighted_pts=("weighted_pts", "sum"),
                top10s=("is_top10", "sum"),
                starts=("position", "count"),
            ).reset_index()

            grouped = grouped.rename(columns={
                "pts": f"{st}_pts_{window_name}",
                "weighted_pts": f"{st}_strength_{window_name}",
                "top10s": f"{st}_top10s_{window_name}",
                "starts": f"{st}_starts_{window_name}",
            })

            # Top-10 rate
            starts_col = f"{st}_starts_{window_name}"
            top10_col = f"{st}_top10s_{window_name}"
            grouped[f"{st}_top10_rate_{window_name}"] = (
                grouped[top10_col] / grouped[starts_col]
            ).fillna(0.0)

            all_features.append(grouped)

    # Start with target keys as base
    result = target_keys[["rider_id", "race_slug", "year"]].copy()

    # Merge all feature groups
    for feat_df in all_features:
        result = result.merge(
            feat_df, on=["rider_id", "race_slug", "year"], how="left"
        )

    # Fill NaN with 0 (rider had no history of that type in that window)
    feat_cols = [c for c in result.columns if c not in ["rider_id", "race_slug", "year"]]
    result[feat_cols] = result[feat_cols].fillna(0.0)

    print(f"\nStage features built: {len(result):,} rows, {len(feat_cols)} feature columns")
    print(f"Feature columns: {sorted(feat_cols)}")

    return result


def compute_stage_features_ondemand(
    rider_ids: list[str],
    cutoff_date,
    db_url: str | None = None,
) -> pd.DataFrame:
    """Compute stage features on-demand for a set of riders at a cutoff date.

    Used for future race predictions where the cached parquet has no data.
    Same computation as build_stage_features but for a single prediction request.
    """
    url = db_url or DB_URL
    history = _load_stage_history(url)
    history = history.sort_values("race_date").reset_index(drop=True)

    cutoff = pd.Timestamp(cutoff_date)

    target_keys = pd.DataFrame({"rider_id": rider_ids, "race_start": cutoff})

    merged = target_keys.merge(
        history[["rider_id", "race_date", "stage_type", "stage_pts",
                 "weighted_pts", "is_top10", "position"]],
        on="rider_id",
        suffixes=("", "_hist"),
    )
    merged = merged[merged["race_date"] < merged["race_start"]].copy()
    if merged.empty:
        result = pd.DataFrame({"rider_id": rider_ids})
        for window_name in WINDOWS:
            for st in STAGE_TYPES:
                for suffix in ["pts", "strength", "top10s", "starts", "top10_rate"]:
                    result[f"{st}_{suffix}_{window_name}"] = 0.0
        return result

    merged["days_before"] = (merged["race_start"] - merged["race_date"]).dt.days

    all_features = []
    for window_name, window_days in WINDOWS.items():
        windowed = merged[merged["days_before"] <= window_days]
        for st in STAGE_TYPES:
            st_data = windowed[windowed["stage_type"] == st]
            grouped = st_data.groupby("rider_id").agg(
                pts=("stage_pts", "sum"),
                weighted_pts=("weighted_pts", "sum"),
                top10s=("is_top10", "sum"),
                starts=("position", "count"),
            ).reset_index()
            grouped = grouped.rename(columns={
                "pts": f"{st}_pts_{window_name}",
                "weighted_pts": f"{st}_strength_{window_name}",
                "top10s": f"{st}_top10s_{window_name}",
                "starts": f"{st}_starts_{window_name}",
            })
            starts_col = f"{st}_starts_{window_name}"
            top10_col = f"{st}_top10s_{window_name}"
            grouped[f"{st}_top10_rate_{window_name}"] = (
                grouped[top10_col] / grouped[starts_col]
            ).fillna(0.0)
            all_features.append(grouped)

    result = pd.DataFrame({"rider_id": rider_ids})
    for feat_df in all_features:
        result = result.merge(feat_df, on="rider_id", how="left")

    feat_cols = [c for c in result.columns if c != "rider_id"]
    result[feat_cols] = result[feat_cols].fillna(0.0)
    return result


def save_stage_features(db_url: str | None = None) -> str:
    """Build and save stage features to parquet."""
    df = build_stage_features(db_url)
    cache_dir = os.path.join(os.path.dirname(__file__), "..", "cache")
    os.makedirs(cache_dir, exist_ok=True)
    path = os.path.join(cache_dir, "stage_features.parquet")
    df.to_parquet(path, index=False)
    print(f"\nSaved to {path}")
    return path


if __name__ == "__main__":
    save_stage_features()
