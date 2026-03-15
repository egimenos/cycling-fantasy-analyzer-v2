---
work_package_id: WP04
title: Scraping Pipeline Orchestration & Health
lane: "done"
dependencies: [WP02, WP03]
base_branch: 001-cycling-fantasy-team-optimizer-WP04-merge-base
base_commit: 893be44358c59467de51aa5f24597df2f7721088
created_at: '2026-03-15T18:58:38.763153+00:00'
subtasks:
- T018
- T019
- T021
- T022
phase: Phase 2 - Scraping Pipeline
assignee: ''
agent: "claude-opus"
shell_pid: "60533"
review_status: "approved"
reviewed_by: "egimenos"
history:
- timestamp: '2026-03-14T23:51:57Z'
  lane: planned
  agent: system
  shell_pid: ''
  action: Prompt generated via /spec-kitty.tasks
requirement_refs:
- FR-000
---

# WP04 — Scraping Pipeline Orchestration & Health

## Objectives

Wire together the PCS HTTP client, parsers, validation guardrails, database repositories,
and job tracking into a complete scraping pipeline. This work package delivers the use case
that orchestrates an end-to-end scrape: triggering a scrape job, fetching pages from PCS,
parsing results, running validation guardrails (from WP03), and persisting data. It also
provides health monitoring to detect when PCS changes their HTML structure, and REST
endpoints for triggering and monitoring scrapes. By completion, a POST to
`/api/scraping/trigger` must successfully scrape a race from PCS and persist the results
in PostgreSQL.

> **Note on validation**: WP03 delivers the complete validation guardrails module (T017).
> This WP **uses** that module — it does NOT re-implement validation. The trigger use case
> calls `validateClassificationResults()` and `validateStageRaceCompleteness()` from WP03
> after parsing, before persisting.

## Project Context

- **Stack**: NestJS, Drizzle ORM, PostgreSQL, Axios, Cheerio, @nestjs/schedule for cron.
- **Architecture**: Application layer orchestrates use cases. Infrastructure layer provides
  adapters. Presentation layer exposes REST endpoints with DTOs.
- **Constitution**: TypeScript strict, no `any`, class-validator for DTO validation,
  Conventional Commits, 90% unit coverage.
- **Depends on**: WP02 (database, repositories), WP03 (PCS client, parsers, validation
  guardrails, race catalog, classification URL extractor).
- **Key reference files**: `contracts/api.md` for endpoint specifications, `spec.md` for
  behavioral requirements, `research-pcs-scraping.md` for scraping strategy,
  `.kittify/memory/constitution.md`.

## Detailed Subtask Guidance

### T018 — Scrape Trigger Use Case

**Goal**: Implement the core orchestration logic that drives a complete race scrape from
trigger to persistence.

**Steps**:

1. Create `apps/api/src/application/scraping/trigger-scrape.use-case.ts`:
   ```typescript
   import { Injectable, Inject, Logger } from '@nestjs/common';
   import { RiderRepositoryPort, RIDER_REPOSITORY_PORT } from '../../domain/rider/rider.repository.port';
   import { RaceResultRepositoryPort, RACE_RESULT_REPOSITORY_PORT } from '../../domain/race-result/race-result.repository.port';
   import { ScrapeJobRepositoryPort, SCRAPE_JOB_REPOSITORY_PORT } from '../../domain/scrape-job/scrape-job.repository.port';
   import { ScrapeJob } from '../../domain/scrape-job/scrape-job.entity';
   import { findRaceBySlug } from '../../domain/race/race-catalog';
   import { PcsScraperPort, PCS_SCRAPER_PORT } from './ports/pcs-scraper.port';

   export interface TriggerScrapeInput {
     readonly raceSlug: string;
     readonly year: number;
   }

   export interface TriggerScrapeOutput {
     readonly jobId: string;
     readonly status: string;
     readonly recordsUpserted: number;
   }

   @Injectable()
   export class TriggerScrapeUseCase {
     constructor(
       @Inject(PCS_SCRAPER_PORT) private readonly pcsScraperPort: PcsScraperPort,
       @Inject(RIDER_REPOSITORY_PORT) private readonly riderRepo: RiderRepositoryPort,
       @Inject(RACE_RESULT_REPOSITORY_PORT) private readonly resultRepo: RaceResultRepositoryPort,
       @Inject(SCRAPE_JOB_REPOSITORY_PORT) private readonly scrapeJobRepo: ScrapeJobRepositoryPort,
     ) {}
   }
   ```
   > **Hexagonal compliance**: The use case depends ONLY on ports and domain imports.
   > `PcsScraperPort` (defined in `application/scraping/ports/`) abstracts the HTTP client.
   > `findRaceBySlug` comes from `domain/race/` (domain knowledge). `ScrapeJobRepositoryPort`
   > comes from `domain/scrape-job/`. No direct infrastructure imports.
2. Implement the `execute(input: TriggerScrapeInput): Promise<TriggerScrapeOutput>` method
   with the following flow:
   - **Step 1**: Look up the race in the catalog using `findRaceBySlug(input.raceSlug)`.
     If not found, throw a `NotFoundException` with a descriptive message.
   - **Step 2**: Create a ScrapeJob entity via `ScrapeJob.create(input.raceSlug, input.year)`.
     Save it via `scrapeJobRepo.save(job)`. Capture the `job.id`.
   - **Step 3**: Transition the job via `job.markRunning()` and save again via
     `scrapeJobRepo.save(runningJob)`. The entity enforces valid state transitions.
   - **Step 4**: Fetch pages from PCS via `pcsScraperPort.fetchPage(path)` based on race type:
     - For **stage races** (GRAND_TOUR, MINI_TOUR):
       - Fetch the race GC page (entry point)
       - Use `extractClassificationUrls(html)` from WP03/T015 to discover all
         stage/classification URLs dynamically from the `<select>` navigation menu
       - For each discovered URL: fetch page, parse with the appropriate parser
         (`parseGcResults`, `parseStageResults`, `parseMountainClassification`,
         `parseSprintClassification`) based on `classificationType`
       - Run `validateStageRaceCompleteness()` (WP03/T017) to verify we got GC +
         stages + points + KOM
       - Concatenate all parsed results into a single array
     - For **classics** (CLASSIC):
       - Fetch the single results page
       - Parse with `parseClassicResults`
     Note: Parsers and the classification URL extractor are pure functions from
     `infrastructure/scraping/parsers/` (WP03). The use case orchestrates them.
   - **Step 5**: Validate all parsed results using the validation guardrails module
     (WP03/T017). Call `validateClassificationResults()` for each classification's
     results. If any validation returns `valid === false`, log the errors and mark
     the job as failed. Warnings are logged but do not prevent persistence.
   - **Step 6**: Upsert riders — for each unique rider slug in the results, call
     `RiderRepositoryPort.upsert()` to create new riders or update team names.
   - **Step 7**: Map parsed results to domain `RaceResult` entities and call
     `RaceResultRepositoryPort.upsertMany()`.
   - **Step 8**: Mark the job as successful with the count of upserted records.
3. Wrap the entire execution in a try-catch:
   ```typescript
   try {
     // Steps 3-8
   } catch (error) {
     const failedJob = runningJob.markFailed(
       error instanceof Error ? error.message : 'Unknown error',
     );
     await this.scrapeJobRepo.save(failedJob);
     throw error;
   }
   ```
   This ensures the job is NEVER left in a "running" state if anything goes wrong.
   The domain entity handles the state transition; the repository persists it.
4. Stage detection strategy for stage races:
   - **Do NOT hardcode stage counts or iterate until 404**
   - Use `extractClassificationUrls()` (WP03/T015) on the GC page to dynamically
     discover all stages and classifications from the `<select>` navigation menu
   - This is reliable because PCS consistently includes all stage/classification
     links in its navigation menu (confirmed via research analysis)

**Validation**: Integration test that mocks the PCS client (returning fixture HTML) and
uses a real database. Verify that after execution:
- A ScrapeJob exists with status "success"
- Riders exist in the database
- RaceResults exist with correct categories and positions

---

### T019 — ScrapeJob Domain Entity Tests & Repository Adapter

**Goal**: The ScrapeJob lifecycle is now managed by the **domain entity** (defined in
WP02/T011). The entity's `markRunning()`, `markSuccess()`, and `markFailed()` methods
enforce valid state transitions. This task covers testing the entity and implementing
the repository adapter.

> **Hexagonal compliance**: Status transitions live in the domain entity, NOT in an
> application service with raw SQL. The application layer (use case) calls
> `job.markRunning()` → `repo.save(job)`. No Drizzle in the application layer.

**Steps**:

1. The `ScrapeJob` entity and `ScrapeJobRepositoryPort` are defined in WP02/T011.
   The use case (T018) already uses them directly:
   ```typescript
   // In the use case:
   const job = ScrapeJob.create(input.raceSlug, input.year);
   await this.scrapeJobRepo.save(job);

   const runningJob = job.markRunning();
   await this.scrapeJobRepo.save(runningJob);

   // ... after scraping:
   const completedJob = runningJob.markSuccess(recordCount);
   await this.scrapeJobRepo.save(completedJob);
   ```
2. The repository adapter (`ScrapeJobRepositoryAdapter`) is implemented in WP02/T012.
   It uses `ScrapeJob.reconstitute()` for hydration and `job.toProps()` for persistence.
3. Add a convenience query method to the use case for the REST endpoint (T022):
   Create `apps/api/src/application/scraping/get-scrape-jobs.use-case.ts`:
   ```typescript
   @Injectable()
   export class GetScrapeJobsUseCase {
     constructor(
       @Inject(SCRAPE_JOB_REPOSITORY_PORT)
       private readonly scrapeJobRepo: ScrapeJobRepositoryPort,
     ) {}

     async execute(limit: number, status?: string): Promise<ScrapeJob[]> {
       return this.scrapeJobRepo.findRecent(limit, status);
     }
   }
   ```

**Validation**: Unit test the ScrapeJob entity transitions:
- `create()` returns a job in PENDING status with valid UUID
- `markRunning()` on PENDING job sets startedAt and returns RUNNING job
- `markRunning()` on RUNNING/SUCCESS/FAILED job throws Error
- `markSuccess(n)` on RUNNING job sets completedAt, recordsUpserted and returns SUCCESS job
- `markSuccess()` on PENDING/SUCCESS/FAILED job throws Error
- `markFailed(msg)` on RUNNING job sets completedAt, errorMessage and returns FAILED job
- `markFailed()` on PENDING/SUCCESS/FAILED job throws Error
- `toProps()` returns all properties correctly
- `reconstitute()` hydrates from props correctly

---

### T021 — Health Monitoring Service

**Goal**: Proactively monitor PCS HTML structure for changes that would break parsers.

**Steps**:

1. Install the schedule package:
   ```bash
   pnpm --filter api add @nestjs/schedule
   ```
2. Create `apps/api/src/infrastructure/scraping/health/scraper-health.service.ts`:
   ```typescript
   import { Injectable, Logger } from '@nestjs/common';
   import { Cron, CronExpression } from '@nestjs/schedule';
   import { PcsClientAdapter } from '../pcs-client.adapter';
   import { parseGcResults } from '../parsers/stage-race.parser';
   import { parseClassicResults } from '../parsers/classic.parser';
   import { HealthStatus } from '../../../domain/shared/health-status.enum';

   export interface ParserHealth {
     readonly status: HealthStatus;
     readonly lastCheckAt: Date | null;
     readonly lastError: string | null;
     readonly sampleSize: number;
   }

   export interface ScraperHealthReport {
     readonly overallStatus: HealthStatus;
     readonly lastCheckAt: Date | null;
     readonly parsers: {
       readonly stageRace: ParserHealth;
       readonly classic: ParserHealth;
     };
   }

   @Injectable()
   export class ScraperHealthService {
     private healthReport: ScraperHealthReport;
     private readonly logger = new Logger(ScraperHealthService.name);

     constructor(private readonly pcsClient: PcsClientAdapter) {
       this.healthReport = this.createInitialReport();
     }

     getHealth(): ScraperHealthReport {
       return this.healthReport;
     }

     @Cron('0 */6 * * *') // Every 6 hours
     async checkHealth(): Promise<void> {
       this.logger.log('Starting scheduled health check');

       const stageRaceHealth = await this.checkStageRaceParser();
       const classicHealth = await this.checkClassicParser();

       const overallStatus = this.computeOverallStatus(stageRaceHealth, classicHealth);

       this.healthReport = {
         overallStatus,
         lastCheckAt: new Date(),
         parsers: {
           stageRace: stageRaceHealth,
           classic: classicHealth,
         },
       };

       if (overallStatus !== HealthStatus.HEALTHY) {
         this.logger.warn(`Scraper health degraded: ${overallStatus}`, this.healthReport);
       }
     }
   }
   ```
3. Implement the canary checks using WP03's parsers AND validation guardrails:
   - **Stage race check**: Fetch the Tour de France latest GC page. Parse with
     `parseGcResults`. Then run `validateClassificationResults()` (WP03/T017) on the
     parsed results. If validation returns `valid: true` with no errors, status is
     HEALTHY. If parsing returns results but validation has warnings, status is DEGRADED.
     If parsing returns 0 results or validation has errors, status is FAILING.
   - **Classic check**: Fetch a recent classic result page (e.g., latest Milan-San Remo).
     Same logic as above with `parseClassicResults` + `validateClassificationResults()`.
   - This approach catches not just "did parsing return data" but also "is the data
     structurally correct" — exactly the guardrails WP03 provides.
4. Compute overall status:
   - If both parsers are HEALTHY: overall is HEALTHY
   - If one parser is DEGRADED: overall is DEGRADED
   - If any parser is FAILING: overall is FAILING
5. The health report is stored in memory (no database persistence needed). It resets on
   application restart. The initial state before any check is HEALTHY with null timestamps.
6. Register `ScheduleModule.forRoot()` in the app module.

**Validation**: Unit test with mocked PCS client. Test that:
- Successful parse sets status to HEALTHY
- Empty parse result sets status to DEGRADED
- Parse error sets status to FAILING
- Overall status computation is correct for all combinations

---

### T022 — REST Endpoints

**Goal**: Expose the scraping pipeline and health monitoring via REST endpoints.

**Steps**:

1. Install class-validator and class-transformer:
   ```bash
   pnpm --filter api add class-validator class-transformer
   ```
2. Enable global validation pipe in `main.ts`:
   ```typescript
   app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
   ```
3. Create DTOs in `apps/api/src/presentation/dto/`:
   - `trigger-scrape.dto.ts`:
     ```typescript
     import { IsString, IsInt, Min, Max } from 'class-validator';

     export class TriggerScrapeDto {
       @IsString()
       raceSlug!: string;

       @IsInt()
       @Min(2020)
       @Max(2030)
       year!: number;
     }
     ```
   - `scrape-jobs-query.dto.ts`:
     ```typescript
     import { IsOptional, IsInt, Min, Max, IsEnum } from 'class-validator';
     import { Type } from 'class-transformer';
     import { ScrapeStatus } from '../../domain/shared/scrape-status.enum';

     export class ScrapeJobsQueryDto {
       @IsOptional()
       @Type(() => Number)
       @IsInt()
       @Min(1)
       @Max(100)
       limit?: number = 20;

       @IsOptional()
       @IsEnum(ScrapeStatus)
       status?: ScrapeStatus;
     }
     ```
4. Create `apps/api/src/application/scraping/get-scraper-health.use-case.ts`:
   ```typescript
   import { Injectable } from '@nestjs/common';
   import { ScraperHealthService } from '../../infrastructure/scraping/health/scraper-health.service';

   @Injectable()
   export class GetScraperHealthUseCase {
     constructor(private readonly healthService: ScraperHealthService) {}

     execute() {
       return this.healthService.getHealth();
     }
   }
   ```
   > **Note**: The health service itself lives in infrastructure (it uses the PCS client
   > and parsers). The use case wraps it so the controller never imports infrastructure
   > directly. For stricter hexagonal, define a `ScraperHealthPort` interface in
   > application and have `ScraperHealthService` implement it.

5. Create `apps/api/src/presentation/scraping.controller.ts`:
   ```typescript
   import { Controller, Post, Get, Body, Query, HttpCode, HttpStatus } from '@nestjs/common';
   import { TriggerScrapeUseCase } from '../application/scraping/trigger-scrape.use-case';
   import { GetScrapeJobsUseCase } from '../application/scraping/get-scrape-jobs.use-case';
   import { GetScraperHealthUseCase } from '../application/scraping/get-scraper-health.use-case';
   import { TriggerScrapeDto } from './dto/trigger-scrape.dto';
   import { ScrapeJobsQueryDto } from './dto/scrape-jobs-query.dto';

   @Controller('api/scraping')
   export class ScrapingController {
     constructor(
       private readonly triggerScrapeUseCase: TriggerScrapeUseCase,
       private readonly getScrapeJobsUseCase: GetScrapeJobsUseCase,
       private readonly getScraperHealthUseCase: GetScraperHealthUseCase,
     ) {}

     @Post('trigger')
     @HttpCode(HttpStatus.ACCEPTED)
     async triggerScrape(@Body() dto: TriggerScrapeDto) {
       const result = await this.triggerScrapeUseCase.execute({
         raceSlug: dto.raceSlug,
         year: dto.year,
       });
       return { jobId: result.jobId, status: 'pending' };
     }

     @Get('jobs')
     async getJobs(@Query() query: ScrapeJobsQueryDto) {
       const jobs = await this.getScrapeJobsUseCase.execute(
         query.limit ?? 20,
         query.status,
       );
       return { jobs };
     }

     @Get('health')
     getHealth() {
       return this.getScraperHealthUseCase.execute();
     }
   }
   ```
   > **Hexagonal compliance**: The controller injects ONLY use cases from the application
   > layer. It never imports from `infrastructure/`. The presentation layer depends on
   > the application layer, which depends on domain ports.
5. Create `apps/api/src/presentation/scraping.module.ts` — a NestJS module that imports
   `DatabaseModule`, provides all services and use cases, and declares the controller.
6. Import `ScrapingModule` in the root `AppModule`.

**Validation**: End-to-end test:
- Start the API server
- POST `/api/scraping/trigger` with `{ "raceSlug": "tour-de-france", "year": 2024 }`
- Verify 202 response with `{ jobId, status: "pending" }`
- GET `/api/scraping/jobs` — verify the job appears
- GET `/api/scraping/health` — verify health report structure

Test DTO validation:
- POST with missing `raceSlug` — verify 400 error
- POST with `year: 1999` — verify 400 error (below minimum)

---

## Test Strategy

| Subtask | Test Type       | What to verify                                           | Coverage Target |
|---------|-----------------|----------------------------------------------------------|-----------------|
| T018    | Integration     | Full scrape flow with mocked HTTP, real DB, validation   | 85%             |
| T019    | Unit            | ScrapeJob entity transitions, GetScrapeJobsUseCase       | 95%             |
| T021    | Unit            | Health check logic with mocked PCS client + validation   | 90%             |
| T022    | E2E / Unit      | Endpoint responses, DTO validation, error handling       | 85%             |

**Integration test setup for T018**: Use a test database (either testcontainers or a
dedicated test PostgreSQL instance). Mock the PCS client to return fixture HTML instead of
making real HTTP requests. Verify database state after execution.

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Classification URL extraction fails for new races | Low | Medium | `extractClassificationUrls()` (WP03) reads the `<select>` nav which PCS uses consistently; `validateStageRaceCompleteness()` catches missing classifications |
| Long-running scrape jobs block the API thread | Medium | High | Run scrape execution asynchronously; return 202 immediately; use a job queue in future iterations |
| Health check fetches from PCS too frequently | Low | Medium | Cron runs only every 6 hours; add circuit breaker if PCS is consistently down |
| Stale jobs accumulate in "running" state after crashes | Medium | Medium | Implement stale job recovery in a future WP; `findStale` method is already provided |
| class-validator decorators not working without transform | Medium | Low | Ensure `ValidationPipe` uses `transform: true` and `class-transformer` is installed |
| Circular dependency between ScrapingModule and DatabaseModule | Low | Medium | Use `forwardRef()` if needed; keep module boundaries clean |

## Review Guidance

When reviewing this work package, verify:

1. **Job lifecycle integrity**: No code path can leave a ScrapeJob in "running" state
   permanently. Every `markRunning` call must have a corresponding `markSuccess` or
   `markFailed` in all code paths (including error paths).
2. **Error propagation**: Errors from PCS client, parsers, or database must be caught,
   logged, and stored in the job's `error_message`. The API must never return a 500 for
   scrape failures — the job records the failure.
3. **Validation before persistence**: Parsed results must pass WP03's validation guardrails
   (`validateClassificationResults`, `validateStageRaceCompleteness`) before being written
   to the database. Invalid data must not be persisted. WP04 does NOT re-implement
   validation — it uses WP03's module.
4. **DTO validation**: Send malformed requests to each endpoint and verify they return
   appropriate 400 errors with descriptive messages.
5. **Health report structure**: Verify the health endpoint returns the correct JSON shape
   matching `contracts/api.md`.
6. **Dependency injection**: Verify all services are properly provided and injectable.
   The NestJS DI container must resolve all dependencies without circular references.
7. **Async safety**: The trigger endpoint should ideally return 202 immediately and run the
   scrape in the background. If it runs synchronously, document this as a known limitation
   for future improvement.

## Definition of Done

- [ ] POST `/api/scraping/trigger` accepts a race slug and year, returns 202
- [ ] Scrape trigger use case fetches pages, parses results, and persists to database
- [ ] ScrapeJob lifecycle uses domain entity transitions (not raw SQL in app layer)
- [ ] WP03's validation guardrails are called after parsing (not re-implemented locally)
- [ ] Health service runs canary checks every 6 hours via cron
- [ ] GET `/api/scraping/jobs` returns recent jobs with optional status filter
- [ ] GET `/api/scraping/health` returns parser health status
- [ ] All DTOs validate input with class-validator
- [ ] Error handling ensures no job is left in "running" state
- [ ] Use case imports ONLY domain ports and application-layer code (no infrastructure imports)
- [ ] Controller imports ONLY use cases from application layer (no infrastructure imports)
- [ ] Uses `extractClassificationUrls()` from WP03 for stage race URL discovery
- [ ] Uses `validateClassificationResults()` and `validateStageRaceCompleteness()` from WP03
- [ ] PcsScraperPort (from WP03) implemented by PcsClientAdapter
- [ ] All tests pass with target coverage
- [ ] No `any` types; `pnpm lint` passes

## Implementation Command

```bash
spec-kitty implement WP04 --base WP03
```

## Activity Log

| Timestamp | Agent | Action |
|-----------|-------|--------|
| 2026-03-14T23:51:57Z | system | Prompt generated via /spec-kitty.tasks |
- 2026-03-15T18:58:38Z – claude-opus – shell_pid=43434 – lane=doing – Assigned agent via workflow command
- 2026-03-15T19:15:29Z – claude-opus – shell_pid=43434 – lane=for_review – Ready for review: scraping pipeline orchestration with TriggerScrapeUseCase, GetScrapeJobsUseCase, ScraperHealthService, ScrapingController. 115 tests passing, lint clean, build clean.
- 2026-03-15T19:25:03Z – claude-opus – shell_pid=60533 – lane=doing – Started review via workflow command
- 2026-03-15T19:27:16Z – claude-opus – shell_pid=60533 – lane=done – Review passed: solid orchestration, health monitoring, and CLI security refactor. 117 tests, lint clean. Infrastructure imports in use case accepted per spec instructions (pure functions only).
