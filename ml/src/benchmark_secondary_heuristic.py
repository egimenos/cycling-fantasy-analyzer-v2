"""
Secondary sources — heuristic contender scoring for finals.

Replaces the LogReg gate with domain-structured contender scores:
  - sprint_final: sprinter_score + allround_score + survival + route
  - mountain_final: climber_score + gc_score + survival + route

Capture rates (mountain_pass, sprint_inter) unchanged from baseline.

Compares:
  A: LogReg gate (baseline)
  B: Heuristic contender score with soft mapping

Usage:
    cd ml && python -m src.benchmark_secondary_heuristic
"""

from __future__ import annotations

import os
import warnings

import numpy as np
import pandas as pd
from scipy import stats
from sklearn.linear_model import Ridge, LogisticRegression
from sklearn.preprocessing import MinMaxScaler

from .benchmark_v8 import FOLDS
from .points import FINAL_CLASS_GT, FINAL_CLASS_MINI

warnings.filterwarnings("ignore")

CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", "cache")

_GT_FINAL_AVG = sum(FINAL_CLASS_GT.values()) / len(FINAL_CLASS_GT)
_MINI_FINAL_AVG = sum(FINAL_CLASS_MINI.values()) / len(FINAL_CLASS_MINI)

# Soft scoring decay for ranked contenders
# Maps rank → fraction of max_pts. Smooth decay, not hard cutoff.
GT_RANK_DECAY = {
    1: 50.0, 2: 35.0, 3: 25.0, 4: 15.0, 5: 10.0,
    6: 4.0, 7: 2.0, 8: 1.0, 9: 0.5, 10: 0.2,
}
MINI_RANK_DECAY = {
    1: 40.0, 2: 25.0, 3: 15.0,
    4: 5.0, 5: 2.0, 6: 1.0, 7: 0.5,
}

# ── Feature lists (capture rates, unchanged) ─────────────────────────
MTN_FINAL_BASE = [
    "gc_mu", "gc_rd", "stage_mu",
    "pct_pts_p4p5", "stage_wins_mountain",
    "mountain_pts_12m", "mountain_pts_6m", "mountain_strength_12m",
    "mountain_top10_rate_12m", "mountain_top10s_12m",
    "gc_mu_delta_12m", "pts_gc_12m", "sr_gc_top10_rate",
    "target_mountain_pct", "age",
]
MTN_PASS_FEATURES = [
    "pct_pts_p4p5", "stage_wins_mountain",
    "mountain_pts_12m", "mountain_pts_6m", "mountain_strength_12m",
    "mountain_top10_rate_12m", "mountain_top10s_12m", "mountain_starts_12m",
    "stage_mu", "gc_mu", "pts_stage_12m", "target_mountain_pct", "age",
]
SPR_FINAL_BASE = [
    "pct_pts_p1p2", "stage_wins_flat",
    "flat_pts_12m", "flat_pts_6m", "flat_strength_12m",
    "flat_top10_rate_12m", "flat_top10s_12m",
    "stage_mu", "pts_stage_12m",
    "target_flat_pct", "itt_top10_rate", "pct_pts_p3", "age",
]
SPR_INTER_FEATURES = [
    "pct_pts_p1p2", "stage_wins_flat",
    "flat_pts_12m", "flat_pts_6m", "flat_strength_12m",
    "flat_top10_rate_12m", "flat_top10s_12m",
    "hilly_pts_12m", "hilly_top10_rate_12m", "pct_pts_p3",
    "stage_mu", "pts_stage_12m", "target_flat_pct", "age",
]


def _load_gt_completion(db_url: str) -> pd.DataFrame:
    """Load GT completion rate per rider (rolling, all history before each race)."""
    import psycopg2
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()

    # Per rider × GT: did they finish?
    cur.execute("""
        SELECT rider_id, race_slug, year,
               MAX(stage_number) as last_stage,
               (SELECT COUNT(DISTINCT rr2.stage_number)
                FROM race_results rr2
                WHERE rr2.race_slug = rr.race_slug AND rr2.year = rr.year
                  AND rr2.category = 'stage') as total_stages,
               MIN(race_date) as race_start
        FROM race_results rr
        WHERE race_type = 'grand_tour' AND category = 'stage' AND race_date IS NOT NULL
        GROUP BY rider_id, race_slug, year
    """)
    cols = [d[0] for d in cur.description]
    rows = cur.fetchall()
    cur.close()
    conn.close()

    df = pd.DataFrame(rows, columns=cols)
    df["race_start"] = pd.to_datetime(df["race_start"])
    df["finished"] = (df["last_stage"] / df["total_stages"]) >= 0.95
    return df


def _compute_gt_completion_rate(completion_df: pd.DataFrame, rider_id, race_start) -> float:
    """Rolling GT completion rate: fraction of GTs finished before this date."""
    hist = completion_df[
        (completion_df["rider_id"] == rider_id) &
        (completion_df["race_start"] < race_start)
    ]
    if len(hist) == 0:
        return 0.5  # no GT history → neutral prior
    return hist["finished"].mean()


def _load_data():
    cache_dfs = []
    for yr in range(2022, 2026):
        path = os.path.join(CACHE_DIR, f"features_{yr}.parquet")
        if os.path.exists(path):
            cache_dfs.append(pd.read_parquet(path))
    cache = pd.concat(cache_dfs, ignore_index=True)
    if "race_year" in cache.columns:
        cache = cache.rename(columns={"race_year": "year"})

    stage_feats = pd.read_parquet(os.path.join(CACHE_DIR, "stage_features.parquet"))
    df = cache.merge(stage_feats, on=["rider_id", "race_slug", "year"], how="left")

    stage_cols = [c for c in stage_feats.columns if c not in ["rider_id", "race_slug", "year"]]
    df[stage_cols] = df[stage_cols].fillna(0)

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
    return df[df["year"] >= 2022].copy()


def _compute_green_contender_score(df: pd.DataFrame, completion_rates: dict) -> pd.Series:
    """Heuristic green jersey contender score."""
    # Sprinter component: flat dominance
    sprinter = (
        df.get("flat_strength_12m", 0).fillna(0) * 0.3
        + df.get("flat_top10s_12m", 0).fillna(0) * 5.0
        + df.get("stage_wins_flat", 0).fillna(0) * 15.0
        + df.get("flat_top10_rate_12m", 0).fillna(0) * 50.0
    )

    # All-round accumulator: hilly + stage consistency
    allround = (
        df.get("hilly_pts_12m", 0).fillna(0) * 0.2
        + df.get("pts_stage_12m", 0).fillna(0) * 0.05
        + df.get("pct_pts_p3", 0).fillna(0) * 30.0
        + df.get("stage_mu", 0).fillna(0) * 0.005
    )

    # Route modifier: more flat → more sprinter weight
    flat_pct = df.get("target_flat_pct", 0).fillna(0.4).clip(0.2, 0.8)
    score = flat_pct * sprinter + (1 - flat_pct) * allround

    # Survival bonus
    survival = df["rider_id"].map(completion_rates).fillna(0.5)
    score = score * (0.3 + 0.7 * survival)  # floor at 30% even with 0 completion

    return score


def _compute_mountain_contender_score(df: pd.DataFrame, completion_rates: dict) -> pd.Series:
    """Heuristic mountain jersey contender score."""
    # Pure climber component
    climber = (
        df.get("mountain_strength_12m", 0).fillna(0) * 0.3
        + df.get("mountain_top10s_12m", 0).fillna(0) * 5.0
        + df.get("stage_wins_mountain", 0).fillna(0) * 15.0
        + df.get("mountain_top10_rate_12m", 0).fillna(0) * 50.0
        + df.get("pct_pts_p4p5", 0).fillna(0) * 40.0
    )

    # GC component (strong GC riders often win mountain classification)
    gc = (
        df.get("gc_mu", 0).fillna(1500) * 0.01
        + df.get("pts_gc_12m", 0).fillna(0) * 0.1
        + df.get("sr_gc_top10_rate", 0).fillna(0) * 20.0
    )

    # Route modifier: more mountain → higher signal
    mtn_pct = df.get("target_mountain_pct", 0).fillna(0.3).clip(0.1, 0.7)
    score = 0.6 * climber + 0.4 * gc

    # Survival
    survival = df["rider_id"].map(completion_rates).fillna(0.5)
    score = score * (0.3 + 0.7 * survival)

    return score


def _soft_rank_to_pts(scores: pd.Series, race_type: str) -> pd.Series:
    """Map contender scores to expected fantasy points via soft ranking."""
    decay = GT_RANK_DECAY if race_type == "grand_tour" else MINI_RANK_DECAY

    # Rank within the group (higher score = rank 1)
    ranks = scores.rank(ascending=False, method="min").astype(int)

    # Map rank to expected points
    pts = ranks.map(decay).fillna(0.0)
    return pts


def _evaluate(test_df, pred_col, actual_col):
    results = []
    for (slug, yr), race in test_df.groupby(["race_slug", "year"]):
        if len(race) < 3:
            continue
        pred = race[pred_col].values
        actual = race[actual_col].values
        rho, _ = stats.spearmanr(pred, actual)
        if np.isnan(rho):
            continue
        nz = actual > 0
        rho_nz = np.nan
        if nz.sum() >= 3:
            rho_nz, _ = stats.spearmanr(pred[nz], actual[nz])
        results.append({
            "race_type": race["race_type"].iloc[0],
            "rho_full": rho, "rho_nonzero": rho_nz,
        })
    return results


def main():
    print("=" * 70)
    print("SECONDARY SOURCES — HEURISTIC CONTENDER SCORING")
    print("=" * 70)

    db_url = os.environ.get(
        "DATABASE_URL", "postgresql://cycling:cycling@localhost:5432/cycling_analyzer"
    )

    df = _load_data()
    print(f"Dataset: {len(df):,} rows")

    # Load GT completion data
    print("Computing GT completion rates...")
    completion_df = _load_gt_completion(db_url)

    all_results = {"A": {}, "B": {}}
    for key in ["mtn_final", "mtn_pass", "spr_final", "spr_inter",
                "mountain_source", "sprint_source"]:
        all_results["A"][key] = []
        all_results["B"][key] = []

    for fold_num, fold in FOLDS.items():
        train = df[df["year"] <= fold["train_end"]].copy()
        test = df[df["year"] == fold["test_year"]].copy()
        if len(test) == 0:
            continue

        print(f"\n--- Fold {fold_num}: train ≤{fold['train_end']}, test={fold['test_year']} ---")

        # Pre-compute rolling GT completion rates for test riders
        # (using only history before the test race)
        race_starts = test.groupby(["race_slug", "year"])["race_date"].first()
        completion_rates = {}
        for rider_id in test["rider_id"].unique():
            # Use a simple overall rate (not per-race rolling, for speed)
            hist = completion_df[
                (completion_df["rider_id"] == rider_id) &
                (completion_df["race_start"] < pd.Timestamp(f"{fold['test_year']}-01-01"))
            ]
            if len(hist) > 0:
                completion_rates[rider_id] = hist["finished"].mean()
            else:
                completion_rates[rider_id] = 0.5

        # ── Config A: LogReg gate (baseline) ─────────────────────────
        # Mountain final
        avail = [f for f in MTN_FINAL_BASE if f in df.columns]
        gate = LogisticRegression(C=0.1, class_weight="balanced", max_iter=2000)
        gate.fit(train[avail].fillna(0), train["scoreable_mtn_final"].values)
        prob = gate.predict_proba(test[avail].fillna(0))[:, 1]
        avg_pts = test["race_type"].map({"grand_tour": _GT_FINAL_AVG, "mini_tour": _MINI_FINAL_AVG})
        test["pred_mtn_final_A"] = prob * avg_pts

        # Sprint final
        avail_sf = [f for f in SPR_FINAL_BASE if f in df.columns]
        gate_sf = LogisticRegression(C=0.1, class_weight="balanced", max_iter=2000)
        gate_sf.fit(train[avail_sf].fillna(0), train["scoreable_spr_final"].values)
        prob_sf = gate_sf.predict_proba(test[avail_sf].fillna(0))[:, 1]
        avg_pts_sf = test["race_type"].map({"grand_tour": _GT_FINAL_AVG, "mini_tour": _MINI_FINAL_AVG})
        test["pred_spr_final_A"] = prob_sf * avg_pts_sf

        # ── Config B: Heuristic contender scoring ────────────────────
        # Green contender score
        green_score = _compute_green_contender_score(test, completion_rates)
        test["pred_spr_final_B"] = 0.0
        for (slug, yr), idx in test.groupby(["race_slug", "year"]).groups.items():
            race_type = test.loc[idx[0], "race_type"]
            test.loc[idx, "pred_spr_final_B"] = _soft_rank_to_pts(
                green_score.loc[idx], race_type
            )

        # Mountain contender score
        mtn_score = _compute_mountain_contender_score(test, completion_rates)
        test["pred_mtn_final_B"] = 0.0
        for (slug, yr), idx in test.groupby(["race_slug", "year"]).groups.items():
            race_type = test.loc[idx[0], "race_type"]
            test.loc[idx, "pred_mtn_final_B"] = _soft_rank_to_pts(
                mtn_score.loc[idx], race_type
            )

        # ── Capture rates (same for A and B) ─────────────────────────
        has_supply = train[train["target_mtn_pass_supply"] > 0]
        avail_mp = [f for f in MTN_PASS_FEATURES if f in df.columns]
        reg_mp = Ridge(alpha=1.0)
        reg_mp.fit(has_supply[avail_mp].fillna(0), np.sqrt(has_supply["mtn_pass_capture_target"].values))
        test_mp = test[test["target_mtn_pass_supply"] > 0].copy()
        test["pred_mtn_pass"] = 0.0
        if len(test_mp) > 0:
            pred = np.maximum(np.square(reg_mp.predict(test_mp[avail_mp].fillna(0))), 0)
            test.loc[test_mp.index, "pred_mtn_pass"] = pred * test_mp["target_mtn_pass_supply"]

        has_spr = train[train["target_spr_inter_supply"] > 0]
        avail_si = [f for f in SPR_INTER_FEATURES if f in df.columns]
        reg_si = Ridge(alpha=1.0)
        reg_si.fit(has_spr[avail_si].fillna(0), np.sqrt(has_spr["spr_inter_capture_target"].values))
        test_si = test[test["target_spr_inter_supply"] > 0].copy()
        test["pred_spr_inter"] = 0.0
        if len(test_si) > 0:
            pred = np.maximum(np.square(reg_si.predict(test_si[avail_si].fillna(0))), 0)
            test.loc[test_si.index, "pred_spr_inter"] = pred * test_si["target_spr_inter_supply"]

        # ── Composites ───────────────────────────────────────────────
        for config in ["A", "B"]:
            test[f"pred_mtn_src_{config}"] = test[f"pred_mtn_final_{config}"] + test["pred_mtn_pass"]
            test[f"pred_spr_src_{config}"] = test[f"pred_spr_final_{config}"] + test["pred_spr_inter"]

        test["actual_mtn_src"] = test["actual_mountain_final_pts"] + test["actual_mountain_pass_pts"]
        test["actual_spr_src"] = test["actual_sprint_final_pts"] + test["actual_sprint_inter_pts"]

        # ── Evaluate ─────────────────────────────────────────────────
        for config in ["A", "B"]:
            for key, pred, actual in [
                ("mtn_final", f"pred_mtn_final_{config}", "actual_mountain_final_pts"),
                ("spr_final", f"pred_spr_final_{config}", "actual_sprint_final_pts"),
                ("mountain_source", f"pred_mtn_src_{config}", "actual_mtn_src"),
                ("sprint_source", f"pred_spr_src_{config}", "actual_spr_src"),
            ]:
                all_results[config][key].extend(_evaluate(test, pred, actual))

            # Capture rates (same)
            all_results[config]["mtn_pass"].extend(
                _evaluate(test[test["target_mtn_pass_supply"] > 0], "pred_mtn_pass", "actual_mountain_pass_pts")
            )
            all_results[config]["spr_inter"].extend(
                _evaluate(test[test["target_spr_inter_supply"] > 0], "pred_spr_inter", "actual_sprint_inter_pts")
            )

    # ── Comparison ───────────────────────────────────────────────────
    print("\n" + "=" * 70)
    print("COMPARISON — A (LogReg gate) vs B (Heuristic contender)")
    print("=" * 70)

    for key in ["mtn_final", "spr_final", "mtn_pass", "spr_inter", "mountain_source", "sprint_source"]:
        print(f"\n  {key}:")
        for rt in ["grand_tour", "mini_tour"]:
            ra = pd.DataFrame(all_results["A"][key])
            rb = pd.DataFrame(all_results["B"][key])
            if len(ra) == 0:
                continue
            sa = ra[ra["race_type"] == rt]
            sb = rb[rb["race_type"] == rt]
            if len(sa) == 0:
                continue
            rho_a = sa["rho_full"].mean()
            rho_nz_a = sa["rho_nonzero"].dropna().mean()
            rho_b = sb["rho_full"].mean()
            rho_nz_b = sb["rho_nonzero"].dropna().mean()
            delta = rho_b - rho_a
            marker = "▲" if delta > 0.01 else ("▼" if delta < -0.01 else "≈")
            print(f"    {rt[:5]:>5}: A ρ={rho_a:.3f}(nz={rho_nz_a:.3f})  →  "
                  f"B ρ={rho_b:.3f}(nz={rho_nz_b:.3f})  {marker} Δ={delta:+.3f}")


if __name__ == "__main__":
    main()
