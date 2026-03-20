# Implementation Plan: ML Scoring for Stage Races

**Branch**: `006-ml-scoring-stage-races` | **Date**: 2026-03-20 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `kitty-specs/006-ml-scoring-stage-races/spec.md`

## Summary

Implement ML scoring (Random Forest) for stage races in production. A lightweight Python FastAPI microservice handles on-demand predictions: when the TypeScript API analyzes a stage race, it calls the internal ML service which extracts features, runs the model, and caches results in a `ml_scores` database table. The model is loaded once at service startup (zero cold start). `make retrain` trains the model only — predictions happen on-demand. The benchmark suite is extended to compare rules, ML, and hybrid scoring side-by-side.

## Technical Context

**Language/Version**: TypeScript 5.9+ (API, existing) + Python 3.12 (ML service, new)
**Primary Dependencies**:

- API: NestJS 11, Drizzle ORM (existing)
- ML service: FastAPI, scikit-learn, pandas, psycopg2, joblib, uvicorn
  **Storage**: PostgreSQL 16 (existing) — new `ml_scores` table (cache)
  **Testing**: Jest (TypeScript), pytest (Python)
  **Target Platform**: Linux VPS (Dokploy), Docker containers
  **Project Type**: Monorepo (Turborepo) — adds Python ML service alongside existing TypeScript apps
  **Performance Goals**: On-demand prediction < 3s (cache miss), < 100ms (cache hit); retrain < 10 min
  **Constraints**: Single-user tool; ML service is internal only (not exposed to internet)
  **Scale/Scope**: ~210K race results, ~3,500 riders, ~381 races, 36 ML features

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Rule                              | Status              | Notes                                                                                                                                                                                               |
| --------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No Python in v1                   | JUSTIFIED EXCEPTION | Constitution states "Python may be added later if ML complexity warrants it." Feature 005 research validated GO for stage races (RF rho=0.52-0.59 vs baseline 0.39). ML complexity warrants Python. |
| DDD/Hexagonal Architecture        | PASS                | New `MlScoringPort` (domain) + `MlScoringAdapter` (infrastructure, HTTP client to ML service). `MlScoreRepositoryPort` + adapter for cache reads. Domain layer remains pure.                        |
| Scoring logic 100% coverage       | PASS with NOTE      | Rules-based scoring remains 100% covered. ML scoring integration (cache read, fallback, service call) is fully testable. Model quality is validated via benchmark rho.                              |
| Scoring model changes require ADR | PASS                | ADR required for this feature documenting hybrid scoring and microservice rationale.                                                                                                                |
| English only                      | PASS                | All code, comments, docs in English.                                                                                                                                                                |
| No half-finished features         | PASS                | Feature is independently functional: retrain → service → analyze → benchmark. Each user story is independently testable.                                                                            |

**Post-Phase 1 re-check**: The ML service is an internal microservice (not exposed to internet). The CLI-only rule applies to scraping endpoints exposed to the public, not internal service-to-service communication. The constitution's "No Python" clause explicitly allows this evolution.

## Project Structure

### Documentation (this feature)

```
kitty-specs/006-ml-scoring-stage-races/
├── spec.md
├── plan.md              # This file
├── research.md          # Phase 0 — architecture decisions
├── data-model.md        # Phase 1 — ml_scores cache table schema
├── quickstart.md        # Phase 1 — dev setup for this feature
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

```
ml/                                    # Python ML service (NEW)
├── src/
│   ├── app.py                         # FastAPI application (/predict, /health)
│   ├── features.py                    # 36-feature extraction (from research_v3.py)
│   ├── train.py                       # Model training (RF per race type)
│   ├── predict.py                     # Prediction logic (load model, extract features, predict)
│   └── retrain.py                     # CLI entrypoint (make retrain)
├── models/                            # Trained model storage (gitignored)
│   └── .gitkeep
├── tests/
│   ├── test_features.py               # Feature extraction unit tests
│   ├── test_predict.py                # Prediction pipeline tests
│   └── test_app.py                    # FastAPI endpoint tests
├── requirements.txt                   # Python dependencies
└── src/research_v3.py                 # Original research script (unchanged)

apps/api/src/
├── domain/
│   ├── ml-score/                      # NEW aggregate
│   │   ├── ml-score.entity.ts         # MlScore entity (cached prediction)
│   │   └── ml-score.repository.port.ts # Port: read/write cache
│   └── scoring/
│       └── ml-scoring.port.ts         # NEW port: request predictions from ML service
├── infrastructure/
│   ├── database/
│   │   ├── schema/
│   │   │   └── ml-scores.ts           # NEW Drizzle schema (cache table)
│   │   └── ml-score.repository.adapter.ts  # NEW adapter (cache read/write)
│   └── ml/
│       └── ml-scoring.adapter.ts      # NEW adapter: HTTP client to ML service
├── application/
│   ├── analyze/
│   │   └── analyze-price-list.use-case.ts  # MODIFIED — call ML service for stage races
│   └── benchmark/
│       ├── run-benchmark.use-case.ts       # MODIFIED — 3-method comparison
│       └── run-benchmark-suite.use-case.ts # MODIFIED — aggregate 3 rhos
└── presentation/cli/
    └── benchmark.command.ts                # MODIFIED — 3-column display

packages/shared-types/src/
└── scoring.ts                         # MODIFIED — add scoringMethod, mlPredictedScore

docker/
├── Dockerfile.api                     # UNCHANGED — Node-only
└── Dockerfile.ml                      # NEW — Python FastAPI service

docker-compose.yml                     # MODIFIED — add ml-service for dev
Makefile                               # MODIFIED — add retrain, ml-up, ml-logs targets
```

**Structure Decision**: Extends the existing monorepo with a Python ML microservice (`ml/`). The TypeScript API stays Node-only and communicates with the ML service via internal HTTP calls. Two new DDD components: `MlScoringPort` (domain port for prediction requests) with `MlScoringAdapter` (HTTP client), and `MlScoreRepositoryPort` (cache) with adapter. Both registered in `DatabaseModule`.

## Complexity Tracking

| Violation                            | Why Needed                                                                                                                                           | Simpler Alternative Rejected Because                                                                  |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Adding Python to TypeScript monorepo | ML model training + inference requires scikit-learn ecosystem. 36-feature extraction is complex and validated in Python.                             | Porting to TypeScript would duplicate ~500 lines and require ONNX conversion.                         |
| Adding a microservice (FastAPI)      | On-demand predictions require model in memory. Subprocess approach has 2-3s cold start per call (Python boot + model load). Microservice loads once. | Subprocess: unacceptable UX latency. Pre-computed: doesn't match real user flow (on-demand analysis). |
