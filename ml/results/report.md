# ML Scoring Feasibility — Results Report

**Date**: 2026-03-20
**Baseline**: ρ = 0.3833 (rules-based, 206 races)

## Model Comparison

| Model             | Mean ρ | Races | Classic | Mini Tour | Grand Tour |
| ----------------- | ------ | ----- | ------- | --------- | ---------- |
| Linear Regression | 0.3630 | 116   | 0.2964  | 0.4514    | 0.6007     |
| Random Forest     | 0.3662 | 116   | 0.2917  | 0.4681    | 0.5847     |
| XGBoost           | 0.3176 | 116   | 0.2571  | 0.3989    | 0.5173     |

## Feature Importance (XGBoost)

| Rank | Feature              | Importance |
| ---- | -------------------- | ---------- |
| 1    | win_rate             | 0.1652     |
| 2    | race_type_enc        | 0.1545     |
| 3    | top10_rate           | 0.0952     |
| 4    | best_race_pts_12m    | 0.0798     |
| 5    | pts_total_12m        | 0.0679     |
| 6    | pts_total_alltime    | 0.0591     |
| 7    | pts_sprint_12m       | 0.0585     |
| 8    | pts_stage_12m        | 0.0569     |
| 9    | pts_same_type_12m    | 0.0503     |
| 10   | days_since_last_race | 0.0496     |
| 11   | pts_gc_12m           | 0.0462     |
| 12   | race_count_12m       | 0.0398     |
| 13   | pts_trend            | 0.0394     |
| 14   | pts_mountain_12m     | 0.0377     |
| 15   | same_race_avg_pts    | 0.0000     |
| 16   | same_race_editions   | 0.0000     |

## Decision

Best: **Random Forest** with ρ = 0.3662

**NO-GO** — Keep rules-based approach.
