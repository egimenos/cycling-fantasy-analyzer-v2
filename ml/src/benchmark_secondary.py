"""
Secondary sources benchmark (Feature 012 — mountain + sprint).

4 sub-models:
  1. mountain_final: gate + expected pts (LogReg, P(top-5) × avg_pts)
  2. mountain_pass: capture rate regression (Ridge)
  3. sprint_final: gate + expected pts (LogReg, P(top-5) × avg_pts)
  4. sprint_inter + regularidad: capture rate regression (Ridge)

Usage:
    cd ml && python -m src.benchmark_secondary
"""

from __future__ import annotations

import os
import warnings

import numpy as np
import pandas as pd
from scipy import stats
from sklearn.linear_model import Ridge, LogisticRegression

from .benchmark_v8 import FOLDS
from .points import (
    FINAL_CLASS_GT, FINAL_CLASS_MINI,
)

warnings.filterwarnings("ignore")

CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", "cache")

# ── Feature sets per sub-model ───────────────────────────────────────

# Mountain final: who gets the mountain jersey?
MTN_FINAL_FEATURES = [
    # Core climbing signal
    "gc_mu", "gc_rd", "stage_mu",
    "pct_pts_p4p5", "stage_wins_mountain",
    # Mountain-specific from stage features
    "mountain_pts_12m", "mountain_pts_6m",
    "mountain_strength_12m",
    "mountain_top10_rate_12m", "mountain_top10s_12m",
    # GC signal (GC leaders often win mountain jersey)
    "gc_mu_delta_12m", "pts_gc_12m", "sr_gc_top10_rate",
    # Race profile
    "target_mountain_pct",
    # Age
    "age",
]

# Mountain pass: who captures pass-by-pass points?
MTN_PASS_FEATURES = [
    "pct_pts_p4p5", "stage_wins_mountain",
    "mountain_pts_12m", "mountain_pts_6m",
    "mountain_strength_12m",
    "mountain_top10_rate_12m", "mountain_top10s_12m",
    "mountain_starts_12m",
    # Breakaway / aggression proxy
    "stage_mu", "gc_mu",
    "pts_stage_12m",
    "target_mountain_pct",
    "age",
]

# Sprint final: who gets the green jersey?
SPR_FINAL_FEATURES = [
    # Sprint signal
    "pct_pts_p1p2", "stage_wins_flat",
    "flat_pts_12m", "flat_pts_6m",
    "flat_strength_12m",
    "flat_top10_rate_12m", "flat_top10s_12m",
    # Stage ability
    "stage_mu",
    "pts_stage_12m",
    # Race profile (more flat stages = more sprint chances)
    "target_flat_pct",
    # Consistency
    "itt_top10_rate", "pct_pts_p3",
    "age",
]

# Sprint inter + regularidad: who captures intermediate points?
SPR_INTER_FEATURES = [
    "pct_pts_p1p2", "stage_wins_flat",
    "flat_pts_12m", "flat_pts_6m",
    "flat_strength_12m",
    "flat_top10_rate_12m", "flat_top10s_12m",
    # Hilly for puncheur/allrounder types (Pedersen, Van Aert)
    "hilly_pts_12m", "hilly_top10_rate_12m",
    "pct_pts_p3",
    # General consistency
    "stage_mu", "pts_stage_12m",
    "target_flat_pct",
    "age",
]

# Expected fantasy pts if rider scores in final classification
# Weighted average across scoreable positions
_GT_FINAL_AVG = sum(FINAL_CLASS_GT.values()) / len(FINAL_CLASS_GT)  # (50+35+25+15+10)/5 = 27.0
_MINI_FINAL_AVG = sum(FINAL_CLASS_MINI.values()) / len(FINAL_CLASS_MINI)  # (40+25+15)/3 = 26.7


def _load_data():
    """Load cache + stage features."""
    cache_dfs = []
    for yr in range(2022, 2026):
        path = os.path.join(CACHE_DIR, f"features_{yr}.parquet")
        if os.path.exists(path):
            cache_dfs.append(pd.read_parquet(path))
    cache = pd.concat(cache_dfs, ignore_index=True)

    # Load stage features for mountain/flat/hilly type-specific features
    stage_feats = pd.read_parquet(os.path.join(CACHE_DIR, "stage_features.parquet"))

    if "race_year" in cache.columns:
        cache = cache.rename(columns={"race_year": "year"})

    # Merge stage features into cache
    df = cache.merge(
        stage_feats, on=["rider_id", "race_slug", "year"], how="left"
    )

    # Fill NaN stage features with 0
    stage_cols = [c for c in stage_feats.columns if c not in ["rider_id", "race_slug", "year"]]
    df[stage_cols] = df[stage_cols].fillna(0)

    # Build targets
    # mountain_final: scoreable = actual_mountain_final_pts > 0
    df["scoreable_mtn_final"] = (df["actual_mountain_final_pts"] > 0).astype(int)
    # sprint_final: scoreable = actual_sprint_final_pts > 0
    df["scoreable_spr_final"] = (df["actual_sprint_final_pts"] > 0).astype(int)

    # Capture rates (already in cache, but recompute for safety)
    df["mtn_pass_capture_target"] = np.where(
        df["target_mtn_pass_supply"] > 0,
        df["actual_mountain_pass_pts"] / df["target_mtn_pass_supply"],
        0.0,
    )
    df["spr_inter_capture_target"] = np.where(
        df["target_spr_inter_supply"] > 0,
        df["actual_sprint_inter_pts"] / df["target_spr_inter_supply"],
        0.0,
    )

    df = df[df["year"] >= 2022].copy()
    return df


def _evaluate_per_race(test_df, pred_col, actual_col):
    """Per-race Spearman evaluation."""
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
            "race_slug": slug, "year": yr,
            "race_type": race["race_type"].iloc[0],
            "rho_full": rho, "rho_nonzero": rho_nz,
        })
    return results


def _print_results(label, results):
    """Print per-race-type summary."""
    if not results:
        print(f"  {label}: no results")
        return
    rdf = pd.DataFrame(results)
    for rt in ["grand_tour", "mini_tour"]:
        sub = rdf[rdf["race_type"] == rt]
        if len(sub) == 0:
            continue
        rho = sub["rho_full"].mean()
        rho_nz = sub["rho_nonzero"].dropna().mean()
        print(f"  {label:>25} ({rt[:5]}): n={len(sub):>3}, ρ_full={rho:.3f}, ρ_nz={rho_nz:.3f}")


def run_benchmark():
    print("=" * 70)
    print("SECONDARY SOURCES BENCHMARK (mountain + sprint)")
    print("=" * 70)

    df = _load_data()
    print(f"Dataset: {len(df):,} rows")

    all_results = {
        "mtn_final": [], "mtn_pass": [],
        "spr_final": [], "spr_inter": [],
        "mountain_source": [], "sprint_source": [], "total_secondary": [],
    }

    for fold_num, fold in FOLDS.items():
        train = df[df["year"] <= fold["train_end"]].copy()
        test = df[df["year"] == fold["test_year"]].copy()
        if len(test) == 0:
            continue

        print(f"\n--- Fold {fold_num}: train ≤{fold['train_end']}, test={fold['test_year']} ---")

        # ── 1. Mountain Final (gate + expected pts) ──────────────────
        avail = [f for f in MTN_FINAL_FEATURES if f in df.columns]
        X_train = train[avail].fillna(0)
        y_gate = train["scoreable_mtn_final"].values

        gate_mtn = LogisticRegression(C=0.1, class_weight="balanced", max_iter=2000)
        gate_mtn.fit(X_train, y_gate)

        X_test = test[avail].fillna(0)
        prob_mtn = gate_mtn.predict_proba(X_test)[:, 1]
        avg_pts = test["race_type"].map({"grand_tour": _GT_FINAL_AVG, "mini_tour": _MINI_FINAL_AVG})
        test["pred_mtn_final"] = prob_mtn * avg_pts

        results = _evaluate_per_race(test, "pred_mtn_final", "actual_mountain_final_pts")
        all_results["mtn_final"].extend(results)
        n = len(results)
        if n > 0:
            rho = np.mean([r["rho_full"] for r in results])
            print(f"  mtn_final: {n} races, ρ_full={rho:.3f}")

        # ── 2. Mountain Pass (capture rate regression) ───────────────
        has_supply = train[train["target_mtn_pass_supply"] > 0]
        avail = [f for f in MTN_PASS_FEATURES if f in df.columns]
        X_train_mp = has_supply[avail].fillna(0)
        y_mp = np.sqrt(has_supply["mtn_pass_capture_target"].values)

        reg_mp = Ridge(alpha=1.0)
        reg_mp.fit(X_train_mp, y_mp)

        test_supply = test[test["target_mtn_pass_supply"] > 0].copy()
        if len(test_supply) > 0:
            X_test_mp = test_supply[avail].fillna(0)
            pred_capture = np.maximum(np.square(reg_mp.predict(X_test_mp)), 0)
            test_supply["pred_mtn_pass"] = pred_capture * test_supply["target_mtn_pass_supply"]
            # Write back to full test
            test["pred_mtn_pass"] = 0.0
            test.loc[test_supply.index, "pred_mtn_pass"] = test_supply["pred_mtn_pass"]

            results = _evaluate_per_race(test_supply, "pred_mtn_pass", "actual_mountain_pass_pts")
            all_results["mtn_pass"].extend(results)
            if results:
                rho = np.mean([r["rho_full"] for r in results])
                print(f"  mtn_pass: {len(results)} races, ρ_full={rho:.3f}")
        else:
            test["pred_mtn_pass"] = 0.0

        # ── 3. Sprint Final (gate + expected pts) ────────────────────
        avail = [f for f in SPR_FINAL_FEATURES if f in df.columns]
        X_train_sf = train[avail].fillna(0)
        y_gate_sf = train["scoreable_spr_final"].values

        gate_spr = LogisticRegression(C=0.1, class_weight="balanced", max_iter=2000)
        gate_spr.fit(X_train_sf, y_gate_sf)

        X_test_sf = test[avail].fillna(0)
        prob_spr = gate_spr.predict_proba(X_test_sf)[:, 1]
        avg_pts_spr = test["race_type"].map({"grand_tour": _GT_FINAL_AVG, "mini_tour": _MINI_FINAL_AVG})
        test["pred_spr_final"] = prob_spr * avg_pts_spr

        results = _evaluate_per_race(test, "pred_spr_final", "actual_sprint_final_pts")
        all_results["spr_final"].extend(results)
        if results:
            rho = np.mean([r["rho_full"] for r in results])
            print(f"  spr_final: {len(results)} races, ρ_full={rho:.3f}")

        # ── 4. Sprint Inter + Regularidad (capture rate regression) ──
        has_spr_supply = train[train["target_spr_inter_supply"] > 0]
        avail = [f for f in SPR_INTER_FEATURES if f in df.columns]
        X_train_si = has_spr_supply[avail].fillna(0)
        y_si = np.sqrt(has_spr_supply["spr_inter_capture_target"].values)

        reg_si = Ridge(alpha=1.0)
        reg_si.fit(X_train_si, y_si)

        test_spr_supply = test[test["target_spr_inter_supply"] > 0].copy()
        if len(test_spr_supply) > 0:
            X_test_si = test_spr_supply[avail].fillna(0)
            pred_capture_si = np.maximum(np.square(reg_si.predict(X_test_si)), 0)
            test_spr_supply["pred_spr_inter"] = pred_capture_si * test_spr_supply["target_spr_inter_supply"]
            test["pred_spr_inter"] = 0.0
            test.loc[test_spr_supply.index, "pred_spr_inter"] = test_spr_supply["pred_spr_inter"]

            results = _evaluate_per_race(test_spr_supply, "pred_spr_inter", "actual_sprint_inter_pts")
            all_results["spr_inter"].extend(results)
            if results:
                rho = np.mean([r["rho_full"] for r in results])
                print(f"  spr_inter: {len(results)} races, ρ_full={rho:.3f}")
        else:
            test["pred_spr_inter"] = 0.0

        # ── Composite sources ────────────────────────────────────────
        test["pred_mountain_source"] = test["pred_mtn_final"] + test["pred_mtn_pass"]
        test["pred_sprint_source"] = test["pred_spr_final"] + test["pred_spr_inter"]
        test["actual_mountain_source"] = test["actual_mountain_final_pts"] + test["actual_mountain_pass_pts"]
        test["actual_sprint_source"] = test["actual_sprint_final_pts"] + test["actual_sprint_inter_pts"]

        # Evaluate composites
        results_mtn = _evaluate_per_race(test, "pred_mountain_source", "actual_mountain_source")
        all_results["mountain_source"].extend(results_mtn)

        results_spr = _evaluate_per_race(test, "pred_sprint_source", "actual_sprint_source")
        all_results["sprint_source"].extend(results_spr)

        # Total secondary = mountain + sprint
        test["pred_total_secondary"] = test["pred_mountain_source"] + test["pred_sprint_source"]
        test["actual_total_secondary"] = test["actual_mountain_source"] + test["actual_sprint_source"]
        results_total = _evaluate_per_race(test, "pred_total_secondary", "actual_total_secondary")
        all_results["total_secondary"].extend(results_total)

    # ── Final summary ────────────────────────────────────────────────
    print("\n" + "=" * 70)
    print("RESULTS SUMMARY")
    print("=" * 70)

    print("\n  Sub-models:")
    _print_results("mountain_final", all_results["mtn_final"])
    _print_results("mountain_pass", all_results["mtn_pass"])
    _print_results("sprint_final", all_results["spr_final"])
    _print_results("sprint_inter+reg", all_results["spr_inter"])

    print("\n  Composite sources:")
    _print_results("mountain_source", all_results["mountain_source"])
    _print_results("sprint_source", all_results["sprint_source"])
    _print_results("total_secondary", all_results["total_secondary"])


if __name__ == "__main__":
    run_benchmark()
