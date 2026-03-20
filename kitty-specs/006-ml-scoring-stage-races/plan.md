# Implementation Plan: ML Scoring for Stage Races

**Branch**: `006-ml-scoring-stage-races` | **Date**: 2026-03-20 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `kitty-specs/006-ml-scoring-stage-races/spec.md`

## Summary

Implement ML scoring (Random Forest) for stage races in production. The system pre-computes predictions via a Python CLI pipeline and stores them in a `ml_scores` database table. The TypeScript API reads pre-computed scores and serves hybrid results: ML predictions alongside rules-based breakdown for stage races, rules-only for classics. Weekly retraining runs as a one-shot batch job. The benchmark suite is extended to compare rules, ML, and hybrid scoring side-by-side.

## Technical Context

**Language/Version**: TypeScript 5.9+ (API, existing) + Python 3.12 (ML pipeline, new)
**Primary Dependencies**:

- API: NestJS 11, Drizzle ORM (existing)
- ML: scikit-learn, pandas, psycopg2, joblib
  **Storage**: PostgreSQL 16 (existing) — new `ml_scores` table
  **Testing**: Jest (TypeScript), pytest (Python)
  **Target Platform**: Linux VPS (Dokploy), Docker containers
  **Project Type**: Monorepo (Turborepo) — adds Python ML module alongside existing TypeScript apps
  **Performance Goals**: Retrain pipeline completes in < 15 min; API reads pre-computed scores (< 1ms DB lookup)
  **Constraints**: Single-user tool; CLI-only for ML operations (no HTTP endpoints for Python)
  **Scale/Scope**: ~210K race results, ~3,500 riders, ~381 races, 36 ML features

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Rule                              | Status              | Notes                                                                                                                                                                                                                                                           |
| --------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No Python in v1                   | JUSTIFIED EXCEPTION | Constitution states "Python may be added later if ML complexity warrants it." Feature 005 research validated GO for stage races (RF rho=0.52-0.59 vs baseline 0.39). ML complexity warrants Python.                                                             |
| DDD/Hexagonal Architecture        | PASS                | New `MlScoreRepositoryPort` (domain) + `MlScoreRepositoryAdapter` (infrastructure). Python writes raw SQL to same schema. Domain layer remains pure.                                                                                                            |
| Scoring logic 100% coverage       | PASS with NOTE      | Rules-based scoring remains 100% covered. ML scoring is a pre-computed lookup (not deterministic logic) — test coverage applies to the integration layer (reading from DB, fallback logic), not the model itself. Model quality is validated via benchmark rho. |
| Scoring model changes require ADR | PASS                | ADR required for this feature documenting hybrid scoring rationale.                                                                                                                                                                                             |
| English only                      | PASS                | All code, comments, docs in English.                                                                                                                                                                                                                            |
| No half-finished features         | PASS                | Feature is independently functional: retrain → predict → serve → benchmark. Each user story is independently testable.                                                                                                                                          |

## Project Structure

### Documentation (this feature)

```
kitty-specs/006-ml-scoring-stage-races/
├── spec.md
├── plan.md              # This file
├── research.md          # Phase 0 — architecture decisions
├── data-model.md        # Phase 1 — ml_scores table schema
├── quickstart.md        # Phase 1 — dev setup for this feature
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

```
ml/                                    # Python ML pipeline (NEW)
├── src/
│   ├── features.py                    # 36-feature extraction (from research_v3.py)
│   ├── train.py                       # Model training (RF per race type)
│   ├── predict.py                     # Prediction generation → DB writes
│   └── retrain.py                     # CLI entrypoint (make retrain / make predict)
├── models/                            # Trained model storage (gitignored)
│   └── .gitkeep
├── tests/
│   ├── test_features.py               # Feature extraction unit tests
│   ├── test_train.py                  # Training pipeline tests
│   └── test_predict.py                # Prediction pipeline tests
├── requirements.txt                   # Python dependencies
└── src/research_v3.py                 # Original research script (unchanged)

apps/api/src/
├── domain/
│   └── ml-score/                      # NEW aggregate
│       ├── ml-score.entity.ts         # MlScore entity
│       └── ml-score.repository.port.ts # Port interface
├── infrastructure/database/
│   ├── schema/
│   │   └── ml-scores.ts               # NEW Drizzle schema
│   └── ml-score.repository.adapter.ts  # NEW adapter
├── application/
│   ├── analyze/
│   │   └── analyze-price-list.use-case.ts  # MODIFIED — inject ML scores
│   └── benchmark/
│       ├── run-benchmark.use-case.ts       # MODIFIED — 3-method comparison
│       └── run-benchmark-suite.use-case.ts # MODIFIED — aggregate 3 rhos
└── presentation/cli/
    └── benchmark.command.ts                # MODIFIED — 3-column display

packages/shared-types/src/
└── scoring.ts                         # MODIFIED — add scoring_method, ml_predicted_score

docker/
└── Dockerfile.ml                      # NEW — Python ML worker image

Makefile                               # MODIFIED — add retrain, predict targets
```

**Structure Decision**: Extends the existing monorepo with a new `ml/` top-level module for Python ML code. The TypeScript API gains a new DDD aggregate (`ml-score`) following the established port/adapter pattern. No new NestJS modules — the ML score repository is added to `DatabaseModule` alongside existing repositories.

## Complexity Tracking

| Violation                            | Why Needed                                                                                                                                     | Simpler Alternative Rejected Because                                                                                                                                     |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Adding Python to TypeScript monorepo | ML model training requires scikit-learn ecosystem (pandas, sklearn, joblib). 36-feature extraction is complex and already validated in Python. | Porting 36 features + RF training to TypeScript would duplicate ~500 lines of validated Python code and introduce sklearn-to-ONNX conversion complexity with no benefit. |
