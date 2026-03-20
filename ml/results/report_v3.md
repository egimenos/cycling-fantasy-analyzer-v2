# ML Research v3 — Results

**Date**: 2026-03-20
**Feature**: 005-ml-scoring-feasibility-research
**Baseline**: Rules-based scoring, ρ = 0.3872 (381 races, 2022-2026)
**Go threshold**: ρ > 0.50

## Decision

**GO for stage races (mini tours + grand tours). NO-GO for classics.**

- Mini tours: Random Forest achieves ρ = 0.52 (+8% vs baseline) — above go threshold
- Grand tours: Random Forest achieves ρ = 0.59 (+7% vs baseline) — well above go threshold
- Classics: ρ = 0.31 — no improvement, inherently unpredictable one-day races

**Next step**: Feature 006 — implement ML scoring for stage races in production. Export trained Random Forest model (ONNX or pickle) and serve predictions from the TypeScript API. Keep rules-based scoring for classics.

## Research iterations

- **v1**: 3 years data (2024-2026), 16 features. All models below baseline. Cause: insufficient historical depth for training features.
- **v2**: 5 years data (2022-2026), 25 features, separate per-type models. RF global ρ=0.40. Mini tour ρ=0.50. Improvement from richer historical data.
- **v3**: 36 features adding micro-form (recent 30/14d), age/trajectory (birth_date), team leader context. RF global ρ=0.41. Mini tour ρ=0.52, grand tour ρ=0.59. New features add measurable signal.

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
