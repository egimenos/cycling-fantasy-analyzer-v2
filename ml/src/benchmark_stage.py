"""
Stage source benchmark (Feature 012, Step 4 — Experiment A).

Trains per-type models (regression or gate+magnitude) and evaluates
stage predictions conditioned on race route structure.

Architecture (from EDA):
  - flat, hilly, mountain: direct regression on pts_per_stage
  - itt: gate (scoreable y/n) + magnitude (pts_per_stage if scoreable)

Usage:
    cd ml && python -m src.benchmark_stage
    cd ml && python -m src.benchmark_stage --transform sqrt
    cd ml && python -m src.benchmark_stage --model lgbm
"""

from __future__ import annotations

import argparse
import os
import warnings

import numpy as np
import pandas as pd
from scipy import stats
from sklearn.ensemble import RandomForestRegressor, RandomForestClassifier
from sklearn.linear_model import Ridge, LogisticRegression
from sklearn.metrics import precision_score, recall_score

from .benchmark_v8 import FOLDS
from .stage_targets import STAGE_TYPES

warnings.filterwarnings("ignore", category=FutureWarning)

CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", "cache")

# Features per type model. stage_mu/stage_rd are secondary (shared across types).
# Type-specific features are primary signal.
SHARED_FEATURES = ["stage_mu", "stage_rd", "age"]

TYPE_FEATURES_TEMPLATE = [
    "{type}_pts_12m", "{type}_pts_6m",
    "{type}_strength_12m", "{type}_strength_6m",
    "{type}_top10_rate_12m", "{type}_top10_rate_6m",
    "{type}_top10s_12m", "{type}_starts_12m",
]

# Cross-type context (helps model understand rider profile)
PROFILE_FEATURES = [
    "pct_pts_p1p2", "pct_pts_p4p5", "pct_pts_p3",
    "itt_top10_rate", "stage_wins_flat", "stage_wins_mountain",
]


def _get_features_for_type(stage_type: str) -> list[str]:
    """Build the feature list for a specific stage type model."""
    type_feats = [f.format(type=stage_type) for f in TYPE_FEATURES_TEMPLATE]
    return SHARED_FEATURES + type_feats + PROFILE_FEATURES


def _load_data() -> pd.DataFrame:
    """Load and join cache + stage targets + stage features."""
    # Load existing cache (has stage_mu, stage_rd, age, profile features)
    cache_dfs = []
    for yr in range(2022, 2026):
        path = os.path.join(CACHE_DIR, f"features_{yr}.parquet")
        if os.path.exists(path):
            cache_dfs.append(pd.read_parquet(path))
    cache = pd.concat(cache_dfs, ignore_index=True)

    # Load stage targets
    targets = pd.read_parquet(os.path.join(CACHE_DIR, "stage_targets.parquet"))

    # Load stage features
    feats = pd.read_parquet(os.path.join(CACHE_DIR, "stage_features.parquet"))

    # Join on (rider_id, race_slug, year)
    # Cache uses 'race_year' or 'year' — check column names
    if "race_year" in cache.columns and "year" not in cache.columns:
        cache = cache.rename(columns={"race_year": "year"})

    # Select needed columns from cache
    cache_cols = ["rider_id", "race_slug", "year"] + [
        c for c in SHARED_FEATURES + PROFILE_FEATURES if c in cache.columns
    ]
    cache_slim = cache[cache_cols].drop_duplicates(subset=["rider_id", "race_slug", "year"])

    # Merge targets + features
    df = targets.merge(feats, on=["rider_id", "race_slug", "year"], how="inner")
    df = df.merge(cache_slim, on=["rider_id", "race_slug", "year"], how="inner")

    print(f"Combined dataset: {len(df):,} rows")
    print(f"Years: {sorted(df['year'].unique())}")
    print(f"Race types: {df['race_type'].value_counts().to_dict()}")

    return df


def _apply_transform(y: np.ndarray, transform: str) -> np.ndarray:
    if transform == "sqrt":
        return np.sqrt(y)
    if transform == "log1p":
        return np.log1p(y)
    return y


def _inverse_transform(y: np.ndarray, transform: str) -> np.ndarray:
    if transform == "sqrt":
        return np.square(y)
    if transform == "log1p":
        return np.expm1(y)
    return y


def _train_regression(
    X_train: pd.DataFrame, y_train: np.ndarray,
    weights: np.ndarray, model_type: str, transform: str,
) -> tuple:
    """Train a regression model for a stage type."""
    y_t = _apply_transform(y_train, transform)

    if model_type == "ridge":
        model = Ridge(alpha=1.0)
        X_fill = X_train.fillna(0)
        model.fit(X_fill, y_t, sample_weight=weights)
    elif model_type == "rf":
        model = RandomForestRegressor(
            n_estimators=200, max_depth=8, min_samples_leaf=10,
            random_state=42, n_jobs=-1,
        )
        X_fill = X_train.fillna(0)
        model.fit(X_fill, y_t, sample_weight=weights)
    elif model_type == "lgbm":
        import lightgbm as lgb
        model = lgb.LGBMRegressor(
            n_estimators=300, max_depth=6, learning_rate=0.05,
            min_child_samples=20, subsample=0.8, colsample_bytree=0.8,
            random_state=42, verbose=-1,
        )
        model.fit(X_train, y_t, sample_weight=weights)
    else:
        raise ValueError(f"Unknown model type: {model_type}")

    return model, transform, model_type


def _predict_regression(model, X_test: pd.DataFrame, transform: str, model_type: str) -> np.ndarray:
    """Predict with a regression model."""
    if model_type in ("ridge", "rf"):
        X_fill = X_test.fillna(0)
    else:
        X_fill = X_test
    pred = model.predict(X_fill)
    pred = _inverse_transform(pred, transform)
    return np.maximum(pred, 0)  # No negative predictions


def _train_gate(
    X_train: pd.DataFrame, y_gate: np.ndarray, weights: np.ndarray,
) -> LogisticRegression:
    """Train a gate classifier (scoreable yes/no)."""
    model = LogisticRegression(C=0.1, class_weight="balanced", max_iter=1000)
    model.fit(X_train.fillna(0), y_gate, sample_weight=weights)
    return model


def _train_magnitude(
    X_train: pd.DataFrame, y_mag: np.ndarray,
    weights: np.ndarray, model_type: str, transform: str,
) -> tuple:
    """Train a magnitude model on non-zero subset."""
    return _train_regression(X_train, y_mag, weights, model_type, transform)


def _evaluate_per_race(
    test_df: pd.DataFrame, pred_col: str, actual_col: str,
) -> list[dict]:
    """Evaluate predictions per race, returning per-race metrics."""
    results = []
    for (slug, year), race_df in test_df.groupby(["race_slug", "year"]):
        if len(race_df) < 3:
            continue
        pred = race_df[pred_col].values
        actual = race_df[actual_col].values

        # Spearman on full set
        rho_full, _ = stats.spearmanr(pred, actual)
        if np.isnan(rho_full):
            continue

        # Spearman on non-zero actual only
        nz_mask = actual > 0
        rho_nz = np.nan
        if nz_mask.sum() >= 3:
            rho_nz, _ = stats.spearmanr(pred[nz_mask], actual[nz_mask])

        results.append({
            "race_slug": slug,
            "year": year,
            "race_type": race_df["race_type"].iloc[0],
            "n_riders": len(race_df),
            "n_nonzero": int(nz_mask.sum()),
            "rho_full": rho_full,
            "rho_nonzero": rho_nz,
        })
    return results


def run_benchmark(model_type: str = "ridge", transform: str = "raw"):
    """Run the full stage source benchmark."""
    print("=" * 70)
    print(f"STAGE SOURCE BENCHMARK — model={model_type}, transform={transform}")
    print("=" * 70)

    df = _load_data()

    # Filter to races with stage data (year >= 2022 because cache starts there)
    df = df[df["year"] >= 2022].copy()

    all_race_results = []
    all_type_results = {st: [] for st in STAGE_TYPES}

    for fold_num, fold in FOLDS.items():
        train_mask = df["year"] <= fold["train_end"]
        test_mask = df["year"] == fold["test_year"]
        train_df = df[train_mask].copy()
        test_df = df[test_mask].copy()

        if len(test_df) == 0:
            continue

        print(f"\n--- Fold {fold_num}: train ≤{fold['train_end']}, test={fold['test_year']} ---")
        print(f"  Train: {len(train_df):,}, Test: {len(test_df):,}")

        # Initialize prediction columns
        for st in STAGE_TYPES:
            test_df[f"pred_{st}_pts_per_stage"] = 0.0

        for st in STAGE_TYPES:
            features = _get_features_for_type(st)
            available = [f for f in features if f in df.columns]
            target_col = f"{st}_pts_per_stage"
            exposure_col = f"n_{st}_stages_ridden"
            scoreable_col = f"scoreable_{st}"

            # Filter training to riders with exposure
            train_exposed = train_df[train_df[exposure_col] > 0]
            test_exposed_mask = test_df[exposure_col] > 0

            if len(train_exposed) < 10:
                print(f"  {st}: insufficient training data ({len(train_exposed)}), skipping")
                continue

            X_train = train_exposed[available]
            y_train = train_exposed[target_col].values
            weights = train_exposed["stage_sample_weight"].values

            if st == "itt":
                # Gate + magnitude
                y_gate = train_exposed[scoreable_col].values

                gate_model = _train_gate(X_train, y_gate, weights)

                # Magnitude: only non-zero
                nz_mask = y_train > 0
                if nz_mask.sum() < 5:
                    print(f"  itt: insufficient non-zero for magnitude ({nz_mask.sum()})")
                    continue

                mag_model, mag_transform, mag_type = _train_magnitude(
                    X_train[nz_mask], y_train[nz_mask],
                    weights[nz_mask], model_type, transform,
                )

                # Predict
                X_test = test_df[available]
                gate_pred = gate_model.predict(X_test.fillna(0))
                mag_pred = _predict_regression(mag_model, X_test, mag_transform, mag_type)

                test_df[f"pred_{st}_pts_per_stage"] = np.where(gate_pred == 1, mag_pred, 0.0)

                # Gate metrics
                if test_exposed_mask.sum() > 0:
                    y_test_gate = test_df.loc[test_exposed_mask, scoreable_col].values
                    gate_pred_exposed = gate_model.predict(
                        test_df.loc[test_exposed_mask, available].fillna(0)
                    )
                    prec = precision_score(y_test_gate, gate_pred_exposed, zero_division=0)
                    rec = recall_score(y_test_gate, gate_pred_exposed, zero_division=0)
                    print(f"  {st}: gate precision={prec:.3f}, recall={rec:.3f}")

            else:
                # Direct regression
                reg_model, reg_transform, reg_type = _train_regression(
                    X_train, y_train, weights, model_type, transform,
                )

                X_test = test_df[available]
                test_df[f"pred_{st}_pts_per_stage"] = _predict_regression(
                    reg_model, X_test, reg_transform, reg_type,
                )

            # Per-type evaluation
            type_results = _evaluate_per_race(
                test_df[test_exposed_mask] if test_exposed_mask.sum() > 0 else test_df,
                f"pred_{st}_pts_per_stage",
                target_col,
            )
            all_type_results[st].extend(type_results)

            n_races = len(type_results)
            if n_races > 0:
                mean_rho = np.nanmean([r["rho_full"] for r in type_results])
                mean_rho_nz = np.nanmean([r["rho_nonzero"] for r in type_results])
                print(f"  {st}: {n_races} races, ρ_full={mean_rho:.3f}, ρ_nonzero={mean_rho_nz:.3f}")

        # Aggregate: pred_stage_total = sum(pred_type_pts_per_stage × n_type_stages_race)
        test_df["pred_stage_total"] = sum(
            test_df[f"pred_{st}_pts_per_stage"] * test_df[f"n_{st}_stages_race"]
            for st in STAGE_TYPES
        )

        # Total-level evaluation
        race_results = _evaluate_per_race(
            test_df, "pred_stage_total", "actual_stage_pts_typed",
        )
        all_race_results.extend(race_results)

    # ── Final summary ────────────────────────────────────────────────
    print("\n" + "=" * 70)
    print("RESULTS SUMMARY")
    print("=" * 70)

    # Per-type results
    for st in STAGE_TYPES:
        results = all_type_results[st]
        if not results:
            continue
        results_df = pd.DataFrame(results)
        for rt in ["grand_tour", "mini_tour"]:
            sub = results_df[results_df["race_type"] == rt]
            if len(sub) == 0:
                continue
            rho = sub["rho_full"].mean()
            rho_nz = sub["rho_nonzero"].dropna().mean()
            print(f"  {st:>10} ({rt[:5]:>5}): n={len(sub):>3}, "
                  f"ρ_full={rho:.3f}, ρ_nonzero={rho_nz:.3f}")

    # Aggregate results
    print()
    results_df = pd.DataFrame(all_race_results)
    for rt in ["grand_tour", "mini_tour"]:
        sub = results_df[results_df["race_type"] == rt]
        if len(sub) == 0:
            continue
        rho = sub["rho_full"].mean()
        rho_nz = sub["rho_nonzero"].dropna().mean()
        print(f"  TOTAL ({rt[:5]:>5}): n={len(sub):>3}, "
              f"ρ_full={rho:.3f}, ρ_nonzero={rho_nz:.3f}")

    # Top-20 MAE
    print()
    for rt in ["grand_tour", "mini_tour"]:
        rt_df = df[df["race_type"] == rt]
        # This is a rough estimate — detailed per-fold MAE would need more work
        print(f"  (per-type ρ breakdown above gives the actionable signal)")


def main():
    parser = argparse.ArgumentParser(description="Stage source benchmark")
    parser.add_argument("--model", default="ridge", choices=["ridge", "rf", "lgbm"])
    parser.add_argument("--transform", default="raw", choices=["raw", "sqrt", "log1p"])
    args = parser.parse_args()
    run_benchmark(model_type=args.model, transform=args.transform)


if __name__ == "__main__":
    main()
