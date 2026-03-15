---
work_package_id: WP02
title: Docker, Database & Hexagonal Layers
lane: planned
dependencies: [WP01]
subtasks:
- T007
- T008
- T009
- T010
- T011
- T012
phase: Phase 1 - Foundation
assignee: ''
agent: ''
shell_pid: ''
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

### T011 — Domain Entities & Repository Ports

**Goal**: Define pure domain interfaces for entities and repository ports. These must have
ZERO framework dependencies — no NestJS, no Drizzle, no external imports. They are the
innermost ring of the hexagonal architecture.

**Steps**:

1. Create `apps/api/src/domain/rider/rider.entity.ts`:
   ```typescript
   export interface Rider {
     readonly id: string;
     readonly pcsSlug: string;
     readonly fullName: string;
     readonly normalizedName: string;
     readonly currentTeam: string | null;
     readonly nationality: string | null;
     readonly lastScrapedAt: Date | null;
   }
   ```
2. Create `apps/api/src/domain/rider/rider.repository.port.ts`:
   ```typescript
   import { Rider } from './rider.entity';

   export interface RiderRepositoryPort {
     findByPcsSlug(pcsSlug: string): Promise<Rider | null>;
     findAll(): Promise<Rider[]>;
     upsert(rider: Omit<Rider, 'id'>): Promise<Rider>;
   }

   export const RIDER_REPOSITORY_PORT = Symbol('RiderRepositoryPort');
   ```
3. Create `apps/api/src/domain/race-result/race-result.entity.ts`:
   ```typescript
   import { RaceType, RaceClass, ResultCategory } from '@cycling-analyzer/shared-types';

   export interface RaceResult {
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
   ```
4. Create `apps/api/src/domain/race-result/race-result.repository.port.ts`:
   ```typescript
   import { RaceResult } from './race-result.entity';

   export interface RaceResultRepositoryPort {
     findByRider(riderId: string): Promise<RaceResult[]>;
     findByRace(raceSlug: string, year: number): Promise<RaceResult[]>;
     upsert(result: Omit<RaceResult, 'id'>): Promise<RaceResult>;
     upsertMany(results: Omit<RaceResult, 'id'>[]): Promise<number>;
   }

   export const RACE_RESULT_REPOSITORY_PORT = Symbol('RaceResultRepositoryPort');
   ```
5. Create `apps/api/src/domain/race-result/race-type.enum.ts` that re-exports enums from
   shared-types for domain convenience. This keeps the domain layer importable without
   reaching into infrastructure.

**Validation**: These files must compile with `tsc --noEmit` without importing anything
from `drizzle-orm`, `@nestjs/*`, or any infrastructure package. Run
`grep -r "drizzle\|@nestjs" apps/api/src/domain/` — must return zero matches.

---

### T012 — Drizzle Repository Adapters

**Goal**: Implement the repository ports using Drizzle ORM queries. These are the
infrastructure-layer adapters that fulfill the domain contracts.

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
     // findByPcsSlug: SELECT * FROM riders WHERE pcs_slug = ?
     // findAll: SELECT * FROM riders ORDER BY full_name
     // upsert: INSERT ... ON CONFLICT (pcs_slug) DO UPDATE SET ...
   }
   ```
2. Create `apps/api/src/infrastructure/database/race-result.repository.adapter.ts`:
   - `findByRider`: SELECT with WHERE rider_id = ?, ORDER BY year DESC, race_slug
   - `findByRace`: SELECT with WHERE race_slug = ? AND year = ?
   - `upsert`: INSERT ... ON CONFLICT (rider_id, race_slug, year, category, stage_number)
     DO UPDATE SET position, dnf, scraped_at
   - `upsertMany`: Use a transaction to batch upsert. Iterate over results and call
     individual upserts within a single transaction. Return the count of affected rows.
3. Register adapters in `DatabaseModule`:
   ```typescript
   {
     provide: RIDER_REPOSITORY_PORT,
     useClass: RiderRepositoryAdapter,
   }
   ```
4. Ensure all adapter methods map between Drizzle row types and domain entity types.
   Create private mapper methods if needed: `private toDomain(row: typeof riders.$inferSelect): Rider`

**Validation**: Write integration tests in `apps/api/test/infrastructure/database/` that:
- Start a test database (use testcontainers or a dedicated test DB)
- Run migrations
- Execute each repository method and verify results
- Clean up after each test

---

## Test Strategy

| Subtask | Test Type   | What to verify                                                |
|---------|-------------|---------------------------------------------------------------|
| T007    | Integration | `docker compose up postgres` starts healthy; `pg_isready` ok  |
| T008    | Integration | Drizzle config loads; `db:generate` runs without error        |
| T009    | Unit        | Schema types compile; column constraints match data-model.md  |
| T010    | Integration | Migration runs; tables exist in DB with correct columns       |
| T011    | Unit        | Domain files compile with zero infrastructure imports         |
| T012    | Integration | Repository CRUD operations work against real PostgreSQL       |

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
4. **Domain purity**: Run `grep -r "drizzle\|@nestjs\|pg" apps/api/src/domain/`. Must
   return zero results. The domain layer must be framework-agnostic.
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
- [ ] Domain entities and ports have zero infrastructure dependencies
- [ ] Repository adapters implement all port methods
- [ ] Upsert operations use ON CONFLICT correctly
- [ ] Integration tests for repository adapters pass against real PostgreSQL
- [ ] All code passes `pnpm lint` with zero errors

## Implementation Command

```bash
spec-kitty implement WP02 --base WP01
```

## Activity Log

| Timestamp | Agent | Action |
|-----------|-------|--------|
| 2026-03-14T23:51:57Z | system | Prompt generated via /spec-kitty.tasks |
