---
work_package_id: WP03
title: Database & NestJS Integration
lane: planned
dependencies: [WP02]
subtasks:
  - T013
  - T014
  - T015
  - T016
  - T017
phase: Phase 2 - Integration
assignee: ''
agent: ''
shell_pid: ''
review_status: ''
reviewed_by: ''
history:
  - timestamp: '2026-03-29T18:00:50Z'
    lane: planned
    agent: system
    shell_pid: ''
    action: Prompt generated via /spec-kitty.tasks
requirement_refs:
  - FR-005
  - FR-009
  - FR-010
---

# Work Package Prompt: WP03 – Database & NestJS Integration

## Objectives & Success Criteria

- ml_scores table has 4 new breakdown columns (gc_pts, stage_pts, mountain_pts, sprint_pts)
- NestJS adapter parses breakdown from ML service response
- MlPrediction interface includes breakdown type
- Downstream consumers (analyze use cases) receive breakdown data

## Context & Constraints

- **Plan D5**: Explicit columns (not JSONB) for queryability and type safety
- **Existing adapter**: `apps/api/src/infrastructure/ml/ml-scoring.adapter.ts`
- **Existing port**: `apps/api/src/domain/scoring/ml-scoring.port.ts`
- **DDD/Hexagonal**: Changes to port (domain) and adapter (infrastructure) must respect layer boundaries
- **Migration convention**: Check existing migrations in `apps/api/src/infrastructure/database/migrations/`

**Implementation command**: `spec-kitty implement WP03 --base WP02`

## Subtasks & Detailed Guidance

### Subtask T013 – Database migration

**Purpose**: Add breakdown columns to ml_scores table.

**Steps**:

1. Create a new migration file following existing naming convention
2. SQL:
   ```sql
   ALTER TABLE ml_scores ADD COLUMN IF NOT EXISTS gc_pts REAL DEFAULT 0;
   ALTER TABLE ml_scores ADD COLUMN IF NOT EXISTS stage_pts REAL DEFAULT 0;
   ALTER TABLE ml_scores ADD COLUMN IF NOT EXISTS mountain_pts REAL DEFAULT 0;
   ALTER TABLE ml_scores ADD COLUMN IF NOT EXISTS sprint_pts REAL DEFAULT 0;
   ```
3. Non-breaking: existing rows get default 0, no data loss
4. Verify the unique constraint on ml_scores doesn't need changes

**Files**: New migration file in `apps/api/src/infrastructure/database/migrations/`
**Parallel**: Yes, can proceed alongside T013-T014.

### Subtask T014 – Update Drizzle ORM schema

**Purpose**: Add breakdown columns to the Drizzle schema definition.

**Steps**:

1. Find the ml_scores schema definition (likely in `apps/api/src/infrastructure/database/schema/`)
2. Add columns:
   ```typescript
   gcPts: real('gc_pts').default(0),
   stagePts: real('stage_pts').default(0),
   mountainPts: real('mountain_pts').default(0),
   sprintPts: real('sprint_pts').default(0),
   ```
3. Verify the schema matches the migration

**Files**: Schema file in `apps/api/src/infrastructure/database/schema/` (modify)
**Parallel**: Yes, alongside T011.

### Subtask T015 – Update `MlPrediction` interface

**Purpose**: Extend the domain port interface to include breakdown.

**Steps**:

1. Update `apps/api/src/domain/scoring/ml-scoring.port.ts`:

   ```typescript
   export interface MlBreakdown {
     readonly gc: number;
     readonly stage: number;
     readonly mountain: number;
     readonly sprint: number;
   }

   export interface MlPrediction {
     readonly riderId: string;
     readonly predictedScore: number;
     readonly breakdown: MlBreakdown;
   }
   ```

2. This is a domain type — no framework dependencies

**Files**: `apps/api/src/domain/scoring/ml-scoring.port.ts` (modify)
**Parallel**: Yes, alongside T011-T012.

### Subtask T016 – Update `MlScoringAdapter`

**Purpose**: Parse the new breakdown field from ML service response.

**Steps**:

1. Update `apps/api/src/infrastructure/ml/ml-scoring.adapter.ts`:
   ```typescript
   const data = (await response.json()) as {
     predictions: Array<{
       rider_id: string;
       predicted_score: number;
       breakdown?: { gc: number; stage: number; mountain: number; sprint: number };
     }>;
   };
   return data.predictions.map((p) => ({
     riderId: p.rider_id,
     predictedScore: p.predicted_score,
     breakdown: p.breakdown ?? { gc: 0, stage: 0, mountain: 0, sprint: 0 },
   }));
   ```
2. Handle backward compatibility: if breakdown is missing (old model), default to zeros
3. The adapter maps snake_case → camelCase at the boundary

**Files**: `apps/api/src/infrastructure/ml/ml-scoring.adapter.ts` (modify)
**Parallel**: Yes, alongside T011-T012.

### Subtask T017 – Update downstream consumers

**Purpose**: Propagate breakdown through use cases that consume MlPrediction.

**Steps**:

1. Find all files that import MlPrediction or use predictRace():
   - `apps/api/src/application/analyze/analyze-price-list.use-case.ts`
   - `apps/api/src/application/benchmark/run-benchmark.use-case.ts`
   - Any other consumers
2. Update each consumer to pass through or store the breakdown
3. If the consumer stores predictions in DB (ml_scores), include breakdown columns
4. If the consumer returns predictions to the frontend, include breakdown in the response DTO

**Files**: Multiple use case files (modify)

## Risks & Mitigations

- **Migration on running DB**: ALTER TABLE with defaults is non-blocking on PostgreSQL. No downtime.
- **Type mismatch**: Ensure MlBreakdown is exported from shared-types if frontend needs it (done in WP04).

## Review Guidance

- Verify migration is reversible
- Verify Drizzle schema matches migration exactly
- Verify adapter handles both old (no breakdown) and new (with breakdown) responses
- Verify domain port has no framework imports

## Activity Log

- 2026-03-29T18:00:50Z – system – lane=planned – Prompt created.
