"""
EDA for Stage Source (Feature 012, Step 1).

Answers the questions from the operational plan:
1. Coverage of parcours_type and is_itt
2. Distribution of zeros by stage type per rider per race
3. Result statuses → stages_ridden definition
4. Stage counts by type per race
5. Architecture decision: ≥85% zeros → gate+magnitude

Run: python -m ml.src.eda_stage_source
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

# Stage type mapping from the operational plan
STAGE_TYPE_MAP = {
    "p1": "flat",
    "p2": "flat",
    "p3": "hilly",
    "p4": "mountain",
    "p5": "mountain",
}


def load_stage_results() -> pd.DataFrame:
    """Load all stage-category results with metadata."""
    conn = psycopg2.connect(DB_URL)
    df = pd.read_sql(
        """
        SELECT rr.rider_id, rr.race_slug, rr.race_name, rr.race_type, rr.race_class,
               rr.year, rr.category, rr.position, rr.stage_number, rr.dnf,
               rr.parcours_type, rr.is_itt, rr.is_ttt, rr.race_date,
               r.full_name as rider_name
        FROM race_results rr
        JOIN riders r ON rr.rider_id = r.id
        WHERE rr.race_date IS NOT NULL
          AND rr.race_type IN ('grand_tour', 'mini_tour')
        ORDER BY rr.race_date, rr.stage_number
        """,
        conn,
    )
    conn.close()
    return df


def classify_stage_type(row: pd.Series) -> str | None:
    """Map parcours_type + is_itt to stage type."""
    if row["is_itt"]:
        return "itt"
    pt = row["parcours_type"]
    if pt is None or (isinstance(pt, float) and np.isnan(pt)):
        return None
    return STAGE_TYPE_MAP.get(pt)


def compute_stage_pts(position) -> float:
    """Fantasy points for a stage result."""
    if position is None or (isinstance(position, float) and np.isnan(position)):
        return 0.0
    return float(STAGE_POINTS.get(int(position), 0))


def main():
    print("=" * 70)
    print("STAGE SOURCE EDA — Feature 012, Step 1")
    print("=" * 70)

    # ── Load data ────────────────────────────────────────────────────
    df_all = load_stage_results()
    print(f"\nTotal results loaded: {len(df_all):,}")
    print(f"Categories present: {sorted(df_all['category'].unique())}")
    print(f"Race types: {df_all['race_type'].value_counts().to_dict()}")

    # Filter to stage results only
    stages = df_all[df_all["category"] == "stage"].copy()
    print(f"\nStage results: {len(stages):,}")
    print(f"Unique races: {stages.groupby(['race_slug', 'year']).ngroups}")
    print(f"Year range: {stages['year'].min()} - {stages['year'].max()}")

    # ── 1. Coverage of parcours_type and is_itt ──────────────────────
    print("\n" + "=" * 70)
    print("1. PARCOURS_TYPE AND IS_ITT COVERAGE")
    print("=" * 70)

    total = len(stages)
    parcours_counts = stages["parcours_type"].value_counts(dropna=False)
    print(f"\nparcours_type distribution:")
    for val, count in parcours_counts.items():
        label = val if val is not None else "NULL"
        print(f"  {label:>6}: {count:>6,} ({100*count/total:.1f}%)")

    itt_counts = stages["is_itt"].value_counts(dropna=False)
    print(f"\nis_itt distribution:")
    for val, count in itt_counts.items():
        print(f"  {str(val):>6}: {count:>6,} ({100*count/total:.1f}%)")

    ttt_counts = stages["is_ttt"].value_counts(dropna=False)
    print(f"\nis_ttt distribution:")
    for val, count in ttt_counts.items():
        print(f"  {str(val):>6}: {count:>6,} ({100*count/total:.1f}%)")

    # Classify stage types
    stages["stage_type"] = stages.apply(classify_stage_type, axis=1)
    type_counts = stages["stage_type"].value_counts(dropna=False)
    print(f"\nDerived stage_type distribution:")
    for val, count in type_counts.items():
        label = val if val is not None else "UNCLASSIFIABLE"
        print(f"  {label:>15}: {count:>6,} ({100*count/total:.1f}%)")

    # Coverage by race_type
    for rt in ["grand_tour", "mini_tour"]:
        sub = stages[stages["race_type"] == rt]
        null_pct = sub["stage_type"].isna().mean() * 100
        print(f"\n  {rt}: {len(sub):,} stage results, {null_pct:.1f}% unclassifiable")

    # ── 2. Result status analysis → stages_ridden definition ─────────
    print("\n" + "=" * 70)
    print("2. RESULT STATUS ANALYSIS (stages_ridden definition)")
    print("=" * 70)

    print(f"\ndnf distribution:")
    dnf_counts = stages["dnf"].value_counts(dropna=False)
    for val, count in dnf_counts.items():
        print(f"  dnf={str(val):>6}: {count:>6,} ({100*count/total:.1f}%)")

    # Position analysis for dnf rows
    dnf_rows = stages[stages["dnf"] == True]  # noqa: E712
    print(f"\nDNF rows with position != null: {dnf_rows['position'].notna().sum()}")
    print(f"DNF rows with position == null: {dnf_rows['position'].isna().sum()}")

    # Can DNF riders score fantasy points?
    dnf_with_pos = dnf_rows[dnf_rows["position"].notna()]
    if len(dnf_with_pos) > 0:
        dnf_with_pos_pts = dnf_with_pos["position"].apply(
            lambda p: float(STAGE_POINTS.get(int(p), 0))
        )
        print(f"  DNF with scoreable position (top-20): {(dnf_with_pos_pts > 0).sum()}")
        print(f"  Example DNF with position:")
        print(dnf_with_pos[["rider_name", "race_slug", "year", "stage_number", "position"]].head(5).to_string())

    # Non-DNF rows without position (should be 0)
    non_dnf_no_pos = stages[(stages["dnf"] != True) & (stages["position"].isna())]  # noqa: E712
    print(f"\nNon-DNF rows with position == null: {len(non_dnf_no_pos)}")

    # Proposed definition: stage ridden = has a row with dnf=false (has valid result)
    # DNF rows = did not finish, position is null, no points → do NOT count as ridden
    print("\n--- PROPOSED DEFINITION ---")
    print("stage_ridden = row exists AND dnf == false (rider finished the stage)")
    print("Rationale: DNF riders have position=null → 0 fantasy pts → no scoring opportunity")

    # ── 3. Zero distribution by stage type ───────────────────────────
    print("\n" + "=" * 70)
    print("3. ZERO DISTRIBUTION BY STAGE TYPE")
    print("=" * 70)

    # Only classifiable, finished stages
    finished = stages[(stages["stage_type"].notna()) & (stages["dnf"] != True)].copy()  # noqa: E712
    finished["stage_pts"] = finished["position"].apply(compute_stage_pts)
    print(f"\nFinished + classifiable stage results: {len(finished):,}")

    # Per rider × race × stage_type: aggregate points
    rider_race_type = (
        finished.groupby(["rider_id", "race_slug", "year", "race_type", "stage_type"])
        .agg(
            total_pts=("stage_pts", "sum"),
            n_stages_ridden=("stage_number", "nunique"),
            rider_name=("rider_name", "first"),
        )
        .reset_index()
    )
    rider_race_type["pts_per_stage"] = (
        rider_race_type["total_pts"] / rider_race_type["n_stages_ridden"]
    )
    rider_race_type["is_zero"] = rider_race_type["total_pts"] == 0

    print(f"\nRider × race × stage_type observations: {len(rider_race_type):,}")

    # Zero rate by stage type
    print(f"\n{'Stage Type':>12} | {'Total':>7} | {'Zeros':>7} | {'Zero %':>7} | {'Architecture':>18}")
    print("-" * 70)
    for st in ["flat", "hilly", "mountain", "itt"]:
        sub = rider_race_type[rider_race_type["stage_type"] == st]
        n_total = len(sub)
        n_zero = sub["is_zero"].sum()
        zero_pct = 100 * n_zero / n_total if n_total > 0 else 0
        arch = "gate + magnitude" if zero_pct >= 85 else "direct regression"
        print(f"{st:>12} | {n_total:>7,} | {n_zero:>7,} | {zero_pct:>6.1f}% | {arch:>18}")

    # Same split by race_type
    for rt in ["grand_tour", "mini_tour"]:
        print(f"\n  --- {rt} ---")
        sub_rt = rider_race_type[rider_race_type["race_type"] == rt]
        print(f"  {'Stage Type':>12} | {'Total':>7} | {'Zeros':>7} | {'Zero %':>7}")
        print(f"  " + "-" * 50)
        for st in ["flat", "hilly", "mountain", "itt"]:
            sub = sub_rt[sub_rt["stage_type"] == st]
            n_total = len(sub)
            n_zero = sub["is_zero"].sum()
            zero_pct = 100 * n_zero / n_total if n_total > 0 else 0
            print(f"  {st:>12} | {n_total:>7,} | {n_zero:>7,} | {zero_pct:>6.1f}%")

    # ── 4. Distribution of pts_per_stage for non-zero riders ─────────
    print("\n" + "=" * 70)
    print("4. PTS_PER_STAGE DISTRIBUTION (non-zero riders)")
    print("=" * 70)

    for st in ["flat", "hilly", "mountain", "itt"]:
        sub = rider_race_type[
            (rider_race_type["stage_type"] == st) & (~rider_race_type["is_zero"])
        ]
        if len(sub) == 0:
            print(f"\n{st}: no non-zero observations")
            continue
        desc = sub["pts_per_stage"].describe(percentiles=[0.25, 0.5, 0.75, 0.9])
        print(f"\n{st} (n={len(sub):,}):")
        print(f"  mean={desc['mean']:.2f}, median={desc['50%']:.2f}, "
              f"p75={desc['75%']:.2f}, p90={desc['90%']:.2f}, max={desc['max']:.2f}")

        # Top scorers example
        top5 = sub.nlargest(5, "pts_per_stage")
        print(f"  Top 5:")
        for _, row in top5.iterrows():
            print(f"    {row['rider_name']:25s} {row['race_slug']:25s} "
                  f"{row['year']} pts/stg={row['pts_per_stage']:.1f} "
                  f"(total={row['total_pts']:.0f}, n={row['n_stages_ridden']})")

    # ── 5. Stage counts by type per race ─────────────────────────────
    print("\n" + "=" * 70)
    print("5. STAGE COUNTS BY TYPE PER RACE")
    print("=" * 70)

    # Build stage inventory per race (unique stages, not rider results)
    stage_inventory = (
        finished.groupby(["race_slug", "year", "race_type", "stage_number"])
        .agg(stage_type=("stage_type", "first"))
        .reset_index()
    )
    race_stage_counts = (
        stage_inventory.groupby(["race_slug", "year", "race_type", "stage_type"])
        .size()
        .unstack(fill_value=0)
        .reset_index()
    )

    # Ensure all columns exist
    for col in ["flat", "hilly", "mountain", "itt"]:
        if col not in race_stage_counts.columns:
            race_stage_counts[col] = 0

    race_stage_counts["total"] = race_stage_counts[["flat", "hilly", "mountain", "itt"]].sum(axis=1)

    print(f"\nRaces with stage data: {len(race_stage_counts)}")

    # Show GT races
    gts = race_stage_counts[race_stage_counts["race_type"] == "grand_tour"].sort_values(
        ["race_slug", "year"]
    )
    print(f"\n--- Grand Tours ({len(gts)}) ---")
    print(f"{'Race':30s} {'Year':>4} | {'flat':>4} {'hilly':>5} {'mtn':>4} {'itt':>3} | {'total':>5}")
    print("-" * 65)
    for _, r in gts.iterrows():
        print(f"{r['race_slug']:30s} {r['year']:>4} | {r['flat']:>4} {r['hilly']:>5} "
              f"{r['mountain']:>4} {r['itt']:>3} | {r['total']:>5}")

    # Show average stage distribution
    print(f"\nAverage stage distribution (GT):")
    for col in ["flat", "hilly", "mountain", "itt"]:
        mean_val = gts[col].mean()
        print(f"  {col:>10}: {mean_val:.1f} stages (avg)")

    # Mini tours summary
    minis = race_stage_counts[race_stage_counts["race_type"] == "mini_tour"]
    print(f"\n--- Mini Tours ({len(minis)}) ---")
    print(f"Average stage distribution:")
    for col in ["flat", "hilly", "mountain", "itt"]:
        mean_val = minis[col].mean()
        print(f"  {col:>10}: {mean_val:.1f} stages (avg)")

    # ── 6. TTT handling ──────────────────────────────────────────────
    print("\n" + "=" * 70)
    print("6. TTT STAGES (excluded from stage_type)")
    print("=" * 70)

    ttt_stages = stages[stages["is_ttt"] == True]  # noqa: E712
    print(f"\nTTT stage results: {len(ttt_stages):,}")
    if len(ttt_stages) > 0:
        ttt_races = ttt_stages.groupby(["race_slug", "year"]).size().reset_index(name="n_results")
        print(f"Races with TTT: {len(ttt_races)}")
        for _, r in ttt_races.iterrows():
            print(f"  {r['race_slug']} {r['year']}: {r['n_results']} results")

    # ── 7. Unclassifiable stages ─────────────────────────────────────
    print("\n" + "=" * 70)
    print("7. UNCLASSIFIABLE STAGES (parcours_type=NULL, is_itt=false)")
    print("=" * 70)

    unclass = stages[stages["stage_type"].isna() & (stages["is_ttt"] != True)]  # noqa: E712
    print(f"\nUnclassifiable stage results: {len(unclass):,}")
    if len(unclass) > 0:
        unclass_races = (
            unclass.groupby(["race_slug", "year", "stage_number"])
            .size()
            .reset_index(name="n_results")
        )
        print(f"Unique unclassifiable stages: {len(unclass_races)}")
        print(f"Races affected:")
        for race, group in unclass_races.groupby(["race_slug", "year"]):
            print(f"  {race[0]} {race[1]}: stages {sorted(group['stage_number'].tolist())}")

    # ── Summary & architecture decision ──────────────────────────────
    print("\n" + "=" * 70)
    print("SUMMARY — ARCHITECTURE DECISION TABLE")
    print("=" * 70)

    print(f"\n{'Stage Type':>12} | {'Zero Rate':>10} | {'Architecture':>20} | {'Rationale'}")
    print("-" * 80)
    for st in ["flat", "hilly", "mountain", "itt"]:
        sub = rider_race_type[rider_race_type["stage_type"] == st]
        n_total = len(sub)
        zero_pct = 100 * sub["is_zero"].mean() if n_total > 0 else 0
        if zero_pct >= 85:
            arch = "gate + magnitude"
            rationale = f"≥85% zeros ({zero_pct:.1f}%)"
        else:
            arch = "direct regression"
            rationale = f"<85% zeros ({zero_pct:.1f}%)"
        print(f"{st:>12} | {zero_pct:>9.1f}% | {arch:>20} | {rationale}")

    print("\n--- stages_ridden definition ---")
    print("stage_ridden = row with dnf=false (rider finished the stage with a valid position)")
    print("DNF/DNS/OTL/DSQ → dnf=true, position=null → 0 pts → NOT counted as exposure")


if __name__ == "__main__":
    main()
