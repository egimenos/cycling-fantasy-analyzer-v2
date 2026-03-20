# ML Research v3 — Results

**Date**: 2026-03-20

## New features in v3

- **Micro-form**: pts in last 30/14 days, last 3 race performance
- **Age**: rider age, young/veteran flags, pts per career year
- **Team leader**: rank within team startlist, leader flag, % of team pts

## Global results

| Model            | rho    | vs baseline |
| ---------------- | ------ | ----------- |
| Rules-based      | 0.3872 | —           |
| v2 RF            | 0.3973 | +0.0101     |
| v3 Random Forest | 0.4060 | +0.0188     |
| v3 XGBoost       | 0.3904 | +0.0032     |

## Per-type results

| Type/Model     | rho    |
| -------------- | ------ |
| classic/RF     | 0.3121 |
| classic/XGB    | 0.2908 |
| grand_tour/RF  | 0.5872 |
| grand_tour/XGB | 0.5411 |
| mini_tour/RF   | 0.5185 |
| mini_tour/XGB  | 0.5026 |

## Top 20 features

| Rank | Feature             | Importance | Source         |
| ---- | ------------------- | ---------- | -------------- |
| 1    | stage_pts_12m       | 0.1414     | v2             |
| 2    | win_rate            | 0.0675     | v2             |
| 3    | pts_total_12m       | 0.0467     | v2             |
| 4    | race_type_enc       | 0.0444     | v2             |
| 5    | median_race_pts_12m | 0.0406     | v2             |
| 6    | podium_rate         | 0.0384     | v2             |
| 7    | same_race_mean      | 0.0329     | v2             |
| 8    | team_size           | 0.0312     | NEW:team       |
| 9    | pts_per_career_year | 0.0304     | NEW:age        |
| 10   | same_race_best      | 0.0250     | v2             |
| 11   | pts_gc_12m          | 0.0237     | v2             |
| 12   | pts_stage_12m       | 0.0233     | v2             |
| 13   | last_3_mean_pts     | 0.0203     | NEW:micro-form |
| 14   | is_leader           | 0.0198     | NEW:team       |
| 15   | pts_sprint_12m      | 0.0187     | v2             |
| 16   | top10_rate          | 0.0181     | v2             |
| 17   | pts_total_3m        | 0.0180     | v2             |
| 18   | pts_same_type_12m   | 0.0179     | v2             |
| 19   | top5_rate           | 0.0175     | v2             |
| 20   | race_count_30d      | 0.0175     | NEW:micro-form |
