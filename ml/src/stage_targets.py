"""
Stage source target construction (Feature 012, Step 2).

Builds per-rider, per-race targets split by stage type:
  - flat_pts_per_stage, hilly_pts_per_stage, mountain_pts_per_stage, itt_pts_per_stage
  - scoreable_X binary targets (for gate models)
  - n_X_stages_ridden denominators (for audit)
  - sample_weight by race class

Joinable with the existing cache on (rider_id, race_slug, year).

Usage:
    from ml.src.stage_targets import build_stage_targets
    targets_df = build_stage_targets(db_url)
"""

from __future__ import annotations

import os

import numpy as np
import pandas as pd
import psycopg2

from .points import STAGE_POINTS

DB_URL = os.environ.get(
    "DATABASE_URL", "postgresql://cycling:cycling@localhost:5432/cycling_analyzer"
)

# Stage type mapping (from operational plan)
STAGE_TYPE_MAP = {
    "p1": "flat",
    "p2": "flat",
    "p3": "hilly",
    "p4": "mountain",
    "p5": "mountain",
}

STAGE_TYPES = ["flat", "hilly", "mountain", "itt"]

# Race-class sample weights (from operational plan)
RACE_CLASS_WEIGHTS = {
    ("grand_tour", "UWT"): 1.0,
    ("mini_tour", "UWT"): 0.7,
    ("mini_tour", "Pro"): 0.4,
    ("mini_tour", "1"): 0.4,
}


def _load_stage_results(db_url: str) -> pd.DataFrame:
    """Load stage-category results with metadata for stage races."""
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()
    cur.execute("""
        SELECT rr.rider_id, rr.race_slug, rr.race_type, rr.race_class,
               rr.year, rr.position, rr.stage_number, rr.dnf,
               rr.parcours_type, rr.is_itt, rr.race_date
        FROM race_results rr
        WHERE rr.race_date IS NOT NULL
          AND rr.category = 'stage'
          AND rr.race_type IN ('grand_tour', 'mini_tour')
        ORDER BY rr.race_date, rr.stage_number
    """)
    cols = [desc[0] for desc in cur.description]
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return pd.DataFrame(rows, columns=cols)


def _classify_stage_type(parcours_type, is_itt: bool) -> str | None:
    """Map parcours_type + is_itt to stage type."""
    if is_itt:
        return "itt"
    if parcours_type is None or (isinstance(parcours_type, float) and np.isnan(parcours_type)):
        return None
    return STAGE_TYPE_MAP.get(parcours_type)


def _compute_stage_pts(position) -> float:
    """Fantasy points for a stage result position."""
    if position is None or (isinstance(position, float) and np.isnan(position)):
        return 0.0
    return float(STAGE_POINTS.get(int(position), 0))


def _get_sample_weight(race_type: str, race_class: str) -> float:
    """Race-class weight for training."""
    return RACE_CLASS_WEIGHTS.get((race_type, race_class), 0.4)


def build_stage_targets(db_url: str | None = None) -> pd.DataFrame:
    """Build type-split stage targets per rider per race.

    Returns a DataFrame with one row per (rider_id, race_slug, year) containing:
      - {type}_pts_per_stage: normalized points per stage ridden of that type
      - {type}_total_pts: total raw points in that type
      - n_{type}_stages_ridden: denominator (for audit)
      - scoreable_{type}: binary 1 if rider scored >0 in that type
      - n_{type}_stages_race: total stages of that type in the race (for aggregation)
      - stage_sample_weight: race-class weight
      - race_type, race_class, race_date: metadata
    """
    url = db_url or DB_URL

    print("Loading stage results...")
    raw = _load_stage_results(url)
    print(f"  {len(raw):,} stage result rows")

    # Classify stage types (vectorized)
    raw["stage_type"] = np.where(
        raw["is_itt"],
        "itt",
        raw["parcours_type"].map(STAGE_TYPE_MAP),
    )

    # Drop unclassifiable stages
    n_unclass = raw["stage_type"].isna().sum()
    raw = raw[raw["stage_type"].notna()].copy()
    print(f"  Dropped {n_unclass:,} unclassifiable rows ({100*n_unclass/(len(raw)+n_unclass):.1f}%)")

    # Compute stage points (vectorized)
    pts_map = pd.Series(STAGE_POINTS)
    raw["stage_pts"] = raw["position"].map(pts_map).fillna(0.0)

    # Filter to finished stages only (stage_ridden = dnf==false)
    finished = raw[raw["dnf"] == False].copy()  # noqa: E712
    print(f"  Finished stage results: {len(finished):,}")

    # ── Per rider × race × stage_type aggregation ────────────────────
    rider_type = (
        finished.groupby(["rider_id", "race_slug", "year", "race_type", "race_class",
                          "stage_type"])
        .agg(
            total_pts=("stage_pts", "sum"),
            n_stages_ridden=("stage_number", "nunique"),
        )
        .reset_index()
    )
    rider_type["pts_per_stage"] = rider_type["total_pts"] / rider_type["n_stages_ridden"]
    rider_type["scoreable"] = (rider_type["total_pts"] > 0).astype(int)

    # ── Race-level stage counts (total stages of each type) ──────────
    # Unique stages per race (one row per stage, not per rider)
    stage_inventory = (
        finished.groupby(["race_slug", "year", "stage_number"])
        .agg(stage_type=("stage_type", "first"))
        .reset_index()
    )
    race_type_counts = (
        stage_inventory.groupby(["race_slug", "year", "stage_type"])
        .size()
        .reset_index(name="n_stages_race")
    )

    # ── Pivot to wide format: one row per (rider_id, race_slug, year) ─
    # Get all unique rider×race combinations (from finished data)
    # race_date varies per stage, so take the min (race start date)
    rider_races = (
        finished.groupby(["rider_id", "race_slug", "year", "race_type", "race_class"])
        .agg(race_date=("race_date", "min"))
        .reset_index()
    )

    # For each stage type, merge the per-type stats
    result = rider_races.copy()

    for st in STAGE_TYPES:
        st_data = rider_type[rider_type["stage_type"] == st][
            ["rider_id", "race_slug", "year", "total_pts", "n_stages_ridden",
             "pts_per_stage", "scoreable"]
        ].rename(columns={
            "total_pts": f"{st}_total_pts",
            "n_stages_ridden": f"n_{st}_stages_ridden",
            "pts_per_stage": f"{st}_pts_per_stage",
            "scoreable": f"scoreable_{st}",
        })
        result = result.merge(st_data, on=["rider_id", "race_slug", "year"], how="left")

        # Merge race-level stage counts
        st_counts = race_type_counts[race_type_counts["stage_type"] == st][
            ["race_slug", "year", "n_stages_race"]
        ].rename(columns={"n_stages_race": f"n_{st}_stages_race"})
        result = result.merge(st_counts, on=["race_slug", "year"], how="left")

    # Fill NaN: if a rider didn't ride any stages of a type, they score 0
    for st in STAGE_TYPES:
        result[f"{st}_total_pts"] = result[f"{st}_total_pts"].fillna(0.0)
        result[f"n_{st}_stages_ridden"] = result[f"n_{st}_stages_ridden"].fillna(0).astype(int)
        result[f"{st}_pts_per_stage"] = result[f"{st}_pts_per_stage"].fillna(0.0)
        result[f"scoreable_{st}"] = result[f"scoreable_{st}"].fillna(0).astype(int)
        result[f"n_{st}_stages_race"] = result[f"n_{st}_stages_race"].fillna(0).astype(int)

    # Sample weight (vectorized)
    weight_map = pd.Series(RACE_CLASS_WEIGHTS)
    weight_keys = list(zip(result["race_type"], result["race_class"]))
    result["stage_sample_weight"] = pd.Series(weight_keys).map(
        lambda k: RACE_CLASS_WEIGHTS.get(k, 0.4)
    ).values

    # Aggregate total stage pts (sum across all types)
    result["actual_stage_pts_typed"] = sum(
        result[f"{st}_total_pts"] for st in STAGE_TYPES
    )

    # NOTE: riders with n_X_stages_ridden == 0 have pts_per_stage = 0 by fill.
    # For TRAINING per-type models, filter to n_X_stages_ridden > 0 (only riders
    # with actual exposure to that stage type). For PREDICTION aggregation,
    # multiply pred_pts_per_stage × n_X_stages_race, so no-exposure riders
    # contribute 0 naturally.

    print(f"\nStage targets built: {len(result):,} rider×race observations")
    print(f"  Year range: {result['year'].min()} - {result['year'].max()}")
    print(f"  Races: {result.groupby(['race_slug', 'year']).ngroups}")

    # Summary stats
    for st in STAGE_TYPES:
        col = f"{st}_pts_per_stage"
        n_nonzero = (result[col] > 0).sum()
        zero_pct = 100 * (1 - n_nonzero / len(result))
        mean_nz = result.loc[result[col] > 0, col].mean() if n_nonzero > 0 else 0
        print(f"  {st:>10}: {zero_pct:.1f}% zero, mean(non-zero)={mean_nz:.2f} pts/stg")

    return result


def save_stage_targets(db_url: str | None = None) -> str:
    """Build and save stage targets to parquet."""
    df = build_stage_targets(db_url)
    cache_dir = os.path.join(os.path.dirname(__file__), "..", "cache")
    os.makedirs(cache_dir, exist_ok=True)
    path = os.path.join(cache_dir, "stage_targets.parquet")
    df.to_parquet(path, index=False)
    print(f"\nSaved to {path}")
    return path


if __name__ == "__main__":
    save_stage_targets()
