# Research Specification: ML Scoring Feasibility Research

**Feature Branch**: `005-ml-scoring-feasibility-research`
**Created**: 2026-03-19
**Status**: Draft
**Mission**: research
**Input**: "Investigate whether ML-based scoring can meaningfully improve prediction quality over the current rules-based algorithm."

## Research Question

Can a machine learning model predict fantasy cycling scores (totalProjectedPts) significantly better than the current rules-based algorithm, which achieves a Spearman rank correlation of ρ ≈ 0.38 across 206 historical races?

## Motivation

The current scoring algorithm uses manually tuned weights (temporal decay, cross-type weights, race class weights) to project rider performance. Systematic weight tuning (feature 004) showed that these weights are at a local optimum — no single parameter change improves ρ by more than ±0.001. This plateau suggests that the linear weighted-sum architecture itself may be the limiting factor, not the specific weight values.

ML models can capture non-linear interactions between features (e.g., "this rider performs better in mountain stages early in the season") that a fixed-weight formula cannot represent.

## Scope

### In Scope

- Feature engineering: identify and extract predictive features from existing race results data (~114K results, ~2,500 riders, 206 races across 2024-2026)
- Model selection: evaluate candidate model architectures (gradient boosting as primary candidate, with comparison to simpler baselines)
- Evaluation: use the existing benchmark harness (feature 004) to measure Spearman ρ against the same 206-race dataset
- Go/no-go recommendation: data-driven decision on whether to proceed with full ML implementation
- If positive: outline the integration architecture (Python service, model serving, API changes)

### Out of Scope

- Full production ML pipeline implementation (that would be a follow-up feature)
- Real-time model training or online learning
- Frontend changes
- Changes to the existing rules-based scoring (it remains as-is regardless of outcome)

## Research Methodology

### Phase 1: Feature Engineering & Data Preparation

Extract features per (rider, target_race) pair from historical data available before the target race date:

**Rider Performance Features:**

- Total points in last N months (by category: GC, stage, mountain, sprint)
- Points in same race type (classic/mini_tour/grand_tour)
- Win rate and top-10 rate over recent history
- Number of races started in last 12 months (activity level)
- Best single-race score in last 12 months (peak performance)
- Points trend (improving/declining over last 3 races)

**Race Context Features:**

- Race type (classic/mini_tour/grand_tour)
- Race class (UWT/Pro/One)
- Days since rider's last race (freshness)
- Historical performance in this specific race (if applicable)

**Target Variable:**

- Actual totalProjectedPts earned in the target race (computed from real results using the same scoring tables)

**Training/Test Split:**

- Train: 2024 races (with pre-2024 data as features)
- Validation: early 2025 races
- Test: late 2025 + 2026 races
- Alternative: rolling window cross-validation

### Phase 2: Model Training & Evaluation

**Candidate Models (in order of priority):**

1. Gradient Boosting (XGBoost/LightGBM) — strong baseline for tabular data, handles feature interactions naturally
2. Linear Regression — as a sanity-check baseline (should approximate current algorithm)
3. Random Forest — alternative ensemble method

**Evaluation Protocol:**

- Primary metric: Spearman ρ (same as benchmark harness)
- Evaluate per-race ρ, then aggregate as mean across all test races
- Compare against rules-based baseline (ρ ≈ 0.38)
- Report by race type (classic/mini_tour/grand_tour) to identify where ML helps most

### Phase 3: Analysis & Recommendation

- Feature importance analysis (which features matter most?)
- Error analysis (where does ML fail? where does it improve?)
- Go/no-go decision based on ρ threshold
- If go: draft integration architecture
- If no-go: document findings for future reference

## Success Criteria

- **SC-001**: At least 10 candidate features are extracted and evaluated for predictive signal.
- **SC-002**: At least 2 model architectures are trained and compared against the rules-based baseline.
- **SC-003**: ML model achieves Spearman ρ > 0.50 on the full test set (206 races) — the go threshold for full implementation.
- **SC-004**: Feature importance ranking is produced, identifying the top 5 most predictive features.
- **SC-005**: A clear go/no-go recommendation is documented with supporting evidence.
- **SC-006**: If go, a high-level integration architecture is outlined (how Python ML fits into the TypeScript stack).

## Decision Criteria

| Outcome   | ρ Result        | Action                                                 |
| --------- | --------------- | ------------------------------------------------------ |
| Strong go | ρ > 0.60        | Prioritize ML implementation as next feature           |
| Go        | 0.50 < ρ ≤ 0.60 | Plan ML implementation, consider hybrid approach       |
| Marginal  | 0.42 < ρ ≤ 0.50 | Document findings, consider targeted improvements only |
| No-go     | ρ ≤ 0.42        | Keep rules-based approach, archive research            |

## Deliverables

- **Feature extraction script**: Python script that generates features from the PostgreSQL database
- **Training notebook/script**: Model training with evaluation metrics
- **Results report**: Documented findings with metrics, charts, and recommendation
- **Feature importance analysis**: Ranked list of predictive features with explanations
- **Integration architecture** (if go): How Python ML service integrates with the TypeScript API

## Assumptions

- The existing ~114K race results across 3 years provide sufficient training data for tabular ML models.
- The benchmark harness (feature 004) provides a fair evaluation framework — same data, same metric.
- Python can be added to the monorepo for ML work without disrupting the TypeScript codebase (constitution explicitly allows Python for ML).
- Gradient boosting on tabular features is the right starting point — deep learning would be overkill for this data volume and feature type.
- The current rules-based algorithm's ρ ≈ 0.38 is a hard baseline measured on 206 races and is reproducible.

## Dependencies

- Feature 004 (Scoring Benchmark Harness) — provides evaluation infrastructure and baseline metrics
- PostgreSQL database with seeded race results, race dates, and startlists
- Python 3.11+ environment for ML experimentation

## Risks

- **Data leakage**: Features must use only data available before the target race date. The benchmark harness enforces this for the rules-based model, but the ML pipeline must independently enforce the same temporal cutoff.
- **Overfitting**: With ~30K training examples (206 races × ~150 riders), overfitting is possible with complex models. Mitigate with cross-validation and regularization.
- **Feature engineering bias**: The features we choose to extract may not capture what truly differentiates rider performance. Mitigate by starting broad and using feature importance to prune.
- **Apples-to-oranges comparison**: The ML model and rules-based model must be evaluated on exactly the same races and riders to ensure fair comparison.
