"""
Hilly stage type experiments (Feature 012).

Tests alternative architectures for hilly, which is structurally weak
as continuous regression (GT ρ=0.40) because most GTs have 1-2 hilly stages.

Experiments:
  1. Current baseline: Ridge+sqrt regression (from benchmark_stage)
  2. Gate + magnitude (like ITT)
  3. Conditional: gate+magnitude if n_hilly_stages <= 2, regression if >= 3
  4. Ordinal buckets: win / podium / top10 / none → expected points

Usage:
    cd ml && python -m src.benchmark_stage_hilly
"""

from __future__ import annotations

import os
import warnings

import numpy as np
import pandas as pd
from scipy import stats
from sklearn.linear_model import Ridge, LogisticRegression
from sklearn.metrics import precision_score, recall_score

from .benchmark_v8 import FOLDS
from .points import STAGE_POINTS

warnings.filterwarnings("ignore")

CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", "cache")

SHARED_FEATURES = ["stage_mu", "stage_rd", "age"]
PROFILE_FEATURES = [
    "pct_pts_p1p2", "pct_pts_p4p5", "pct_pts_p3",
    "itt_top10_rate", "stage_wins_flat", "stage_wins_mountain",
]
RAW_FEATURES = [
    "hilly_pts_12m", "hilly_pts_6m",
    "hilly_top10_rate_12m", "hilly_top10_rate_6m",
    "hilly_top10s_12m", "hilly_starts_12m",
]
STRENGTH_FEATURES = [
    "hilly_strength_12m", "hilly_strength_6m",
]
ALL_HILLY_FEATURES = SHARED_FEATURES + RAW_FEATURES + STRENGTH_FEATURES + PROFILE_FEATURES

# Ordinal bucket boundaries and expected points
HILLY_BUCKETS = {
    "win": lambda pos: pos == 1,       # 40 pts
    "podium": lambda pos: 2 <= pos <= 3,  # ~23.5 pts avg
    "top10": lambda pos: 4 <= pos <= 10,  # ~10.3 pts avg
    "top20": lambda pos: 11 <= pos <= 20,  # ~3.5 pts avg
    "none": lambda pos: pos > 20 or pos is None,
}
BUCKET_EXPECTED_PTS = {
    "win": 40.0,
    "podium": (25 + 22) / 2,  # 23.5
    "top10": sum(STAGE_POINTS.get(i, 0) for i in range(4, 11)) / 7,  # ~13.0
    "top20": sum(STAGE_POINTS.get(i, 0) for i in range(11, 21)) / 10,  # ~4.5
    "none": 0.0,
}


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

    df = targets.merge(feats, on=["rider_id", "race_slug", "year"], how="inner")
    df = df.merge(cache_slim, on=["rider_id", "race_slug", "year"], how="inner")
    df = df[df["year"] >= 2022].copy()
    return df


def _evaluate(test_df, pred_col="pred_hilly", actual_col="hilly_pts_per_stage"):
    """Per-race evaluation for hilly type."""
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
        n_hilly = race["n_hilly_stages_race"].iloc[0]
        results.append({
            "race_slug": slug, "year": yr,
            "race_type": race["race_type"].iloc[0],
            "n_hilly_stages": n_hilly,
            "rho_full": rho, "rho_nonzero": rho_nz,
        })
    return pd.DataFrame(results)


def _print_summary(results_df, label):
    """Print summary metrics."""
    for rt in ["grand_tour", "mini_tour"]:
        sub = results_df[results_df["race_type"] == rt]
        if len(sub) == 0:
            continue
        rho = sub["rho_full"].mean()
        rho_nz = sub["rho_nonzero"].dropna().mean()
        n = len(sub)
        print(f"  {label:>25} ({rt[:5]}): n={n:>3}, ρ_full={rho:.3f}, ρ_nz={rho_nz:.3f}")

    # Split by n_hilly_stages for GT
    gt = results_df[results_df["race_type"] == "grand_tour"]
    if len(gt) > 0:
        for threshold, label_t in [(2, "≤2 stages"), (3, "≥3 stages")]:
            if threshold == 2:
                sub = gt[gt["n_hilly_stages"] <= 2]
            else:
                sub = gt[gt["n_hilly_stages"] >= 3]
            if len(sub) > 0:
                rho = sub["rho_full"].mean()
                rho_nz = sub["rho_nonzero"].dropna().mean()
                print(f"  {'':>25} GT {label_t}: n={len(sub)}, ρ_full={rho:.3f}, ρ_nz={rho_nz:.3f}")


def experiment_1_baseline(df):
    """Baseline: Ridge+sqrt regression (current)."""
    print("\n--- Experiment 1: Baseline (Ridge+sqrt regression) ---")
    all_results = []

    for fold_num, fold in FOLDS.items():
        train = df[(df["year"] <= fold["train_end"]) & (df["n_hilly_stages_ridden"] > 0)]
        test = df[df["year"] == fold["test_year"]].copy()
        if len(test) == 0:
            continue

        available = [f for f in ALL_HILLY_FEATURES if f in df.columns]
        X_train = train[available].fillna(0)
        y_train = np.sqrt(train["hilly_pts_per_stage"].values)

        model = Ridge(alpha=1.0)
        model.fit(X_train, y_train)

        X_test = test[available].fillna(0)
        test["pred_hilly"] = np.maximum(np.square(model.predict(X_test)), 0)

        results = _evaluate(test[test["n_hilly_stages_ridden"] > 0])
        all_results.append(results)

    results_df = pd.concat(all_results, ignore_index=True)
    _print_summary(results_df, "Baseline")
    return results_df


def experiment_2_gate_magnitude(df):
    """Gate + magnitude for hilly (like ITT)."""
    print("\n--- Experiment 2: Gate + Magnitude ---")
    all_results = []

    for fold_num, fold in FOLDS.items():
        train = df[(df["year"] <= fold["train_end"]) & (df["n_hilly_stages_ridden"] > 0)]
        test = df[df["year"] == fold["test_year"]].copy()
        if len(test) == 0:
            continue

        available = [f for f in ALL_HILLY_FEATURES if f in df.columns]
        X_train = train[available].fillna(0)
        y_gate = train["scoreable_hilly"].values
        y_pts = train["hilly_pts_per_stage"].values
        weights = np.ones(len(train))

        # Gate
        gate = LogisticRegression(C=0.1, class_weight="balanced", max_iter=2000)
        gate.fit(X_train, y_gate, sample_weight=weights)

        # Magnitude (only non-zero)
        nz = y_pts > 0
        mag = Ridge(alpha=1.0)
        mag.fit(X_train[nz], np.sqrt(y_pts[nz]))

        X_test = test[available].fillna(0)
        gate_pred = gate.predict(X_test)
        mag_pred = np.maximum(np.square(mag.predict(X_test)), 0)
        test["pred_hilly"] = np.where(gate_pred == 1, mag_pred, 0.0)

        # Gate metrics on exposed
        exposed = test[test["n_hilly_stages_ridden"] > 0]
        if len(exposed) > 0:
            y_test_gate = exposed["scoreable_hilly"].values
            gate_test = gate.predict(exposed[available].fillna(0))
            prec = precision_score(y_test_gate, gate_test, zero_division=0)
            rec = recall_score(y_test_gate, gate_test, zero_division=0)
            if fold_num == 3:  # Print once
                print(f"  Gate (fold {fold_num}): precision={prec:.3f}, recall={rec:.3f}")

        results = _evaluate(exposed)
        all_results.append(results)

    results_df = pd.concat(all_results, ignore_index=True)
    _print_summary(results_df, "Gate+Magnitude")
    return results_df


def experiment_3_conditional(df):
    """Conditional: gate+mag if n_hilly <= 2, regression if >= 3."""
    print("\n--- Experiment 3: Conditional (gate if ≤2 stages, reg if ≥3) ---")
    all_results = []

    for fold_num, fold in FOLDS.items():
        train = df[(df["year"] <= fold["train_end"]) & (df["n_hilly_stages_ridden"] > 0)]
        test = df[df["year"] == fold["test_year"]].copy()
        if len(test) == 0:
            continue

        available = [f for f in ALL_HILLY_FEATURES if f in df.columns]
        X_train = train[available].fillna(0)
        y_pts = train["hilly_pts_per_stage"].values

        # Train both models
        # Regression (for ≥3 stages)
        reg = Ridge(alpha=1.0)
        reg.fit(X_train, np.sqrt(y_pts))

        # Gate + magnitude (for ≤2 stages)
        y_gate = train["scoreable_hilly"].values
        gate = LogisticRegression(C=0.1, class_weight="balanced", max_iter=2000)
        gate.fit(X_train, y_gate)
        nz = y_pts > 0
        mag = Ridge(alpha=1.0)
        mag.fit(X_train[nz], np.sqrt(y_pts[nz]))

        # Predict conditionally
        X_test = test[available].fillna(0)
        low_mask = test["n_hilly_stages_race"] <= 2
        high_mask = ~low_mask

        test["pred_hilly"] = 0.0
        if high_mask.sum() > 0:
            test.loc[high_mask, "pred_hilly"] = np.maximum(
                np.square(reg.predict(X_test[high_mask])), 0
            )
        if low_mask.sum() > 0:
            gate_pred = gate.predict(X_test[low_mask])
            mag_pred = np.maximum(np.square(mag.predict(X_test[low_mask])), 0)
            test.loc[low_mask, "pred_hilly"] = np.where(gate_pred == 1, mag_pred, 0.0)

        exposed = test[test["n_hilly_stages_ridden"] > 0]
        results = _evaluate(exposed)
        all_results.append(results)

    results_df = pd.concat(all_results, ignore_index=True)
    _print_summary(results_df, "Conditional")
    return results_df


def experiment_4_gate_magnitude_tuned(df):
    """Gate + magnitude with probability-weighted output instead of hard gate."""
    print("\n--- Experiment 4: Soft gate (probability × magnitude) ---")
    all_results = []

    for fold_num, fold in FOLDS.items():
        train = df[(df["year"] <= fold["train_end"]) & (df["n_hilly_stages_ridden"] > 0)]
        test = df[df["year"] == fold["test_year"]].copy()
        if len(test) == 0:
            continue

        available = [f for f in ALL_HILLY_FEATURES if f in df.columns]
        X_train = train[available].fillna(0)
        y_gate = train["scoreable_hilly"].values
        y_pts = train["hilly_pts_per_stage"].values

        # Gate (probability)
        gate = LogisticRegression(C=0.1, class_weight="balanced", max_iter=2000)
        gate.fit(X_train, y_gate)

        # Magnitude (on non-zero)
        nz = y_pts > 0
        mag = Ridge(alpha=1.0)
        mag.fit(X_train[nz], np.sqrt(y_pts[nz]))

        X_test = test[available].fillna(0)
        gate_prob = gate.predict_proba(X_test)[:, 1]  # P(scoreable)
        mag_pred = np.maximum(np.square(mag.predict(X_test)), 0)
        test["pred_hilly"] = gate_prob * mag_pred

        exposed = test[test["n_hilly_stages_ridden"] > 0]
        results = _evaluate(exposed)
        all_results.append(results)

    results_df = pd.concat(all_results, ignore_index=True)
    _print_summary(results_df, "Soft gate (P×mag)")
    return results_df


def main():
    print("=" * 70)
    print("HILLY STAGE TYPE — ARCHITECTURE EXPERIMENTS")
    print("=" * 70)

    df = _load_data()
    print(f"Dataset: {len(df):,} rows")

    # Stats on n_hilly_stages
    gt = df[df["race_type"] == "grand_tour"]
    hilly_counts = gt.groupby(["race_slug", "year"])["n_hilly_stages_race"].first()
    print(f"\nGT hilly stages distribution:")
    print(hilly_counts.value_counts().sort_index().to_string())

    r1 = experiment_1_baseline(df)
    r2 = experiment_2_gate_magnitude(df)
    r3 = experiment_3_conditional(df)
    r4 = experiment_4_gate_magnitude_tuned(df)

    # Comparison
    print("\n" + "=" * 70)
    print("COMPARISON — GT hilly")
    print("=" * 70)

    for label, results in [("Baseline", r1), ("Gate+Mag", r2), ("Conditional", r3), ("Soft gate", r4)]:
        gt_r = results[results["race_type"] == "grand_tour"]
        if len(gt_r) > 0:
            rho = gt_r["rho_full"].mean()
            rho_nz = gt_r["rho_nonzero"].dropna().mean()
            print(f"  {label:<15}: ρ_full={rho:.3f}, ρ_nz={rho_nz:.3f}")

    print("\n  (split by n_hilly_stages)")
    for label, results in [("Baseline", r1), ("Gate+Mag", r2), ("Conditional", r3), ("Soft gate", r4)]:
        gt_r = results[results["race_type"] == "grand_tour"]
        low = gt_r[gt_r["n_hilly_stages"] <= 2]
        high = gt_r[gt_r["n_hilly_stages"] >= 3]
        low_rho = low["rho_full"].mean() if len(low) > 0 else np.nan
        high_rho = high["rho_full"].mean() if len(high) > 0 else np.nan
        print(f"  {label:<15}: ≤2 stg ρ={low_rho:.3f}, ≥3 stg ρ={high_rho:.3f}")


if __name__ == "__main__":
    main()
