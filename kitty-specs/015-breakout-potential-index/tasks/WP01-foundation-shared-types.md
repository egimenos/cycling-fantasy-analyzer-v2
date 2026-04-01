---
work_package_id: WP01
title: Foundation — Shared Types & Rider Entity
lane: 'done'
dependencies: []
base_branch: 015-breakout-potential-index
base_commit: 6f339c0ca2e0d250bb1c1c1f9ec1b84466d8b073
created_at: '2026-04-01T18:14:17.508026+00:00'
subtasks:
  - T001
  - T002
  - T003
phase: Phase 0 - Foundation
assignee: ''
agent: 'claude-opus'
shell_pid: '42200'
review_status: 'approved'
reviewed_by: 'egimenos'
history:
  - timestamp: '2026-04-01T17:57:39Z'
    lane: planned
    agent: system
    shell_pid: ''
    action: Prompt generated via /spec-kitty.tasks
requirement_refs:
  - FR-004
  - FR-006
---

# Work Package Prompt: WP01 – Foundation — Shared Types & Rider Entity

## Objectives & Success Criteria

- Add `BreakoutFlag`, `BreakoutSignals`, and `BreakoutResult` types to the shared-types package
- Add `breakout: BreakoutResult | null` field to the existing `AnalyzedRider` interface
- Expose `birthDate` from the rider domain entity (already in DB, not yet mapped)
- **Success**: `tsc --noEmit` passes across all packages. New types are importable. Rider queries include `birthDate`.

## Context & Constraints

- **Spec**: `kitty-specs/015-breakout-potential-index/spec.md`
- **Data model**: `kitty-specs/015-breakout-potential-index/data-model.md`
- **Contract**: `kitty-specs/015-breakout-potential-index/contracts/analyze-response.schema.ts`
- **Constitution**: DDD/Hexagonal architecture. Domain entities must not depend on framework. TypeScript strict mode, no `any`.
- **Key constraint**: No database migration needed — `birth_date` column already exists in `riders` table.

## Implementation Command

```bash
spec-kitty implement WP01
```

## Subtasks & Detailed Guidance

### Subtask T001 – Add BPI types to shared-types

**Purpose**: Establish the type contract that backend and frontend will share for breakout data.

**Steps**:

1. Open `packages/shared-types/src/api.ts`
2. Add the `BreakoutFlag` enum:
   ```typescript
   export enum BreakoutFlag {
     EmergingTalent = 'EMERGING_TALENT',
     HotStreak = 'HOT_STREAK',
     DeepValue = 'DEEP_VALUE',
     CeilingPlay = 'CEILING_PLAY',
     SprintOpportunity = 'SPRINT_OPPORTUNITY',
     BreakawayHunter = 'BREAKAWAY_HUNTER',
   }
   ```
3. Add the `BreakoutSignals` interface:
   ```typescript
   export interface BreakoutSignals {
     readonly trajectory: number; // 0-25
     readonly recency: number; // 0-25
     readonly ceiling: number; // 0-20
     readonly routeFit: number; // 0-15
     readonly variance: number; // 0-15
   }
   ```
4. Add the `BreakoutResult` interface:
   ```typescript
   export interface BreakoutResult {
     readonly index: number; // 0-100
     readonly upsideP80: number;
     readonly flags: readonly BreakoutFlag[];
     readonly signals: BreakoutSignals;
   }
   ```
5. Add `breakout: BreakoutResult | null` to the existing `AnalyzedRider` interface — place it after `mlBreakdown`.

**Files**:

- `packages/shared-types/src/api.ts` (modify)

**Parallel?**: Yes — different package from T002/T003.

**Notes**:

- Use `readonly` on all fields to enforce immutability (per constitution).
- The `BreakoutFlag` enum uses PascalCase members per naming conventions.
- Ensure the enum and interfaces are exported.

### Subtask T002 – Extend RiderProps with birthDate

**Purpose**: Make `birthDate` available in the domain layer so BPI can compute age-dependent signals.

**Steps**:

1. Open `apps/api/src/domain/rider/rider.entity.ts`
2. Add `readonly birthDate: Date | null` to the `RiderProps` interface
3. Verify `Rider.reconstitute()` (or the constructor) passes `birthDate` through to the internal props — check how other nullable fields like `nationality` are handled and follow the same pattern
4. If the `Rider` class has getter methods for each prop, add a `get birthDate(): Date | null` getter

**Files**:

- `apps/api/src/domain/rider/rider.entity.ts` (modify)

**Parallel?**: Yes — can proceed alongside T001.

**Notes**:

- The `Rider` entity may use a factory method or direct constructor. Follow the existing reconstitution pattern exactly.
- `birthDate` is nullable because some riders may not have been scraped with birth info yet.

### Subtask T003 – Update RiderRepositoryAdapter to map birthDate

**Purpose**: Wire the existing `birth_date` DB column through to the domain entity.

**Steps**:

1. Open `apps/api/src/infrastructure/database/rider.repository.adapter.ts`
2. Find the `toDomain()` private method (maps DB rows to `Rider` domain entities)
3. Add `birthDate: row.birthDate` to the `Rider.reconstitute()` call — it should already be available via Drizzle's type inference since `birthDate` is defined in the schema
4. Verify the Drizzle schema at `apps/api/src/infrastructure/database/schema/riders.ts` — confirm `birthDate: date('birth_date', { mode: 'date' })` exists (it should)

**Files**:

- `apps/api/src/infrastructure/database/rider.repository.adapter.ts` (modify)

**Parallel?**: No — depends on T002 (RiderProps must include birthDate first).

**Notes**:

- The `birthDate` in Drizzle schema uses `mode: 'date'`, so it returns a JavaScript `Date` object (or `null`).
- No migration needed — the column already exists and is populated by the scraping pipeline.

## Risks & Mitigations

- **Type mismatch**: If Drizzle's inferred type for `birthDate` differs from `Date | null`, the TypeScript compiler will catch it at `tsc --noEmit`.
- **Existing tests**: Adding a new required field to `RiderProps` may break existing tests that create `Rider` instances without `birthDate`. Search for `Rider.reconstitute` in test files and add `birthDate: null` to those fixtures.

## Review Guidance

- Verify `BreakoutFlag` enum values match the spec exactly (uppercase with underscores).
- Verify `BreakoutResult` is `readonly` throughout.
- Verify `AnalyzedRider.breakout` is typed as `BreakoutResult | null` (not optional `?`).
- Verify `birthDate` flows from DB → adapter → domain entity without transformation.
- Run `npx turbo build` to confirm no compilation errors across the monorepo.

## Activity Log

- 2026-04-01T17:57:39Z – system – lane=planned – Prompt created.
- 2026-04-01T18:14:18Z – claude-opus – shell_pid=17711 – lane=doing – Assigned agent via workflow command
- 2026-04-01T18:20:47Z – claude-opus – shell_pid=17711 – lane=for_review – Ready for review: shared types + birthDate entity + adapter + all test fixtures updated
- 2026-04-01T18:40:01Z – claude-opus – shell_pid=42200 – lane=doing – Started review via workflow command
- 2026-04-01T18:40:19Z – claude-opus – shell_pid=42200 – lane=done – Review passed: types correct (readonly, PascalCase enum), birthDate flows DB→adapter→entity, all fixtures updated, build clean
