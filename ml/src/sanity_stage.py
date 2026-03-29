"""
Stage source sanity checks by rider profile (Feature 012).

Runs config B (features only, Ridge+sqrt) and inspects predictions
for known rider archetypes across GT races in the test folds.

Focus areas:
  - flat: sprinters (Philipsen, Pedersen, Groenewegen, Cavendish, Girmay)
  - mountain: climbers/GC (Pogačar, Vingegaard, Evenepoel, Mas, Tiberi)
  - itt: TT specialists (Evenepoel, Ganna, Küng, Pogačar, Tarling)
  - hilly: mixed archetypes — deep dive into why ρ is weak

Usage:
    cd ml && python -m src.sanity_stage
"""

from __future__ import annotations

import os
import warnings

import numpy as np
import pandas as pd
from scipy import stats
from sklearn.linear_model import Ridge, LogisticRegression

from .benchmark_v8 import FOLDS
from .stage_targets import STAGE_TYPES

warnings.filterwarnings("ignore")

CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", "cache")

SHARED_FEATURES = ["stage_mu", "stage_rd", "age"]
PROFILE_FEATURES = [
    "pct_pts_p1p2", "pct_pts_p4p5", "pct_pts_p3",
    "itt_top10_rate", "stage_wins_flat", "stage_wins_mountain",
]
RAW_TYPE_FEATURES = [
    "{type}_pts_12m", "{type}_pts_6m",
    "{type}_top10_rate_12m", "{type}_top10_rate_6m",
    "{type}_top10s_12m", "{type}_starts_12m",
]
STRENGTH_TYPE_FEATURES = [
    "{type}_strength_12m", "{type}_strength_6m",
]


def _get_features(stage_type: str) -> list[str]:
    raw = [f.format(type=stage_type) for f in RAW_TYPE_FEATURES]
    strength = [f.format(type=stage_type) for f in STRENGTH_TYPE_FEATURES]
    return SHARED_FEATURES + raw + strength + PROFILE_FEATURES


def _load_data():
    cache_dfs = []
    for yr in range(2022, 2026):
        path = os.path.join(CACHE_DIR, f"features_{yr}.parquet")
        if os.path.exists(path):
            cache_dfs.append(pd.read_parquet(path))
    cache = pd.concat(cache_dfs, ignore_index=True)
    targets = pd.read_parquet(os.path.join(CACHE_DIR, "stage_targets.parquet"))
    feats = pd.read_parquet(os.path.join(CACHE_DIR, "stage_features.parquet"))

    if "race_year" in cache.columns and "year" not in cache.columns:
        cache = cache.rename(columns={"race_year": "year"})

    all_needed = set(SHARED_FEATURES + PROFILE_FEATURES)
    cache_cols = ["rider_id", "race_slug", "year"] + [
        c for c in all_needed if c in cache.columns
    ]
    cache_slim = cache[cache_cols].drop_duplicates(subset=["rider_id", "race_slug", "year"])

    # Load rider names from DB
    import psycopg2
    db_url = os.environ.get(
        "DATABASE_URL", "postgresql://cycling:cycling@localhost:5432/cycling_analyzer"
    )
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()
    cur.execute("SELECT id, full_name FROM riders")
    names = pd.DataFrame(cur.fetchall(), columns=["rider_id", "rider_name"])
    cur.close()
    conn.close()
    cache_slim = cache_slim.merge(names, on="rider_id", how="left")

    df = targets.merge(feats, on=["rider_id", "race_slug", "year"], how="inner")
    df = df.merge(cache_slim, on=["rider_id", "race_slug", "year"], how="inner")
    df = df[df["year"] >= 2022].copy()
    return df


def _train_and_predict(df: pd.DataFrame) -> pd.DataFrame:
    """Train config B on all folds, return test predictions with rider names."""
    all_test = []

    for fold_num, fold in FOLDS.items():
        train_df = df[df["year"] <= fold["train_end"]].copy()
        test_df = df[df["year"] == fold["test_year"]].copy()
        if len(test_df) == 0:
            continue

        for st in STAGE_TYPES:
            test_df[f"pred_{st}"] = 0.0

        for st in STAGE_TYPES:
            features = _get_features(st)
            available = [f for f in features if f in df.columns]
            target_col = f"{st}_pts_per_stage"
            exposure_col = f"n_{st}_stages_ridden"
            scoreable_col = f"scoreable_{st}"

            train_exp = train_df[train_df[exposure_col] > 0]
            if len(train_exp) < 10:
                continue

            X_train = train_exp[available].fillna(0)
            y_train = np.sqrt(train_exp[target_col].values)
            weights = np.ones(len(train_exp))  # Config B: uniform

            if st == "itt":
                y_gate = train_exp[scoreable_col].values
                gate = LogisticRegression(C=0.1, class_weight="balanced", max_iter=2000)
                gate.fit(X_train, y_gate, sample_weight=weights)
                nz = y_train > 0
                if nz.sum() < 5:
                    continue
                mag = Ridge(alpha=1.0)
                mag.fit(X_train[nz], y_train[nz])
                X_test = test_df[available].fillna(0)
                gate_pred = gate.predict(X_test)
                mag_pred = np.maximum(np.square(mag.predict(X_test)), 0)
                test_df[f"pred_{st}"] = np.where(gate_pred == 1, mag_pred, 0.0)
            else:
                model = Ridge(alpha=1.0)
                model.fit(X_train, y_train)
                X_test = test_df[available].fillna(0)
                test_df[f"pred_{st}"] = np.maximum(np.square(model.predict(X_test)), 0)

        test_df["pred_stage_total"] = sum(
            test_df[f"pred_{st}"] * test_df[f"n_{st}_stages_race"]
            for st in STAGE_TYPES
        )
        all_test.append(test_df)

    return pd.concat(all_test, ignore_index=True)


def _print_type_check(df: pd.DataFrame, stage_type: str, race_slug: str, year: int, n: int = 15):
    """Show top-N predicted vs actual for a type in a specific race."""
    race = df[(df["race_slug"] == race_slug) & (df["year"] == year)].copy()
    if len(race) == 0:
        print(f"  No data for {race_slug} {year}")
        return

    pred_col = f"pred_{stage_type}"
    actual_col = f"{stage_type}_pts_per_stage"
    actual_total = f"{stage_type}_total_pts"
    n_ridden = f"n_{stage_type}_stages_ridden"

    race = race.sort_values(pred_col, ascending=False)
    top = race.head(n)

    rho, _ = stats.spearmanr(race[pred_col].values, race[actual_col].values)
    nz = race[actual_col] > 0
    rho_nz = np.nan
    if nz.sum() >= 3:
        rho_nz, _ = stats.spearmanr(race.loc[nz, pred_col].values, race.loc[nz, actual_col].values)

    print(f"\n  {race_slug} {year} — {stage_type} (ρ_full={rho:.3f}, ρ_nz={rho_nz:.3f})")
    print(f"  {'Rider':25s} {'Pred':>6} {'Actual':>7} {'TotPts':>7} {'Ridden':>6}")
    print(f"  {'-'*55}")
    for _, r in top.iterrows():
        name = r.get("rider_name", "?")
        if isinstance(name, str) and len(name) > 24:
            name = name[:24]
        pred = r[pred_col]
        act = r[actual_col]
        tot = r[actual_total]
        nrd = r[n_ridden]
        marker = " *" if act > 0 and pred < 0.5 else ("" if act == 0 or pred > 0.5 else " !")
        print(f"  {name:25s} {pred:>6.1f} {act:>7.1f} {tot:>7.0f} {nrd:>6.0f}{marker}")

    # Missed scorers: actual > 0 but not in top-N predicted
    missed = race[(race[actual_col] > 0) & (~race.index.isin(top.index))]
    if len(missed) > 0:
        missed_top = missed.nlargest(5, actual_col)
        print(f"\n  Missed scorers (actual>0, outside top-{n} predicted):")
        for _, r in missed_top.iterrows():
            name = r.get("rider_name", "?")
            if isinstance(name, str) and len(name) > 24:
                name = name[:24]
            print(f"    {name:25s} pred={r[pred_col]:.1f}, actual={r[actual_col]:.1f}")


def main():
    print("=" * 70)
    print("STAGE SOURCE — SANITY CHECKS BY RIDER PROFILE")
    print("Config B (features only, Ridge+sqrt)")
    print("=" * 70)

    df = _load_data()
    print(f"Dataset: {len(df):,} rows")

    preds = _train_and_predict(df)
    gt_preds = preds[preds["race_type"] == "grand_tour"]
    print(f"GT predictions: {len(gt_preds):,} rows")

    # Available GT races in test folds
    gt_races = gt_preds.groupby(["race_slug", "year"]).size().reset_index(name="n")
    print(f"\nGT races in test folds:")
    for _, r in gt_races.sort_values(["year", "race_slug"]).iterrows():
        print(f"  {r['race_slug']} {r['year']} ({r['n']} riders)")

    # Pick representative races (1 per year if possible)
    representative = [
        ("tour-de-france", 2023),
        ("tour-de-france", 2024),
        ("tour-de-france", 2025),
        ("giro-d-italia", 2023),
        ("giro-d-italia", 2024),
        ("giro-d-italia", 2025),
        ("vuelta-a-espana", 2023),
        ("vuelta-a-espana", 2024),
        ("vuelta-a-espana", 2025),
    ]

    # ── FLAT: sprinters should dominate ──────────────────────────────
    print("\n" + "=" * 70)
    print("FLAT — Do sprinters rise?")
    print("=" * 70)
    for race_slug, year in representative:
        if ((gt_preds["race_slug"] == race_slug) & (gt_preds["year"] == year)).any():
            _print_type_check(gt_preds, "flat", race_slug, year, n=10)

    # ── MOUNTAIN: climbers/GC should dominate ────────────────────────
    print("\n" + "=" * 70)
    print("MOUNTAIN — Do climbers/GC riders rise?")
    print("=" * 70)
    for race_slug, year in representative:
        if ((gt_preds["race_slug"] == race_slug) & (gt_preds["year"] == year)).any():
            _print_type_check(gt_preds, "mountain", race_slug, year, n=10)

    # ── ITT: specialists should dominate ─────────────────────────────
    print("\n" + "=" * 70)
    print("ITT — Do TT specialists rise?")
    print("=" * 70)
    for race_slug, year in [("tour-de-france", 2024), ("giro-d-italia", 2025), ("tour-de-france", 2025)]:
        if ((gt_preds["race_slug"] == race_slug) & (gt_preds["year"] == year)).any():
            _print_type_check(gt_preds, "itt", race_slug, year, n=10)

    # ── HILLY: deep dive ─────────────────────────────────────────────
    print("\n" + "=" * 70)
    print("HILLY — Deep dive (weakest type)")
    print("=" * 70)

    # First: show predictions for races with hilly stages
    for race_slug, year in representative:
        race = gt_preds[(gt_preds["race_slug"] == race_slug) & (gt_preds["year"] == year)]
        if race["n_hilly_stages_race"].iloc[0] > 0 if len(race) > 0 else False:
            _print_type_check(gt_preds, "hilly", race_slug, year, n=10)

    # Hilly archetype analysis: who scores in hilly stages?
    print("\n" + "-" * 60)
    print("HILLY SCORER PROFILES — Who actually scores in hilly GT stages?")
    print("-" * 60)

    hilly_scorers = gt_preds[
        (gt_preds["hilly_total_pts"] > 0) & (gt_preds["n_hilly_stages_ridden"] > 0)
    ].copy()

    if len(hilly_scorers) > 0:
        hilly_scorers["hilly_pred_rank"] = hilly_scorers.groupby(
            ["race_slug", "year"]
        )["pred_hilly"].rank(ascending=False)

        # Categorize by rider profile using existing features
        hilly_scorers["profile"] = "unknown"
        hilly_scorers.loc[hilly_scorers["pct_pts_p1p2"] > 0.5, "profile"] = "sprinter"
        hilly_scorers.loc[hilly_scorers["pct_pts_p4p5"] > 0.4, "profile"] = "climber"
        hilly_scorers.loc[
            (hilly_scorers["pct_pts_p3"] > 0.3) &
            (hilly_scorers["profile"] == "unknown"), "profile"
        ] = "puncheur"
        hilly_scorers.loc[hilly_scorers["profile"] == "unknown", "profile"] = "allrounder"

        profile_stats = hilly_scorers.groupby("profile").agg(
            count=("hilly_total_pts", "count"),
            mean_pts=("hilly_pts_per_stage", "mean"),
            mean_pred=("pred_hilly", "mean"),
            mean_pred_rank=("hilly_pred_rank", "mean"),
        ).round(2)
        print(f"\n  Profiles of GT hilly scorers:")
        print(profile_stats.to_string())

        # Top hilly scorers and their profiles
        top_hilly = hilly_scorers.nlargest(20, "hilly_pts_per_stage")
        print(f"\n  Top 20 GT hilly scorers:")
        print(f"  {'Rider':25s} {'Race':20s} {'Yr':>4} {'Act':>5} {'Pred':>5} {'Profile':>10}")
        for _, r in top_hilly.iterrows():
            name = str(r.get("rider_name", "?"))[:24]
            race = str(r["race_slug"])[:19]
            print(f"  {name:25s} {race:20s} {r['year']:>4} "
                  f"{r['hilly_pts_per_stage']:>5.1f} {r['pred_hilly']:>5.1f} {r['profile']:>10}")

    # Error analysis: biggest misses
    print(f"\n  Biggest hilly prediction errors (GT):")
    hilly_exposed = gt_preds[gt_preds["n_hilly_stages_ridden"] > 0].copy()
    hilly_exposed["hilly_error"] = hilly_exposed["pred_hilly"] - hilly_exposed["hilly_pts_per_stage"]
    hilly_exposed["hilly_abs_error"] = hilly_exposed["hilly_error"].abs()

    # Over-predictions
    over = hilly_exposed.nlargest(10, "hilly_error")
    print(f"\n  Top over-predictions:")
    print(f"  {'Rider':25s} {'Race':20s} {'Yr':>4} {'Pred':>5} {'Act':>5} {'Err':>6}")
    for _, r in over.iterrows():
        name = str(r.get("rider_name", "?"))[:24]
        race = str(r["race_slug"])[:19]
        print(f"  {name:25s} {race:20s} {r['year']:>4} "
              f"{r['pred_hilly']:>5.1f} {r['hilly_pts_per_stage']:>5.1f} {r['hilly_error']:>6.1f}")

    # Under-predictions
    under = hilly_exposed.nsmallest(10, "hilly_error")
    print(f"\n  Top under-predictions:")
    print(f"  {'Rider':25s} {'Race':20s} {'Yr':>4} {'Pred':>5} {'Act':>5} {'Err':>6}")
    for _, r in under.iterrows():
        name = str(r.get("rider_name", "?"))[:24]
        race = str(r["race_slug"])[:19]
        print(f"  {name:25s} {race:20s} {r['year']:>4} "
              f"{r['pred_hilly']:>5.1f} {r['hilly_pts_per_stage']:>5.1f} {r['hilly_error']:>6.1f}")


if __name__ == "__main__":
    main()
