---
work_package_id: WP01
title: Foundation — DB Schema, Python Scaffold, Docker
lane: planned
dependencies: []
subtasks:
  - T001
  - T002
  - T003
  - T004
  - T005
  - T006
  - T007
phase: Phase 0 - Foundation
assignee: ''
agent: ''
shell_pid: ''
review_status: ''
reviewed_by: ''
history:
  - timestamp: '2026-03-20T16:27:36Z'
    lane: planned
    agent: system
    shell_pid: ''
    action: Prompt generated via /spec-kitty.tasks
requirement_refs:
  - FR-002
  - FR-005
---

# Work Package Prompt: WP01 – Foundation — DB Schema, Python Scaffold, Docker

## ⚠️ IMPORTANT: Review Feedback Status

**Read this first if you are implementing this task!**

- **Has review feedback?**: Check the `review_status` field above. If it says `has_feedback`, scroll to the **Review Feedback** section immediately.
- **Mark as acknowledged**: When you understand the feedback and begin addressing it, update `review_status: acknowledged` in the frontmatter.

---

## Review Feedback

_[This section is empty initially. Reviewers will populate it if the work is returned from review.]_

---

## Implementation Command

```bash
spec-kitty implement WP01
```

---

## Objectives & Success Criteria

- Python project structure (`ml/`) exists with proper layout and dependencies
- `ml_scores` table created via Drizzle migration
- DDD components (entity, port, adapter) for ML score cache are in place
- ML service runs via `docker-compose` (placeholder, no ML logic yet)
- Makefile targets work: `make ml-up`, `make ml-down`, `make retrain` (placeholder)
- `.gitignore` updated to exclude model files and Python virtual environment

## Context & Constraints

- **Architecture**: See `kitty-specs/006-ml-scoring-stage-races/plan.md` for project structure
- **Data model**: See `kitty-specs/006-ml-scoring-stage-races/data-model.md` for `ml_scores` table
- **DDD patterns**: Follow existing patterns in `apps/api/src/domain/race-result/` and `apps/api/src/infrastructure/database/`
- **Constitution**: All code in English. DDD/Hexagonal compliance required.

## Subtasks & Detailed Guidance

### Subtask T001 – Create Python project structure

- **Purpose**: Establish the `ml/` directory with proper layout for the ML service.
- **Steps**:
  1. Create directory structure:
     ```
     ml/
     ├── src/
     │   └── __init__.py
     ├── tests/
     │   └── __init__.py
     ├── models/
     │   └── .gitkeep
     └── requirements.txt
     ```
  2. Create `ml/requirements.txt`:
     ```
     scikit-learn>=1.4
     pandas>=2.2
     psycopg2-binary>=2.9
     joblib>=1.3
     fastapi>=0.110
     uvicorn>=0.29
     numpy>=1.26
     ```
  3. Verify: `cd ml && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt`
- **Files**: `ml/src/__init__.py`, `ml/tests/__init__.py`, `ml/models/.gitkeep`, `ml/requirements.txt`
- **Parallel?**: No — other subtasks depend on this structure

### Subtask T002 – Create `ml_scores` Drizzle schema + generate migration

- **Purpose**: Define the prediction cache table. Drizzle is the single source of truth for all DB schemas.
- **Steps**:
  1. Create `apps/api/src/infrastructure/database/schema/ml-scores.ts`:

     ```typescript
     import { pgTable, uuid, varchar, integer, real, timestamp } from 'drizzle-orm/pg-core';
     import { riders } from './riders';

     export const mlScores = pgTable('ml_scores', {
       id: uuid('id').primaryKey().defaultRandom(),
       riderId: uuid('rider_id')
         .notNull()
         .references(() => riders.id),
       raceSlug: varchar('race_slug').notNull(),
       year: integer('year').notNull(),
       predictedScore: real('predicted_score').notNull(),
       modelVersion: varchar('model_version').notNull(),
       createdAt: timestamp('created_at').notNull().defaultNow(),
     });
     ```

  2. Add unique constraint on `(rider_id, race_slug, year, model_version)`
  3. Add indexes on `(race_slug, year, model_version)` and `(model_version)`
  4. Export from schema index file if one exists
  5. Run `make db-generate` to generate migration SQL
  6. Run `make db-migrate` to apply
  7. Verify: `make db-psql` → `\d ml_scores` shows table

- **Files**: `apps/api/src/infrastructure/database/schema/ml-scores.ts`, `apps/api/drizzle/*.sql` (auto-generated)
- **Notes**: Check how existing schemas handle unique constraints and indexes (look at `schema/race-results.ts` for reference patterns)

### Subtask T003 – Create `MlScore` entity

- **Purpose**: Domain entity representing a cached ML prediction. Pure, no framework dependencies.
- **Steps**:
  1. Create `apps/api/src/domain/ml-score/ml-score.entity.ts`:
     ```typescript
     export interface MlScore {
       readonly id: string;
       readonly riderId: string;
       readonly raceSlug: string;
       readonly year: number;
       readonly predictedScore: number;
       readonly modelVersion: string;
       readonly createdAt: Date;
     }
     ```
- **Files**: `apps/api/src/domain/ml-score/ml-score.entity.ts`
- **Parallel?**: Can proceed once directory exists

### Subtask T004 – Create `MlScoreRepositoryPort`

- **Purpose**: Domain port interface for reading/writing ML score cache. Read-heavy (TypeScript reads cache), write-heavy from Python side.
- **Steps**:
  1. Create `apps/api/src/domain/ml-score/ml-score.repository.port.ts`:

     ```typescript
     import { MlScore } from './ml-score.entity';

     export const ML_SCORE_REPOSITORY_PORT = Symbol('MlScoreRepositoryPort');

     export interface MlScoreRepositoryPort {
       findByRace(raceSlug: string, year: number, modelVersion: string): Promise<MlScore[]>;
       findLatestModelVersion(): Promise<string | null>;
       saveMany(scores: Omit<MlScore, 'id' | 'createdAt'>[]): Promise<void>;
     }
     ```

  2. `findByRace`: returns cached predictions for a specific race + model version
  3. `findLatestModelVersion`: returns the most recent model_version string from ml_scores
  4. `saveMany`: bulk insert predictions (used by ML service if writing via TypeScript, or for testing)

- **Files**: `apps/api/src/domain/ml-score/ml-score.repository.port.ts`
- **Notes**: Follow pattern from `race-result.repository.port.ts` (Symbol injection token)

### Subtask T005 – Create `MlScoreRepositoryAdapter` + register in DatabaseModule

- **Purpose**: Drizzle ORM adapter implementing the port. Register in NestJS DI.
- **Steps**:
  1. Create `apps/api/src/infrastructure/database/ml-score.repository.adapter.ts`
  2. Implement `findByRace` using Drizzle `select().from(mlScores).where(...)` with `and(eq, eq, eq)` conditions
  3. Implement `findLatestModelVersion` using `select({ modelVersion }).from(mlScores).orderBy(desc(createdAt)).limit(1)`
  4. Implement `saveMany` using Drizzle `insert(mlScores).values(...)` with `onConflictDoNothing()`
  5. Register in `apps/api/src/infrastructure/database/database.module.ts`:
     - Add to `providers` array: `{ provide: ML_SCORE_REPOSITORY_PORT, useClass: MlScoreRepositoryAdapter }`
     - Add to `exports` array: `ML_SCORE_REPOSITORY_PORT`
  6. Follow exact patterns from `race-result.repository.adapter.ts` and `database.module.ts`
- **Files**: `apps/api/src/infrastructure/database/ml-score.repository.adapter.ts`, `apps/api/src/infrastructure/database/database.module.ts`
- **Notes**: `onConflictDoNothing()` handles race conditions where concurrent requests try to cache the same predictions

### Subtask T006 – Create Dockerfile.ml + add ml-service to docker-compose

- **Purpose**: Docker infrastructure for the ML service. Placeholder app for now (real FastAPI logic comes in WP03).
- **Steps**:
  1. Create `docker/Dockerfile.ml`:

     ```dockerfile
     FROM python:3.12-slim

     WORKDIR /app
     COPY ml/requirements.txt .
     RUN pip install --no-cache-dir -r requirements.txt

     COPY ml/src/ ./src/
     COPY ml/models/ ./models/

     EXPOSE 8000
     CMD ["uvicorn", "src.app:app", "--host", "0.0.0.0", "--port", "8000"]
     ```

  2. Create minimal placeholder `ml/src/app.py`:

     ```python
     from fastapi import FastAPI
     app = FastAPI(title="Cycling ML Service")

     @app.get("/health")
     def health():
         return {"status": "no_model", "model_version": None, "models_loaded": []}
     ```

  3. Add to `docker-compose.yml`:
     ```yaml
     ml-service:
       build:
         context: .
         dockerfile: docker/Dockerfile.ml
       ports:
         - '8000:8000'
       environment:
         - DATABASE_URL=postgresql://cycling:cycling@postgres:5432/cycling_analyzer
       depends_on:
         postgres:
           condition: service_healthy
       volumes:
         - ./ml/models:/app/models
     ```

- **Files**: `docker/Dockerfile.ml`, `docker-compose.yml`, `ml/src/app.py` (placeholder)
- **Parallel?**: Yes — independent of DB schema work

### Subtask T007 – Add Makefile targets + .gitignore updates

- **Purpose**: Developer ergonomics. All ML operations accessible via `make` commands.
- **Steps**:
  1. Add to `Makefile`:

     ```makefile
     # ── ML Service ────────────────────────────────────────────
     retrain: ## Train ML models (Python CLI)
     	cd ml && source venv/bin/activate && python -m src.retrain

     ml-up: ## Start ML service (docker-compose)
     	docker compose up -d ml-service

     ml-down: ## Stop ML service
     	docker compose stop ml-service

     ml-logs: ## View ML service logs
     	docker compose logs -f ml-service

     ml-restart: ## Restart ML service (reload model)
     	docker compose restart ml-service
     ```

  2. Update `.PHONY` line at top of Makefile to include new targets
  3. Add to root `.gitignore`:
     ```
     # ML models and Python
     ml/models/*.joblib
     ml/models/model_version.txt
     ml/venv/
     __pycache__/
     *.pyc
     ```

- **Files**: `Makefile`, `.gitignore`
- **Parallel?**: Yes — independent of other subtasks

## Risks & Mitigations

- **Drizzle migration conflicts**: If other migrations are pending, resolve order before generating. Run `make db-migrate` to apply all pending first.
- **Docker build context**: `Dockerfile.ml` uses root context (`.`) so it can COPY from `ml/`. Verify build context in `docker-compose.yml`.
- **Python version**: Ensure Python 3.12+ is available on the dev machine. The `Dockerfile.ml` pins 3.12-slim.

## Review Guidance

- Verify `ml_scores` table schema matches `data-model.md` exactly (columns, types, constraints)
- Verify DDD pattern compliance: entity has no framework deps, port is a plain interface with Symbol token, adapter uses Drizzle
- Verify Makefile targets work: `make ml-up` starts the service, `curl localhost:8000/health` returns JSON
- Verify `.gitignore` excludes model files but keeps `.gitkeep`

## Activity Log

- 2026-03-20T16:27:36Z – system – lane=planned – Prompt created.
