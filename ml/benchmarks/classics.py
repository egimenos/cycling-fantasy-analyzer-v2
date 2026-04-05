"""
Classics Benchmark — ML evaluation for one-day classic races.

Evaluates prediction quality using:
1. Expanding window CV (3 folds: →2023, →2024, →2025)
2. Metrics: Spearman rho, NDCG@10, P@5, P@10, team capture @15, team overlap @15
3. Per-race and per-classic-type breakdowns
4. Bootstrap 95% confidence intervals

This is a DECOUPLED pipeline — independent from the stage-race benchmark.

Usage:
    cd ml
    python -m src.benchmark_classics --label classics_lgbm_tier1
    python -m src.benchmark_classics --compare logbook/a.json logbook/b.json
"""

from __future__ import annotations

import argparse
import os

import numpy as np
import pandas as pd

from benchmarks.harness import (
    bootstrap_ci,
    find_optimal_team,
    ndcg_at_k,
    precision_at_k,
    spearman_rho,
)
from benchmarks.logbook import (
    _safe_round,
    build_run_metadata,
    load_logbook_entry,
    save_logbook_entry,
)
from src.data.loader import load_data

# ── Constants ────────────────────────────────────────────────────────

RANDOM_SEED = 42
TEAM_SIZE = 15
DEFAULT_BUDGET = 2000
DB_URL_DEFAULT = "postgresql://cycling:cycling@localhost:5432/cycling_analyzer"

FOLDS = {
    1: {"train_end": 2022, "test_year": 2023},
    2: {"train_end": 2023, "test_year": 2024},
    3: {"train_end": 2024, "test_year": 2025},
}


# ── Metrics ──────────────────────────────────────────────────────────


def compute_race_metrics(
    predicted: np.ndarray,
    actual: np.ndarray,
    k_ndcg: int = 10,
    k_p5: int = 5,
    k_p10: int = 10,
) -> dict:
    """Compute all 6 benchmark metrics for a single classic race."""
    metrics = {
        "rho": spearman_rho(predicted, actual),
        "ndcg_10": ndcg_at_k(predicted, actual, k=k_ndcg),
        "p_at_5": precision_at_k(predicted, actual, k=k_p5),
        "p_at_10": precision_at_k(predicted, actual, k=k_p10),
    }
    return metrics


def compute_team_metrics(
    predicted: np.ndarray,
    actual: np.ndarray,
    rider_ids: list[str],
    prices: dict[str, int],
    team_size: int = TEAM_SIZE,
    budget: int = DEFAULT_BUDGET,
) -> dict:
    """Compute team-based metrics: capture rate and overlap."""
    scores_pred = dict(zip(rider_ids, predicted.tolist()))
    scores_actual = dict(zip(rider_ids, actual.tolist()))

    if not prices or len(prices) < team_size:
        return {"team_capture": None, "team_overlap": None}

    pred_team = find_optimal_team(rider_ids, scores_pred, prices, budget, team_size)
    actual_team = find_optimal_team(rider_ids, scores_actual, prices, budget, team_size)

    if not pred_team or not actual_team:
        return {"team_capture": None, "team_overlap": None}

    actual_team_pts = sum(scores_actual.get(r, 0) for r in actual_team)
    pred_team_actual_pts = sum(scores_actual.get(r, 0) for r in pred_team)

    capture = pred_team_actual_pts / actual_team_pts if actual_team_pts > 0 else 0.0
    overlap = len(set(pred_team) & set(actual_team)) / len(actual_team) if actual_team else 0.0

    return {"team_capture": capture, "team_overlap": overlap}


# ── ML benchmark runner ──────────────────────────────────────────────


def run_ml_benchmark(
    feature_cols: list[str],
    model_type: str = "rf",
    transform: str = "raw",
) -> list[dict]:
    """Run ML model benchmark across all 3 CV folds using cached features.

    Returns fold detail dicts compatible with logbook schema.
    """
    from src.features.cache_classics import load_cached_classics
    from src.training.train_classics import TRANSFORMS, print_feature_importance, train_classic_model

    fold_details = []

    for fold_num, fold in FOLDS.items():
        test_year = fold["test_year"]
        train_end = fold["train_end"]

        # Load cached features
        train_dfs = []
        for yr in range(2019, train_end + 1):
            try:
                df = load_cached_classics(yr)
                if len(df) > 0:
                    train_dfs.append(df)
            except FileNotFoundError:
                pass

        if not train_dfs:
            print(f"  Fold {fold_num}: no training data, skipping")
            continue

        train_df = pd.concat(train_dfs, ignore_index=True)

        try:
            test_df = load_cached_classics(test_year)
        except FileNotFoundError:
            print(f"  Fold {fold_num}: no test data for {test_year}, skipping")
            continue

        if len(test_df) == 0:
            continue

        # Filter to available features
        available = [c for c in feature_cols if c in train_df.columns]
        if not available:
            print(f"  Fold {fold_num}: no matching features, skipping")
            continue

        # Train model
        model, meta = train_classic_model(train_df, available, model_type, transform)
        train_fn, inverse_fn = TRANSFORMS[transform]

        # Predict on test
        if model_type == "lgbm":
            X_test = test_df[available].values
        else:
            X_test = test_df[available].fillna(0).values

        raw_preds = model.predict(X_test)
        preds = np.maximum(inverse_fn(raw_preds), 0)
        test_df = test_df.copy()
        test_df["predicted"] = preds

        # Per-race metrics
        race_details = []
        all_rhos, all_ndcg, all_p5, all_p10 = [], [], [], []
        all_capture, all_overlap = [], []

        for (slug, year), group in test_df.groupby(["race_slug", "year"]):
            if len(group) < 5:
                continue

            predicted = group["predicted"].values
            actual = group["actual_pts"].values

            metrics = compute_race_metrics(predicted, actual)
            if np.isnan(metrics["rho"]):
                continue

            all_rhos.append(metrics["rho"])
            all_ndcg.append(metrics["ndcg_10"])
            all_p5.append(metrics["p_at_5"])
            all_p10.append(metrics["p_at_10"])

            rider_names = dict(zip(group["rider_id"], group.get("rider_name", group["rider_id"])))
            race_detail = {
                "race_slug": slug,
                "year": int(year),
                "race_type": "classic",
                "n_riders": len(group),
                "metrics": {
                    "rho": _safe_round(metrics["rho"]),
                    "ndcg_10": _safe_round(metrics["ndcg_10"]),
                    "p_at_5": _safe_round(metrics["p_at_5"]),
                    "p_at_10": _safe_round(metrics["p_at_10"]),
                },
            }
            race_details.append(race_detail)

        # Fold aggregate
        fold_agg = {
            "n_races": len(all_rhos),
            "rho_mean": _safe_round(np.mean(all_rhos)) if all_rhos else None,
            "rho_ci": (
                [_safe_round(x) for x in bootstrap_ci(all_rhos)]
                if len(all_rhos) >= 2
                else [None, None]
            ),
            "ndcg10_mean": _safe_round(np.mean(all_ndcg)) if all_ndcg else None,
            "p5_mean": _safe_round(np.mean(all_p5)) if all_p5 else None,
            "p10_mean": _safe_round(np.mean(all_p10)) if all_p10 else None,
            "team_capture_mean": (
                _safe_round(np.mean(all_capture)) if all_capture else None
            ),
            "team_overlap_mean": (
                _safe_round(np.mean(all_overlap)) if all_overlap else None
            ),
            "n_priced_races": len(all_capture),
        }

        fold_details.append({
            "fold": fold_num,
            "test_year": test_year,
            "race_types": {
                "classic": {
                    "aggregate": fold_agg,
                    "races": race_details,
                }
            },
        })

        print(
            f"  Fold {fold_num} ({test_year}): "
            f"{fold_agg['n_races']} races, "
            f"rho={fold_agg['rho_mean']}"
        )

        # Feature importance (last fold only)
        if fold_num == max(FOLDS.keys()):
            print_feature_importance(model, available)

    return fold_details


# ── Comparison report ────────────────────────────────────────────────


def compare_experiments(baseline_path: str, candidate_path: str) -> None:
    """Print A/B comparison table between two logbook entries."""
    baseline = load_logbook_entry(baseline_path)
    candidate = load_logbook_entry(candidate_path)

    b_agg = baseline.get("aggregate", {}).get("classic", {})
    c_agg = candidate.get("aggregate", {}).get("classic", {})

    print(f"\n{'='*70}")
    print(f"A/B Comparison")
    print(f"  Baseline:  {os.path.basename(baseline_path)}")
    print(f"  Candidate: {os.path.basename(candidate_path)}")
    print(f"{'='*70}")

    metrics = [
        ("rho_mean", "Spearman rho"),
        ("ndcg10_mean", "NDCG@10"),
        ("p5_mean", "P@5"),
        ("p10_mean", "P@10"),
        ("team_capture_mean", "Capture @15"),
        ("team_overlap_mean", "Overlap @15"),
    ]

    print(f"\n  {'Metric':<15} {'Base':>8} {'Candidate':>10} {'Delta':>10} {'Sig':>5}")
    print(f"  {'─'*50}")

    for key, label in metrics:
        b_val = b_agg.get(key)
        c_val = c_agg.get(key)
        if b_val is None or c_val is None:
            print(f"  {label:<15} {'N/A':>8} {'N/A':>10} {'N/A':>10}")
            continue
        delta = c_val - b_val
        # Significance: check CI overlap
        b_ci = b_agg.get("rho_ci", [None, None]) if "rho" in key else [None, None]
        c_ci = c_agg.get("rho_ci", [None, None]) if "rho" in key else [None, None]
        sig = "***" if (b_ci[1] and c_ci[0] and c_ci[0] > b_ci[1]) else ""
        print(f"  {label:<15} {b_val:>8.4f} {c_val:>10.4f} {delta:>+10.4f} {sig:>5}")

    print()


# ── Summary printer ──────────────────────────────────────────────────


def print_summary(fold_details: list[dict], title: str = "Classic ML Benchmark") -> None:
    """Print a formatted summary table."""
    print(f"\n{'='*70}")
    print(f"  {title}")
    print(f"{'='*70}\n")

    header = f"  {'Metric':<15}"
    for fd in fold_details:
        header += f" {'Fold'+str(fd['fold']):>8}"
    header += f" {'Avg':>8} {'95% CI':>16}"
    print(header)
    print(f"  {'─'*65}")

    metric_keys = [
        ("rho_mean", "Spearman rho"),
        ("ndcg10_mean", "NDCG@10"),
        ("p5_mean", "P@5"),
        ("p10_mean", "P@10"),
        ("team_capture_mean", "Capture @15"),
        ("team_overlap_mean", "Overlap @15"),
    ]

    for key, label in metric_keys:
        vals = []
        line = f"  {label:<15}"
        for fd in fold_details:
            agg = fd["race_types"]["classic"]["aggregate"]
            v = agg.get(key)
            if v is not None:
                line += f" {v:>8.4f}"
                vals.append(v)
            else:
                line += f" {'N/A':>8}"
        if vals:
            avg = np.mean(vals)
            ci = bootstrap_ci(vals) if len(vals) >= 2 else (np.nan, np.nan)
            ci_str = (
                f"[{ci[0]:.4f}, {ci[1]:.4f}]"
                if not np.isnan(ci[0])
                else "N/A"
            )
            line += f" {avg:>8.4f} {ci_str:>16}"
        print(line)

    # Per-race count summary
    total_races = sum(
        fd["race_types"]["classic"]["aggregate"]["n_races"] for fd in fold_details
    )
    print(f"\n  Total races evaluated: {total_races}")

    # Per-race detail: list all races
    print(f"\n  Per-race breakdown:")
    print(f"  {'Race':<35} {'Year':>5} {'N':>4} {'rho':>7} {'NDCG':>7} {'P@5':>6}")
    print(f"  {'─'*70}")
    for fd in fold_details:
        for race in sorted(
            fd["race_types"]["classic"]["races"],
            key=lambda r: r["metrics"]["rho"] or 0,
            reverse=True,
        ):
            m = race["metrics"]
            rho_str = f"{m['rho']:.4f}" if m["rho"] is not None else "N/A"
            ndcg_str = f"{m['ndcg_10']:.4f}" if m["ndcg_10"] is not None else "N/A"
            p5_str = f"{m['p_at_5']:.3f}" if m["p_at_5"] is not None else "N/A"
            print(
                f"  {race['race_slug']:<35} {race['year']:>5} "
                f"{race['n_riders']:>4} {rho_str:>7} {ndcg_str:>7} {p5_str:>6}"
            )

    print()


# ── Main ─────────────────────────────────────────────────────────────


def main():
    parser = argparse.ArgumentParser(description="Classics ML Benchmark")
    parser.add_argument("--label", type=str, help="Logbook entry label")
    parser.add_argument(
        "--compare",
        nargs=2,
        metavar=("BASELINE", "CANDIDATE"),
        help="Compare two logbook entries",
    )
    parser.add_argument("--features", type=str, help="Feature set name")
    parser.add_argument("--model", type=str, help="Model type: rf or lgbm")
    parser.add_argument(
        "--transform", type=str, default="raw", help="Target transform"
    )
    args = parser.parse_args()

    if args.compare:
        compare_experiments(args.compare[0], args.compare[1])
        return

    from src.features.cache_classics import cache_all_years, load_cached_classics, validate_cache
    from src.training.train_classics import (
        FEATURE_SETS,
        TRANSFORMS,
        get_feature_cols,
        get_feature_importance,
        make_model,
        print_feature_importance,
        train_classic_model,
    )

    db_url = os.environ.get("DATABASE_URL", DB_URL_DEFAULT)
    model_type = args.model or "rf"
    transform = args.transform or "raw"
    feature_set_name = args.features or "tier1"
    feature_cols = get_feature_cols(feature_set_name)

    # Ensure cache exists
    if not validate_cache():
        print("Cache invalid or missing, rebuilding...")
        results_df, _ = load_data(db_url)
        cache_all_years(results_df)

    print(f"\nRunning ML benchmark: {model_type} / {feature_set_name} / {transform}")
    fold_details = run_ml_benchmark(
        feature_cols, model_type, transform,
    )

    metadata = build_run_metadata(
        model_type=model_type,
        model_params={},
        feature_set_name=feature_set_name,
        feature_cols=feature_cols,
        target_transform=transform,
        cache_schema_hash="N/A",
    )

    label = args.label or f"classics_{model_type}_{feature_set_name}_{transform}"
    path = save_logbook_entry(metadata, fold_details, label=label)
    print(f"\nLogbook saved: {path}")

    print_summary(fold_details, title=f"Classic ML: {model_type} / {feature_set_name} / {transform}")


if __name__ == "__main__":
    main()
