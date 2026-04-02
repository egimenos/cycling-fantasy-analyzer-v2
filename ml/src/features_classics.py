"""
Classic-specific feature extraction — Tier 1.

Computes features for classic (one-day) race prediction:
- Same-race history (best, mean, count, consistency)
- Classic-specific points aggregation (12m/6m/3m)
- Classic rates (top-10 rate, win rate)
- General micro-form (pts_30d, pts_14d, days_since_last)
- Team and prestige features

This is a DECOUPLED pipeline — independent from stage-race features.py.
"""

from __future__ import annotations

from datetime import date, timedelta

import numpy as np
import pandas as pd

from .classic_taxonomy import resolve_slug
from .points import GC_CLASSIC

# ── Feature column lists ────────────────────────────────────────────

TIER1_FEATURE_COLS = [
    # Same-race history
    "same_race_best",
    "same_race_mean",
    "same_race_count",
    "has_same_race",
    "same_race_best_pos",
    "same_race_last_pts",
    "same_race_last_pos",
    # Classic points aggregation
    "pts_classic_12m",
    "pts_classic_6m",
    "pts_classic_3m",
    "classic_top10_rate",
    "classic_win_rate",
    # General micro-form
    "age",
    "days_since_last",
    "pts_30d",
    "pts_14d",
    # Team & prestige
    "team_rank",
    "is_leader",
    "prestige_pts_12m",
]


# ── Main feature computation ────────────────────────────────────────


def compute_classic_features(
    rider_id: str,
    race_slug: str,
    race_date: date | pd.Timestamp,
    rider_history: pd.DataFrame,
    all_classic_results: pd.DataFrame,
    team_info: dict | None = None,
) -> dict:
    """Compute Tier 1 features for a rider in a classic race.

    Args:
        rider_id: Rider UUID.
        race_slug: Classic race slug (e.g., 'ronde-van-vlaanderen').
        race_date: Date of the race (features use only data before this).
        rider_history: All historical results for this rider (all race types).
        all_classic_results: All classic race results (for same-race lookup).
        team_info: Optional dict with team_rank, is_leader keys.

    Returns:
        Dict of feature_name -> value.
    """
    feats: dict[str, float] = {}
    slug = resolve_slug(race_slug)

    if isinstance(race_date, pd.Timestamp):
        race_date_py = race_date.date() if hasattr(race_date, "date") else race_date
        race_date_ts = race_date
    else:
        race_date_py = race_date
        race_date_ts = pd.Timestamp(race_date)

    # ── Same-race history ───────────────────────────────────────────
    _compute_same_race_features(feats, rider_id, slug, race_date_ts, all_classic_results)

    # ── Classic points aggregation ──────────────────────────────────
    _compute_classic_points_features(feats, rider_id, race_date_ts, all_classic_results)

    # ── General micro-form ──────────────────────────────────────────
    _compute_general_features(feats, rider_id, race_date_ts, race_date_py, rider_history)

    # ── Team & prestige ─────────────────────────────────────────────
    _compute_team_prestige_features(feats, rider_id, race_date_ts, rider_history, team_info)

    return feats


# ── Same-race history ────────────────────────────────────────────────


def _compute_same_race_features(
    feats: dict, rider_id: str, race_slug: str,
    race_date: pd.Timestamp, classic_results: pd.DataFrame,
) -> None:
    """How has this rider done in this specific classic before?"""
    if len(classic_results) == 0:
        feats["same_race_best"] = 0.0
        feats["same_race_mean"] = 0.0
        feats["same_race_count"] = 0
        feats["has_same_race"] = 0
        feats["same_race_best_pos"] = np.nan
        feats["same_race_last_pts"] = 0.0
        feats["same_race_last_pos"] = np.nan
        return

    same_race = classic_results[
        (classic_results["rider_id"] == rider_id)
        & (classic_results["race_slug"] == race_slug)
        & (classic_results["race_date"] < race_date)
    ]

    if len(same_race) > 0:
        sr_pts = same_race.groupby("year")["pts"].sum()
        feats["same_race_best"] = float(sr_pts.max())
        feats["same_race_mean"] = float(sr_pts.mean())
        feats["same_race_count"] = len(sr_pts)
        feats["has_same_race"] = 1
        feats["same_race_best_pos"] = float(same_race["position"].min())

        most_recent = same_race.sort_values("race_date").iloc[-1]
        last_pos = most_recent["position"]
        if pd.notna(last_pos):
            feats["same_race_last_pts"] = float(GC_CLASSIC.get(int(last_pos), 0))
            feats["same_race_last_pos"] = float(last_pos)
        else:
            feats["same_race_last_pts"] = 0.0
            feats["same_race_last_pos"] = np.nan
    else:
        feats["same_race_best"] = 0.0
        feats["same_race_mean"] = 0.0
        feats["same_race_count"] = 0
        feats["has_same_race"] = 0
        feats["same_race_best_pos"] = np.nan
        feats["same_race_last_pts"] = 0.0
        feats["same_race_last_pos"] = np.nan


# ── Classic points aggregation ───────────────────────────────────────


def _compute_classic_points_features(
    feats: dict, rider_id: str,
    race_date: pd.Timestamp, classic_results: pd.DataFrame,
) -> None:
    """Classic-specific points and rates over various time windows."""
    if len(classic_results) == 0:
        feats["pts_classic_12m"] = 0.0
        feats["pts_classic_6m"] = 0.0
        feats["pts_classic_3m"] = 0.0
        feats["classic_top10_rate"] = 0.0
        feats["classic_win_rate"] = 0.0
        return

    rider_classics = classic_results[
        (classic_results["rider_id"] == rider_id)
        & (classic_results["race_date"] < race_date)
    ]

    # Time-windowed points
    for window_name, days in [("12m", 365), ("6m", 180), ("3m", 90)]:
        cutoff = race_date - pd.Timedelta(days=days)
        window_df = rider_classics[rider_classics["race_date"] >= cutoff]
        feats[f"pts_classic_{window_name}"] = float(window_df["pts"].sum())

    # Rates over 24 months (more stable with sparse data)
    cutoff_24m = race_date - pd.Timedelta(days=730)
    classic_24m = rider_classics[rider_classics["race_date"] >= cutoff_24m]
    n_starts = classic_24m.groupby(["race_slug", "year"]).ngroups if len(classic_24m) > 0 else 0

    if n_starts > 0:
        top10 = classic_24m[classic_24m["position"] <= 10]
        n_top10 = top10.groupby(["race_slug", "year"]).ngroups if len(top10) > 0 else 0
        feats["classic_top10_rate"] = n_top10 / n_starts

        wins = classic_24m[classic_24m["position"] == 1]
        n_wins = wins.groupby(["race_slug", "year"]).ngroups if len(wins) > 0 else 0
        feats["classic_win_rate"] = n_wins / n_starts
    else:
        feats["classic_top10_rate"] = 0.0
        feats["classic_win_rate"] = 0.0


# ── General micro-form ───────────────────────────────────────────────


def _compute_general_features(
    feats: dict, rider_id: str,
    race_date: pd.Timestamp, race_date_py: date,
    rider_history: pd.DataFrame,
) -> None:
    """General features from ALL race types (not just classics)."""
    if len(rider_history) == 0:
        feats["age"] = np.nan
        feats["days_since_last"] = np.nan
        feats["pts_30d"] = 0.0
        feats["pts_14d"] = 0.0
        return

    # Age — check multiple possible column names
    bd_col = None
    for col_name in ["birth_date", "rider_birth_date"]:
        if col_name in rider_history.columns:
            bd_col = col_name
            break

    birth_dates = rider_history[bd_col].dropna() if bd_col else pd.Series(dtype="datetime64[ns]")
    if len(birth_dates) > 0:
        bd = pd.to_datetime(birth_dates.iloc[0])
        feats["age"] = (race_date - bd).days / 365.25
    else:
        feats["age"] = np.nan

    # Filter to before race date
    hist_before = rider_history[rider_history["race_date"] < race_date]
    if len(hist_before) == 0:
        feats["days_since_last"] = np.nan
        feats["pts_30d"] = 0.0
        feats["pts_14d"] = 0.0
        return

    # Days since last race
    last_race_date = hist_before["race_date"].max()
    feats["days_since_last"] = (race_date - last_race_date).days

    # Micro-form: points in last 30/14 days
    d30 = hist_before[hist_before["race_date"] >= race_date - pd.Timedelta(days=30)]
    d14 = hist_before[hist_before["race_date"] >= race_date - pd.Timedelta(days=14)]
    feats["pts_30d"] = float(d30["pts"].sum()) if len(d30) > 0 else 0.0
    feats["pts_14d"] = float(d14["pts"].sum()) if len(d14) > 0 else 0.0


# ── Team & prestige ──────────────────────────────────────────────────


def _compute_team_prestige_features(
    feats: dict, rider_id: str,
    race_date: pd.Timestamp, rider_history: pd.DataFrame,
    team_info: dict | None,
) -> None:
    """Team context and prestige (UWT) points."""
    feats["team_rank"] = float(team_info.get("team_rank", np.nan)) if team_info else np.nan
    feats["is_leader"] = float(team_info.get("is_leader", 0)) if team_info else 0.0

    if len(rider_history) == 0:
        feats["prestige_pts_12m"] = 0.0
        return

    hist_before = rider_history[rider_history["race_date"] < race_date]
    cutoff_12m = race_date - pd.Timedelta(days=365)
    uwt_12m = hist_before[
        (hist_before["race_date"] >= cutoff_12m)
        & (hist_before["race_class"] == "UWT")
    ] if "race_class" in hist_before.columns else pd.DataFrame()

    feats["prestige_pts_12m"] = float(uwt_12m["pts"].sum()) if len(uwt_12m) > 0 else 0.0


# ── Batch extraction ─────────────────────────────────────────────────


def extract_all_classic_features(
    results_df: pd.DataFrame,
    year: int,
) -> pd.DataFrame:
    """Extract features for all riders in all classic races of a given year.

    Args:
        results_df: Full results DataFrame with pre-computed 'pts' column.
        year: Year to extract features for (test year).

    Returns:
        DataFrame with one row per (rider, race) and all Tier 1 features + target.
    """
    # Classic results with pts
    classic_mask = (results_df["race_type"] == "classic") & (results_df["category"] == "gc")
    all_classics = results_df[classic_mask].copy()

    # Ensure pts column uses GC_CLASSIC for classics
    all_classics["pts"] = all_classics["position"].map(lambda p: float(GC_CLASSIC.get(p, 0)))

    # Ensure race_date is datetime for comparison
    all_classics["race_date"] = pd.to_datetime(all_classics["race_date"])
    results_df = results_df.copy()
    results_df["race_date"] = pd.to_datetime(results_df["race_date"])

    # Test year classics
    year_classics = all_classics[all_classics["year"] == year]
    if len(year_classics) == 0:
        return pd.DataFrame()

    # Historical data (all race types, for general features)
    all_results_with_pts = results_df

    rows = []
    races = year_classics.groupby(["race_slug", "race_date"])
    total_races = len(races)

    for i, ((slug, race_date), race_group) in enumerate(races):
        race_date_ts = pd.Timestamp(race_date)

        # Historical classic results (before this race)
        classic_hist = all_classics[all_classics["race_date"] < race_date_ts]

        for _, rider in race_group.iterrows():
            rid = rider["rider_id"]

            # Rider's full history (all race types, before race date)
            rider_hist = all_results_with_pts[
                (all_results_with_pts["rider_id"] == rid)
                & (all_results_with_pts["race_date"] < race_date_ts)
            ]

            feats = compute_classic_features(
                rider_id=rid,
                race_slug=slug,
                race_date=race_date_ts,
                rider_history=rider_hist,
                all_classic_results=classic_hist,
            )

            # Identity + target
            feats["rider_id"] = rid
            feats["race_slug"] = slug
            feats["year"] = year
            feats["race_date"] = race_date
            feats["rider_name"] = rider.get("rider_name", "")
            pos = rider["position"]
            feats["actual_pts"] = float(GC_CLASSIC.get(int(pos), 0)) if pd.notna(pos) else 0.0
            feats["position"] = int(pos) if pd.notna(pos) else 999

            rows.append(feats)

        if (i + 1) % 10 == 0 or (i + 1) == total_races:
            print(f"    {i+1}/{total_races} races processed ({len(rows)} rider-race rows)")

    return pd.DataFrame(rows)
