---
work_package_id: WP02
title: Docker, Database & Hexagonal Layers
lane: "doing"
dependencies: [WP01]
base_branch: 001-cycling-fantasy-team-optimizer-WP01
base_commit: e2fd54a34106a5cffaaf529da2e09fd651770e18
created_at: '2026-03-15T12:00:28.787445+00:00'
subtasks:
- T007
- T008
- T009
- T010
- T011
- T012
phase: Phase 1 - Foundation
assignee: ''
agent: "claude-opus"
shell_pid: "69479"
review_status: ''
reviewed_by: ''
history:
- timestamp: '2026-03-14T23:51:57Z'
  lane: planned
  agent: system
  shell_pid: ''
  action: Prompt generated via /spec-kitty.tasks
requirement_refs:
- FR-000
- FR-003
---

# WP02 — Docker, Database & Hexagonal Layers

## Objectives

Establish the persistence layer for the Cycling Fantasy Team Optimizer. This work package
delivers a Docker Compose environment with PostgreSQL, Drizzle ORM schema definitions,
migration infrastructure, domain entity interfaces, repository port definitions, and
their Drizzle-based adapter implementations. By completion, running `docker compose up`
must start a healthy PostgreSQL instance, migrations must create all required tables, and
repository adapters must be able to perform full CRUD operations against the database.

## Project Context

- **Stack**: Turborepo monorepo, NestJS (backend), Drizzle ORM, PostgreSQL 16.
- **Architecture**: DDD / hexagonal — domain layer defines ports (interfaces), infrastructure
  layer provides adapters (implementations). Domain must have zero framework imports.
- **Constitution**: TypeScript strict, no `any`, Conventional Commits, 90% unit coverage.
- **Depends on**: WP01 (monorepo must be scaffolded and building).
- **Key reference files**: `data-model.md` for entity definitions, `plan.md` for architecture,
  `.kittify/memory/constitution.md` for coding standards.

## Detailed Subtask Guidance

### T007 — Docker Compose Environment

**Goal**: Provide a containerized development environment with PostgreSQL and service
orchestration.

**Steps**:

1. Create `docker-compose.yml` at the repository root:
   ```yaml
   version: "3.9"
   services:
     postgres:
       image: postgres:16-alpine
       container_name: cycling-postgres
       environment:
         POSTGRES_USER: cycling
         POSTGRES_PASSWORD: cycling
         POSTGRES_DB: cycling_analyzer
       ports:
         - "5432:5432"
       volumes:
         - postgres_data:/var/lib/postgresql/data
       healthcheck:
         test: ["CMD-SHELL", "pg_isready -U cycling -d cycling_analyzer"]
         interval: 5s
         timeout: 5s
         retries: 5

     api:
       build:
         context: .
         dockerfile: apps/api/Dockerfile
       container_name: cycling-api
       ports:
         - "3001:3001"
       environment:
         DATABASE_URL: postgresql://cycling:cycling@postgres:5432/cycling_analyzer
         NODE_ENV: development
       depends_on:
         postgres:
           condition: service_healthy

     web:
       build:
         context: .
         dockerfile: apps/web/Dockerfile
       container_name: cycling-web
       ports:
         - "3000:3000"
       depends_on:
         - api

   volumes:
     postgres_data:
   ```
2. Create `docker-compose.override.yml` for development-specific overrides:
   - Mount `apps/api/src` as a volume into the api container for hot reload
   - Mount `apps/web/src` as a volume into the web container for hot reload
   - Override command to use dev scripts instead of production builds
3. Create lightweight Dockerfiles for `apps/api/Dockerfile` and `apps/web/Dockerfile`.
   For development, these can be simple Node.js 20 Alpine images that run the dev scripts.
4. Create a `.env.example` with all required environment variables documented.
5. Add a root script: `"docker:up": "docker compose up -d"`,
   `"docker:down": "docker compose down"`.

**Validation**: `docker compose up postgres` must start PostgreSQL, and
`pg_isready -h localhost -U cycling` must succeed within 15 seconds.

**Notes**: For local development without Docker, developers should be able to point
`DATABASE_URL` to any PostgreSQL instance. The Docker setup is a convenience, not a hard
requirement for running the API.

---

### T008 — Drizzle ORM Installation & Configuration

**Goal**: Install Drizzle ORM and configure it for PostgreSQL with migration tooling.

**Steps**:

1. Install dependencies in `apps/api`:
   ```bash
   pnpm --filter api add drizzle-orm pg
   pnpm --filter api add -D drizzle-kit @types/pg
   ```
2. Create `apps/api/drizzle.config.ts`:
   ```typescript
   import { defineConfig } from 'drizzle-kit';

   export default defineConfig({
     schema: './src/infrastructure/database/schema/*.ts',
     out: './drizzle/migrations',
     dialect: 'postgresql',
     dbCredentials: {
       url: process.env.DATABASE_URL ?? 'postgresql://cycling:cycling@localhost:5432/cycling_analyzer',
     },
   });
   ```
3. Add scripts to `apps/api/package.json`:
   ```json
   {
     "db:generate": "drizzle-kit generate",
     "db:migrate": "drizzle-kit migrate",
     "db:studio": "drizzle-kit studio",
     "db:push": "drizzle-kit push"
   }
   ```
4. Create `apps/api/src/infrastructure/database/drizzle.provider.ts` that initializes
   the Drizzle client using `drizzle(pool)` and exports it as a NestJS provider.
5. Create `apps/api/src/infrastructure/database/database.module.ts` — a NestJS module
   that provides the Drizzle client for dependency injection.

**Validation**: `pnpm --filter api db:generate` must run without errors (though it will
produce no migrations until schemas exist). `drizzle-kit studio` must launch the Drizzle
Studio UI when a database is available.

---

### T009 — Drizzle Schema Definitions

**Goal**: Define the database schema for riders, race results, and scrape jobs using
Drizzle ORM's schema DSL.

**Steps**:

1. Create `apps/api/src/infrastructure/database/schema/riders.ts`:
   ```typescript
   import { pgTable, uuid, varchar, char, timestamp } from 'drizzle-orm/pg-core';

   export const riders = pgTable('riders', {
     id: uuid('id').primaryKey().defaultRandom(),
     pcsSlug: varchar('pcs_slug', { length: 255 }).notNull().unique(),
     fullName: varchar('full_name', { length: 255 }).notNull(),
     normalizedName: varchar('normalized_name', { length: 255 }).notNull(),
     currentTeam: varchar('current_team', { length: 255 }),
     nationality: char('nationality', { length: 2 }),
     lastScrapedAt: timestamp('last_scraped_at', { withTimezone: true }),
   });
   ```
2. Create `apps/api/src/infrastructure/database/schema/enums.ts` for shared PostgreSQL
   enums:
   ```typescript
   import { pgEnum } from 'drizzle-orm/pg-core';

   export const raceTypeEnum = pgEnum('race_type', ['grand_tour', 'classic', 'mini_tour']);
   export const raceClassEnum = pgEnum('race_class', ['UWT', 'Pro', '1']);
   export const resultCategoryEnum = pgEnum('result_category', ['gc', 'stage', 'mountain', 'sprint', 'final']);
   export const scrapeStatusEnum = pgEnum('scrape_status', ['pending', 'running', 'success', 'failed']);
   ```
3. Create `apps/api/src/infrastructure/database/schema/race-results.ts`:
   - Columns: `id` (uuid pk), `riderId` (uuid fk → riders.id), `raceSlug`, `raceName`,
     `raceType` (enum), `raceClass` (enum), `year` (integer), `category` (enum),
     `position` (integer, nullable), `stageNumber` (integer, nullable), `dnf` (boolean,
     default false), `scrapedAt` (timestamp with timezone)
   - Add unique constraint on `(riderId, raceSlug, year, category, stageNumber)` using
     Drizzle's `.unique()` or `uniqueIndex()`
   - Add foreign key reference to `riders.id` with `ON DELETE CASCADE`
4. Create `apps/api/src/infrastructure/database/schema/scrape-jobs.ts`:
   - Columns: `id` (uuid pk), `raceSlug`, `year` (integer), `status` (enum),
     `startedAt` (timestamp), `completedAt` (timestamp nullable), `errorMessage` (text
     nullable), `recordsUpserted` (integer, default 0)
5. Create `apps/api/src/infrastructure/database/schema/index.ts` that re-exports all
   schemas for use in `drizzle.config.ts`.

**Validation**: After generating migrations (T010), inspect the SQL to verify all columns,
types, constraints, and indexes are present and correct.

**Notes**: Use `withTimezone: true` on all timestamp columns. Use `defaultRandom()` for
UUID primary keys. Ensure `normalizedName` is computed (lowercase, ASCII-folded) — this
transformation happens in the application layer, not the database.

---

### T010 — Migration Generation & Execution

**Goal**: Generate the initial migration from the Drizzle schema and verify it runs
cleanly against PostgreSQL.

**Steps**:

1. Ensure PostgreSQL is running (via Docker Compose or locally).
2. Run migration generation:
   ```bash
   pnpm --filter api db:generate
   ```
3. Inspect the generated SQL in `apps/api/drizzle/migrations/`. Verify:
   - `CREATE TYPE` statements for all enums
   - `CREATE TABLE riders` with correct columns and constraints
   - `CREATE TABLE race_results` with foreign key and unique constraint
   - `CREATE TABLE scrape_jobs` with correct columns
4. Run the migration:
   ```bash
   pnpm --filter api db:migrate
   ```
5. Connect to the database and verify tables exist:
   ```bash
   psql postgresql://cycling:cycling@localhost:5432/cycling_analyzer -c '\dt'
   ```
6. Add a CI-friendly script that runs migrations in a fresh database for testing:
   ```json
   "db:migrate:ci": "DATABASE_URL=$TEST_DATABASE_URL drizzle-kit migrate"
   ```

**Validation**: All three tables must exist in the database with the correct schema. The
migration must be idempotent (running it twice must not error).

---

### T011 — Domain Entities, Enums, Repository Ports & ScrapeJob

**Goal**: Define the complete domain layer: enums, entities with behavior, repository ports,
and the ScrapeJob aggregate. These must have ZERO framework dependencies — no NestJS, no
Drizzle, no `@cycling-analyzer/shared-types`, no external imports. They are the innermost
ring of the hexagonal architecture.

> **DDD guidance**: Entities are NOT plain data bags (anemic model anti-pattern). They
> encapsulate behavior via methods that enforce invariants and domain rules. Use `static
> create()` for construction with validation, `static reconstitute()` for hydration from
> persistence, and domain methods for state transitions. Entities are immutable — methods
> return new instances.

**Steps**:

1. Create domain enums in `apps/api/src/domain/shared/`. These are the **canonical**
   definitions — `packages/shared-types` must duplicate or re-export them, never the
   reverse. The domain layer defines the vocabulary; external packages consume it.
   - `race-type.enum.ts`:
     ```typescript
     export enum RaceType {
       GRAND_TOUR = 'grand_tour',
       CLASSIC = 'classic',
       MINI_TOUR = 'mini_tour',
     }
     ```
   - `race-class.enum.ts`:
     ```typescript
     export enum RaceClass {
       UWT = 'UWT',
       PRO = 'Pro',
       ONE = '1',
     }
     ```
   - `result-category.enum.ts`:
     ```typescript
     export enum ResultCategory {
       GC = 'gc',
       STAGE = 'stage',
       MOUNTAIN = 'mountain',
       SPRINT = 'sprint',
       FINAL = 'final',
     }
     ```
   - `scrape-status.enum.ts`:
     ```typescript
     export enum ScrapeStatus {
       PENDING = 'pending',
       RUNNING = 'running',
       SUCCESS = 'success',
       FAILED = 'failed',
     }
     ```
   - `health-status.enum.ts`:
     ```typescript
     export enum HealthStatus {
       HEALTHY = 'healthy',
       DEGRADED = 'degraded',
       FAILING = 'failing',
     }
     ```
   - `index.ts`: re-export all enums from a single barrel file.

2. Create `apps/api/src/domain/rider/rider.entity.ts`:
   ```typescript
   export interface RiderProps {
     readonly id: string;
     readonly pcsSlug: string;
     readonly fullName: string;
     readonly normalizedName: string;
     readonly currentTeam: string | null;
     readonly nationality: string | null;
     readonly lastScrapedAt: Date | null;
   }

   export class Rider {
     private constructor(private readonly props: RiderProps) {}

     static create(input: Omit<RiderProps, 'id' | 'normalizedName'>): Rider {
       return new Rider({
         ...input,
         id: crypto.randomUUID(),
         normalizedName: Rider.normalizeName(input.fullName),
       });
     }

     static reconstitute(props: RiderProps): Rider {
       return new Rider(props);
     }

     get id(): string { return this.props.id; }
     get pcsSlug(): string { return this.props.pcsSlug; }
     get fullName(): string { return this.props.fullName; }
     get normalizedName(): string { return this.props.normalizedName; }
     get currentTeam(): string | null { return this.props.currentTeam; }
     get nationality(): string | null { return this.props.nationality; }
     get lastScrapedAt(): Date | null { return this.props.lastScrapedAt; }

     updateTeam(team: string): Rider {
       return new Rider({ ...this.props, currentTeam: team });
     }

     markScraped(at: Date = new Date()): Rider {
       return new Rider({ ...this.props, lastScrapedAt: at });
     }

     toProps(): Readonly<RiderProps> { return { ...this.props }; }

     private static normalizeName(name: string): string {
       return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
     }
   }
   ```
3. Create `apps/api/src/domain/rider/rider.repository.port.ts`:
   ```typescript
   import { Rider } from './rider.entity';

   export interface RiderRepositoryPort {
     findByPcsSlug(pcsSlug: string): Promise<Rider | null>;
     findAll(): Promise<Rider[]>;
     save(rider: Rider): Promise<void>;
   }

   export const RIDER_REPOSITORY_PORT = Symbol('RiderRepositoryPort');
   ```
   Note: Use `save()` instead of `upsert()`. The domain expresses intent ("save this
   rider"); the adapter decides whether to INSERT or UPDATE via ON CONFLICT. This keeps
   persistence semantics out of the domain contract.

4. Create `apps/api/src/domain/race-result/race-result.entity.ts`:
   ```typescript
   import { RaceType } from '../shared/race-type.enum';
   import { RaceClass } from '../shared/race-class.enum';
   import { ResultCategory } from '../shared/result-category.enum';

   export interface RaceResultProps {
     readonly id: string;
     readonly riderId: string;
     readonly raceSlug: string;
     readonly raceName: string;
     readonly raceType: RaceType;
     readonly raceClass: RaceClass;
     readonly year: number;
     readonly category: ResultCategory;
     readonly position: number | null;
     readonly stageNumber: number | null;
     readonly dnf: boolean;
     readonly scrapedAt: Date;
   }

   export class RaceResult {
     private constructor(private readonly props: RaceResultProps) {}

     static create(input: Omit<RaceResultProps, 'id'>): RaceResult {
       return new RaceResult({ ...input, id: crypto.randomUUID() });
     }

     static reconstitute(props: RaceResultProps): RaceResult {
       return new RaceResult(props);
     }

     get id(): string { return this.props.id; }
     get riderId(): string { return this.props.riderId; }
     get raceSlug(): string { return this.props.raceSlug; }
     get raceName(): string { return this.props.raceName; }
     get raceType(): RaceType { return this.props.raceType; }
     get raceClass(): RaceClass { return this.props.raceClass; }
     get year(): number { return this.props.year; }
     get category(): ResultCategory { return this.props.category; }
     get position(): number | null { return this.props.position; }
     get stageNumber(): number | null { return this.props.stageNumber; }
     get dnf(): boolean { return this.props.dnf; }
     get scrapedAt(): Date { return this.props.scrapedAt; }

     /** Returns true if this result earns scoring points (has a valid position). */
     isScoring(): boolean {
       return this.props.position !== null && this.props.position >= 1;
     }

     toProps(): Readonly<RaceResultProps> { return { ...this.props }; }
   }
   ```
5. Create `apps/api/src/domain/race-result/race-result.repository.port.ts`:
   ```typescript
   import { RaceResult } from './race-result.entity';

   export interface RaceResultRepositoryPort {
     findByRider(riderId: string): Promise<RaceResult[]>;
     findByRiderIds(riderIds: string[]): Promise<RaceResult[]>;
     findByRace(raceSlug: string, year: number): Promise<RaceResult[]>;
     saveMany(results: RaceResult[]): Promise<number>;
   }

   export const RACE_RESULT_REPOSITORY_PORT = Symbol('RaceResultRepositoryPort');
   ```
   Note: `saveMany()` replaces `upsertMany()` — same reasoning as Rider. Added
   `findByRiderIds()` for batch fetching in the analyze use case (WP06).

6. Create `apps/api/src/domain/scrape-job/scrape-job.entity.ts`:
   ```typescript
   import { ScrapeStatus } from '../shared/scrape-status.enum';

   export interface ScrapeJobProps {
     readonly id: string;
     readonly raceSlug: string;
     readonly year: number;
     readonly status: ScrapeStatus;
     readonly startedAt: Date | null;
     readonly completedAt: Date | null;
     readonly errorMessage: string | null;
     readonly recordsUpserted: number;
   }

   export class ScrapeJob {
     private constructor(private readonly props: ScrapeJobProps) {}

     static create(raceSlug: string, year: number): ScrapeJob {
       return new ScrapeJob({
         id: crypto.randomUUID(), raceSlug, year,
         status: ScrapeStatus.PENDING,
         startedAt: null, completedAt: null, errorMessage: null, recordsUpserted: 0,
       });
     }

     static reconstitute(props: ScrapeJobProps): ScrapeJob {
       return new ScrapeJob(props);
     }

     get id(): string { return this.props.id; }
     get raceSlug(): string { return this.props.raceSlug; }
     get year(): number { return this.props.year; }
     get status(): ScrapeStatus { return this.props.status; }
     get startedAt(): Date | null { return this.props.startedAt; }
     get completedAt(): Date | null { return this.props.completedAt; }
     get errorMessage(): string | null { return this.props.errorMessage; }
     get recordsUpserted(): number { return this.props.recordsUpserted; }

     markRunning(): ScrapeJob {
       if (this.props.status !== ScrapeStatus.PENDING) {
         throw new Error(`Cannot start job in '${this.props.status}' state`);
       }
       return new ScrapeJob({ ...this.props, status: ScrapeStatus.RUNNING, startedAt: new Date() });
     }

     markSuccess(recordsUpserted: number): ScrapeJob {
       if (this.props.status !== ScrapeStatus.RUNNING) {
         throw new Error(`Cannot complete job in '${this.props.status}' state`);
       }
       return new ScrapeJob({
         ...this.props, status: ScrapeStatus.SUCCESS,
         completedAt: new Date(), recordsUpserted,
       });
     }

     markFailed(error: string): ScrapeJob {
       if (this.props.status !== ScrapeStatus.RUNNING) {
         throw new Error(`Cannot fail job in '${this.props.status}' state`);
       }
       return new ScrapeJob({
         ...this.props, status: ScrapeStatus.FAILED,
         completedAt: new Date(), errorMessage: error,
       });
     }

     toProps(): Readonly<ScrapeJobProps> { return { ...this.props }; }
   }
   ```
   ScrapeJob is a **rich entity** with status transition guards. Invalid transitions
   throw errors (e.g., cannot `markSuccess` a PENDING job). The entity is immutable —
   each transition returns a new instance.

7. Create `apps/api/src/domain/scrape-job/scrape-job.repository.port.ts`:
   ```typescript
   import { ScrapeJob } from './scrape-job.entity';

   export interface ScrapeJobRepositoryPort {
     save(job: ScrapeJob): Promise<void>;
     findById(id: string): Promise<ScrapeJob | null>;
     findRecent(limit: number, status?: string): Promise<ScrapeJob[]>;
     findStale(olderThanMinutes: number): Promise<ScrapeJob[]>;
   }

   export const SCRAPE_JOB_REPOSITORY_PORT = Symbol('ScrapeJobRepositoryPort');
   ```

**Aggregate boundaries**:
- **Rider** is its own aggregate (accessed by ID, upserted independently).
- **RaceResult** is its own aggregate (referenced by riderId but managed independently —
  bulk inserts during scraping would be impractical through the Rider aggregate root).
  The FK CASCADE is a database convenience, not an aggregate boundary.
- **ScrapeJob** is its own aggregate (independent lifecycle, no FK to other entities).

**Validation**: These files must compile with `tsc --noEmit` without importing anything
from `drizzle-orm`, `@nestjs/*`, `@cycling-analyzer/shared-types`, or any infrastructure
package. Run:
```bash
grep -r "drizzle\|@nestjs\|@cycling-analyzer" apps/api/src/domain/
```
Must return zero matches. The domain layer is fully self-contained.

---

### T012 — Drizzle Repository Adapters

**Goal**: Implement all repository ports using Drizzle ORM queries. These are the
infrastructure-layer adapters that fulfill the domain contracts. Includes adapters for
Rider, RaceResult, and ScrapeJob.

**Steps**:

1. Create `apps/api/src/infrastructure/database/rider.repository.adapter.ts`:
   ```typescript
   import { Injectable, Inject } from '@nestjs/common';
   import { eq } from 'drizzle-orm';
   import { RiderRepositoryPort } from '../../domain/rider/rider.repository.port';
   import { Rider } from '../../domain/rider/rider.entity';
   import { riders } from './schema/riders';
   // ... inject Drizzle client

   @Injectable()
   export class RiderRepositoryAdapter implements RiderRepositoryPort {
     // findByPcsSlug: SELECT → Rider.reconstitute(row)
     // findAll: SELECT ORDER BY full_name → Rider.reconstitute(row)[]
     // save: INSERT ... ON CONFLICT (pcs_slug) DO UPDATE SET ...
     //   Uses rider.toProps() to extract data for persistence
   }
   ```
2. Create `apps/api/src/infrastructure/database/race-result.repository.adapter.ts`:
   - `findByRider`: SELECT with WHERE rider_id = ?, ORDER BY year DESC, race_slug → `RaceResult.reconstitute()`
   - `findByRiderIds`: SELECT with WHERE rider_id IN (...) → batch fetch for analyze use case
   - `findByRace`: SELECT with WHERE race_slug = ? AND year = ?
   - `saveMany`: Use a transaction to batch INSERT ... ON CONFLICT. Uses `result.toProps()` to
     extract data. Returns the count of affected rows.
3. Create `apps/api/src/infrastructure/database/scrape-job.repository.adapter.ts`:
   ```typescript
   import { Injectable, Inject } from '@nestjs/common';
   import { ScrapeJobRepositoryPort } from '../../domain/scrape-job/scrape-job.repository.port';
   import { ScrapeJob } from '../../domain/scrape-job/scrape-job.entity';
   // ... inject Drizzle client

   @Injectable()
   export class ScrapeJobRepositoryAdapter implements ScrapeJobRepositoryPort {
     // save: INSERT ... ON CONFLICT (id) DO UPDATE SET ... (uses job.toProps())
     // findById: SELECT → ScrapeJob.reconstitute(row)
     // findRecent: SELECT ORDER BY started_at DESC LIMIT ?
     // findStale: SELECT WHERE status = 'running' AND started_at < NOW() - interval
   }
   ```
4. Register all adapters in `DatabaseModule`:
   ```typescript
   {
     provide: RIDER_REPOSITORY_PORT,
     useClass: RiderRepositoryAdapter,
   },
   {
     provide: RACE_RESULT_REPOSITORY_PORT,
     useClass: RaceResultRepositoryAdapter,
   },
   {
     provide: SCRAPE_JOB_REPOSITORY_PORT,
     useClass: ScrapeJobRepositoryAdapter,
   },
   ```
5. All adapter methods must map between Drizzle row types and domain entity classes
   using `Entity.reconstitute()` (DB → domain) and `entity.toProps()` (domain → DB).
   Create private mapper methods if the mapping is non-trivial:
   ```typescript
   private toDomain(row: typeof riders.$inferSelect): Rider {
     return Rider.reconstitute({ ...row });
   }
   ```

**Validation**: Write integration tests in `apps/api/test/infrastructure/database/` that:
- Start a test database (use testcontainers or a dedicated test DB)
- Run migrations
- Execute each repository method and verify results
- Verify that `reconstitute → toProps` round-trips preserve all fields
- Clean up after each test

---

## Test Strategy

| Subtask | Test Type   | What to verify                                                |
|---------|-------------|---------------------------------------------------------------|
| T007    | Integration | `docker compose up postgres` starts healthy; `pg_isready` ok  |
| T008    | Integration | Drizzle config loads; `db:generate` runs without error        |
| T009    | Unit        | Schema types compile; column constraints match data-model.md  |
| T010    | Integration | Migration runs; tables exist in DB with correct columns       |
| T011    | Unit        | Domain files compile with zero external imports; entity transitions work |
| T012    | Integration | All repository adapters (Rider, RaceResult, ScrapeJob) work against real PostgreSQL |

**Coverage targets**: Domain entities and ports (T011) have no logic to test — they are
pure type definitions. Repository adapters (T012) require integration tests against a real
database. Target 90% coverage on adapter code.

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Drizzle ORM version incompatibility with PostgreSQL 16 | Low | High | Pin drizzle-orm and drizzle-kit to known working versions |
| Docker networking issues on WSL2 | Medium | Medium | Provide fallback instructions for running PostgreSQL natively |
| ON CONFLICT upsert with nullable columns in unique constraint | Medium | Medium | Use COALESCE or explicit NULL handling in the unique index |
| Migration drift between dev and CI environments | Low | Medium | Always run migrations from generated SQL, never use `db:push` in CI |
| Drizzle schema inference types not matching domain types | Medium | Low | Create explicit mapper functions; never expose Drizzle types outside adapters |

## Review Guidance

When reviewing this work package, verify:

1. **Docker health**: Run `docker compose up -d postgres && docker compose ps`. The
   postgres container must show as "healthy".
2. **Schema correctness**: Compare Drizzle schema definitions against `data-model.md`.
   Every column, type, and constraint must match.
3. **Migration SQL**: Read the generated migration SQL. Verify enum types, foreign keys,
   unique constraints, and default values.
4. **Domain purity**: Run `grep -r "drizzle\|@nestjs\|pg\|@cycling-analyzer" apps/api/src/domain/`.
   Must return zero results. The domain layer must be fully self-contained — no framework
   deps, no shared-types imports.
5. **Adapter completeness**: Every method declared in a repository port must be implemented
   in the corresponding adapter with correct SQL behavior.
6. **Upsert behavior**: The race-result upsert must use ON CONFLICT with the correct
   composite key and update only mutable fields (position, dnf, scrapedAt).

## Definition of Done

- [ ] `docker compose up` starts PostgreSQL, API, and Web services
- [ ] PostgreSQL health check passes within 15 seconds
- [ ] Drizzle schema files define all tables from `data-model.md`
- [ ] `pnpm --filter api db:generate` produces a valid migration
- [ ] `pnpm --filter api db:migrate` applies the migration successfully
- [ ] Domain enums defined in `domain/shared/` (canonical definitions)
- [ ] Domain entities are classes with `create()`, `reconstitute()`, `toProps()`, and domain methods
- [ ] ScrapeJob entity has status transition guards (`markRunning/markSuccess/markFailed`)
- [ ] ScrapeJobRepositoryPort defined in `domain/scrape-job/`
- [ ] Domain layer has zero imports from `@nestjs`, `drizzle-orm`, or `@cycling-analyzer/shared-types`
- [ ] Repository adapters implement all port methods (Rider, RaceResult, ScrapeJob)
- [ ] Adapters use `Entity.reconstitute()` / `entity.toProps()` for mapping
- [ ] Save operations use ON CONFLICT correctly
- [ ] Integration tests for all repository adapters pass against real PostgreSQL
- [ ] All code passes `pnpm lint` with zero errors

## Implementation Command

```bash
spec-kitty implement WP02 --base WP01
```

## Activity Log

| Timestamp | Agent | Action |
|-----------|-------|--------|
| 2026-03-14T23:51:57Z | system | Prompt generated via /spec-kitty.tasks |
- 2026-03-15T12:00:28Z – claude-opus – shell_pid=46060 – lane=doing – Assigned agent via workflow command
- 2026-03-15T12:17:02Z – claude-opus – shell_pid=46060 – lane=for_review – Ready for review: Docker Compose, Drizzle schema + migration, domain entities with state guards, repository ports/adapters, DatabaseModule, 18 unit tests passing, lint clean, domain purity verified
- 2026-03-15T12:19:05Z – claude-opus – shell_pid=69479 – lane=doing – Started review via workflow command
