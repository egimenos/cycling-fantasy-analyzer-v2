# Research: ML Scoring for Stage Races

**Feature**: 006-ml-scoring-stage-races
**Date**: 2026-03-20
**Status**: Complete

## R1: ML Model Serving Architecture

**Decision**: Pre-computed predictions stored in PostgreSQL `ml_scores` table.

**Rationale**: Avoids duplicating 36-feature extraction in TypeScript, eliminates ONNX runtime dependency, zero deploy complexity (same Postgres instance), sub-millisecond read latency. Python CLI writes predictions; TypeScript API reads them.

**Alternatives considered**:

- ONNX Runtime in Node.js: Requires porting feature extraction to TypeScript (~500 lines) and sklearn-to-ONNX conversion. Feature parity risk.
- Python HTTP microservice: Violates CLI-only constraint for ML operations. Extra service to deploy and monitor.
- Direct sklearn in Python HTTP: Same violation + 24/7 process for a weekly batch job.

## R2: Python Pipeline Structure

**Decision**: Refactor `research_v3.py` into separate modules: `features.py`, `train.py`, `predict.py`, `retrain.py` (entrypoint).

**Rationale**: Clean separation of concerns. `features.py` is the single source of truth for the 36-feature set, reusable by both training and prediction. `retrain.py` orchestrates the full pipeline.

**Alternatives considered**:

- Single monolithic script: Faster to ship but couples production to research code. Hard to test individual components.
- Importing from `research_v3.py` directly: Couples production to a script that includes evaluation logic, report generation, and hardcoded train/test splits.

## R3: DB Schema Ownership

**Decision**: Drizzle ORM owns the `ml_scores` table schema. Python writes via raw SQL matching the Drizzle-defined schema.

**Rationale**: Single source of truth for all database schemas. Consistent with existing pattern (all tables are Drizzle-managed). Migration-based schema evolution.

**Alternatives considered**:

- Python creates table via `CREATE TABLE IF NOT EXISTS`: Two sources of truth. Schema drift risk between Python and TypeScript definitions.

## R4: Model Storage

**Decision**: Local filesystem at `ml/models/`. Model file format: joblib (scikit-learn native).

**Rationale**: Simplest approach. Works directly in dev. In production, the model is generated and read on the same server. No volume management or DB blobs needed at current scale (single-user, single-server).

**Alternatives considered**:

- Docker volume mount: Unnecessary complexity for single-server deployment. Can migrate later if needed.
- PostgreSQL blob: Increases DB size unnecessarily. Model files are ~5-10 MB.

## R5: Feature Extraction Strategy

**Decision**: Load all data into pandas DataFrames, compute features in-memory. Same approach as research.

**Rationale**: 210K results fit trivially in RAM (~50 MB). Batch job runs weekly, not real-time. The approach is proven and validated in research. No premature SQL optimization.

**Alternatives considered**:

- Push aggregations to SQL: More complex queries, harder to maintain parity with research features. Only beneficial at much larger scale (millions of results).

## R6: Model Versioning

**Decision**: Timestamp-based `model_version` stored in `ml_scores` records. No automatic rollback. Benchmark compares versions for visibility.

**Rationale**: Single-user tool. Weekly benchmark provides visibility into regressions. Manual rollback (re-train with previous parameters or restore previous joblib) is sufficient.

**Alternatives considered**:

- Full rollback automation: Over-engineering for single-user scale. Adds complexity to the pipeline with little practical benefit.

## R7: Hybrid Scoring Interface

**Decision**: Extend `AnalyzedRider` (shared-types) with `scoring_method: "rules" | "hybrid"` and `ml_predicted_score: number | null`. Keep full rules-based breakdown intact. For stage races, return both.

**Rationale**: Maximum transparency — users see both scoring methods side by side. No breaking changes to existing interface. The optimizer uses `ml_predicted_score` for stage races when available, falls back to `totalProjectedPts`.

**Alternatives considered**:

- Replace rules-based score entirely for stage races: Loses transparency and category breakdown.
- Train 4 separate models per category (gc, stage, mountain, sprint): Significantly more complex, not validated in research, and the target variable in research was total points.

## R8: Integration Points in TypeScript API

**Decision**: Minimal changes to existing architecture. New components:

1. **Domain layer**: `MlScore` entity + `MlScoreRepositoryPort` (read-only port — Python writes, TypeScript reads)
2. **Infrastructure layer**: `ml-scores` Drizzle schema + `MlScoreRepositoryAdapter`
3. **Application layer**: `AnalyzePriceListUseCase` injects `MlScoreRepositoryPort`, reads ML scores for stage races, enriches response
4. **Benchmark layer**: `RunBenchmarkUseCase` computes 3 rhos (rules, ML, hybrid)
5. **Shared types**: `AnalyzedRider` extended with `scoring_method` + `ml_predicted_score`

**No new NestJS modules** — `MlScoreRepositoryPort` is registered in existing `DatabaseModule`.

## R9: Constitution Compliance — Python Addition

**Decision**: Adding Python is a justified exception to the "No Python in v1" constitution rule.

**Rationale**: The constitution explicitly anticipates this: "Python may be added later if ML complexity warrants it." Feature 005 research proved ML complexity warrants Python (RF achieves rho=0.52-0.59 for stage races vs baseline 0.39). An ADR will document this decision.

**Action required**: Create ADR `docs/adr/2026-03-20-ml-scoring-python-addition.md` documenting the rationale.

## R10: Benchmark 3-Column Display

**Decision**: Single `make benchmark-suite` command displays a table with columns: race, type, rho(rules), rho(ML), rho(hybrid). Aggregate mean rho per method at the bottom.

**Rationale**: One command, complete picture. Hybrid rho is the production-relevant metric. Seeing all three together facilitates analysis and regression detection.

**Implementation approach**: `RunBenchmarkUseCase` returns a `BenchmarkResult` extended with `mlSpearmanRho` and `hybridSpearmanRho`. For each race:

- Rules rho: existing logic (predicted from rules-based scoring vs actual)
- ML rho: predicted from `ml_scores` vs actual (null for classics)
- Hybrid rho: ML for stage races, rules for classics (matches production behavior)
