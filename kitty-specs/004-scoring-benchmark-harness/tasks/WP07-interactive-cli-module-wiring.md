---
work_package_id: WP07
title: Interactive CLI & Module Wiring
lane: 'for_review'
dependencies:
  - WP01
  - WP06
base_branch: 004-scoring-benchmark-harness-WP07-merge-base
base_commit: dcde565f2d2c9a66237f3a706ce1af26d638580e
created_at: '2026-03-19T19:05:52.526963+00:00'
subtasks:
  - T029
  - T029b
  - T030
  - T031
  - T032
phase: Phase 2 - Presentation
assignee: ''
agent: 'claude-opus'
shell_pid: '36720'
review_status: ''
reviewed_by: ''
history:
  - timestamp: '2026-03-19T18:18:14Z'
    lane: planned
    agent: system
    shell_pid: ''
    action: Prompt generated via /spec-kitty.tasks
requirement_refs:
  - FR-009
  - FR-010
  - FR-011
  - FR-013
---

# Work Package Prompt: WP07 – Interactive CLI & Module Wiring

## ⚠️ IMPORTANT: Review Feedback Status

**Read this first if you are implementing this task!**

- **Has review feedback?**: Check the `review_status` field above. If it says `has_feedback`, scroll to the **Review Feedback** section immediately.
- **You must address all feedback** before your work is complete.

---

## Review Feedback

_[This section is empty initially.]_

---

## Implementation Command

```bash
spec-kitty implement WP07 --base WP06
```

Depends on WP06 (benchmark use cases).

---

## Objectives & Success Criteria

- Install `@inquirer/prompts` as a dependency.
- Create an interactive `BenchmarkCommand` using nest-commander + inquirer prompts.
- Create `BenchmarkModule` with all DI providers wired.
- Register the module in `AppModule`.

**Done when**: Running `npx ts-node -r tsconfig-paths/register src/cli.ts benchmark` launches interactive prompt, lets user select a race, runs the benchmark, and displays a table with predicted vs actual scores + Spearman ρ. `--suite` mode works for multiple races.

## Context & Constraints

- **Existing CLI pattern**: `apps/api/src/presentation/cli/trigger-scrape.command.ts` — follow this exact pattern.
- **Module pattern**: `apps/api/src/presentation/scraping.module.ts` — follow for DI wiring.
- **CLI entry point**: `apps/api/src/cli.ts` uses `CommandFactory.run(AppModule)`.
- **Key references**:
  - Trigger scrape command: `apps/api/src/presentation/cli/trigger-scrape.command.ts`
  - Scraping module: `apps/api/src/presentation/scraping.module.ts`
  - App module: `apps/api/src/app.module.ts`
  - Quickstart: `kitty-specs/004-scoring-benchmark-harness/quickstart.md`

---

## Subtasks & Detailed Guidance

### Subtask T029 – Install `@inquirer/prompts`

**Purpose**: Add the interactive prompt library needed for race selection.

**Steps**:

1. From `apps/api/`:
   ```bash
   npm install @inquirer/prompts
   ```
2. Verify it's added to `apps/api/package.json` dependencies.
3. Verify TypeScript can resolve the import:
   ```typescript
   import { select, checkbox } from '@inquirer/prompts';
   ```

**Files**: `apps/api/package.json`

**Notes**: `@inquirer/prompts` v7+ is ESM-first but also ships CJS builds. Since the project uses `ts-node` with `tsconfig-paths`, CJS resolution should work. If not, try `@inquirer/prompts@6` which has better CJS support.

---

### Subtask T029b – Add `findDistinctRacesWithDate` to `RaceResultRepositoryPort`

**Purpose**: The CLI needs to present a list of races that have `raceDate` populated (eligible for benchmarking). No existing repo method provides this.

**Steps**:

1. Define a lightweight return type:
   ```typescript
   export interface RaceSummary {
     readonly raceSlug: string;
     readonly raceName: string;
     readonly year: number;
     readonly raceType: RaceType;
   }
   ```
2. Add to `RaceResultRepositoryPort`:
   ```typescript
   findDistinctRacesWithDate(): Promise<RaceSummary[]>;
   ```
3. Implement in `RaceResultRepositoryAdapter` using Drizzle:
   ```typescript
   async findDistinctRacesWithDate(): Promise<RaceSummary[]> {
     const rows = await this.db
       .selectDistinct({
         raceSlug: raceResults.raceSlug,
         raceName: raceResults.raceName,
         year: raceResults.year,
         raceType: raceResults.raceType,
       })
       .from(raceResults)
       .where(isNotNull(raceResults.raceDate))
       .orderBy(desc(raceResults.year), raceResults.raceName);
     return rows.map((r) => ({
       raceSlug: r.raceSlug,
       raceName: r.raceName,
       year: r.year,
       raceType: r.raceType as RaceType,
     }));
   }
   ```
4. Import `isNotNull`, `desc` from `drizzle-orm`.

**Files**:

- `apps/api/src/domain/race-result/race-result.repository.port.ts`
- `apps/api/src/infrastructure/database/race-result.repository.adapter.ts`

**Notes**: This is a presentation-layer need, but adding it to the port keeps the architecture clean. The `RaceSummary` interface can live alongside the port or in a shared types file.

---

### Subtask T030 – Create `BenchmarkCommand`

**Purpose**: Interactive CLI command that lets users run benchmarks without memorizing race slugs.

**Steps**:

1. Create `apps/api/src/presentation/cli/benchmark.command.ts`
2. Implement:

   ```typescript
   import { Logger } from '@nestjs/common';
   import { Command, CommandRunner, Option } from 'nest-commander';
   import { select, checkbox } from '@inquirer/prompts';
   import { RunBenchmarkUseCase } from '../../application/benchmark/run-benchmark.use-case';
   import { RunBenchmarkSuiteUseCase } from '../../application/benchmark/run-benchmark-suite.use-case';
   import {
     RaceResultRepositoryPort,
     RACE_RESULT_REPOSITORY_PORT,
   } from '../../domain/race-result/race-result.repository.port';
   import { Inject } from '@nestjs/common';
   import { BenchmarkResult } from '../../domain/benchmark/benchmark-result.ts';

   interface BenchmarkOptions {
     suite?: boolean;
   }

   @Command({
     name: 'benchmark',
     description: 'Run scoring prediction benchmark against real race results',
   })
   export class BenchmarkCommand extends CommandRunner {
     private readonly logger = new Logger(BenchmarkCommand.name);

     constructor(
       private readonly runBenchmark: RunBenchmarkUseCase,
       private readonly runSuite: RunBenchmarkSuiteUseCase,
       @Inject(RACE_RESULT_REPOSITORY_PORT)
       private readonly resultRepo: RaceResultRepositoryPort,
     ) {
       super();
     }

     async run(_passedParams: string[], options: BenchmarkOptions): Promise<void> {
       // 1. Fetch available races (with raceDate populated)
       const races = await this.getAvailableRaces();
       if (races.length === 0) {
         this.logger.error('No races with populated race dates. Run seed-database first.');
         return;
       }

       if (options.suite) {
         await this.runSuiteMode(races);
       } else {
         await this.runSingleMode(races);
       }
     }

     private async runSingleMode(races: RaceChoice[]): Promise<void> {
       const selected = await select({
         message: 'Select a race to benchmark:',
         choices: races.map((r) => ({
           name: `${r.raceName} ${r.year} (${r.raceType})`,
           value: r,
         })),
       });

       this.logger.log(`Running benchmark for ${selected.raceName} ${selected.year}...`);
       const result = await this.runBenchmark.execute(selected);
       this.displayResult(result);
     }

     private async runSuiteMode(races: RaceChoice[]): Promise<void> {
       const selected = await checkbox({
         message: 'Select races to benchmark (space to toggle, enter to confirm):',
         choices: races.map((r) => ({
           name: `${r.raceName} ${r.year} (${r.raceType})`,
           value: r,
         })),
       });

       if (selected.length === 0) {
         this.logger.warn('No races selected.');
         return;
       }

       this.logger.log(`Running benchmark suite for ${selected.length} races...`);
       const suiteResult = await this.runSuite.execute(selected, (completed, total, result) => {
         this.logger.log(
           `[${completed}/${total}] ${result.raceName} ${result.year} — ρ = ${result.spearmanRho?.toFixed(4) ?? 'N/A'}`,
         );
       });

       // Display per-race summary
       console.log('\n=== Benchmark Suite Results ===\n');
       console.table(
         suiteResult.races.map((r) => ({
           Race: `${r.raceName} ${r.year}`,
           Riders: r.riderCount,
           'Spearman ρ': r.spearmanRho?.toFixed(4) ?? 'N/A',
         })),
       );
       console.log(`\nAggregate Mean ρ: ${suiteResult.meanSpearmanRho?.toFixed(4) ?? 'N/A'}`);
       console.log(`Races: ${suiteResult.raceCount}`);
     }

     private displayResult(result: BenchmarkResult): void {
       console.log(`\n=== ${result.raceName} ${result.year} ===\n`);

       // Sort by actual rank for display
       const sorted = [...result.riderResults].sort((a, b) => a.actualRank - b.actualRank);

       console.table(
         sorted.slice(0, 30).map((r) => ({
           'Act Rank': r.actualRank,
           'Pred Rank': r.predictedRank,
           Rider: r.riderName.substring(0, 25),
           'Pred Pts': r.predictedPts.toFixed(1),
           'Act Pts': r.actualPts.toFixed(1),
         })),
       );

       if (result.riderResults.length > 30) {
         console.log(`... and ${result.riderResults.length - 30} more riders`);
       }

       console.log(`\nSpearman ρ = ${result.spearmanRho?.toFixed(4) ?? 'N/A'}`);
       console.log(`Riders: ${result.riderCount}`);
     }

     private async getAvailableRaces(): Promise<RaceChoice[]> {
       // Query distinct races with raceDate populated
       // This needs a query method — see implementation notes below
       // For now, use a raw query or add a method to the repo
     }

     @Option({
       flags: '-s, --suite',
       description: 'Run benchmark suite across multiple races',
     })
     parseSuite(): boolean {
       return true;
     }
   }

   interface RaceChoice {
     raceSlug: string;
     year: number;
     raceType: string;
     raceName: string;
   }
   ```

**Files**: `apps/api/src/presentation/cli/benchmark.command.ts` (new)

**Notes**:

- **`getAvailableRaces()`**: Needs to query distinct `(raceSlug, year, raceType, raceName)` from `race_results` where `raceDate IS NOT NULL`. You may need to add a `findDistinctRaces()` method to `RaceResultRepositoryPort`, or use a dedicated query. Keep it simple — a `SELECT DISTINCT` via Drizzle.
- **Display**: `console.table()` produces clean tabular output. Show top 30 riders sorted by actual rank. Include both predicted and actual rank for comparison.
- **Suite progress**: The `onProgress` callback logs each race as it completes.

---

### Subtask T031 – Create `BenchmarkModule`

**Purpose**: NestJS module that wires all DI providers for the benchmark feature.

**Steps**:

1. Create `apps/api/src/presentation/benchmark.module.ts`
2. Wire all providers:

   ```typescript
   import { Module } from '@nestjs/common';
   import { DatabaseModule } from '../infrastructure/database/database.module';
   import { ScrapingModule } from './scraping.module';
   import { StartlistRepositoryAdapter } from '../infrastructure/database/startlist.repository.adapter';
   import { STARTLIST_REPOSITORY_PORT } from '../domain/startlist/startlist.repository.port';
   import { FetchStartlistUseCase } from '../application/benchmark/fetch-startlist.use-case';
   import { RunBenchmarkUseCase } from '../application/benchmark/run-benchmark.use-case';
   import { RunBenchmarkSuiteUseCase } from '../application/benchmark/run-benchmark-suite.use-case';
   import { BenchmarkCommand } from './cli/benchmark.command';

   @Module({
     imports: [DatabaseModule, ScrapingModule],
     providers: [
       {
         provide: STARTLIST_REPOSITORY_PORT,
         useClass: StartlistRepositoryAdapter,
       },
       FetchStartlistUseCase,
       RunBenchmarkUseCase,
       RunBenchmarkSuiteUseCase,
       BenchmarkCommand,
     ],
   })
   export class BenchmarkModule {}
   ```

**Files**: `apps/api/src/presentation/benchmark.module.ts` (new)

**Notes**:

- Import `ScrapingModule` to get `PCS_SCRAPER_PORT` (exported by that module).
- Import `DatabaseModule` to get the Drizzle database provider and existing repo ports.
- The `STARTLIST_REPOSITORY_PORT` is new — provide it here.
- `RaceResultRepositoryPort` and `RiderRepositoryPort` are already provided by `DatabaseModule`.

---

### Subtask T032 – Register `BenchmarkModule` in `AppModule`

**Purpose**: Make the benchmark command available via the CLI entry point.

**Steps**:

1. Open `apps/api/src/app.module.ts`
2. Import `BenchmarkModule`:
   ```typescript
   import { BenchmarkModule } from './presentation/benchmark.module';
   ```
3. Add to the `imports` array:
   ```typescript
   @Module({
     imports: [
       // ... existing modules ...
       BenchmarkModule,
     ],
   })
   export class AppModule {}
   ```
4. Verify the CLI picks up the new command:
   ```bash
   npx ts-node -r tsconfig-paths/register src/cli.ts --help
   ```
   Should list `benchmark` among available commands.

**Files**: `apps/api/src/app.module.ts`

---

## Risks & Mitigations

- **`@inquirer/prompts` ESM/CJS compatibility**: If imports fail at runtime, try:
  1. Use dynamic `import()` instead of static import.
  2. Fall back to `@inquirer/prompts@6` (CJS-compatible).
  3. Update `tsconfig.json` module resolution if needed.
- **Available races query**: Needs a way to get distinct races with populated dates. If adding a repo method feels heavy, use a raw Drizzle query directly in the command (pragmatic exception to port pattern for a presentation-layer concern).
- **Large output**: Console table with 200 riders is overwhelming. Default to showing top 30 by actual rank. Add a `--top <n>` option later if needed.

## Review Guidance

- Verify `BenchmarkModule` imports are correct (DatabaseModule for repos, ScrapingModule for PCS client).
- Verify `@inquirer/prompts` works at runtime (not just compile time).
- Verify `--suite` flag correctly switches between single and multi-race mode.
- Verify `displayResult` shows useful, readable output.
- Verify `AppModule` imports `BenchmarkModule`.
- No `any` types. English only.

## Activity Log

- 2026-03-19T18:18:14Z – system – lane=planned – Prompt created.
- 2026-03-19T19:05:53Z – claude-opus – shell_pid=36720 – lane=doing – Assigned agent via workflow command
- 2026-03-19T19:11:03Z – claude-opus – shell_pid=36720 – lane=for_review – Ready for review: BenchmarkCommand with interactive prompts, BenchmarkModule, AppModule registration, findDistinctRacesWithDate
