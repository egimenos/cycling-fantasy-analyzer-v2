# Research Plan: ML Scoring Feasibility

**Branch**: `005-ml-scoring-feasibility-research` | **Date**: 2026-03-20 | **Spec**: [spec.md](spec.md)
**Mission**: research
**Status**: COMPLETE

## Research Question

Can ML models predict fantasy cycling scores significantly better than the rules-based algorithm (ρ ≈ 0.39)?

## Outcome

**GO for stage races. NO-GO for classics.**

See full results: [ml/results/report_v3.md](../../ml/results/report_v3.md)

## Methodology

- **Data**: 210K race results, 3,500 riders, 381 races (2022-2026)
- **Features**: 36 features per (rider, race) pair including historical points, micro-form, age, team context
- **Models**: Linear Regression, Random Forest, XGBoost
- **Evaluation**: Spearman ρ per race, mean across test set (2025 season, 94 races)
- **Train/test**: 2023-2024 train, 2025 test

## Key Results

| Scope       | Rules-based ρ | ML (RF) ρ | Decision |
| ----------- | ------------- | --------- | -------- |
| Global      | 0.39          | 0.41      | NO-GO    |
| Mini tours  | ~0.48         | 0.52      | GO       |
| Grand tours | ~0.55         | 0.59      | GO       |
| Classics    | ~0.31         | 0.31      | NO-GO    |

## Technical Decisions

- **Python environment**: `ml/.venv/` with pandas, scikit-learn, xgboost, psycopg2
- **Scripts**: `ml/src/research_v3.py` (main), `ml/src/scrape_birth_dates.py` (age data)
- **Schema change**: Added `riders.birth_date` column (migration 0005)
- **No changes to TypeScript codebase** during research

## Next Step

Feature 006: implement ML scoring for stage races in production.
