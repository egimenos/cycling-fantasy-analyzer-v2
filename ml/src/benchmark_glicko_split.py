"""
A/B benchmark: unified stage_mu vs 4-track type-split stage Glicko-2 ratings.

Compares three configurations using the same 3-fold expanding window CV:
  Config A (baseline): unified stage_mu/stage_rd — current production
  Config B (split):    4 type-specific tracks (flat/hilly/mountain/itt)
  Config C (both):     unified + split features together

All other features, targets, models, and hyperparameters are identical.
The GC source doesn't use stage_mu and serves as a control.

Usage:
    cd ml && python -m src.benchmark_glicko_split
"""

from __future__ import annotations

import os
import warnings

import numpy as np
import pandas as pd
import psycopg2
from scipy import stats
from sklearn.linear_model import Ridge, LogisticRegression

from .benchmark_v8 import FOLDS, find_optimal_team, ndcg_at_k, precision_at_k
from .glicko2 import compute_all_ratings, GLICKO_STAGE_TYPES
from .points import (
    FINAL_CLASS_GT, FINAL_CLASS_MINI, STAGE_POINTS,
    estimate_gc_daily_pts, GC_GRAND_TOUR, GC_MINI_TOUR,
)
from .predict_sources import _sharpen, _scale_to_supply, _compute_race_supply
from .research_v6 import load_data_fast
from .stage_targets import STAGE_TYPES
from .supply_estimation import build_supply_history, estimate_supply_for_races, estimate_supply

warnings.filterwarnings("ignore")

CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", "cache")
DB_URL = os.environ.get(
    "DATABASE_URL", "postgresql://cycling:cycling@localhost:5432/cycling_analyzer"
)

_GT_FINAL_AVG = sum(FINAL_CLASS_GT.values()) / len(FINAL_CLASS_GT)
_MINI_FINAL_AVG = sum(FINAL_CLASS_MINI.values()) / len(FINAL_CLASS_MINI)

# ── Feature sets per configuration ──────────────────────────────────

PROFILE = ["pct_pts_p1p2", "pct_pts_p4p5", "pct_pts_p3", "itt_top10_rate"]
STAGE_RAW = ["{t}_pts_12m", "{t}_top10_rate_12m", "{t}_starts_12m"]
STAGE_STRENGTH = ["{t}_strength_12m"]

GC_GATE_FEATS = [
    "gc_mu", "gc_mu_delta_12m", "same_race_gc_best",
    "age", "gc_pts_same_type",
]

# Config A: unified stage_mu (current production)
SHARED_A = ["stage_mu", "stage_rd", "age"]
MTN_FINAL_A = [
    "gc_mu", "gc_rd", "stage_mu", "pct_pts_p4p5", "stage_wins_mountain",
    "mountain_pts_12m", "mountain_pts_6m", "mountain_strength_12m",
    "mountain_top10_rate_12m", "mountain_top10s_12m",
    "gc_mu_delta_12m", "pts_gc_12m", "sr_gc_top10_rate",
    "target_mountain_pct", "age",
]
MTN_PASS_A = [
    "pct_pts_p4p5", "stage_wins_mountain",
    "mountain_pts_12m", "mountain_pts_6m", "mountain_strength_12m",
    "mountain_top10_rate_12m", "mountain_top10s_12m", "mountain_starts_12m",
    "stage_mu", "gc_mu", "pts_stage_12m", "target_mountain_pct", "age",
]
SPR_INTER_A = [
    "pct_pts_p1p2", "stage_wins_flat",
    "flat_pts_12m", "flat_pts_6m", "flat_strength_12m",
    "flat_top10_rate_12m", "flat_top10s_12m",
    "hilly_pts_12m", "hilly_top10_rate_12m", "pct_pts_p3",
    "stage_mu", "pts_stage_12m", "target_flat_pct", "age",
]

# Config B: 4 type-specific tracks
SHARED_B = {
    "flat": ["stage_flat_mu", "stage_flat_rd", "age"],
    "hilly": ["stage_hilly_mu", "stage_hilly_rd", "age"],
    "mountain": ["stage_mountain_mu", "stage_mountain_rd", "age"],
    "itt": ["stage_itt_mu", "stage_itt_rd", "age"],
}
MTN_FINAL_B = [
    "gc_mu", "gc_rd", "stage_mountain_mu", "pct_pts_p4p5", "stage_wins_mountain",
    "mountain_pts_12m", "mountain_pts_6m", "mountain_strength_12m",
    "mountain_top10_rate_12m", "mountain_top10s_12m",
    "gc_mu_delta_12m", "pts_gc_12m", "sr_gc_top10_rate",
    "target_mountain_pct", "age",
]
MTN_PASS_B = [
    "pct_pts_p4p5", "stage_wins_mountain",
    "mountain_pts_12m", "mountain_pts_6m", "mountain_strength_12m",
    "mountain_top10_rate_12m", "mountain_top10s_12m", "mountain_starts_12m",
    "stage_mountain_mu", "gc_mu", "pts_stage_12m", "target_mountain_pct", "age",
]
SPR_INTER_B = [
    "pct_pts_p1p2", "stage_wins_flat",
    "flat_pts_12m", "flat_pts_6m", "flat_strength_12m",
    "flat_top10_rate_12m", "flat_top10s_12m",
    "hilly_pts_12m", "hilly_top10_rate_12m", "pct_pts_p3",
    "stage_flat_mu", "pts_stage_12m", "target_flat_pct", "age",
]

# Config C: both unified + split
SHARED_C = {
    "flat": ["stage_mu", "stage_rd", "stage_flat_mu", "stage_flat_rd", "age"],
    "hilly": ["stage_mu", "stage_rd", "stage_hilly_mu", "stage_hilly_rd", "age"],
    "mountain": ["stage_mu", "stage_rd", "stage_mountain_mu", "stage_mountain_rd", "age"],
    "itt": ["stage_mu", "stage_rd", "stage_itt_mu", "stage_itt_rd", "age"],
}
MTN_FINAL_C = [
    "gc_mu", "gc_rd", "stage_mu", "stage_mountain_mu", "pct_pts_p4p5", "stage_wins_mountain",
    "mountain_pts_12m", "mountain_pts_6m", "mountain_strength_12m",
    "mountain_top10_rate_12m", "mountain_top10s_12m",
    "gc_mu_delta_12m", "pts_gc_12m", "sr_gc_top10_rate",
    "target_mountain_pct", "age",
]
MTN_PASS_C = [
    "pct_pts_p4p5", "stage_wins_mountain",
    "mountain_pts_12m", "mountain_pts_6m", "mountain_strength_12m",
    "mountain_top10_rate_12m", "mountain_top10s_12m", "mountain_starts_12m",
    "stage_mu", "stage_mountain_mu", "gc_mu", "pts_stage_12m", "target_mountain_pct", "age",
]
SPR_INTER_C = [
    "pct_pts_p1p2", "stage_wins_flat",
    "flat_pts_12m", "flat_pts_6m", "flat_strength_12m",
    "flat_top10_rate_12m", "flat_top10s_12m",
    "hilly_pts_12m", "hilly_top10_rate_12m", "pct_pts_p3",
    "stage_mu", "stage_flat_mu", "pts_stage_12m", "target_flat_pct", "age",
]


CONFIGS = {
    "A": {
        "name": "unified stage_mu",
        "stage_shared": lambda st: SHARED_A,
        "mtn_final": MTN_FINAL_A,
        "mtn_pass": MTN_PASS_A,
        "spr_inter": SPR_INTER_A,
        "sprint_allround_mu": "stage_mu",
    },
    "B": {
        "name": "4-track split",
        "stage_shared": lambda st: SHARED_B[st],
        "mtn_final": MTN_FINAL_B,
        "mtn_pass": MTN_PASS_B,
        "spr_inter": SPR_INTER_B,
        "sprint_allround_mu": "stage_flat_mu",
    },
    "C": {
        "name": "unified + split",
        "stage_shared": lambda st: SHARED_C[st],
        "mtn_final": MTN_FINAL_C,
        "mtn_pass": MTN_PASS_C,
        "spr_inter": SPR_INTER_C,
        "sprint_allround_mu": "stage_flat_mu",
    },
}


GT_RANK_DECAY = {1: 50, 2: 35, 3: 25, 4: 15, 5: 10, 6: 4, 7: 2, 8: 1, 9: 0.5, 10: 0.2}
MINI_RANK_DECAY = {1: 40, 2: 25, 3: 15, 4: 5, 5: 2, 6: 1, 7: 0.5}


# ── Data loading ────────────────────────────────────────────────────

def _merge_split_glicko(df: pd.DataFrame, ratings_df: pd.DataFrame) -> pd.DataFrame:
    """Merge type-split Glicko ratings into feature DataFrame using pre-race lookup."""
    split_cols = []
    for st in GLICKO_STAGE_TYPES:
        split_cols.extend([f"stage_{st}_mu", f"stage_{st}_rd"])

    glicko_data = []
    ratings_df = ratings_df.sort_values("race_date")

    for rider_id in df["rider_id"].unique():
        rider_ratings = ratings_df[ratings_df["rider_id"] == rider_id]

        # For each race this rider appears in, find rating from before that race
        rider_rows = df[df["rider_id"] == rider_id]
        for _, row in rider_rows.iterrows():
            race_date = pd.Timestamp(row["race_date"]) if "race_date" in row.index else None
            entry = {"rider_id": rider_id, "race_slug": row["race_slug"], "year": row["year"]}

            if race_date is not None:
                prior = rider_ratings[rider_ratings["race_date"] < race_date]
            else:
                prior = pd.DataFrame()

            if len(prior) > 0:
                latest = prior.iloc[-1]
                for col in split_cols:
                    entry[col] = latest[col] if col in latest.index else 1500.0
            else:
                for col in split_cols:
                    entry[col] = 1500.0 if "mu" in col else 350.0

            glicko_data.append(entry)

    glicko_df = pd.DataFrame(glicko_data)

    # Drop existing split columns if present
    existing = [c for c in split_cols if c in df.columns]
    if existing:
        df = df.drop(columns=existing)

    return df.merge(glicko_df, on=["rider_id", "race_slug", "year"], how="left")


def _load_all_data(ratings_df: pd.DataFrame):
    """Load cache + stage features + stage targets + merge split Glicko."""
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

    fill_cols = [c for c in df.columns if any(
        c.startswith(p) for p in ["flat_", "hilly_", "mountain_", "itt_",
                                   "n_flat", "n_hilly", "n_mountain", "n_itt",
                                   "scoreable_"]
    )]
    df[fill_cols] = df[fill_cols].fillna(0)

    df["scoreable_mtn_final"] = (df["actual_mountain_final_pts"] > 0).astype(int)
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

    # Merge split Glicko ratings
    print("  Merging split Glicko ratings...")
    df = _merge_split_glicko(df, ratings_df)

    # Fill defaults for split Glicko
    for st in GLICKO_STAGE_TYPES:
        df[f"stage_{st}_mu"] = df[f"stage_{st}_mu"].fillna(1500.0)
        df[f"stage_{st}_rd"] = df[f"stage_{st}_rd"].fillna(350.0)

    # Completion rates
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

    prices_df = pd.read_sql(
        "SELECT rider_id, race_slug, year, price_hillios FROM rider_prices", conn
    )

    # Sprint pedigree per year
    pedigree_by_year = {}
    for test_yr in [2023, 2024, 2025]:
        cur.execute("""
            SELECT rider_id,
                   SUM(CASE WHEN race_type = 'grand_tour' THEN 3 ELSE 1 END) as score
            FROM race_results
            WHERE category = 'sprint' AND position > 0 AND race_date IS NOT NULL
              AND EXTRACT(YEAR FROM race_date) >= %s
              AND EXTRACT(YEAR FROM race_date) < %s
              AND ((race_type = 'grand_tour' AND position <= 5)
                   OR (race_type = 'mini_tour' AND position <= 3))
            GROUP BY rider_id
        """, (test_yr - 2, test_yr))
        pedigree_by_year[test_yr] = {str(row[0]): float(row[1]) for row in cur.fetchall()}
    cur.close()
    conn.close()

    result = df[df["year"] >= 2022].copy()
    return result, comp_df, prices_df, supply_hist, pedigree_by_year


# ── Benchmark engine ────────────────────────────────────────────────

def _stage_feats(stage_type: str, config: dict) -> list[str]:
    shared = config["stage_shared"](stage_type)
    raw = [f.format(t=stage_type) for f in STAGE_RAW]
    strength = [f.format(t=stage_type) for f in STAGE_STRENGTH]
    return shared + raw + strength + PROFILE


def _green_contender_score(df, completion_rates, mu_col, sprint_pedigree=None):
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
        + df.get(mu_col, 0).fillna(0) * 0.005
    )
    flat_pct = df.get("target_flat_pct", 0).fillna(0.4).clip(0.2, 0.8)
    score = flat_pct * sprinter + (1 - flat_pct) * allround
    survival = df["rider_id"].map(completion_rates).fillna(0.5)
    score = score * (0.3 + 0.7 * survival)

    if sprint_pedigree:
        ped_score = df["rider_id"].map(sprint_pedigree).fillna(0)
        ped_mult = (1.0 + 0.1 * ped_score).clip(upper=2.0)
        score = score * ped_mult

    return score


def _soft_rank_pts(scores, race_type):
    decay = GT_RANK_DECAY if race_type == "grand_tour" else MINI_RANK_DECAY
    ranks = scores.rank(ascending=False, method="min").astype(int)
    return ranks.map(decay).fillna(0.0)


def _run_config(
    config_name: str,
    config: dict,
    df: pd.DataFrame,
    comp_df: pd.DataFrame,
    prices_df: pd.DataFrame,
    supply_history,
    pedigree_by_year: dict,
) -> pd.DataFrame:
    """Run the full source-by-source benchmark for one configuration."""
    all_race_results = []

    for fold_num, fold in FOLDS.items():
        train = df[df["year"] <= fold["train_end"]].copy()
        test = df[df["year"] == fold["test_year"]].copy()
        if len(test) == 0:
            continue

        # ── GC SOURCE (identical across configs — control) ──────────
        gc_avail = [f for f in GC_GATE_FEATS if f in df.columns]
        gc_target = (train["gc_final_position"].notna() & (train["gc_final_position"] <= 20)).astype(int)
        gc_gate = LogisticRegression(C=0.1, class_weight="balanced", max_iter=2000)
        gc_gate.fit(train[gc_avail].fillna(0), gc_target)

        gc_prob = gc_gate.predict_proba(test[gc_avail].fillna(0))[:, 1]
        gc_mu_vals = test["gc_mu"].fillna(1500).values
        gc_rd_vals = test.get("gc_rd", pd.Series(200, index=test.index)).fillna(200).values
        conservative_mu = gc_mu_vals - 1.0 * gc_rd_vals
        form = test.get("recent_gc_form_score", pd.Series(0, index=test.index)).fillna(0).values
        gc_score = conservative_mu + np.minimum(form * 10, 100)

        test["pred_gc_pts"] = 0.0
        test["pred_gc_daily_pts"] = 0.0

        for (slug, yr), race_df in test.groupby(["race_slug", "year"]):
            race_type = race_df["race_type"].iloc[0]
            n_stages = race_df["target_stage_count"].iloc[0] if "target_stage_count" in race_df.columns else 0
            if n_stages == 0:
                n_stages = 21 if race_type == "grand_tour" else 7

            gc_table = GC_GRAND_TOUR if race_type == "grand_tour" else GC_MINI_TOUR
            max_pos = max(gc_table.keys())

            mask = gc_prob[race_df.index - test.index[0]] >= 0.40 if len(race_df) > 0 else pd.Series(dtype=bool)
            contender_idx = race_df.index[gc_prob[race_df.index.get_indexer(race_df.index)] >= 0.40]

            # Simpler approach: filter from test directly
            race_gc_prob = pd.Series(gc_prob, index=test.index).loc[race_df.index]
            race_gc_score = pd.Series(gc_score, index=test.index).loc[race_df.index]
            contenders = race_df[race_gc_prob >= 0.40].copy()
            contenders["_gc_score"] = race_gc_score[race_gc_prob >= 0.40]

            if len(contenders) > 0:
                last_table_pts = gc_table.get(max_pos, 0)
                contenders = contenders.sort_values("_gc_score", ascending=False)
                for pos_rank, (ridx, _row) in enumerate(contenders.iterrows(), 1):
                    if pos_rank <= max_pos:
                        test.loc[ridx, "pred_gc_pts"] = gc_table.get(pos_rank, 0)
                        test.loc[ridx, "pred_gc_daily_pts"] = estimate_gc_daily_pts(
                            pos_rank, n_stages, race_type
                        )
                    else:
                        beyond = pos_rank - max_pos
                        test.loc[ridx, "pred_gc_pts"] = last_table_pts * (0.5 ** beyond)
                        test.loc[ridx, "pred_gc_daily_pts"] = estimate_gc_daily_pts(
                            max_pos, n_stages, race_type
                        ) * (0.5 ** beyond)

        # ── STAGE SOURCE (config-dependent features) ────────────────
        for st in STAGE_TYPES:
            test[f"pred_{st}_stage"] = 0.0
            feats = _stage_feats(st, config)
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

        # ── MOUNTAIN (config-dependent features) ────────────────────
        avail_mf = [f for f in config["mtn_final"] if f in df.columns]
        gate_mf = LogisticRegression(C=0.1, class_weight="balanced", max_iter=2000)
        gate_mf.fit(train[avail_mf].fillna(0), train["scoreable_mtn_final"].values)
        prob_mf = gate_mf.predict_proba(test[avail_mf].fillna(0))[:, 1]
        avg_mf = test["race_type"].map({"grand_tour": _GT_FINAL_AVG, "mini_tour": _MINI_FINAL_AVG})
        test["pred_mtn_final"] = prob_mf * avg_mf

        has_supply = train[train["target_mtn_pass_supply"] > 0]
        avail_mp = [f for f in config["mtn_pass"] if f in df.columns]
        reg_mp = Ridge(alpha=1.0)
        reg_mp.fit(has_supply[avail_mp].fillna(0),
                    np.sqrt(has_supply["mtn_pass_capture_target"].values))

        test["pred_mtn_pass"] = 0.0
        has_est = test[test["estimated_mtn_supply"] > 0]
        if len(has_est) > 0:
            pred_cap = np.maximum(np.square(reg_mp.predict(has_est[avail_mp].fillna(0))), 0)
            test.loc[has_est.index, "pred_mtn_pass"] = pred_cap * has_est["estimated_mtn_supply"]

        # ── SPRINT (config-dependent mu column) ─────────────────────
        completion_rates = {}
        for rid in test["rider_id"].unique():
            hist = comp_df[
                (comp_df["rider_id"] == rid) &
                (comp_df["year"] < fold["test_year"])
            ]
            completion_rates[rid] = hist["finished"].mean() if len(hist) > 0 else 0.5

        sprint_pedigree = pedigree_by_year.get(fold["test_year"], {})
        mu_col = config["sprint_allround_mu"]

        green_score = _green_contender_score(test, completion_rates, mu_col, sprint_pedigree)
        test["pred_spr_final"] = 0.0
        test["pred_spr_inter"] = 0.0
        for (slug, yr), idx in test.groupby(["race_slug", "year"]).groups.items():
            rt = test.loc[idx[0], "race_type"]
            test.loc[idx, "pred_spr_final"] = _soft_rank_pts(green_score.loc[idx], rt)

            scores = np.maximum(green_score.loc[idx].values, 0)
            concentrated = np.power(scores, 2.0)
            est_supply = test.loc[idx[0]].get("estimated_spr_supply", 0) if "estimated_spr_supply" in test.columns else 0
            if concentrated.sum() > 0 and est_supply > 0:
                test.loc[idx, "pred_spr_inter"] = concentrated / concentrated.sum() * est_supply

        # ── AGGREGATE + CALIBRATE ───────────────────────────────────
        test["pred_gc_source"] = test["pred_gc_pts"] + test["pred_gc_daily_pts"]
        test["pred_mountain_raw"] = test["pred_mtn_final"] + test["pred_mtn_pass"]
        test["pred_sprint_raw"] = test["pred_spr_final"] + test["pred_spr_inter"]

        test["pred_stage_cal"] = 0.0
        test["pred_mountain_source"] = 0.0
        test["pred_sprint_source"] = 0.0

        for (slug, yr), idx in test.groupby(["race_slug", "year"]).groups.items():
            race_type = test.loc[idx[0], "race_type"]
            n_stages = test.loc[idx[0], "target_stage_count"] if "target_stage_count" in test.columns else 0
            if n_stages == 0:
                n_stages = 21 if race_type == "grand_tour" else 7

            supplies = _compute_race_supply(race_type, int(n_stages), slug, yr, supply_history)

            stage_raw = test.loc[idx, "pred_stage_total"].values.copy()
            test.loc[idx, "pred_stage_cal"] = _scale_to_supply(stage_raw, supplies["stage"])

            mtn_raw = test.loc[idx, "pred_mountain_raw"].values.copy()
            mtn_cal = _sharpen(mtn_raw, power=2.0, zero_percentile=60)
            mtn_cal = _scale_to_supply(mtn_cal, supplies["mountain"])
            test.loc[idx, "pred_mountain_source"] = mtn_cal

            spr_raw = test.loc[idx, "pred_sprint_raw"].values.copy()
            spr_cal = _scale_to_supply(spr_raw, supplies["sprint"])
            test.loc[idx, "pred_sprint_source"] = spr_cal

        test["pred_total"] = (
            test["pred_gc_source"]
            + test["pred_stage_cal"]
            + test["pred_mountain_source"]
            + test["pred_sprint_source"]
        )

        test["actual_gc_source"] = test["actual_gc_pts"].fillna(0)
        test["actual_mountain_source"] = (
            test["actual_mountain_final_pts"].fillna(0) + test["actual_mountain_pass_pts"].fillna(0)
        )
        test["actual_sprint_source"] = (
            test["actual_sprint_final_pts"].fillna(0) + test["actual_sprint_inter_pts"].fillna(0)
        )

        # ── EVALUATE PER RACE ───────────────────────────────────────
        for (slug, yr), race_df in test.groupby(["race_slug", "year"]):
            if len(race_df) < 3:
                continue
            race_type = race_df["race_type"].iloc[0]
            result = {
                "race_slug": slug, "year": yr, "race_type": race_type,
                "n_riders": len(race_df), "fold": fold_num,
            }
            for src, pred_col, actual_col in [
                ("gc", "pred_gc_source", "actual_gc_source"),
                ("stage", "pred_stage_cal", "actual_stage_pts_typed"),
                ("mountain", "pred_mountain_source", "actual_mountain_source"),
                ("sprint", "pred_sprint_source", "actual_sprint_source"),
                ("total", "pred_total", "actual_pts"),
            ]:
                p = race_df[pred_col].values
                a = race_df[actual_col].values if actual_col in race_df.columns else np.zeros(len(race_df))
                rho, _ = stats.spearmanr(p, a)
                result[f"rho_{src}"] = rho if not np.isnan(rho) else np.nan

            pred_total = race_df["pred_total"].values
            actual_total = race_df["actual_pts"].values
            result["ndcg_20"] = ndcg_at_k(pred_total, actual_total, 20)
            result["p_at_15"] = precision_at_k(pred_total, actual_total, 15)

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
                        result["has_prices"] = True
                    else:
                        result["has_prices"] = False
                else:
                    result["has_prices"] = False
            else:
                result["has_prices"] = False

            all_race_results.append(result)

    return pd.DataFrame(all_race_results)


# ── Main ────────────────────────────────────────────────────────────

def run_benchmark():
    print("=" * 70)
    print("GLICKO SPLIT A/B BENCHMARK")
    print("=" * 70)

    # Step 1: Compute split Glicko ratings in-memory
    print("\n[1/3] Computing Glicko-2 ratings (unified + 4-track split)...")
    results_df, _ = load_data_fast(DB_URL)
    ratings_df = compute_all_ratings(results_df)

    # Step 2: Load all features and merge split ratings
    print("\n[2/3] Loading features and merging split Glicko...")
    df, comp_df, prices_df, supply_history, pedigree_by_year = _load_all_data(ratings_df)
    print(f"  Dataset: {len(df):,} rows")

    # Step 3: Run each configuration
    print("\n[3/3] Running benchmark for 3 configurations...")
    config_results = {}
    for cfg_name, cfg in CONFIGS.items():
        print(f"\n  Config {cfg_name}: {cfg['name']}...")
        config_results[cfg_name] = _run_config(
            cfg_name, cfg, df, comp_df, prices_df, supply_history, pedigree_by_year,
        )

    # ── Print comparison ────────────────────────────────────────────
    print("\n" + "=" * 70)
    print("RESULTS — Side-by-side comparison")
    print("=" * 70)

    header = f"{'Metric':>25s}"
    for cfg_name in CONFIGS:
        header += f"  {cfg_name}: {CONFIGS[cfg_name]['name']:>18s}"
    print(header)
    print("-" * len(header))

    for rt in ["grand_tour", "mini_tour"]:
        print(f"\n  {rt}:")
        for src in ["gc", "stage", "mountain", "sprint", "total"]:
            col = f"rho_{src}"
            line = f"    {'ρ_' + src:>23s}"
            for cfg_name in CONFIGS:
                sub = config_results[cfg_name]
                vals = sub[sub["race_type"] == rt][col].dropna()
                line += f"  {vals.mean():>25.3f}" if len(vals) > 0 else f"  {'N/A':>25s}"
            print(line)

        for metric, col in [("NDCG@20", "ndcg_20"), ("P@15", "p_at_15")]:
            line = f"    {metric:>23s}"
            for cfg_name in CONFIGS:
                sub = config_results[cfg_name]
                vals = sub[sub["race_type"] == rt][col].dropna()
                line += f"  {vals.mean():>25.3f}" if len(vals) > 0 else f"  {'N/A':>25s}"
            print(line)

        line = f"    {'Team capture':>23s}"
        for cfg_name in CONFIGS:
            sub = config_results[cfg_name]
            priced = sub[(sub["race_type"] == rt) & (sub["has_prices"] == True)]
            if len(priced) > 0:
                line += f"  {priced['team_capture'].mean():>24.1%}"
            else:
                line += f"  {'N/A':>25s}"
        print(line)

    # ── GC control check ────────────────────────────────────────────
    print("\n" + "-" * 70)
    print("CONTROL CHECK — GC source (should be identical across configs):")
    for rt in ["grand_tour", "mini_tour"]:
        vals = []
        for cfg_name in CONFIGS:
            sub = config_results[cfg_name]
            v = sub[sub["race_type"] == rt]["rho_gc"].dropna().mean()
            vals.append(v)
        spread = max(vals) - min(vals) if vals else 0
        status = "OK" if spread < 0.001 else "DRIFT!"
        print(f"  {rt}: spread={spread:.4f} [{status}]")

    # ── Delta summary ───────────────────────────────────────────────
    print("\n" + "=" * 70)
    print("DELTA: Config B (split) vs Config A (baseline)")
    print("=" * 70)

    for rt in ["grand_tour", "mini_tour"]:
        print(f"\n  {rt}:")
        for src in ["stage", "mountain", "sprint", "total"]:
            col = f"rho_{src}"
            a_vals = config_results["A"][config_results["A"]["race_type"] == rt][col].dropna()
            b_vals = config_results["B"][config_results["B"]["race_type"] == rt][col].dropna()
            if len(a_vals) > 0 and len(b_vals) > 0:
                delta = b_vals.mean() - a_vals.mean()
                sign = "+" if delta > 0 else ""
                print(f"    ρ_{src:>8s}: {sign}{delta:.3f}")

        a_priced = config_results["A"][(config_results["A"]["race_type"] == rt) & (config_results["A"]["has_prices"] == True)]
        b_priced = config_results["B"][(config_results["B"]["race_type"] == rt) & (config_results["B"]["has_prices"] == True)]
        if len(a_priced) > 0 and len(b_priced) > 0:
            delta_tc = b_priced["team_capture"].mean() - a_priced["team_capture"].mean()
            sign = "+" if delta_tc > 0 else ""
            print(f"    {'Team capture':>12s}: {sign}{delta_tc:.1%}")


if __name__ == "__main__":
    run_benchmark()
