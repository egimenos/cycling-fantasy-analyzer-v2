"""
Supply estimation for mountain_pass and sprint_inter (Feature 012).

Estimates race supply from historical editions of the same race.
If no prior editions exist, returns 0 (skip capture rate prediction).

For benchmark: can optionally use actual supply for comparison.

Usage:
    from ml.src.supply_estimation import estimate_supply
    mtn_supply, spr_supply = estimate_supply(race_slug, year, historical_df)
"""

from __future__ import annotations

import pandas as pd


def build_supply_history(cache_dfs: list[pd.DataFrame]) -> pd.DataFrame:
    """Build a supply history table from cached feature files.

    Args:
        cache_dfs: List of yearly cache DataFrames (with target_mtn_pass_supply,
                   target_spr_inter_supply columns).

    Returns:
        DataFrame with one row per (race_slug, year) containing supply values.
    """
    df = pd.concat(cache_dfs, ignore_index=True)

    year_col = "race_year" if "race_year" in df.columns else "year"

    supply = df.groupby(["race_slug", year_col]).agg(
        mtn_pass_supply=("target_mtn_pass_supply", "first"),
        spr_inter_supply=("target_spr_inter_supply", "first"),
    ).reset_index()

    if year_col == "race_year":
        supply = supply.rename(columns={"race_year": "year"})

    return supply


def estimate_supply(
    race_slug: str,
    year: int,
    supply_history: pd.DataFrame,
) -> tuple[float, float]:
    """Estimate mountain_pass and sprint_inter supply from prior editions.

    Args:
        race_slug: The race identifier.
        year: The year to predict for.
        supply_history: Output of build_supply_history().

    Returns:
        Tuple of (estimated_mtn_pass_supply, estimated_spr_inter_supply).
        Returns (0.0, 0.0) if no prior editions exist.
    """
    prior = supply_history[
        (supply_history["race_slug"] == race_slug) &
        (supply_history["year"] < year)
    ]

    if len(prior) == 0:
        return 0.0, 0.0

    mtn = prior["mtn_pass_supply"].mean()
    spr = prior["spr_inter_supply"].mean()

    return float(mtn), float(spr)


def estimate_supply_for_races(
    race_keys: pd.DataFrame,
    supply_history: pd.DataFrame,
) -> pd.DataFrame:
    """Vectorized supply estimation for multiple races.

    Args:
        race_keys: DataFrame with race_slug, year columns.
        supply_history: Output of build_supply_history().

    Returns:
        DataFrame with race_slug, year, estimated_mtn_supply, estimated_spr_supply.
    """
    unique_races = race_keys[["race_slug", "year"]].drop_duplicates()

    results = []
    for _, row in unique_races.iterrows():
        mtn, spr = estimate_supply(row["race_slug"], row["year"], supply_history)
        results.append({
            "race_slug": row["race_slug"],
            "year": row["year"],
            "estimated_mtn_supply": mtn,
            "estimated_spr_supply": spr,
        })

    return pd.DataFrame(results)
