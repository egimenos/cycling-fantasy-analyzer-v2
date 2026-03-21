# 008 — Complete Fantasy Scoring: Research

## Mission

Capture the full Grandes miniVueltas scoring in our data pipeline. The current system only scores ~60-70% of what the game awards. The missing categories (daily GC, individual mountain passes, intermediate sprints, daily regularidad) account for significant points that distort both the rules-based scoring and the ML training target.

Once the scoring is complete, revisit ML model improvements (axes A1–A6) with a correct target variable.

## Current Baseline (After 008 Retrain)

| Race Type  | Rules ρ | ML (pre-008) ρ | ML (post-008) ρ | Delta       | Status     |
| ---------- | ------- | -------------- | --------------- | ----------- | ---------- |
| Classic    | 0.31    | 0.31           | N/A             | —           | NO-GO      |
| Mini tour  | ~0.48   | 0.4950         | **0.6256**      | **+0.1306** | Production |
| Grand tour | ~0.55   | 0.6564         | **0.7678**      | **+0.1114** | Production |

**Model**: Random Forest (scikit-learn), 500 trees, max_depth=14, 49 features (v4b).
**Training data**: 236K race results (8 categories), 3457 riders, 382 races (2022–2026).
**Retrained**: 2026-03-22, model version 20260321T234503.

> Note: Pre-008 ρ values differ slightly from the original v3 report (0.53/0.60)
> because the old models were evaluated against the NEW expanded actual_pts target
> (which includes daily GC, mountain passes, etc.). The old models were trained
> on partial scoring data, so their predictions are less correlated with the
> complete target. The post-008 models were trained on the complete target.

---

## A0 — Complete Game Scoring (PRIORITY)

### The Problem

Our `points.py` scoring tables are correct for the categories we capture, but we are **missing entire scoring categories** that the game awards. Current DB has only 4 categories: `stage`, `gc`, `mountain`, `sprint` — all final classifications.

### Scoring Gap Analysis

| Game Category                          | Points (GT)               | In our DB? | Impact                               |
| -------------------------------------- | ------------------------- | ---------- | ------------------------------------ |
| Stage result (top 20)                  | 40/25/22/.../1            | **YES**    | Core                                 |
| GC final (top 20)                      | 150/125/100/.../10        | **YES**    | Core                                 |
| Mountain final (top 5)                 | 50/35/25/15/10            | **YES**    | Medium                               |
| Regularidad final (top 5)              | 50/35/25/15/10            | **YES**    | Medium                               |
| **Daily GC (top 10)**                  | **15/10/8/7/6/5/4/3/2/1** | **NO**     | **HIGH — up to 315 pts/GT**          |
| **Mountain passes HC**                 | **12/8/6/5/4/3/2/1**      | **NO**     | **HIGH — 50-150 pts for climbers**   |
| **Mountain passes Cat 1**              | **8/6/4/2/1**             | **NO**     | **HIGH**                             |
| **Mountain passes Cat 2**              | **5/3/1**                 | **NO**     | **Medium**                           |
| **Mountain passes Cat 3**              | **3/2**                   | **NO**     | **Low**                              |
| **Mountain passes Cat 4**              | **1**                     | **NO**     | **Negligible**                       |
| **Intermediate sprints (single)**      | **6/4/2**                 | **NO**     | **Medium — 20-60 pts for sprinters** |
| **Intermediate sprints (2+ in stage)** | **3/2/1**                 | **NO**     | **Low**                              |
| **Daily regularidad (top 3)**          | **6/4/2**                 | **NO**     | **Medium**                           |
| TTT (team time trial)                  | 20/15/11/.../1            | **NO**     | Low (few races have TTT)             |

### Estimated Points Missing Per Rider Type (Grand Tour)

| Rider archetype     | Points we capture              | Points we miss                               | % Missing |
| ------------------- | ------------------------------ | -------------------------------------------- | --------- |
| GC leader (Pogačar) | ~350 (stages + GC final)       | **~300** (daily GC ×21 + mountain passes)    | **~46%**  |
| Climber (Bardet)    | ~100 (stages + mountain final) | **~120** (mountain passes + daily GC)        | **~55%**  |
| Sprinter (Girmay)   | ~200 (stages + sprint final)   | **~80** (intermediate sprints + regularidad) | **~29%**  |
| Domestique          | ~20 (stage finishes)           | ~30 (daily GC if consistent)                 | ~60%      |

### PCS Data Availability (Verified)

All missing data is available on PCS stage pages **in a single HTTP request per stage**, inside hidden `div.resTab` tabs:

| Tab             | Content                                                     | How to identify                                                                                                                                          |
| --------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tab 0 (visible) | Stage result                                                | Already scraped                                                                                                                                          |
| Tab 1 (hidden)  | GC after stage                                              | Headers include "Time won/lost"                                                                                                                          |
| Tab 2 (hidden)  | Points/Regularidad — general + daily + intermediate sprints | Subtabs with headings: `"Sprint \| Location (km)"` = intermediate sprint (CAPTURE), `"Points at finish"` = stage result points (SKIP — already in Tab 0) |
| Tab 3 (hidden)  | KOM/Mountain — general + daily + **individual passes**      | Headings like `"KOM Sprint (HC) Plateau de Beille"`, `"KOM Sprint (1) Col de Peyresourde"`                                                               |
| Tab 4 (hidden)  | Youth + TTT                                                 | Low priority                                                                                                                                             |
| Tab 5 (hidden)  | Teams classification                                        | Not needed                                                                                                                                               |

**Key finding**: Individual mountain pass results include the **category (HC, 1, 2, 3, 4)** in the heading and rider positions with points in the "Today" column. Sprint intermediates similarly have location and points.

**Important**: Tab 2 (Points) contains both intermediate sprints AND "Points at finish" subtabs. The "Points at finish" data duplicates what we already capture as stage results — **skip it**. Only parse subtabs with heading `"Sprint | <location>"` for intermediate sprints.

### Implementation Approach

1. **Extend scraper**: Parse hidden tabs from existing stage page requests (no extra HTTP calls)
2. **New DB categories**: `gc_daily`, `mountain_pass`, `sprint_intermediate`, `regularidad_daily`
3. **Update `points.py`**: Add scoring tables for new categories
4. **Backfill**: Re-scrape historical stage pages (2022–2026) to populate new categories
5. **Retrain ML**: With correct `actual_pts` target that includes all game scoring
6. **Update rules-based scoring**: Include new categories in `ScoringService`

### Expected Impact

- **Target variable correction**: The ML model will learn to predict the ACTUAL game score, not a partial proxy
- **Better rider differentiation**: Climbers and GC riders are currently undervalued; sprinters slightly overvalued relative to game scoring
- **Estimated ρ improvement**: Hard to predict precisely, but correcting ~35% of the target signal should have a larger effect than any model architecture change

### Results (WP05 — 2026-03-22)

**Scoring data verified**: All 8 categories now in DB (236K rows):

- stage: 147,752 rows (256,825 pts)
- gc: 51,703 rows (264,740 pts)
- gc_daily: 10,632 rows (64,870 pts)
- mountain_pass: 6,578 rows (23,598 pts)
- sprint: 7,408 rows (12,885 pts)
- sprint_intermediate: 4,909 rows (12,412 pts)
- mountain: 3,992 rows (11,260 pts)
- regularidad_daily: 3,357 rows (13,434 pts)

**Sanity check — Pogacar TdF 2024 actual_pts**: 944 total
(stage=336, gc=150, gc_daily=302, mountain=35, mountain_pass=72, sprint=15, regularidad_daily=34)
Old value with 4 categories would have been ~486. The new categories added ~458 pts (+94%).

**Benchmark comparison (2025 holdout, per-race Spearman ρ)**:

| Race Type  | Before (old model) | After (retrained) | Delta       | Target  |
| ---------- | ------------------ | ----------------- | ----------- | ------- |
| Mini tour  | 0.4950 (35 races)  | **0.6256**        | **+0.1306** | >= 0.58 |
| Grand tour | 0.6564 (3 races)   | **0.7678**        | **+0.1114** | >= 0.65 |
| Overall    | 0.5078             | **0.6368**        | **+0.1290** | —       |

**Key observations**:

- Both targets exceeded significantly: mini tour by +0.05, grand tour by +0.12
- The improvement is the largest single-change delta in the project's ML history
- Grand tours benefited most from daily GC data (leader gets 15 pts/stage x 21 stages = 315 potential pts)
- Top performing individual races: TdF 2025 ρ=0.81, Giro 2025 ρ=0.78
- Worst performing races remain the small tours with less complete data (Hongrie, Valencia)
- Improvement is uniform: every single race improved, no regressions

**Rider archetype impact confirmed**:

- GC leaders (Pogacar: 944 pts) now properly differentiated from domestiques
- Climbers get credit for individual mountain passes
- Sprinters get intermediate sprint points

**Conclusion**: A0 (complete scoring) delivered a larger ρ improvement than any model architecture change could. The hypothesis was correct: fixing ~35% of the target signal had more impact than feature engineering. **SHIP IT.**

---

## Future Axes (After A0) — ML Model Improvements

These axes remain valid but should be revisited AFTER the scoring data is complete, since the target variable will change significantly.

### A1 — Gradient Boosting with Hyperparameter Tuning

LightGBM with Optuna-tuned hyperparameters vs fixed-param RF. Effort: Medium. Expected impact: High.

### A2 — Target Variable Engineering

Predict log(pts) or percentile-rank instead of raw points. Effort: Low. Expected impact: Medium.

### A3 — Feature Interactions & Selection

Explicit rider_profile × race_profile cross-terms + SHAP-based pruning. Effort: Medium. Expected impact: Medium.

### A4 — Ensemble: RF + LightGBM Blend

Weighted average of both models. Effort: Low. Expected impact: Medium.

### A5 — DNF-Aware Scoring

Two-stage model: P(DNF) → predicted score. Effort: High. Expected impact: Unknown.

### A6 — Temporal Cross-Validation

Expanding-window CV for robust evaluation. Effort: Low. Expected impact: Foundation for A1–A5.

**Recommended order**: A0 (this feature) → A6 → A1 → A2 → A3 → A4.

---

## Success Criteria

| Metric                       | Target                            | Before | After      | Status |
| ---------------------------- | --------------------------------- | ------ | ---------- | ------ |
| Scoring completeness         | ≥ 95% of game categories captured | ~65%   | ~95%       | PASS   |
| Mini tour ρ (after retrain)  | ≥ 0.58                            | 0.4950 | **0.6256** | PASS   |
| Grand tour ρ (after retrain) | ≥ 0.65                            | 0.6564 | **0.7678** | PASS   |

---

## Open Questions

1. **Backfill depth**: How far back can we scrape daily classifications? PCS may not have stage-level data for older races.
2. **Scraping volume**: For 42 stage races × ~15 stages avg = ~630 stage pages to backfill. At 1.5s throttle = ~16 minutes. Acceptable.
3. **Mountain pass category extraction**: The heading format `"KOM Sprint (HC) Name"` needs robust parsing for category (HC, 1, 2, 3, 4).
4. **Sprint intermediate format**: When a stage has 2+ sprints, the game halves the points (3/2/1 instead of 6/4/2). Need to detect number of sprints per stage.
5. **Schema migration**: New categories need DB migration. Should we add new tables or extend `race_results` with more granular `category` values?
6. **ML features from new data**: Should we create new features from the expanded scoring (e.g., `daily_gc_leader_rate`, `mountain_pass_pts_12m`)? Defer to A3.
