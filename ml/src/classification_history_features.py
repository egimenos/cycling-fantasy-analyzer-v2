"""
Classification history features for mountain/sprint finals (Feature 012).

For each rider × target_race, looks back at historical mountain/sprint
final classification positions and computes targeted features.

Features per classification (mountain, sprint):
  - gt_{cls}_final_top5_count_12m: GT top-5 finishes in classification (12m)
  - gt_{cls}_final_pts_12m: total classification pts from GTs (12m)
  - same_race_{cls}_final_best: best position in same race (all history)
  - mini_{cls}_final_top3_count_12m: mini tour top-3 finishes (12m)

Usage:
    from ml.src.classification_history_features import build_classification_features
    feats = build_classification_features(db_url)
"""

from __future__ import annotations

import os

import numpy as np
import pandas as pd
import psycopg2

from .points import FINAL_CLASS_GT, FINAL_CLASS_MINI

DB_URL = os.environ.get(
    "DATABASE_URL", "postgresql://cycling:cycling@localhost:5432/cycling_analyzer"
)

CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", "cache")


def _load_classification_results(db_url: str) -> pd.DataFrame:
    """Load mountain and sprint final classification results."""
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()
    cur.execute("""
        SELECT rr.rider_id, rr.race_slug, rr.race_type, rr.year,
               rr.category, rr.position, rr.race_date
        FROM race_results rr
        WHERE rr.race_date IS NOT NULL
          AND rr.category IN ('mountain', 'sprint')
          AND rr.race_type IN ('grand_tour', 'mini_tour')
          AND rr.position IS NOT NULL
          AND rr.position > 0
        ORDER BY rr.race_date
    """)
    cols = [desc[0] for desc in cur.description]
    rows = cur.fetchall()
    cur.close()
    conn.close()
    df = pd.DataFrame(rows, columns=cols)
    df["race_date"] = pd.to_datetime(df["race_date"])

    # Compute fantasy points
    def _cls_pts(row):
        tbl = FINAL_CLASS_GT if row["race_type"] == "grand_tour" else FINAL_CLASS_MINI
        return float(tbl.get(int(row["position"]), 0))

    df["cls_pts"] = df.apply(_cls_pts, axis=1)
    return df


def _load_race_dates(db_url: str) -> pd.DataFrame:
    """Load race start dates."""
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()
    cur.execute("""
        SELECT race_slug, year, MIN(race_date) as race_start
        FROM race_results
        WHERE race_date IS NOT NULL
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


def build_classification_features(db_url: str | None = None) -> pd.DataFrame:
    """Build classification history features per rider × race."""
    url = db_url or DB_URL

    print("Loading classification history...")
    cls_results = _load_classification_results(url)
    race_dates = _load_race_dates(url)
    print(f"  {len(cls_results):,} classification results")

    # Load cache to get the rider×race universe
    cache_dfs = []
    for yr in range(2022, 2026):
        path = os.path.join(CACHE_DIR, f"features_{yr}.parquet")
        if os.path.exists(path):
            cache_dfs.append(pd.read_parquet(path))
    cache = pd.concat(cache_dfs, ignore_index=True)
    if "race_year" in cache.columns:
        cache = cache.rename(columns={"race_year": "year"})

    target_keys = cache[["rider_id", "race_slug", "year"]].drop_duplicates()
    target_keys = target_keys.merge(race_dates, on=["race_slug", "year"], how="left")
    print(f"  {len(target_keys):,} rider×race to featurize")

    # For each classification type, compute features
    result = target_keys[["rider_id", "race_slug", "year"]].copy()

    for cls_type in ["mountain", "sprint"]:
        cls_data = cls_results[cls_results["category"] == cls_type].copy()

        # Merge with target keys to get lookback window
        merged = target_keys.merge(
            cls_data[["rider_id", "race_slug", "race_type", "year",
                      "position", "cls_pts", "race_date"]].rename(
                columns={
                    "race_slug": "hist_race_slug",
                    "race_type": "hist_race_type",
                    "year": "hist_year",
                    "race_date": "hist_date",
                }
            ),
            on="rider_id",
        )

        # Filter: only history BEFORE target race
        merged = merged[merged["hist_date"] < merged["race_start"]].copy()
        merged["days_before"] = (merged["race_start"] - merged["hist_date"]).dt.days

        # 12-month window
        w12m = merged[merged["days_before"] <= 365]

        # GT results in 12m
        gt_12m = w12m[w12m["hist_race_type"] == "grand_tour"]
        gt_grouped = gt_12m.groupby(["rider_id", "race_slug", "year"]).agg(
            gt_top5_count=("position", lambda x: (x <= 5).sum()),
            gt_pts=("cls_pts", "sum"),
        ).reset_index()
        gt_grouped = gt_grouped.rename(columns={
            "gt_top5_count": f"gt_{cls_type}_final_top5_count_12m",
            "gt_pts": f"gt_{cls_type}_final_pts_12m",
        })

        # Mini results in 12m
        mini_12m = w12m[w12m["hist_race_type"] == "mini_tour"]
        mini_grouped = mini_12m.groupby(["rider_id", "race_slug", "year"]).agg(
            mini_top3_count=("position", lambda x: (x <= 3).sum()),
        ).reset_index()
        mini_grouped = mini_grouped.rename(columns={
            "mini_top3_count": f"mini_{cls_type}_final_top3_count_12m",
        })

        # Same race best (all history)
        same_race = merged[merged["hist_race_slug"] == merged["race_slug"]]
        same_race_best = same_race.groupby(["rider_id", "race_slug", "year"]).agg(
            best_pos=("position", "min"),
        ).reset_index()
        same_race_best = same_race_best.rename(columns={
            "best_pos": f"same_race_{cls_type}_final_best",
        })

        # Merge all into result
        result = result.merge(gt_grouped, on=["rider_id", "race_slug", "year"], how="left")
        result = result.merge(mini_grouped, on=["rider_id", "race_slug", "year"], how="left")
        result = result.merge(same_race_best, on=["rider_id", "race_slug", "year"], how="left")

    # Fill NaN with 0 (no history = 0)
    feat_cols = [c for c in result.columns if c not in ["rider_id", "race_slug", "year"]]
    result[feat_cols] = result[feat_cols].fillna(0)

    # For same_race_*_best: 0 means no history → set to large value (worse than any position)
    for cls_type in ["mountain", "sprint"]:
        col = f"same_race_{cls_type}_final_best"
        result[col] = result[col].replace(0, 99)

    print(f"\nClassification features built: {len(result):,} rows, {len(feat_cols)} features")
    print(f"Features: {sorted(feat_cols)}")

    return result


def save_classification_features(db_url: str | None = None) -> str:
    """Build and save to parquet."""
    df = build_classification_features(db_url)
    path = os.path.join(CACHE_DIR, "classification_history_features.parquet")
    df.to_parquet(path, index=False)
    print(f"Saved to {path}")
    return path


if __name__ == "__main__":
    save_classification_features()
