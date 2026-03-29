"""
Stage source race-class weighting ablation (Feature 012, Step 5 — Experiment B).

2×2 design:
  A (neither):       raw pts features,     uniform weights
  B (features only): strength features,    uniform weights
  C (weights only):  raw pts features,     class-based weights
  D (both):          strength features,    class-based weights

Uses Ridge + sqrt (best from Experiment A).
Focus: does double-discounting hurt? Is one sufficient?

Usage:
    cd ml && python -m src.benchmark_stage_ablation
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
from .stage_targets import STAGE_TYPES

warnings.filterwarnings("ignore")

CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", "cache")

SHARED_FEATURES = ["stage_mu", "stage_rd", "age"]

PROFILE_FEATURES = [
    "pct_pts_p1p2", "pct_pts_p4p5", "pct_pts_p3",
    "itt_top10_rate", "stage_wins_flat", "stage_wins_mountain",
]

# Features that DO NOT use class weighting
RAW_TYPE_FEATURES = [
    "{type}_pts_12m", "{type}_pts_6m",
    "{type}_top10_rate_12m", "{type}_top10_rate_6m",
    "{type}_top10s_12m", "{type}_starts_12m",
]

# Features that USE class weighting
STRENGTH_TYPE_FEATURES = [
    "{type}_strength_12m", "{type}_strength_6m",
]

CONFIGS = {
    "A_neither": {"use_strength": False, "use_class_weights": False},
    "B_feat_only": {"use_strength": True, "use_class_weights": False},
    "C_wt_only": {"use_strength": False, "use_class_weights": True},
    "D_both": {"use_strength": True, "use_class_weights": True},
}


def _get_features(stage_type: str, use_strength: bool) -> list[str]:
    """Build feature list for a type, optionally including strength features."""
    raw = [f.format(type=stage_type) for f in RAW_TYPE_FEATURES]
    if use_strength:
        strength = [f.format(type=stage_type) for f in STRENGTH_TYPE_FEATURES]
        return SHARED_FEATURES + raw + strength + PROFILE_FEATURES
    return SHARED_FEATURES + raw + PROFILE_FEATURES


def _load_data() -> pd.DataFrame:
    """Load and join all data sources."""
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


def _run_config(df: pd.DataFrame, config_name: str, use_strength: bool, use_class_weights: bool):
    """Run one ablation configuration."""
    all_type_results = {st: [] for st in STAGE_TYPES}
    all_race_results = []

    for fold_num, fold in FOLDS.items():
        train_df = df[df["year"] <= fold["train_end"]].copy()
        test_df = df[df["year"] == fold["test_year"]].copy()
        if len(test_df) == 0:
            continue

        for st in STAGE_TYPES:
            test_df[f"pred_{st}_pts_per_stage"] = 0.0

        for st in STAGE_TYPES:
            features = _get_features(st, use_strength)
            available = [f for f in features if f in df.columns]
            target_col = f"{st}_pts_per_stage"
            exposure_col = f"n_{st}_stages_ridden"
            scoreable_col = f"scoreable_{st}"

            train_exp = train_df[train_df[exposure_col] > 0]
            test_exp_mask = test_df[exposure_col] > 0

            if len(train_exp) < 10:
                continue

            X_train = train_exp[available].fillna(0)
            y_train = np.sqrt(train_exp[target_col].values)

            if use_class_weights:
                weights = train_exp["stage_sample_weight"].values
            else:
                weights = np.ones(len(train_exp))

            if st == "itt":
                # Gate + magnitude
                y_gate = train_exp[scoreable_col].values
                gate = LogisticRegression(C=0.1, class_weight="balanced", max_iter=2000)
                gate.fit(X_train, y_gate, sample_weight=weights)

                nz = y_train > 0
                if nz.sum() < 5:
                    continue
                mag = Ridge(alpha=1.0)
                mag.fit(X_train[nz], y_train[nz], sample_weight=weights[nz])

                X_test = test_df[available].fillna(0)
                gate_pred = gate.predict(X_test)
                mag_pred = np.maximum(np.square(mag.predict(X_test)), 0)
                test_df[f"pred_{st}_pts_per_stage"] = np.where(gate_pred == 1, mag_pred, 0.0)
            else:
                model = Ridge(alpha=1.0)
                model.fit(X_train, y_train, sample_weight=weights)
                X_test = test_df[available].fillna(0)
                test_df[f"pred_{st}_pts_per_stage"] = np.maximum(np.square(model.predict(X_test)), 0)

            # Per-type eval
            if test_exp_mask.sum() > 0:
                sub = test_df[test_exp_mask]
                for (slug, yr), race in sub.groupby(["race_slug", "year"]):
                    if len(race) < 3:
                        continue
                    rho, _ = stats.spearmanr(
                        race[f"pred_{st}_pts_per_stage"].values,
                        race[target_col].values,
                    )
                    if np.isnan(rho):
                        continue
                    actual = race[target_col].values
                    nz_m = actual > 0
                    rho_nz = np.nan
                    if nz_m.sum() >= 3:
                        rho_nz, _ = stats.spearmanr(
                            race[f"pred_{st}_pts_per_stage"].values[nz_m],
                            actual[nz_m],
                        )
                    all_type_results[st].append({
                        "race_type": race["race_type"].iloc[0],
                        "rho_full": rho,
                        "rho_nonzero": rho_nz,
                    })

        # Total aggregation
        test_df["pred_stage_total"] = sum(
            test_df[f"pred_{st}_pts_per_stage"] * test_df[f"n_{st}_stages_race"]
            for st in STAGE_TYPES
        )
        for (slug, yr), race in test_df.groupby(["race_slug", "year"]):
            if len(race) < 3:
                continue
            rho, _ = stats.spearmanr(
                race["pred_stage_total"].values,
                race["actual_stage_pts_typed"].values,
            )
            if np.isnan(rho):
                continue
            actual = race["actual_stage_pts_typed"].values
            nz_m = actual > 0
            rho_nz = np.nan
            if nz_m.sum() >= 3:
                rho_nz, _ = stats.spearmanr(
                    race["pred_stage_total"].values[nz_m], actual[nz_m]
                )
            all_race_results.append({
                "race_type": race["race_type"].iloc[0],
                "rho_full": rho,
                "rho_nonzero": rho_nz,
            })

    return all_type_results, all_race_results


def main():
    print("=" * 70)
    print("STAGE SOURCE — RACE-CLASS WEIGHTING ABLATION (Experiment B)")
    print("=" * 70)

    df = _load_data()
    print(f"Dataset: {len(df):,} rows\n")

    summary_rows = []

    for config_name, cfg in CONFIGS.items():
        print(f"\n{'─' * 60}")
        print(f"Config: {config_name}")
        print(f"  strength features: {cfg['use_strength']}")
        print(f"  class sample weights: {cfg['use_class_weights']}")
        print(f"{'─' * 60}")

        type_results, race_results = _run_config(
            df, config_name, cfg["use_strength"], cfg["use_class_weights"]
        )

        race_df = pd.DataFrame(race_results)

        # Per-type summary
        for st in STAGE_TYPES:
            tr = pd.DataFrame(type_results[st])
            if len(tr) == 0:
                continue
            for rt in ["grand_tour", "mini_tour"]:
                sub = tr[tr["race_type"] == rt]
                if len(sub) == 0:
                    continue
                rho = sub["rho_full"].mean()
                rho_nz = sub["rho_nonzero"].dropna().mean()
                print(f"  {st:>10} ({rt[:5]}): ρ_full={rho:.3f}, ρ_nz={rho_nz:.3f}")
                summary_rows.append({
                    "config": config_name,
                    "type": st,
                    "race_type": rt[:5],
                    "rho_full": rho,
                    "rho_nonzero": rho_nz,
                })

        # Total summary
        for rt in ["grand_tour", "mini_tour"]:
            sub = race_df[race_df["race_type"] == rt]
            if len(sub) == 0:
                continue
            rho = sub["rho_full"].mean()
            rho_nz = sub["rho_nonzero"].dropna().mean()
            print(f"  {'TOTAL':>10} ({rt[:5]}): ρ_full={rho:.3f}, ρ_nz={rho_nz:.3f}")
            summary_rows.append({
                "config": config_name,
                "type": "TOTAL",
                "race_type": rt[:5],
                "rho_full": rho,
                "rho_nonzero": rho_nz,
            })

    # ── Comparison table ─────────────────────────────────────────────
    print("\n" + "=" * 70)
    print("COMPARISON TABLE — GT results")
    print("=" * 70)

    summary = pd.DataFrame(summary_rows)
    gt = summary[summary["race_type"] == "grand"]

    for st in STAGE_TYPES + ["TOTAL"]:
        st_data = gt[gt["type"] == st]
        if len(st_data) == 0:
            continue
        print(f"\n  {st}:")
        print(f"  {'Config':<15} {'ρ_full':>8} {'ρ_nz':>8}")
        for _, row in st_data.iterrows():
            print(f"  {row['config']:<15} {row['rho_full']:>8.3f} {row['rho_nonzero']:>8.3f}")

    print("\n" + "=" * 70)
    print("COMPARISON TABLE — Mini Tour results")
    print("=" * 70)

    mini = summary[summary["race_type"] == "mini_"]
    for st in STAGE_TYPES + ["TOTAL"]:
        st_data = mini[mini["type"] == st]
        if len(st_data) == 0:
            continue
        print(f"\n  {st}:")
        print(f"  {'Config':<15} {'ρ_full':>8} {'ρ_nz':>8}")
        for _, row in st_data.iterrows():
            print(f"  {row['config']:<15} {row['rho_full']:>8.3f} {row['rho_nonzero']:>8.3f}")


if __name__ == "__main__":
    main()
