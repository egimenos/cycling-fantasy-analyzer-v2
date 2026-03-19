---
work_package_id: WP02
title: Startlist — Schema, Entity & Repository
lane: planned
dependencies: []
subtasks:
  - T006
  - T007
  - T008
  - T009
  - T010
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
  - FR-004
  - FR-012
---

# Work Package Prompt: WP02 – Startlist — Schema, Entity & Repository

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
spec-kitty implement WP02
```

No dependencies — this is a foundation work package.

---

## Objectives & Success Criteria

- Create a new `startlist_entries` table via Drizzle schema.
- Create the `StartlistEntry` domain entity.
- Define the `StartlistRepositoryPort` interface.
- Implement `StartlistRepositoryAdapter` with Drizzle.
- Generate and apply migration.

**Done when**: Migration applies. Entries can be saved and retrieved by race. Unique constraint prevents duplicate rider+race entries. `existsForRace` correctly detects existing startlists.

## Context & Constraints

- **Architecture**: DDD/Hexagonal. Entity in domain layer, port in domain layer, adapter in infrastructure.
- **Constitution**: TypeScript strict, no `any`, English only.
- **Key references**:
  - Existing entity pattern: `apps/api/src/domain/race-result/race-result.entity.ts`
  - Existing port pattern: `apps/api/src/domain/race-result/race-result.repository.port.ts`
  - Existing adapter pattern: `apps/api/src/infrastructure/database/race-result.repository.adapter.ts`
  - Existing schema pattern: `apps/api/src/infrastructure/database/schema/race-results.ts`
  - Data model: `kitty-specs/004-scoring-benchmark-harness/data-model.md`

---

## Subtasks & Detailed Guidance

### Subtask T006 – Create `startlist-entries.ts` Drizzle schema

**Purpose**: Define the database table for storing race startlists.

**Steps**:

1. Create `apps/api/src/infrastructure/database/schema/startlist-entries.ts`
2. Define the table:

   ```typescript
   import { pgTable, uuid, varchar, integer, timestamp, unique, index } from 'drizzle-orm/pg-core';
   import { riders } from './riders';

   export const startlistEntries = pgTable(
     'startlist_entries',
     {
       id: uuid('id').primaryKey().defaultRandom(),
       raceSlug: varchar('race_slug', { length: 255 }).notNull(),
       year: integer('year').notNull(),
       riderId: uuid('rider_id')
         .notNull()
         .references(() => riders.id, { onDelete: 'cascade' }),
       teamName: varchar('team_name', { length: 255 }),
       bibNumber: integer('bib_number'),
       scrapedAt: timestamp('scraped_at', { withTimezone: true }).notNull().defaultNow(),
     },
     (table) => [
       unique('startlist_entries_unique').on(table.raceSlug, table.year, table.riderId),
       index('startlist_entries_race_idx').on(table.raceSlug, table.year),
     ],
   );
   ```

**Files**: `apps/api/src/infrastructure/database/schema/startlist-entries.ts` (new)

**Notes**: Follow the exact pattern from `race-results.ts` for constraint syntax. The composite index on `(raceSlug, year)` accelerates `findByRace` queries.

---

### Subtask T007 – Export from `schema/index.ts` and generate migration

**Purpose**: Make the new schema visible to Drizzle and generate the migration.

**Steps**:

1. Open `apps/api/src/infrastructure/database/schema/index.ts`
2. Add export:
   ```typescript
   export { startlistEntries } from './startlist-entries';
   ```
3. From `apps/api/`, generate migration:
   ```bash
   npx drizzle-kit generate
   ```
4. Verify the migration SQL creates the table with correct constraints.
5. Apply:
   ```bash
   npx drizzle-kit migrate
   ```

**Files**:

- `apps/api/src/infrastructure/database/schema/index.ts`
- `apps/api/drizzle/migrations/` (auto-generated)

**Notes**: If WP01 migration was already generated, this generates a separate sequential migration file. That's correct — Drizzle handles ordering.

---

### Subtask T008 – Create `StartlistEntry` domain entity

**Purpose**: Domain entity representing a rider's presence on a race startlist.

**Steps**:

1. Create directory: `apps/api/src/domain/startlist/`
2. Create `apps/api/src/domain/startlist/startlist-entry.entity.ts`:

   ```typescript
   import { randomUUID } from 'node:crypto';

   export interface StartlistEntryProps {
     readonly id: string;
     readonly raceSlug: string;
     readonly year: number;
     readonly riderId: string;
     readonly teamName: string | null;
     readonly bibNumber: number | null;
     readonly scrapedAt: Date;
   }

   export class StartlistEntry {
     private constructor(private readonly props: StartlistEntryProps) {}

     static create(input: Omit<StartlistEntryProps, 'id'>): StartlistEntry {
       return new StartlistEntry({ ...input, id: randomUUID() });
     }

     static reconstitute(props: StartlistEntryProps): StartlistEntry {
       return new StartlistEntry(props);
     }

     get id(): string {
       return this.props.id;
     }
     get raceSlug(): string {
       return this.props.raceSlug;
     }
     get year(): number {
       return this.props.year;
     }
     get riderId(): string {
       return this.props.riderId;
     }
     get teamName(): string | null {
       return this.props.teamName;
     }
     get bibNumber(): number | null {
       return this.props.bibNumber;
     }
     get scrapedAt(): Date {
       return this.props.scrapedAt;
     }

     toProps(): Readonly<StartlistEntryProps> {
       return { ...this.props };
     }
   }
   ```

**Files**: `apps/api/src/domain/startlist/startlist-entry.entity.ts` (new)

**Notes**: Follow exact pattern from `RaceResult` entity. Private constructor, static factories, readonly props.

---

### Subtask T009 – Create `StartlistRepositoryPort`

**Purpose**: Define the port interface for startlist persistence (domain layer, no framework deps).

**Steps**:

1. Create `apps/api/src/domain/startlist/startlist.repository.port.ts`:

   ```typescript
   import { StartlistEntry } from './startlist-entry.entity';

   export interface StartlistRepositoryPort {
     findByRace(raceSlug: string, year: number): Promise<StartlistEntry[]>;
     existsForRace(raceSlug: string, year: number): Promise<boolean>;
     saveMany(entries: StartlistEntry[]): Promise<number>;
   }

   export const STARTLIST_REPOSITORY_PORT = Symbol('StartlistRepositoryPort');
   ```

**Files**: `apps/api/src/domain/startlist/startlist.repository.port.ts` (new)

**Notes**: Symbol injection token follows existing pattern (`RACE_RESULT_REPOSITORY_PORT`).

---

### Subtask T010 – Create `StartlistRepositoryAdapter`

**Purpose**: Drizzle ORM implementation of the startlist repository port.

**Steps**:

1. Create `apps/api/src/infrastructure/database/startlist.repository.adapter.ts`
2. Implement all three methods:

   ```typescript
   import { Injectable, Inject } from '@nestjs/common';
   import { eq, and } from 'drizzle-orm';
   import { StartlistRepositoryPort } from '../../domain/startlist/startlist.repository.port';
   import {
     StartlistEntry,
     StartlistEntryProps,
   } from '../../domain/startlist/startlist-entry.entity';
   import { startlistEntries } from './schema/startlist-entries';
   import { DRIZZLE, DrizzleDatabase } from './drizzle.provider';

   @Injectable()
   export class StartlistRepositoryAdapter implements StartlistRepositoryPort {
     constructor(@Inject(DRIZZLE) private readonly db: DrizzleDatabase) {}

     async findByRace(raceSlug: string, year: number): Promise<StartlistEntry[]> {
       const rows = await this.db
         .select()
         .from(startlistEntries)
         .where(and(eq(startlistEntries.raceSlug, raceSlug), eq(startlistEntries.year, year)));
       return rows.map((row) => this.toDomain(row));
     }

     async existsForRace(raceSlug: string, year: number): Promise<boolean> {
       const rows = await this.db
         .select({ id: startlistEntries.id })
         .from(startlistEntries)
         .where(and(eq(startlistEntries.raceSlug, raceSlug), eq(startlistEntries.year, year)))
         .limit(1);
       return rows.length > 0;
     }

     async saveMany(entries: StartlistEntry[]): Promise<number> {
       if (entries.length === 0) return 0;
       let count = 0;
       await this.db.transaction(async (tx) => {
         for (const entry of entries) {
           const props = entry.toProps();
           await tx
             .insert(startlistEntries)
             .values({
               id: props.id,
               raceSlug: props.raceSlug,
               year: props.year,
               riderId: props.riderId,
               teamName: props.teamName,
               bibNumber: props.bibNumber,
               scrapedAt: props.scrapedAt,
             })
             .onConflictDoUpdate({
               target: [startlistEntries.raceSlug, startlistEntries.year, startlistEntries.riderId],
               set: {
                 teamName: props.teamName,
                 bibNumber: props.bibNumber,
                 scrapedAt: props.scrapedAt,
               },
             });
           count++;
         }
       });
       return count;
     }

     private toDomain(row: typeof startlistEntries.$inferSelect): StartlistEntry {
       return StartlistEntry.reconstitute({
         id: row.id,
         raceSlug: row.raceSlug,
         year: row.year,
         riderId: row.riderId,
         teamName: row.teamName,
         bibNumber: row.bibNumber,
         scrapedAt: row.scrapedAt,
       } satisfies StartlistEntryProps);
     }
   }
   ```

**Files**: `apps/api/src/infrastructure/database/startlist.repository.adapter.ts` (new)

**Notes**: `saveMany` uses upsert (onConflictDoUpdate) so re-scraping the same startlist updates fields gracefully.

---

## Risks & Mitigations

- **DrizzleDatabase type**: The `DrizzleDatabase` type may need the new `startlistEntries` schema added to its type definition. Check `drizzle.provider.ts` to see if it uses a dynamic type or explicit table list.
- **Migration ordering**: If WP01 and WP02 generate migrations in separate worktrees, they may have conflicting sequence numbers. This is resolved during merge — Drizzle handles migration ordering by filename timestamp.

## Review Guidance

- Verify unique constraint is on `(raceSlug, year, riderId)` — not just `(raceSlug, year)`.
- Verify `existsForRace` uses `LIMIT 1` for efficiency.
- Verify `saveMany` uses upsert, not insert-only.
- Verify entity follows existing `RaceResult` pattern exactly.
- No `any` types anywhere.

## Activity Log

- 2026-03-19T18:18:14Z – system – lane=planned – Prompt created.
