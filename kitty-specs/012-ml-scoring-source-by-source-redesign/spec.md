# ML Scoring Source-by-Source Redesign

## Problem Statement

The current ML model predicts total fantasy points via regression. After extensive research (feature 011), this approach has a fundamental ceiling:

1. **Regression to mean**: sub-models predict 70-130 pts for all riders when real range is 0-700+
2. **Classic/mini-tour contamination**: riders with good minor results (Skjelmose, Ciccone) get GC predictions comparable to Tour winners (Pogačar, Vingegaard)
3. **Glicko-2 miscalibration**: prestige multipliers are too compressed (GT/Pro ratio = 2.1x, should be ~5x per UCI points)
4. **Feature mixing**: 56+ features across all categories dilute signal — the model picks up "looks like a good rider" instead of "will score in THIS category"

The product goal is to select a 9-rider fantasy team under a 2000 hillio budget for grandesminivueltas.com. Prediction accuracy per scoring category directly impacts team selection quality.

## Goal

Redesign the prediction pipeline to predict **positions** (learnable) and convert to **fantasy points** (known) via deterministic scoring tables. Each scoring source gets its own model with curated features.

This is a research/benchmark feature. Production integration will be a separate feature once results are validated.

## Scoring Sources (from the fantasy game)

The fantasy game awards points across 8 categories. We group them into 5 scoring sources:

| Scoring Source | Categories                                       | Mechanism                                         | Points Range (GT) |
| -------------- | ------------------------------------------------ | ------------------------------------------------- | ----------------- |
| **GC**         | gc + gc_daily                                    | Final classification position + daily standings   | 0-450+            |
| **Stage**      | stage                                            | Individual stage results (wins, top-10s)          | 0-350             |
| **Mountain**   | mountain + mountain_pass                         | Final mountain classification + per-pass results  | 0-150             |
| **Sprint**     | sprint + sprint_intermediate + regularidad_daily | Final sprint classification + daily intermediates | 0-200             |
| **Total**      | Sum of above                                     |                                                   | 0-950             |

## Prediction-to-Points Mapping

Each scoring source follows the same principle: the model predicts something **learnable** (positions, counts, rates), and a deterministic conversion translates that prediction into fantasy points using the known scoring tables from `ml/src/points.py`.

### GC (gc + gc_daily combined)

| Step                   | What                                       | Detail                                                                                                |
| ---------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| **Model output**       | Predicted GC final position (1-20+)        | Binary gate (top-20 y/n) → position regressor for top-20 riders                                       |
| **gc points**          | `GC_GRAND_TOUR[pos]` lookup                | 150, 125, 100, 80, 60, 50, 45, 40, 35, 30, 28...10. Pos 21+ = 0                                       |
| **gc_daily points**    | Heuristic: `pts_per_stage[pos] × n_stages` | Empirical averages per position (pos 1 = 12.0/stage, pos 2 = 8.0, ...). See `estimate_gc_daily_pts()` |
| **Total GC pts**       | gc + gc_daily                              | Single combined prediction per rider                                                                  |
| **Race inputs needed** | `race_type`, `n_stages`                    | Mini tour uses `GC_MINI_TOUR` table and `_GC_DAILY_PTS_PER_STAGE_MINI`                                |

gc_daily is NOT a separate model — it derives from the same predicted GC position. The heuristic is an approximation; a future refinement could incorporate `target_mountain_pct` to adjust the effective number of GC-discriminating stages.

### Stage

| Step                   | What                                                                   | Detail                                                                                                                                                                               |
| ---------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Model output**       | Predicted count of top-10 stage finishes                               | Count regression (continuous, e.g. 3.2)                                                                                                                                              |
| **Conversion**         | Linear approximation: `stage_pts ≈ 22 × count + 3`                     | Empirically derived from historical data. Average pts per top-10 finish ≈ 22 (weighted towards higher finishes since riders who score multiple top-10s tend to include wins/podiums) |
| **Race inputs needed** | `target_flat_pct`, `target_mountain_pct`, `target_itt_pct`, `n_stages` | Race profile affects which rider archetypes score                                                                                                                                    |

Note: the `STAGE_POINTS` table (pos 1=40 down to pos 20=1) exists but is not used directly — predicting individual stage positions across 21 stages is impractical. The count model is a practical simplification.

### Mountain (mountain_final + mountain_pass)

**Mountain final classification:**

| Step                   | What                                                          | Detail                                                       |
| ---------------------- | ------------------------------------------------------------- | ------------------------------------------------------------ |
| **Model output**       | Classification position bucket (1st / 2nd-3rd / 4th-5th / 6+) | Ordinal classifier, same gate pattern as GC                  |
| **Conversion**         | `FINAL_CLASS_GT[pos]` lookup                                  | 50, 35, 25, 15, 10. Pos 6+ = 0                               |
| **Race inputs needed** | `race_type`                                                   | Mini tour: `FINAL_CLASS_MINI` (40, 25, 15), only top-3 score |

**Mountain pass (per-climb points):**

| Step                   | What                                                               | Detail                                                                                          |
| ---------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| **Model output**       | Capture rate: predicted fraction of available mountain pass points | Regression (0.0 - 1.0)                                                                          |
| **Supply calculation** | Total pts available = Σ (pts per climb category × n_climbs)        | HC: max 41 pts/climb, Cat1: 21, Cat2: 9, Cat3: 5, Cat4: 1. Summed across all climbs in the race |
| **Conversion**         | `mountain_pass_pts = capture_rate × total_supply`                  |                                                                                                 |
| **Race inputs needed** | Climb inventory: count of HC, Cat1, Cat2, Cat3, Cat4 climbs        | Must be known or estimated from race profile before prediction                                  |

### Sprint (sprint_final + sprint_intermediate + regularidad_daily)

**Sprint final classification:**

| Step                   | What                                                    | Detail                        |
| ---------------------- | ------------------------------------------------------- | ----------------------------- |
| **Model output**       | Classification position bucket (same as mountain final) | Ordinal classifier            |
| **Conversion**         | `FINAL_CLASS_GT[pos]` / `FINAL_CLASS_MINI[pos]`         | Same tables as mountain final |
| **Race inputs needed** | `race_type`                                             |                               |

**Sprint intermediate + regularidad_daily (combined):**

| Step                   | What                                                                                                         | Detail                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------- |
| **Model output**       | Capture rate: predicted fraction of available sprint/regularity points                                       | Regression (0.0 - 1.0) |
| **Supply calculation** | Sprint: 12 pts/stage (single) or 6 pts/stage (multi) × n_sprint_stages. Regularidad: 12 pts/stage × n_stages | Depends on race format |
| **Conversion**         | `sprint_inter_pts = capture_rate × total_supply`                                                             |                        |
| **Race inputs needed** | `n_intermediate_sprints` per stage (or total), `n_stages`                                                    |                        |

### Final Aggregation

```
predicted_total = gc_pts + gc_daily_pts + stage_pts + mountain_final_pts
                + mountain_pass_pts + sprint_final_pts + sprint_inter_pts
```

Each sub-prediction is independent. The total is a simple sum, not a learned combination. This ensures that errors in one source don't contaminate others and that each sub-model can be evaluated and improved independently.

### Race-Level Inputs Summary

Every prediction requires these race-level inputs, known before the race starts:

| Input                               | Source                                 | Used by                       |
| ----------------------------------- | -------------------------------------- | ----------------------------- |
| `race_type`                         | Race metadata (grand_tour / mini_tour) | All models                    |
| `n_stages`                          | Race calendar                          | GC daily, stage, sprint inter |
| `target_flat_pct`                   | Stage profile from PCS                 | Stage model                   |
| `target_mountain_pct`               | Stage profile from PCS                 | Stage model                   |
| `target_itt_pct`                    | Stage profile from PCS                 | Stage model                   |
| Climb inventory (HC, Cat1-4 counts) | Route data from PCS                    | Mountain pass supply          |
| `n_intermediate_sprints`            | Race format                            | Sprint inter supply           |

For training, these are derived from historical results. For prediction, they must be scraped or estimated from the upcoming race route.

## Research Phases

### Phase 1: Recalibrate Glicko-2

**Problem**: Current prestige multipliers (GT=1.5, UWT=1.0, Pro=0.7) don't reflect the real competitive hierarchy. Ganar Luxembourg (.Pro) gives almost as much rating as ganar the Tour (.UWT GT).

**Action**:

- Adjust multipliers to align with UCI points ratios: GT=3.0, UWT mini=1.0, Pro mini=0.5
- Recompute all ratings from scratch (touches `rider_ratings` table)
- Add `gc_mu_delta_12m` feature (rating trend over 12 months)
- Validate: Pogačar gc_mu should be significantly above Skjelmose (currently 2570 vs 2201, should be wider)

### Phase 2: GC Model (biggest scoring impact)

**Approach**: Hierarchical gate + position + scoring table lookup

- Binary gate: "will this rider finish top-20 GC?" (y/n)
- Position regressor: trained only on top-20 riders, predicts position 1-20
- Scoring table: deterministic lookup from `ml/src/points.py`
- GC daily: heuristic from predicted GC position × stage count

**Feature set (curated for GC only)**:

- `gc_mu` (dominant — relative GC strength from Glicko)
- `gc_mu_delta_12m` (trend — improving or declining)
- `same_race_best` (specific race history)
- `leader_gc_mu_gap` (team dynamics — gap between rider and team leader gc_mu. Large gap = rider will sacrifice)
- `age` (secondary complement, not dominant)
- `gc_pts_same_type` (GC points in same race type)

**NOT included in GC model**: stage_mu, micro-form (pts_30d), classic results, generic volume features, pct_of_team — these caused Skjelmose/Ciccone/VdP inflation in previous iterations.

**Scope**: GT-only first. Mini tours after GT is validated.

### Phase 3: Stage Model

**Approach**: Count model — predict expected number of top-10 stage finishes

- Target: `stage_top10_count` (0-13 range for GT)
- Empirically verified: ~22 pts per top-10 stage finish + 3 pts base
- More stochastic than GC (individual stage outcomes vary)

**Feature set (curated for stages)**:

- `stage_mu` (stage-specific Glicko rating)
- `stage_pts_per_stage_day_12m` (daily scoring rate)
- `target_flat_pct`, `target_mountain_pct`, `target_itt_pct` (race profile — affects which rider types score)
- Sprint/climbing ability features

### Phase 4: Secondary Categories

Lower priority — smaller point contributions. Tackle after GC + stage are validated.

- **Mountain/Sprint final**: gate + position + scoring table (same pattern as GC)
- **Mountain pass / Sprint intermediate**: capture rate model (predicted ratio × available supply)

## Key Infrastructure (from feature 011)

Already built and available:

- `ml/src/benchmark_canonical.py` — canonical runner with `--ordinal` flag, logbook
- `ml/src/logbook.py` — per-race, per-rider JSON artifacts
- `ml/src/points.py` — all scoring tables + bucket definitions + gc_daily heuristic
- `ml/cache/` — parquet cache with per-category targets, positions, stage counts, supply metrics
- `ml/src/features.py` — Phase B features (E01-E04), SR decontamination, split GC rates

## Success Criteria

1. **GT rho > 0.58** (current best single model: 0.57)
2. **GT Team Capture > 60%** (current best: 57%)
3. **GC sanity**: riders like VdP and Skjelmose outside predicted top-10 for GT GC
4. **Prediction magnitudes**: predicted total pts within 30% of actual for top-5 riders
5. **Per-source accuracy**: each sub-model evaluated independently, not just aggregate total
6. **Reproducible**: every experiment logged in logbook with full metadata

## Methodology

- Source-by-source: fix GC first, validate, then stage, then secondary
- Every change benchmarked with canonical runner + logbook
- Case study validation: TdF 2023 top-20 breakdown (docs-local tables)
- Compare against RF baseline (GT rho=0.554) and decomposed baseline (GT rho=0.584)

## Risks and Constraints

- **Small sample size for GT**: only ~12 GT winners in training data. Glicko recalibration should help but fundamental constraint remains.
- **GC daily variance**: daily GC positions change (breakaways, crashes). Deriving from final position is an approximation. May need a more nuanced model later.
- **Team dynamics hard to model**: leader_gc_mu_gap captures static hierarchy but not tactical decisions (team switching leaders mid-race).
- **Feature 011 code may need cleanup**: iterative research left multiple evaluation functions and feature sets. May need consolidation.

## Dependencies

- Feature 011 infrastructure (benchmark, logbook, cache)
- PostgreSQL database with rider_ratings, race_results, rider_prices tables
- Glicko-2 recompute requires full re-run of `ml/src/glicko2.py`

## Assumptions

- The fantasy scoring tables in `ml/src/points.py` are correct and up to date
- Historical race results from 2019-2025 are representative of future patterns
- Glicko-2 with corrected multipliers will provide sufficient signal for GC gate discrimination
- GT-first approach will transfer insights to mini tours
