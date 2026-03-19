---
work_package_id: WP01
title: Race Date — Schema, Entity & Repository
lane: planned
dependencies: []
subtasks:
  - T001
  - T002
  - T003
  - T004
  - T004b
  - T005
phase: Phase 0 - Foundation
assignee: ''
agent: ''
shell_pid: ''
review_status: ''
reviewed_by: ''
history:
  - timestamp: '2026-03-19T18:18:14Z'
    lane: planned
    agent: system
    shell_pid: ''
    action: Prompt generated via /spec-kitty.tasks
requirement_refs:
  - FR-001
  - FR-006
---

# Work Package Prompt: WP01 – Race Date — Schema, Entity & Repository

## ⚠️ IMPORTANT: Review Feedback Status

**Read this first if you are implementing this task!**

- **Has review feedback?**: Check the `review_status` field above. If it says `has_feedback`, scroll to the **Review Feedback** section immediately.
- **You must address all feedback** before your work is complete.
- **Mark as acknowledged**: When you understand the feedback, update `review_status: acknowledged` in the frontmatter.

---

## Review Feedback

_[This section is empty initially. Reviewers will populate it if the work is returned from review.]_

---

## Implementation Command

```bash
spec-kitty implement WP01
```

No dependencies — this is a foundation work package.

---

## Objectives & Success Criteria

- Add a `raceDate` column (DATE, nullable) to the `race_results` table via Drizzle schema.
- Propagate `raceDate` through the `RaceResult` domain entity (props, create, reconstitute, getter).
- Update the repository adapter to persist and read `raceDate`.
- Add a new `findByRiderIdsBeforeDate()` query method to the repository port and adapter.
- Generate a Drizzle migration file.

**Done when**: Migration applies cleanly. Entity accepts `raceDate`. Adapter persists and reads it. `findByRiderIdsBeforeDate` returns only results with `raceDate < cutoff`.

## Context & Constraints

- **Architecture**: DDD/Hexagonal. Domain entity must remain pure (no NestJS decorators). Port defines interface, adapter implements with Drizzle.
- **Constitution**: TypeScript strict mode, no `any` types, English only.
- **Key files** (read these first):
  - Schema: `apps/api/src/infrastructure/database/schema/race-results.ts`
  - Entity: `apps/api/src/domain/race-result/race-result.entity.ts`
  - Port: `apps/api/src/domain/race-result/race-result.repository.port.ts`
  - Adapter: `apps/api/src/infrastructure/database/race-result.repository.adapter.ts`
  - Data model: `kitty-specs/004-scoring-benchmark-harness/data-model.md`
  - Plan: `kitty-specs/004-scoring-benchmark-harness/plan.md`

---

## Subtasks & Detailed Guidance

### Subtask T001 – Add `raceDate` column to Drizzle schema

**Purpose**: Store the actual calendar date of a race or stage in the database.

**Steps**:

1. Open `apps/api/src/infrastructure/database/schema/race-results.ts`
2. Import `date` from `drizzle-orm/pg-core`
3. Add `raceDate` column to the `raceResults` table definition:

   ```typescript
   raceDate: date('race_date', { mode: 'date' }),
   ```

   - Use `{ mode: 'date' }` to get native JS `Date` objects instead of strings.
   - Do NOT add `.notNull()` — column must be nullable for migration safety.

4. Do NOT change the unique constraint — `raceDate` is not part of it.

**Files**: `apps/api/src/infrastructure/database/schema/race-results.ts`

**Notes**: The `date` type in Drizzle maps to PostgreSQL `DATE` (no time component). Using `{ mode: 'date' }` ensures the adapter receives/sends JS `Date` objects.

---

### Subtask T002 – Add `raceDate` to `RaceResult` entity

**Purpose**: The domain entity must expose the new field via its typed props interface.

**Steps**:

1. Open `apps/api/src/domain/race-result/race-result.entity.ts`
2. Add to `RaceResultProps` interface:
   ```typescript
   readonly raceDate: Date | null;
   ```
3. Add getter in `RaceResult` class:
   ```typescript
   get raceDate(): Date | null {
     return this.props.raceDate;
   }
   ```
4. Update `static create(input: Omit<RaceResultProps, 'id'>)` — no changes needed to the signature since `raceDate` is already in `RaceResultProps`. Callers will need to provide it.
5. `reconstitute` already takes full `RaceResultProps`, so it's automatically updated.

**Files**: `apps/api/src/domain/race-result/race-result.entity.ts`

**Notes**: Existing callers of `RaceResult.create()` must now include `raceDate` in the input. This will cause type errors in `TriggerScrapeUseCase` — those will be fixed in WP04. For now, pass `raceDate: null` as a temporary fix if needed to keep the build passing.

---

### Subtask T003 – Update `RaceResultRepositoryAdapter` for `raceDate`

**Purpose**: The adapter must map `raceDate` between the database row and the domain entity.

**Steps**:

1. Open `apps/api/src/infrastructure/database/race-result.repository.adapter.ts`
2. Update `toDomain()`:
   ```typescript
   private toDomain(row: typeof raceResults.$inferSelect): RaceResult {
     return RaceResult.reconstitute({
       // ... existing fields ...
       raceDate: row.raceDate ?? null,
     } satisfies RaceResultProps);
   }
   ```
3. Update `saveMany()` — add `raceDate` to the `values` object:
   ```typescript
   raceDate: props.raceDate,
   ```
4. Update `saveMany()` — add `raceDate` to the `onConflictDoUpdate.set` object so re-seeds update it:
   ```typescript
   set: {
     // ... existing fields ...
     raceDate: props.raceDate,
   },
   ```

**Files**: `apps/api/src/infrastructure/database/race-result.repository.adapter.ts`

---

### Subtask T004 – Add `findByRiderIdsBeforeDate` to port and adapter

**Purpose**: Enable querying all results for a set of riders that occurred before a given date. This is the core query for the benchmark's predicted score computation.

**Steps**:

1. Open `apps/api/src/domain/race-result/race-result.repository.port.ts`
2. Add method to `RaceResultRepositoryPort`:
   ```typescript
   findByRiderIdsBeforeDate(riderIds: string[], cutoffDate: Date): Promise<RaceResult[]>;
   ```
3. Open `apps/api/src/infrastructure/database/race-result.repository.adapter.ts`
4. Import `lt` from `drizzle-orm`
5. Implement the new method:

   ```typescript
   async findByRiderIdsBeforeDate(riderIds: string[], cutoffDate: Date): Promise<RaceResult[]> {
     if (riderIds.length === 0) return [];

     const rows = await this.db
       .select()
       .from(raceResults)
       .where(
         and(
           inArray(raceResults.riderId, riderIds),
           lt(raceResults.raceDate, cutoffDate),
         ),
       );

     return rows.map((row) => this.toDomain(row));
   }
   ```

**Files**:

- `apps/api/src/domain/race-result/race-result.repository.port.ts`
- `apps/api/src/infrastructure/database/race-result.repository.adapter.ts`

**Notes**:

- Results with `raceDate IS NULL` will NOT be included (PostgreSQL `NULL < date` evaluates to NULL/false). This is correct — we only want results with known dates.
- The `lt` operator uses strict less-than. A race on `2025-07-01` with cutoff `2025-07-01` will NOT be included (results must be from BEFORE the target race).

---

### Subtask T004b – Add `findByIds` to `RiderRepositoryPort` and adapter

**Purpose**: The benchmark use case (WP06) needs to look up rider names by ID. The existing `RiderRepositoryPort` only has `findByPcsSlugs`, not `findByIds`. Add it now alongside the other repository changes.

**Steps**:

1. Open `apps/api/src/domain/rider/rider.repository.port.ts`
2. Add method:
   ```typescript
   findByIds(ids: string[]): Promise<Rider[]>;
   ```
3. Open the rider repository adapter (find it via the port's injection token pattern)
4. Implement:
   ```typescript
   async findByIds(ids: string[]): Promise<Rider[]> {
     if (ids.length === 0) return [];
     const rows = await this.db
       .select()
       .from(riders)
       .where(inArray(riders.id, ids));
     return rows.map((row) => this.toDomain(row));
   }
   ```

**Files**:

- `apps/api/src/domain/rider/rider.repository.port.ts`
- Rider repository adapter in `apps/api/src/infrastructure/database/`

**Notes**: Simple addition — follows the exact same pattern as `findByPcsSlugs` but filters on `id` instead of `pcs_slug`.

---

### Subtask T005 – Generate Drizzle migration

**Purpose**: Create and apply the database migration for the new column.

**Steps**:

1. From `apps/api/`, run:
   ```bash
   npx drizzle-kit generate
   ```
2. Verify the generated migration SQL contains:
   ```sql
   ALTER TABLE "race_results" ADD COLUMN "race_date" date;
   ```
3. Apply the migration:
   ```bash
   npx drizzle-kit migrate
   ```
4. Verify the column exists:
   ```bash
   psql -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='race_results' AND column_name='race_date';"
   ```

**Files**: `apps/api/drizzle/migrations/` (auto-generated)

---

## Risks & Mitigations

- **Drizzle `date()` mode**: Verify `{ mode: 'date' }` is supported in your Drizzle version. If not, omit it and handle `string ↔ Date` conversion in the adapter's `toDomain()`.
- **Existing tests**: Any test that calls `RaceResult.create()` will fail until `raceDate` is added to the input. Add `raceDate: null` to all existing test fixtures in this WP.
- **Build breakage**: `TriggerScrapeUseCase.persistResults()` calls `RaceResult.create()` without `raceDate`. Add `raceDate: null` temporarily to keep the build green. WP04 will wire the actual date.

## Review Guidance

- Verify `raceDate` is nullable in the schema (no `.notNull()`).
- Verify `findByRiderIdsBeforeDate` uses strict `lt` (not `lte`).
- Verify `raceDate` is included in the upsert conflict set in `saveMany`.
- Verify no `any` types are introduced.
- Check that the migration generates cleanly.

## Activity Log

- 2026-03-19T18:18:14Z – system – lane=planned – Prompt created.
