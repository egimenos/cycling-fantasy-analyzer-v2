# Research: ML Scoring for Stage Races

**Feature**: 006-ml-scoring-stage-races
**Date**: 2026-03-20
**Status**: Complete

## R1: ML Model Serving Architecture

**Decision**: Internal Python FastAPI microservice with on-demand predictions cached in PostgreSQL `ml_scores` table.

**Rationale**: The real user flow is on-demand: user uploads price list → system analyzes race → needs ML predictions now. Pre-computed predictions assume we know which races to predict in advance, but analysis is user-triggered. A microservice loads the model once at startup (zero cold start on predictions) and serves predictions in ~200-500ms. Results are cached in `ml_scores` for subsequent requests. The service is internal-only (Docker network), not exposed to the internet.

**Alternatives considered**:

- Pre-computed predictions (batch): Doesn't match real user flow. User triggers analysis on-demand; can't pre-compute for races not yet requested. Would also re-predict all races on every retrain unnecessarily.
- Python subprocess from Node.js: 2-3s cold start per call (Python interpreter boot + sklearn import + model load). Unacceptable UX for an interactive analysis request.
- ONNX Runtime in Node.js: Requires porting 36-feature extraction to TypeScript (~500 lines). Feature parity risk and maintenance burden.

## R2: Python Service Structure

**Decision**: FastAPI service with modular internals: `app.py` (endpoints), `features.py` (36-feature extraction), `train.py` (model training), `predict.py` (prediction logic), `retrain.py` (CLI entrypoint for training only).

**Rationale**: Clean separation of concerns. `features.py` is the single source of truth for the 36-feature set, reused by both training (`retrain.py`) and on-demand prediction (`predict.py` via `app.py`). FastAPI endpoints are minimal (~50 lines): `/predict` and `/health`.

**Alternatives considered**:

- Single monolithic script: Couples production to research code. Hard to test individual components.
- Importing from `research_v3.py` directly: Couples production to a script with evaluation logic, report generation, and hardcoded splits.

## R3: DB Schema Ownership

**Decision**: Drizzle ORM owns the `ml_scores` table schema. Python writes via raw SQL matching the Drizzle-defined schema.

**Rationale**: Single source of truth for all database schemas. Consistent with existing pattern (all tables are Drizzle-managed). Migration-based schema evolution.

**Alternatives considered**:

- Python creates table via `CREATE TABLE IF NOT EXISTS`: Two sources of truth. Schema drift risk.

## R4: Model Storage

**Decision**: Local filesystem at `ml/models/`. Model file format: joblib (scikit-learn native). Model loaded into memory once at FastAPI startup.

**Rationale**: Simplest approach. In dev, files are on local disk. In production, the ML service container has access to the model directory (Docker volume or bind mount). The model stays in memory for the lifetime of the service — no per-request loading overhead.

**Alternatives considered**:

- Docker volume mount: May be needed in production but not an architecture change — just a deployment detail.
- PostgreSQL blob: Increases DB size unnecessarily. Model files are ~5-10 MB.

## R5: Feature Extraction Strategy

**Decision**: Load all data into pandas DataFrames, compute features in-memory. Same approach as research.

**Rationale**: 210K results fit trivially in RAM (~50 MB). For on-demand prediction of a single race (~150 riders), feature extraction is fast (~1-2s). The approach is proven and validated in research.

**Alternatives considered**:

- Push aggregations to SQL: Harder to maintain parity with research features. Only beneficial at much larger scale.

## R6: Model Versioning

**Decision**: Timestamp-based `model_version` stored in `ml_scores` records and in `ml/models/model_version.txt`. No automatic rollback. Benchmark compares versions for visibility.

**Rationale**: Single-user tool. Weekly benchmark provides visibility into regressions. The ML service reads `model_version.txt` on startup and uses it to detect stale cache entries. When model version changes, cached predictions are invalidated.

**Alternatives considered**:

- Full rollback automation: Over-engineering for single-user scale.

## R7: Hybrid Scoring Interface

**Decision**: Extend `AnalyzedRider` (shared-types) with `scoringMethod: "rules" | "hybrid"` and `mlPredictedScore: number | null`. Keep full rules-based breakdown intact. For stage races, return both.

**Rationale**: Maximum transparency — users see both scoring methods side by side. No breaking changes to existing interface. The optimizer uses `mlPredictedScore` for stage races when available, falls back to `totalProjectedPts`.

**Alternatives considered**:

- Replace rules-based score entirely for stage races: Loses transparency and category breakdown.
- Train 4 separate models per category: Not validated in research, significantly more complex.

## R8: Integration Points in TypeScript API

**Decision**: Two new ports in the domain layer:

1. **`MlScoringPort`** (domain): Abstract interface for requesting ML predictions for a race. The adapter (`MlScoringAdapter`) makes HTTP calls to the internal FastAPI service.
2. **`MlScoreRepositoryPort`** (domain): Read/write interface for the `ml_scores` cache table. The adapter uses Drizzle ORM.

**Integration flow in `AnalyzePriceListUseCase`**:

1. Compute rules-based scores (existing logic, unchanged)
2. If race type is stage race (mini_tour / grand_tour):
   a. Check `ml_scores` cache for current model version
   b. Cache miss → call `MlScoringPort.predictRace(raceSlug, year)` → ML service → features + predict → write cache → return
   c. Cache hit → read from `ml_scores`
3. Enrich `AnalyzedRider` with `scoringMethod` and `mlPredictedScore`

**Fallback**: If ML service is unavailable (timeout, error, no model), return rules-based scoring only. Never fail the analysis request because of ML.

## R9: Constitution Compliance — Python Addition

**Decision**: Adding Python is a justified exception to the "No Python in v1" constitution rule.

**Rationale**: The constitution explicitly anticipates this: "Python may be added later if ML complexity warrants it." Feature 005 research proved ML complexity warrants Python. An ADR will document this decision.

**Clarification on CLI-only rule**: The CLI-only rule applies to scraping operations that were previously proposed as REST endpoints exposed to the internet. The ML service is an internal microservice on the Docker network, not accessible from outside. This is service-to-service communication, not a public API endpoint.

**Action required**: Create ADR `docs/adr/2026-03-20-ml-scoring-python-addition.md`.

## R10: Benchmark 3-Column Display

**Decision**: Single `make benchmark-suite` command displays a table with columns: race, type, rho(rules), rho(ML), rho(hybrid). Aggregate mean rho per method at the bottom.

**Rationale**: One command, complete picture. Hybrid rho is the production-relevant metric.

**Implementation approach**: The benchmark generates ML predictions on-the-fly by calling the ML service for each historical race. For each race:

- Rules rho: existing logic (rules-based predicted vs actual)
- ML rho: ML predicted vs actual (null for classics)
- Hybrid rho: ML for stage races, rules for classics (matches production behavior)

## R11: Cache Invalidation Strategy

**Decision**: Model-version-based invalidation. Each cached prediction in `ml_scores` records the `model_version` that produced it. When the API (or benchmark) requests predictions, it compares the cached version against the current model version (read from ML service `/health` endpoint or `model_version.txt`). Stale entries trigger a re-prediction.

**Rationale**: Simple and correct. No TTL-based expiration needed — the cache is only stale when the model changes (weekly retrain). The ML service knows its current model version and can be queried for it.

**Cache lifecycle**:

1. `make retrain` → trains model, writes new `model_version.txt`
2. ML service detects new version (on next request or restart) and reloads model
3. API checks cached `model_version` vs current → stale → re-predict
4. Fresh predictions cached with new `model_version`
