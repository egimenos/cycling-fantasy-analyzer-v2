"""
Secondary sources A/B test: baseline vs baseline + classification history.

Narrow experiment: only tests whether adding 4 classification history
features per type improves the gate for mountain_final and sprint_final.

Capture rate models (mountain_pass, sprint_inter) are unchanged.

Usage:
    cd ml && python -m src.benchmark_secondary_ab
"""

from __future__ import annotations

import os
import warnings

import numpy as np
import pandas as pd
from scipy import stats
from sklearn.linear_model import Ridge, LogisticRegression

from .benchmark_v8 import FOLDS
from .points import FINAL_CLASS_GT, FINAL_CLASS_MINI

warnings.filterwarnings("ignore")

CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", "cache")

_GT_FINAL_AVG = sum(FINAL_CLASS_GT.values()) / len(FINAL_CLASS_GT)
_MINI_FINAL_AVG = sum(FINAL_CLASS_MINI.values()) / len(FINAL_CLASS_MINI)

# ── Feature sets ─────────────────────────────────────────────────────

MTN_FINAL_BASE = [
    "gc_mu", "gc_rd", "stage_mu",
    "pct_pts_p4p5", "stage_wins_mountain",
    "mountain_pts_12m", "mountain_pts_6m", "mountain_strength_12m",
    "mountain_top10_rate_12m", "mountain_top10s_12m",
    "gc_mu_delta_12m", "pts_gc_12m", "sr_gc_top10_rate",
    "target_mountain_pct", "age",
]

MTN_FINAL_HISTORY = [
    "gt_mountain_final_top5_count_12m",
    "gt_mountain_final_pts_12m",
    "same_race_mountain_final_best",
    "mini_mountain_final_top3_count_12m",
]

SPR_FINAL_BASE = [
    "pct_pts_p1p2", "stage_wins_flat",
    "flat_pts_12m", "flat_pts_6m", "flat_strength_12m",
    "flat_top10_rate_12m", "flat_top10s_12m",
    "stage_mu", "pts_stage_12m",
    "target_flat_pct", "itt_top10_rate", "pct_pts_p3", "age",
]

SPR_FINAL_HISTORY = [
    "gt_sprint_final_top5_count_12m",
    "gt_sprint_final_pts_12m",
    "same_race_sprint_final_best",
    "mini_sprint_final_top3_count_12m",
]

# Capture rate features (unchanged between A/B)
MTN_PASS_FEATURES = [
    "pct_pts_p4p5", "stage_wins_mountain",
    "mountain_pts_12m", "mountain_pts_6m", "mountain_strength_12m",
    "mountain_top10_rate_12m", "mountain_top10s_12m", "mountain_starts_12m",
    "stage_mu", "gc_mu", "pts_stage_12m", "target_mountain_pct", "age",
]

SPR_INTER_FEATURES = [
    "pct_pts_p1p2", "stage_wins_flat",
    "flat_pts_12m", "flat_pts_6m", "flat_strength_12m",
    "flat_top10_rate_12m", "flat_top10s_12m",
    "hilly_pts_12m", "hilly_top10_rate_12m", "pct_pts_p3",
    "stage_mu", "pts_stage_12m", "target_flat_pct", "age",
]


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
    cls_feats = pd.read_parquet(os.path.join(CACHE_DIR, "classification_history_features.parquet"))

    df = cache.merge(stage_feats, on=["rider_id", "race_slug", "year"], how="left")
    df = df.merge(cls_feats, on=["rider_id", "race_slug", "year"], how="left")

    # Fill NaN
    fill_cols = [c for c in stage_feats.columns if c not in ["rider_id", "race_slug", "year"]]
    fill_cols += [c for c in cls_feats.columns if c not in ["rider_id", "race_slug", "year"]]
    for c in fill_cols:
        if c in df.columns:
            df[c] = df[c].fillna(0)

    # Targets
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


def _run_config(df, mtn_features, spr_features, label):
    """Run one configuration and return per-race results."""
    all_results = {
        "mtn_final": [], "mtn_pass": [],
        "spr_final": [], "spr_inter": [],
        "mountain_source": [], "sprint_source": [],
    }

    for fold_num, fold in FOLDS.items():
        train = df[df["year"] <= fold["train_end"]].copy()
        test = df[df["year"] == fold["test_year"]].copy()
        if len(test) == 0:
            continue

        # ── Mountain final ───────────────────────────────────────────
        avail = [f for f in mtn_features if f in df.columns]
        gate = LogisticRegression(C=0.1, class_weight="balanced", max_iter=2000)
        gate.fit(train[avail].fillna(0), train["scoreable_mtn_final"].values)
        prob = gate.predict_proba(test[avail].fillna(0))[:, 1]
        avg_pts = test["race_type"].map({"grand_tour": _GT_FINAL_AVG, "mini_tour": _MINI_FINAL_AVG})
        test["pred_mtn_final"] = prob * avg_pts

        # ── Mountain pass (same for A and B) ─────────────────────────
        has_supply = train[train["target_mtn_pass_supply"] > 0]
        avail_mp = [f for f in MTN_PASS_FEATURES if f in df.columns]
        reg = Ridge(alpha=1.0)
        reg.fit(has_supply[avail_mp].fillna(0), np.sqrt(has_supply["mtn_pass_capture_target"].values))
        test_supply = test[test["target_mtn_pass_supply"] > 0].copy()
        test["pred_mtn_pass"] = 0.0
        if len(test_supply) > 0:
            pred_cap = np.maximum(np.square(reg.predict(test_supply[avail_mp].fillna(0))), 0)
            test.loc[test_supply.index, "pred_mtn_pass"] = pred_cap * test_supply["target_mtn_pass_supply"]

        # ── Sprint final ─────────────────────────────────────────────
        avail_sf = [f for f in spr_features if f in df.columns]
        gate_sf = LogisticRegression(C=0.1, class_weight="balanced", max_iter=2000)
        gate_sf.fit(train[avail_sf].fillna(0), train["scoreable_spr_final"].values)
        prob_sf = gate_sf.predict_proba(test[avail_sf].fillna(0))[:, 1]
        avg_pts_sf = test["race_type"].map({"grand_tour": _GT_FINAL_AVG, "mini_tour": _MINI_FINAL_AVG})
        test["pred_spr_final"] = prob_sf * avg_pts_sf

        # ── Sprint inter (same for A and B) ──────────────────────────
        has_spr_supply = train[train["target_spr_inter_supply"] > 0]
        avail_si = [f for f in SPR_INTER_FEATURES if f in df.columns]
        reg_si = Ridge(alpha=1.0)
        reg_si.fit(has_spr_supply[avail_si].fillna(0), np.sqrt(has_spr_supply["spr_inter_capture_target"].values))
        test_spr = test[test["target_spr_inter_supply"] > 0].copy()
        test["pred_spr_inter"] = 0.0
        if len(test_spr) > 0:
            pred_si = np.maximum(np.square(reg_si.predict(test_spr[avail_si].fillna(0))), 0)
            test.loc[test_spr.index, "pred_spr_inter"] = pred_si * test_spr["target_spr_inter_supply"]

        # Composites
        test["pred_mountain_source"] = test["pred_mtn_final"] + test["pred_mtn_pass"]
        test["pred_sprint_source"] = test["pred_spr_final"] + test["pred_spr_inter"]
        test["actual_mountain_source"] = test["actual_mountain_final_pts"] + test["actual_mountain_pass_pts"]
        test["actual_sprint_source"] = test["actual_sprint_final_pts"] + test["actual_sprint_inter_pts"]

        # Evaluate all
        for key, pred_col, actual_col in [
            ("mtn_final", "pred_mtn_final", "actual_mountain_final_pts"),
            ("mtn_pass", "pred_mtn_pass", "actual_mountain_pass_pts"),
            ("spr_final", "pred_spr_final", "actual_sprint_final_pts"),
            ("spr_inter", "pred_spr_inter", "actual_sprint_inter_pts"),
            ("mountain_source", "pred_mountain_source", "actual_mountain_source"),
            ("sprint_source", "pred_sprint_source", "actual_sprint_source"),
        ]:
            for (slug, yr), race in test.groupby(["race_slug", "year"]):
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
                all_results[key].append({
                    "race_type": race["race_type"].iloc[0],
                    "rho_full": rho, "rho_nonzero": rho_nz,
                })

    return all_results


def main():
    print("=" * 70)
    print("SECONDARY SOURCES — A/B TEST: classification history")
    print("=" * 70)

    df = _load_data()
    print(f"Dataset: {len(df):,} rows\n")

    # Config A: baseline (no history features)
    results_a = _run_config(df, MTN_FINAL_BASE, SPR_FINAL_BASE, "A_baseline")

    # Config B: baseline + classification history
    results_b = _run_config(
        df,
        MTN_FINAL_BASE + MTN_FINAL_HISTORY,
        SPR_FINAL_BASE + SPR_FINAL_HISTORY,
        "B_with_history",
    )

    # ── Comparison ───────────────────────────────────────────────────
    print("\n" + "=" * 70)
    print("COMPARISON — A (baseline) vs B (+ classification history)")
    print("=" * 70)

    for key in ["mtn_final", "spr_final", "mtn_pass", "spr_inter", "mountain_source", "sprint_source"]:
        print(f"\n  {key}:")
        for rt in ["grand_tour", "mini_tour"]:
            ra = pd.DataFrame(results_a[key])
            rb = pd.DataFrame(results_b[key])
            sa = ra[ra["race_type"] == rt]
            sb = rb[rb["race_type"] == rt]
            if len(sa) == 0:
                continue
            rho_a = sa["rho_full"].mean()
            rho_nz_a = sa["rho_nonzero"].dropna().mean()
            rho_b = sb["rho_full"].mean()
            rho_nz_b = sb["rho_nonzero"].dropna().mean()
            delta = rho_b - rho_a
            delta_nz = rho_nz_b - rho_nz_a
            marker = "▲" if delta > 0.01 else ("▼" if delta < -0.01 else "≈")
            print(f"    {rt[:5]:>5}: A ρ={rho_a:.3f} (nz={rho_nz_a:.3f})  →  "
                  f"B ρ={rho_b:.3f} (nz={rho_nz_b:.3f})  {marker} Δ={delta:+.3f} (nz Δ={delta_nz:+.3f})")


if __name__ == "__main__":
    main()
