"""
Integrated source-by-source benchmark (Feature 012).

Combines all scoring sources into a total fantasy prediction:
  GC:       gc + gc_daily (gate + heuristic position)
  Stage:    flat/hilly/mountain/itt (type-split regression + gate)
  Mountain: mountain_final (gate) + mountain_pass (capture rate)
  Sprint:   sprint_final (heuristic contender) + sprint_inter+reg (capture rate)

Evaluates:
  - Per-source ρ
  - Total ρ
  - Team capture % under 2000 hillios budget (knapsack)
  - Per-source breakdown (for ML service output)

Usage:
    cd ml && python -m src.benchmark_integrated
"""

from __future__ import annotations

import os
import warnings

import numpy as np
import pandas as pd
import psycopg2
from scipy import stats
from sklearn.linear_model import Ridge, LogisticRegression

from .benchmark_v8 import FOLDS, find_optimal_team
from .points import (
    FINAL_CLASS_GT, FINAL_CLASS_MINI,
    estimate_gc_daily_pts,
)
from .stage_targets import STAGE_TYPES
from .supply_estimation import build_supply_history, estimate_supply_for_races

warnings.filterwarnings("ignore")

CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", "cache")
DB_URL = os.environ.get(
    "DATABASE_URL", "postgresql://cycling:cycling@localhost:5432/cycling_analyzer"
)

_GT_FINAL_AVG = sum(FINAL_CLASS_GT.values()) / len(FINAL_CLASS_GT)
_MINI_FINAL_AVG = sum(FINAL_CLASS_MINI.values()) / len(FINAL_CLASS_MINI)

# ── Feature sets (copied from frozen benchmarks) ─────────────────────

SHARED = ["stage_mu", "stage_rd", "age"]
PROFILE = ["pct_pts_p1p2", "pct_pts_p4p5", "pct_pts_p3",
           "itt_top10_rate", "stage_wins_flat", "stage_wins_mountain"]

STAGE_RAW = ["{t}_pts_12m", "{t}_pts_6m", "{t}_top10_rate_12m",
             "{t}_top10_rate_6m", "{t}_top10s_12m", "{t}_starts_12m"]
STAGE_STRENGTH = ["{t}_strength_12m", "{t}_strength_6m"]

MTN_FINAL_FEATS = [
    "gc_mu", "gc_rd", "stage_mu", "pct_pts_p4p5", "stage_wins_mountain",
    "mountain_pts_12m", "mountain_pts_6m", "mountain_strength_12m",
    "mountain_top10_rate_12m", "mountain_top10s_12m",
    "gc_mu_delta_12m", "pts_gc_12m", "sr_gc_top10_rate",
    "target_mountain_pct", "age",
]
MTN_PASS_FEATS = [
    "pct_pts_p4p5", "stage_wins_mountain",
    "mountain_pts_12m", "mountain_pts_6m", "mountain_strength_12m",
    "mountain_top10_rate_12m", "mountain_top10s_12m", "mountain_starts_12m",
    "stage_mu", "gc_mu", "pts_stage_12m", "target_mountain_pct", "age",
]
SPR_INTER_FEATS = [
    "pct_pts_p1p2", "stage_wins_flat",
    "flat_pts_12m", "flat_pts_6m", "flat_strength_12m",
    "flat_top10_rate_12m", "flat_top10s_12m",
    "hilly_pts_12m", "hilly_top10_rate_12m", "pct_pts_p3",
    "stage_mu", "pts_stage_12m", "target_flat_pct", "age",
]

# Sprint final soft rank decay
GT_RANK_DECAY = {1: 50, 2: 35, 3: 25, 4: 15, 5: 10, 6: 4, 7: 2, 8: 1, 9: 0.5, 10: 0.2}
MINI_RANK_DECAY = {1: 40, 2: 25, 3: 15, 4: 5, 5: 2, 6: 1, 7: 0.5}

# ── GC features (from frozen GC pipeline) ────────────────────────────
GC_GATE_FEATS = [
    "gc_mu", "gc_mu_delta_12m", "same_race_gc_best",
    "age", "gc_pts_same_type",
]


def _stage_feats(stage_type):
    raw = [f.format(t=stage_type) for f in STAGE_RAW]
    strength = [f.format(t=stage_type) for f in STAGE_STRENGTH]
    return SHARED + raw + strength + PROFILE


def _load_all_data():
    """Load cache + stage features + stage targets + prices."""
    cache_dfs_raw = []
    for yr in range(2022, 2026):
        path = os.path.join(CACHE_DIR, f"features_{yr}.parquet")
        if os.path.exists(path):
            cache_dfs_raw.append(pd.read_parquet(path))

    cache = pd.concat(cache_dfs_raw, ignore_index=True)
    if "race_year" in cache.columns:
        cache = cache.rename(columns={"race_year": "year"})

    stage_feats = pd.read_parquet(os.path.join(CACHE_DIR, "stage_features.parquet"))
    stage_targets = pd.read_parquet(os.path.join(CACHE_DIR, "stage_targets.parquet"))

    df = cache.merge(stage_feats, on=["rider_id", "race_slug", "year"], how="left")
    df = df.merge(
        stage_targets[["rider_id", "race_slug", "year"] +
                      [c for c in stage_targets.columns
                       if c.endswith("_pts_per_stage") or c.endswith("_stages_race")
                       or c.endswith("_stages_ridden") or c.startswith("scoreable_")
                       or c == "stage_sample_weight" or c == "actual_stage_pts_typed"]],
        on=["rider_id", "race_slug", "year"], how="left",
    )

    # Fill NaN
    fill_cols = [c for c in df.columns if any(
        c.startswith(p) for p in ["flat_", "hilly_", "mountain_", "itt_",
                                   "n_flat", "n_hilly", "n_mountain", "n_itt",
                                   "scoreable_"]
    )]
    df[fill_cols] = df[fill_cols].fillna(0)

    # Build secondary targets
    df["scoreable_mtn_final"] = (df["actual_mountain_final_pts"] > 0).astype(int)
    df["scoreable_spr_final"] = (df["actual_sprint_final_pts"] > 0).astype(int)
    df["mtn_pass_capture_target"] = np.where(
        df["target_mtn_pass_supply"] > 0,
        df["actual_mountain_pass_pts"] / df["target_mtn_pass_supply"], 0.0,
    )
    df["spr_inter_capture_target"] = np.where(
        df["target_spr_inter_supply"] > 0,
        df["actual_sprint_inter_pts"] / df["target_spr_inter_supply"], 0.0,
    )

    # Supply estimation
    supply_hist = build_supply_history(cache_dfs_raw)
    race_keys = df[["race_slug", "year"]].drop_duplicates()
    est = estimate_supply_for_races(race_keys, supply_hist)
    df = df.merge(est, on=["race_slug", "year"], how="left")

    # Load GT completion rates for sprint heuristic
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    cur.execute("""
        SELECT rider_id, race_slug, year,
               MAX(stage_number) as last_stage,
               (SELECT COUNT(DISTINCT rr2.stage_number) FROM race_results rr2
                WHERE rr2.race_slug = rr.race_slug AND rr2.year = rr.year
                  AND rr2.category = 'stage') as total_stages
        FROM race_results rr
        WHERE race_type = 'grand_tour' AND category = 'stage' AND race_date IS NOT NULL
        GROUP BY rider_id, race_slug, year
    """)
    comp_df = pd.DataFrame(cur.fetchall(), columns=[d[0] for d in cur.description])
    comp_df["finished"] = (comp_df["last_stage"] / comp_df["total_stages"]) >= 0.95
    df._completion_df = comp_df  # stash for later use

    # Load prices
    prices_df = pd.read_sql(
        "SELECT rider_id, race_slug, year, price_hillios FROM rider_prices", conn
    )
    conn.close()
    df._prices_df = prices_df

    # Load rider names
    conn2 = psycopg2.connect(DB_URL)
    cur2 = conn2.cursor()
    cur2.execute("SELECT id, full_name FROM riders")
    names = pd.DataFrame(cur2.fetchall(), columns=["rider_id", "rider_name"])
    cur2.close()
    conn2.close()
    df = df.merge(names, on="rider_id", how="left")

    result = df[df["year"] >= 2022].copy()
    result._completion_df = comp_df
    result._prices_df = prices_df
    return result


def _green_contender_score(df, completion_rates):
    """Sprint final heuristic contender score."""
    sprinter = (
        df.get("flat_strength_12m", 0).fillna(0) * 0.3
        + df.get("flat_top10s_12m", 0).fillna(0) * 5.0
        + df.get("stage_wins_flat", 0).fillna(0) * 15.0
        + df.get("flat_top10_rate_12m", 0).fillna(0) * 50.0
    )
    allround = (
        df.get("hilly_pts_12m", 0).fillna(0) * 0.2
        + df.get("pts_stage_12m", 0).fillna(0) * 0.05
        + df.get("pct_pts_p3", 0).fillna(0) * 30.0
        + df.get("stage_mu", 0).fillna(0) * 0.005
    )
    flat_pct = df.get("target_flat_pct", 0).fillna(0.4).clip(0.2, 0.8)
    score = flat_pct * sprinter + (1 - flat_pct) * allround
    survival = df["rider_id"].map(completion_rates).fillna(0.5)
    return score * (0.3 + 0.7 * survival)


def _soft_rank_pts(scores, race_type):
    decay = GT_RANK_DECAY if race_type == "grand_tour" else MINI_RANK_DECAY
    ranks = scores.rank(ascending=False, method="min").astype(int)
    return ranks.map(decay).fillna(0.0)


def run_benchmark():
    print("=" * 70)
    print("INTEGRATED SOURCE-BY-SOURCE BENCHMARK")
    print("=" * 70)

    df = _load_all_data()
    completion_df = df._completion_df
    prices_df = df._prices_df
    print(f"Dataset: {len(df):,} rows, prices: {len(prices_df):,}")

    all_race_results = []

    for fold_num, fold in FOLDS.items():
        train = df[df["year"] <= fold["train_end"]].copy()
        test = df[df["year"] == fold["test_year"]].copy()
        if len(test) == 0:
            continue

        print(f"\n{'='*60}")
        print(f"Fold {fold_num}: train ≤{fold['train_end']}, test={fold['test_year']}")
        print(f"  Train: {len(train):,}, Test: {len(test):,}")

        # ── GC SOURCE ────────────────────────────────────────────────
        # Gate: P(top-20 GC)
        gc_avail = [f for f in GC_GATE_FEATS if f in df.columns]
        gc_target = (train["gc_final_position"].notna() & (train["gc_final_position"] <= 20)).astype(int)
        gc_gate = LogisticRegression(C=0.1, class_weight="balanced", max_iter=2000)
        gc_gate.fit(train[gc_avail].fillna(0), gc_target)

        gc_prob = gc_gate.predict_proba(test[gc_avail].fillna(0))[:, 1]
        # Heuristic position from gc_mu
        gc_mu_vals = test["gc_mu"].fillna(1500).values
        gc_rd_vals = test.get("gc_rd", pd.Series(200, index=test.index)).fillna(200).values
        conservative_mu = gc_mu_vals - 1.0 * gc_rd_vals
        form = test.get("recent_gc_form_score", pd.Series(0, index=test.index)).fillna(0).values
        gc_score = conservative_mu + np.minimum(form * 10, 100)

        # For each race, rank by gc_score among riders with P(top20) >= 0.40
        from .points import GC_GRAND_TOUR, GC_MINI_TOUR
        test["pred_gc_pts"] = 0.0
        test["pred_gc_daily_pts"] = 0.0
        test["_gc_prob"] = gc_prob
        test["_gc_score"] = gc_score

        for (slug, yr), race_df in test.groupby(["race_slug", "year"]):
            race_type = race_df["race_type"].iloc[0]
            n_stages = race_df["target_stage_count"].iloc[0] if "target_stage_count" in race_df.columns else 0
            if n_stages == 0:
                n_stages = 21 if race_type == "grand_tour" else 7

            gc_table = GC_GRAND_TOUR if race_type == "grand_tour" else GC_MINI_TOUR
            max_pos = max(gc_table.keys())

            contenders = race_df[race_df["_gc_prob"] >= 0.40].copy()
            if len(contenders) > 0:
                contenders = contenders.sort_values("_gc_score", ascending=False)
                for pos_rank, (ridx, row) in enumerate(contenders.iterrows(), 1):
                    if pos_rank <= max_pos:
                        test.loc[ridx, "pred_gc_pts"] = gc_table.get(pos_rank, 0)
                        test.loc[ridx, "pred_gc_daily_pts"] = estimate_gc_daily_pts(
                            pos_rank, n_stages, race_type
                        )

        test.drop(columns=["_gc_prob", "_gc_score"], inplace=True)

        # ── STAGE SOURCE ─────────────────────────────────────────────
        for st in STAGE_TYPES:
            test[f"pred_{st}_stage"] = 0.0
            feats = _stage_feats(st)
            avail = [f for f in feats if f in df.columns]
            exposure_col = f"n_{st}_stages_ridden"
            train_exp = train[train[exposure_col] > 0]
            if len(train_exp) < 10:
                continue

            X_train = train_exp[avail].fillna(0)
            y_train = np.sqrt(train_exp[f"{st}_pts_per_stage"].values)

            if st == "itt":
                gate = LogisticRegression(C=0.1, class_weight="balanced", max_iter=2000)
                gate.fit(X_train, train_exp[f"scoreable_{st}"].values)
                nz = y_train > 0
                if nz.sum() < 5:
                    continue
                mag = Ridge(alpha=1.0)
                mag.fit(X_train[nz], y_train[nz])
                X_test = test[avail].fillna(0)
                gate_pred = gate.predict(X_test)
                mag_pred = np.maximum(np.square(mag.predict(X_test)), 0)
                test[f"pred_{st}_stage"] = np.where(gate_pred == 1, mag_pred, 0.0)
            else:
                model = Ridge(alpha=1.0)
                model.fit(X_train, y_train)
                X_test = test[avail].fillna(0)
                test[f"pred_{st}_stage"] = np.maximum(np.square(model.predict(X_test)), 0)

        test["pred_stage_total"] = sum(
            test[f"pred_{st}_stage"] * test[f"n_{st}_stages_race"]
            for st in STAGE_TYPES
        )

        # ── MOUNTAIN FINAL (LogReg gate) ─────────────────────────────
        avail_mf = [f for f in MTN_FINAL_FEATS if f in df.columns]
        gate_mf = LogisticRegression(C=0.1, class_weight="balanced", max_iter=2000)
        gate_mf.fit(train[avail_mf].fillna(0), train["scoreable_mtn_final"].values)
        prob_mf = gate_mf.predict_proba(test[avail_mf].fillna(0))[:, 1]
        avg_mf = test["race_type"].map({"grand_tour": _GT_FINAL_AVG, "mini_tour": _MINI_FINAL_AVG})
        test["pred_mtn_final"] = prob_mf * avg_mf

        # ── MOUNTAIN PASS (capture rate, estimated supply) ───────────
        has_supply = train[train["target_mtn_pass_supply"] > 0]
        avail_mp = [f for f in MTN_PASS_FEATS if f in df.columns]
        reg_mp = Ridge(alpha=1.0)
        reg_mp.fit(has_supply[avail_mp].fillna(0),
                    np.sqrt(has_supply["mtn_pass_capture_target"].values))

        test["pred_mtn_pass"] = 0.0
        has_est = test[test["estimated_mtn_supply"] > 0]
        if len(has_est) > 0:
            pred_cap = np.maximum(np.square(reg_mp.predict(has_est[avail_mp].fillna(0))), 0)
            test.loc[has_est.index, "pred_mtn_pass"] = pred_cap * has_est["estimated_mtn_supply"]

        # ── SPRINT FINAL (heuristic contender) ───────────────────────
        completion_rates = {}
        for rid in test["rider_id"].unique():
            hist = completion_df[
                (completion_df["rider_id"] == rid) &
                (completion_df["year"] < fold["test_year"])
            ]
            completion_rates[rid] = hist["finished"].mean() if len(hist) > 0 else 0.5

        green_score = _green_contender_score(test, completion_rates)
        test["pred_spr_final"] = 0.0
        for (slug, yr), idx in test.groupby(["race_slug", "year"]).groups.items():
            rt = test.loc[idx[0], "race_type"]
            test.loc[idx, "pred_spr_final"] = _soft_rank_pts(green_score.loc[idx], rt)

        # ── SPRINT INTER + REG (capture rate, estimated supply) ──────
        has_spr = train[train["target_spr_inter_supply"] > 0]
        avail_si = [f for f in SPR_INTER_FEATS if f in df.columns]
        reg_si = Ridge(alpha=1.0)
        reg_si.fit(has_spr[avail_si].fillna(0),
                    np.sqrt(has_spr["spr_inter_capture_target"].values))

        test["pred_spr_inter"] = 0.0
        has_spr_est = test[test["estimated_spr_supply"] > 0]
        if len(has_spr_est) > 0:
            pred_si = np.maximum(np.square(reg_si.predict(has_spr_est[avail_si].fillna(0))), 0)
            test.loc[has_spr_est.index, "pred_spr_inter"] = pred_si * has_spr_est["estimated_spr_supply"]

        # ── AGGREGATE ────────────────────────────────────────────────
        test["pred_gc_source"] = test["pred_gc_pts"] + test["pred_gc_daily_pts"]
        test["pred_mountain_source"] = test["pred_mtn_final"] + test["pred_mtn_pass"]
        test["pred_sprint_source"] = test["pred_spr_final"] + test["pred_spr_inter"]
        test["pred_total"] = (
            test["pred_gc_source"]
            + test["pred_stage_total"]
            + test["pred_mountain_source"]
            + test["pred_sprint_source"]
        )

        # Actual totals for comparison
        test["actual_gc_source"] = test["actual_gc_pts"].fillna(0)
        test["actual_mountain_source"] = (
            test["actual_mountain_final_pts"].fillna(0) + test["actual_mountain_pass_pts"].fillna(0)
        )
        test["actual_sprint_source"] = (
            test["actual_sprint_final_pts"].fillna(0) + test["actual_sprint_inter_pts"].fillna(0)
        )

        # ── PER-RACE EVALUATION ──────────────────────────────────────
        for (slug, yr), race_df in test.groupby(["race_slug", "year"]):
            if len(race_df) < 3:
                continue

            race_type = race_df["race_type"].iloc[0]
            result = {
                "race_slug": slug, "year": yr, "race_type": race_type,
                "n_riders": len(race_df),
            }

            # ρ per source
            for src, pred_col, actual_col in [
                ("gc", "pred_gc_source", "actual_gc_source"),
                ("stage", "pred_stage_total", "actual_stage_pts_typed"),
                ("mountain", "pred_mountain_source", "actual_mountain_source"),
                ("sprint", "pred_sprint_source", "actual_sprint_source"),
                ("total", "pred_total", "actual_pts"),
            ]:
                p = race_df[pred_col].values if pred_col in race_df.columns else np.zeros(len(race_df))
                a = race_df[actual_col].values if actual_col in race_df.columns else np.zeros(len(race_df))
                rho, _ = stats.spearmanr(p, a)
                result[f"rho_{src}"] = rho if not np.isnan(rho) else np.nan

            # Team capture
            race_prices = prices_df[
                (prices_df["race_slug"] == slug) & (prices_df["year"] == yr)
            ]
            if len(race_prices) > 0:
                price_map = dict(zip(race_prices["rider_id"], race_prices["price_hillios"]))
                rider_ids = race_df["rider_id"].tolist()
                actual_map = dict(zip(race_df["rider_id"], race_df["actual_pts"].fillna(0)))
                pred_map = dict(zip(race_df["rider_id"], race_df["pred_total"]))

                actual_team = find_optimal_team(rider_ids, actual_map, price_map)
                pred_team = find_optimal_team(rider_ids, pred_map, price_map)

                if actual_team:
                    actual_team_pts = sum(actual_map.get(r, 0) for r in actual_team)
                    pred_team_pts = sum(actual_map.get(r, 0) for r in pred_team)
                    if actual_team_pts > 0:
                        result["team_capture"] = pred_team_pts / actual_team_pts
                        result["team_overlap"] = len(set(actual_team) & set(pred_team)) / len(actual_team)
                        result["actual_team_pts"] = actual_team_pts
                        result["pred_team_actual_pts"] = pred_team_pts
                        result["has_prices"] = True
                    else:
                        result["has_prices"] = False
                else:
                    result["has_prices"] = False
            else:
                result["has_prices"] = False

            all_race_results.append(result)

    # ── SUMMARY ──────────────────────────────────────────────────────
    results = pd.DataFrame(all_race_results)

    print("\n" + "=" * 70)
    print("RESULTS — Per-source ρ")
    print("=" * 70)

    for rt in ["grand_tour", "mini_tour"]:
        sub = results[results["race_type"] == rt]
        if len(sub) == 0:
            continue
        print(f"\n  {rt} (n={len(sub)}):")
        for src in ["gc", "stage", "mountain", "sprint", "total"]:
            col = f"rho_{src}"
            vals = sub[col].dropna()
            if len(vals) > 0:
                print(f"    {src:>10}: ρ={vals.mean():.3f} (median={vals.median():.3f})")

    print("\n" + "=" * 70)
    print("RESULTS — Team Capture")
    print("=" * 70)

    for rt in ["grand_tour", "mini_tour"]:
        priced = results[(results["race_type"] == rt) & (results["has_prices"] == True)]
        if len(priced) == 0:
            print(f"\n  {rt}: no races with prices")
            continue
        capture = priced["team_capture"].dropna()
        overlap = priced["team_overlap"].dropna()
        print(f"\n  {rt} (n={len(priced)} priced races):")
        print(f"    Team Capture: mean={capture.mean():.1%}, median={capture.median():.1%}")
        print(f"    Team Overlap: mean={overlap.mean():.1%}")

        # Show individual GT races
        if rt == "grand_tour":
            for _, r in priced.sort_values(["year", "race_slug"]).iterrows():
                tc = r.get("team_capture", np.nan)
                to = r.get("team_overlap", np.nan)
                apt = r.get("actual_team_pts", 0)
                ppt = r.get("pred_team_actual_pts", 0)
                rho = r.get("rho_total", np.nan)
                print(f"      {r['race_slug']:25s} {r['year']}: "
                      f"capture={tc:.1%}, overlap={to:.1%}, "
                      f"ρ_total={rho:.3f}, "
                      f"optimal={apt:.0f}pts, predicted={ppt:.0f}pts")

    # ── BREAKDOWN EXAMPLE ────────────────────────────────────────────
    print("\n" + "=" * 70)
    print("BREAKDOWN EXAMPLE — Top predicted riders (last GT)")
    print("=" * 70)

    last_gt = results[results["race_type"] == "grand_tour"].iloc[-1]
    slug, yr = last_gt["race_slug"], last_gt["year"]
    gt_race = df[(df["race_slug"] == slug) & (df["year"] == yr)].copy()

    # We need pred columns — re-run would be needed, but let's show from test
    # Just show the structure
    print(f"\n  {slug} {yr} — source breakdown would show:")
    print(f"  {{'predicted_total': X, 'breakdown': {{'gc': X, 'stage': X, 'mountain': X, 'sprint': X}}}}")


if __name__ == "__main__":
    run_benchmark()
