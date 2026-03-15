---
work_package_id: WP04
title: Scraping Pipeline Orchestration & Health
lane: planned
dependencies: [WP02, WP03]
subtasks:
- T018
- T019
- T020
- T021
- T022
phase: Phase 2 - Scraping Pipeline
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
---

# WP04 — Scraping Pipeline Orchestration & Health

## Objectives

Wire together the PCS HTTP client, parsers, database repositories, and job tracking into a
complete scraping pipeline. This work package delivers the use case that orchestrates an
end-to-end scrape: triggering a scrape job, fetching pages from PCS, parsing results,
validating output, and persisting data. It also provides health monitoring to detect when
PCS changes their HTML structure, and REST endpoints for triggering and monitoring scrapes.
By completion, a POST to `/api/scraping/trigger` must successfully scrape a race from PCS
and persist the results in PostgreSQL.

## Project Context

- **Stack**: NestJS, Drizzle ORM, PostgreSQL, Axios, Cheerio, @nestjs/schedule for cron.
- **Architecture**: Application layer orchestrates use cases. Infrastructure layer provides
  adapters. Presentation layer exposes REST endpoints with DTOs.
- **Constitution**: TypeScript strict, no `any`, class-validator for DTO validation,
  Conventional Commits, 90% unit coverage.
- **Depends on**: WP02 (database, repositories), WP03 (PCS client, parsers, catalog).
- **Key reference files**: `contracts/api.md` for endpoint specifications, `spec.md` for
  behavioral requirements, `.kittify/memory/constitution.md`.

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
   import { PcsClientAdapter } from '../../infrastructure/scraping/pcs-client.adapter';
   import { findRaceBySlug } from '../../infrastructure/scraping/race-catalog';
   import { ScrapeJobService } from './scrape-job.service';

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
     // Constructor injects all dependencies
   }
   ```
2. Implement the `execute(input: TriggerScrapeInput): Promise<TriggerScrapeOutput>` method
   with the following flow:
   - **Step 1**: Look up the race in the catalog using `findRaceBySlug(input.raceSlug)`.
     If not found, throw a `NotFoundException` with a descriptive message.
   - **Step 2**: Create a ScrapeJob via `ScrapeJobService.create(input.raceSlug, input.year)`.
     Capture the returned `jobId`.
   - **Step 3**: Mark the job as running via `ScrapeJobService.markRunning(jobId)`.
   - **Step 4**: Fetch pages from PCS based on race type:
     - For **stage races** (GRAND_TOUR, MINI_TOUR):
       - Fetch the race overview page to detect the number of stages
       - For each stage: fetch stage results page, parse with `parseStageResults`
       - Fetch GC page, parse with `parseGcResults`
       - Fetch mountain classification page, parse with `parseMountainClassification`
       - Fetch sprint classification page, parse with `parseSprintClassification`
       - Concatenate all parsed results into a single array
     - For **classics** (CLASSIC):
       - Fetch the single results page
       - Parse with `parseClassicResults`
   - **Step 5**: Validate all parsed results using the shape validator (T020). If validation
     fails, log the errors and mark the job as failed.
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
     await this.scrapeJobService.markFailed(jobId, error instanceof Error ? error.message : 'Unknown error');
     throw error;
   }
   ```
   This ensures the job is NEVER left in a "running" state if anything goes wrong.
4. Stage detection strategy for stage races:
   - Fetch `race/{slug}/{year}` overview page
   - Parse the stage list from the sidebar or stages navigation
   - Alternatively, try stages 1 through N and stop when a 404 is received
   - The stage count varies: Grand Tours have 21, mini-tours have 5-8

**Validation**: Integration test that mocks the PCS client (returning fixture HTML) and
uses a real database. Verify that after execution:
- A ScrapeJob exists with status "success"
- Riders exist in the database
- RaceResults exist with correct categories and positions

---

### T019 — ScrapeJob Lifecycle Service

**Goal**: Manage the lifecycle of scrape job records with atomic status transitions.

**Steps**:

1. Create `apps/api/src/application/scraping/scrape-job.service.ts`:
   ```typescript
   import { Injectable, Inject } from '@nestjs/common';

   @Injectable()
   export class ScrapeJobService {
     async create(raceSlug: string, year: number): Promise<string> {
       // INSERT INTO scrape_jobs (race_slug, year, status) VALUES (?, ?, 'pending')
       // RETURN id
     }

     async markRunning(jobId: string): Promise<void> {
       // UPDATE scrape_jobs SET status = 'running', started_at = NOW() WHERE id = ?
     }

     async markSuccess(jobId: string, recordCount: number): Promise<void> {
       // UPDATE scrape_jobs SET status = 'success', completed_at = NOW(),
       //   records_upserted = ? WHERE id = ?
     }

     async markFailed(jobId: string, error: string): Promise<void> {
       // UPDATE scrape_jobs SET status = 'failed', completed_at = NOW(),
       //   error_message = ? WHERE id = ?
     }

     async findRecent(limit: number, status?: string): Promise<ScrapeJob[]> {
       // SELECT * FROM scrape_jobs WHERE status = ? ORDER BY started_at DESC LIMIT ?
     }
   }
   ```
2. Use Drizzle ORM queries directly in this service (it lives in the application layer but
   depends on infrastructure for persistence — this is an acceptable pragmatic compromise).
   Alternatively, create a ScrapeJobRepositoryPort in the domain layer.
3. Use database transactions for atomic status updates. Ensure that `markRunning` only
   transitions from "pending" status, and `markSuccess`/`markFailed` only transition from
   "running" status. If the current status does not match, log a warning and skip.
4. Add a method `findStale(olderThanMinutes: number): Promise<ScrapeJob[]>` to find jobs
   stuck in "running" state for too long. This supports future recovery logic.

**Validation**: Unit test all status transitions. Verify that:
- `create` returns a valid UUID
- `markRunning` sets started_at
- `markSuccess` sets completed_at and records_upserted
- `markFailed` sets error_message
- Stale job detection finds jobs older than the threshold

---

### T020 — Shape Validator

**Goal**: Validate parsed results before persisting them to catch parser regressions early.

**Steps**:

1. Create `apps/api/src/infrastructure/scraping/health/html-shape-validator.ts`:
   ```typescript
   import { ParsedResult } from '../parsers/parsed-result.type';

   export interface ValidationResult {
     readonly valid: boolean;
     readonly errors: string[];
     readonly warnings: string[];
   }

   export function validateParsedResults(results: ParsedResult[]): ValidationResult {
     const errors: string[] = [];
     const warnings: string[] = [];

     // Check 1: Results array is not empty
     if (results.length === 0) {
       errors.push('Parsed results array is empty — parser may have failed silently');
     }

     // Check 2: Every entry has a non-empty riderName
     results.forEach((result, index) => {
       if (!result.riderName || result.riderName.trim().length === 0) {
         errors.push(`Result at index ${index} has empty riderName`);
       }
     });

     // Check 3: Positions are positive integers or null (for DNF)
     results.forEach((result, index) => {
       if (result.position !== null) {
         if (!Number.isInteger(result.position) || result.position < 1) {
           errors.push(`Result at index ${index} has invalid position: ${result.position}`);
         }
       }
     });

     // Check 4: No duplicate rider+category+stage combinations
     const seen = new Set<string>();
     results.forEach((result) => {
       const key = `${result.riderSlug}|${result.category}|${result.stageNumber ?? 'none'}`;
       if (seen.has(key)) {
         errors.push(`Duplicate entry for ${result.riderSlug} in ${result.category} stage ${result.stageNumber}`);
       }
       seen.add(key);
     });

     // Check 5: Warn if very few results (possible incomplete parse)
     if (results.length > 0 && results.length < 10) {
       warnings.push(`Only ${results.length} results parsed — verify completeness`);
     }

     // Check 6: Warn if more than 50% are DNF
     const dnfCount = results.filter((r) => r.dnf).length;
     if (results.length > 0 && dnfCount / results.length > 0.5) {
       warnings.push(`${dnfCount}/${results.length} results are DNF — unusual ratio`);
     }

     return {
       valid: errors.length === 0,
       errors,
       warnings,
     };
   }
   ```
2. This is a **pure function** with no NestJS dependencies. It can be unit tested trivially.
3. The trigger use case (T018) calls this validator after parsing. If `valid === false`,
   the use case marks the job as failed with the error messages and does NOT persist
   results.
4. Warnings are logged but do not prevent persistence.

**Validation**: Unit tests must cover:
- Valid results array passes
- Empty array fails
- Entry with empty riderName fails
- Entry with negative position fails
- Entry with non-integer position fails
- Duplicate rider+category+stage fails
- Low count triggers warning but still valid
- High DNF ratio triggers warning but still valid

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
   import { HealthStatus } from '@cycling-analyzer/shared-types';

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
3. Implement the canary checks:
   - **Stage race check**: Fetch the Tour de France latest GC page. Attempt to parse with
     `parseGcResults`. If parsing succeeds and returns more than 0 results, status is
     HEALTHY. If parsing returns 0 results, status is DEGRADED. If an error is thrown,
     status is FAILING.
   - **Classic check**: Fetch a recent classic result page (e.g., latest Milan-San Remo).
     Same logic as above with `parseClassicResults`.
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
     import { ScrapeStatus } from '@cycling-analyzer/shared-types';

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
4. Create `apps/api/src/presentation/scraping.controller.ts`:
   ```typescript
   import { Controller, Post, Get, Body, Query, HttpCode, HttpStatus } from '@nestjs/common';
   import { TriggerScrapeUseCase } from '../application/scraping/trigger-scrape.use-case';
   import { ScrapeJobService } from '../application/scraping/scrape-job.service';
   import { ScraperHealthService } from '../infrastructure/scraping/health/scraper-health.service';
   import { TriggerScrapeDto } from './dto/trigger-scrape.dto';
   import { ScrapeJobsQueryDto } from './dto/scrape-jobs-query.dto';

   @Controller('api/scraping')
   export class ScrapingController {
     constructor(
       private readonly triggerScrapeUseCase: TriggerScrapeUseCase,
       private readonly scrapeJobService: ScrapeJobService,
       private readonly healthService: ScraperHealthService,
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
       const jobs = await this.scrapeJobService.findRecent(
         query.limit ?? 20,
         query.status,
       );
       return { jobs };
     }

     @Get('health')
     getHealth() {
       return this.healthService.getHealth();
     }
   }
   ```
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
| T018    | Integration     | Full scrape flow with mocked HTTP, real DB               | 85%             |
| T019    | Unit            | All status transitions, stale job detection              | 95%             |
| T020    | Unit            | All validation rules, edge cases                         | 100%            |
| T021    | Unit            | Health check logic with mocked PCS client                | 90%             |
| T022    | E2E / Unit      | Endpoint responses, DTO validation, error handling       | 85%             |

**Integration test setup for T018**: Use a test database (either testcontainers or a
dedicated test PostgreSQL instance). Mock the PCS client to return fixture HTML instead of
making real HTTP requests. Verify database state after execution.

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Stage count detection fails for new races | Medium | Medium | Fall back to iterating stages until 404; cap at 25 max stages |
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
3. **Validation before persistence**: Parsed results must pass the shape validator before
   being written to the database. Invalid data must not be persisted.
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
- [ ] ScrapeJob lifecycle tracks all status transitions with timestamps
- [ ] Shape validator catches empty results, invalid positions, and duplicates
- [ ] Health service runs canary checks every 6 hours via cron
- [ ] GET `/api/scraping/jobs` returns recent jobs with optional status filter
- [ ] GET `/api/scraping/health` returns parser health status
- [ ] All DTOs validate input with class-validator
- [ ] Error handling ensures no job is left in "running" state
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
