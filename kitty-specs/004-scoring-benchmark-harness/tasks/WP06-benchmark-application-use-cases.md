---
work_package_id: WP06
title: Benchmark Application Layer — Use Cases
lane: 'for_review'
dependencies:
  - WP01
  - WP02
  - WP03
  - WP05
subtasks:
  - T024
  - T025
  - T026
  - T027
  - T028
phase: Phase 1 - Integration
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
  - FR-005
  - FR-006
  - FR-007
  - FR-010
  - FR-012
---

# Work Package Prompt: WP06 – Benchmark Application Layer — Use Cases

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
spec-kitty implement WP06 --base WP05
```

Depends on WP01 (raceDate + findByRiderIdsBeforeDate), WP02 (StartlistRepositoryPort), WP03 (startlist parser), WP05 (Spearman + value objects).

---

## Objectives & Success Criteria

- Create `FetchStartlistUseCase`: check DB → scrape PCS if missing → persist → create missing riders.
- Create `RunBenchmarkUseCase`: single race benchmark orchestration (predicted vs actual `totalProjectedPts`).
- Create `RunBenchmarkSuiteUseCase`: multi-race benchmark with aggregate Spearman ρ.
- Tests for all use cases with mocked repositories.

**Done when**: Unit tests pass with mocked deps. `RunBenchmarkUseCase` correctly computes predicted scores from pre-race data, actual scores from race results, and returns a valid `BenchmarkResult` with Spearman ρ. `RunBenchmarkSuiteUseCase` aggregates multiple races correctly.

## Context & Constraints

- **Architecture**: Application layer orchestrates domain functions and infrastructure ports. Use `@Injectable()` and inject ports via constructor.
- **Key design decision** (from plan.md): Reuse `computeRiderScore` for BOTH predicted and actual scores. Only the input data differs:
  - **Predicted**: `computeRiderScore(riderId, historicalResults, raceType, raceYear)` — results with `raceDate < target`
  - **Actual**: `computeRiderScore(riderId, raceResults, raceType, raceYear, 1)` — only results from the target race itself
- **Key references**:
  - Existing use case pattern: `apps/api/src/application/scraping/trigger-scrape.use-case.ts`
  - Scoring service: `apps/api/src/domain/scoring/scoring.service.ts` (`computeRiderScore`)
  - Spearman: `apps/api/src/domain/scoring/spearman-correlation.ts` (from WP05)
  - Value objects: `apps/api/src/domain/benchmark/benchmark-result.ts` (from WP05)
  - Plan: `kitty-specs/004-scoring-benchmark-harness/plan.md` (Key Design Decision #1)

---

## Subtasks & Detailed Guidance

### Subtask T024 – Create `FetchStartlistUseCase`

**Purpose**: Fetch a race's startlist — from DB if already persisted, from PCS if not. Create missing rider records. This ensures the benchmark always has a startlist to work with.

**Steps**:

1. Create `apps/api/src/application/benchmark/fetch-startlist.use-case.ts`
2. Implement:

   ```typescript
   import { Inject, Injectable, Logger } from '@nestjs/common';
   import {
     StartlistRepositoryPort,
     STARTLIST_REPOSITORY_PORT,
   } from '../../domain/startlist/startlist.repository.port';
   import {
     RiderRepositoryPort,
     RIDER_REPOSITORY_PORT,
   } from '../../domain/rider/rider.repository.port';
   import { PcsScraperPort, PCS_SCRAPER_PORT } from '../scraping/ports/pcs-scraper.port';
   import { StartlistEntry } from '../../domain/startlist/startlist-entry.entity';
   import { Rider } from '../../domain/rider/rider.entity';
   import { parseStartlist } from '../../infrastructure/scraping/parsers/startlist.parser';

   export interface FetchStartlistInput {
     readonly raceSlug: string;
     readonly year: number;
   }

   export interface FetchStartlistOutput {
     readonly entries: StartlistEntry[];
     readonly fromCache: boolean;
   }

   @Injectable()
   export class FetchStartlistUseCase {
     private readonly logger = new Logger(FetchStartlistUseCase.name);

     constructor(
       @Inject(STARTLIST_REPOSITORY_PORT) private readonly startlistRepo: StartlistRepositoryPort,
       @Inject(RIDER_REPOSITORY_PORT) private readonly riderRepo: RiderRepositoryPort,
       @Inject(PCS_SCRAPER_PORT) private readonly pcsClient: PcsScraperPort,
     ) {}

     async execute(input: FetchStartlistInput): Promise<FetchStartlistOutput> {
       // 1. Check if startlist already exists in DB
       const exists = await this.startlistRepo.existsForRace(input.raceSlug, input.year);
       if (exists) {
         const entries = await this.startlistRepo.findByRace(input.raceSlug, input.year);
         this.logger.log(
           `Loaded cached startlist for ${input.raceSlug} ${input.year}: ${entries.length} riders`,
         );
         return { entries, fromCache: true };
       }

       // 2. Scrape from PCS
       const path = `race/${input.raceSlug}/${input.year}/startlist`;
       this.logger.log(`Scraping startlist: ${path}`);
       const html = await this.pcsClient.fetchPage(path);
       const parsed = parseStartlist(html);

       if (parsed.length === 0) {
         this.logger.warn(`Empty startlist for ${input.raceSlug} ${input.year}`);
         return { entries: [], fromCache: false };
       }

       // 3. Ensure all riders exist in DB (create missing ones)
       const slugs = parsed.map((p) => p.riderSlug);
       const existingRiders = await this.riderRepo.findByPcsSlugs(slugs);
       const existingBySlug = new Map(existingRiders.map((r) => [r.pcsSlug, r]));

       const ridersToSave: Rider[] = [];
       const riderIdMap = new Map<string, string>();

       for (const p of parsed) {
         let rider = existingBySlug.get(p.riderSlug);
         if (!rider) {
           rider = Rider.create({
             pcsSlug: p.riderSlug,
             fullName: p.riderName,
             currentTeam: p.teamName || null,
             nationality: null,
             lastScrapedAt: new Date(),
           });
           ridersToSave.push(rider);
         }
         riderIdMap.set(p.riderSlug, rider.id);
       }

       if (ridersToSave.length > 0) {
         await this.riderRepo.saveMany(ridersToSave);
         this.logger.log(`Created ${ridersToSave.length} new riders from startlist`);
       }

       // 4. Create and persist startlist entries
       const entries = parsed.map((p) =>
         StartlistEntry.create({
           raceSlug: input.raceSlug,
           year: input.year,
           riderId: riderIdMap.get(p.riderSlug)!,
           teamName: p.teamName || null,
           bibNumber: p.bibNumber,
           scrapedAt: new Date(),
         }),
       );

       await this.startlistRepo.saveMany(entries);
       this.logger.log(
         `Persisted startlist for ${input.raceSlug} ${input.year}: ${entries.length} riders`,
       );

       return { entries, fromCache: false };
     }
   }
   ```

**Files**: `apps/api/src/application/benchmark/fetch-startlist.use-case.ts` (new)

**Notes**: The rider creation pattern mirrors `TriggerScrapeUseCase.persistResults()` — batch-fetch existing, create missing, batch-save.

---

### Subtask T025 – Create `RunBenchmarkUseCase`

**Purpose**: Core benchmark orchestration — compute predicted vs actual `totalProjectedPts` for a single race.

**Steps**:

1. Create `apps/api/src/application/benchmark/run-benchmark.use-case.ts`
2. Flow:
   ```
   Input: { raceSlug, year, raceType, raceName }
   1. Fetch startlist → get rider IDs
   2. Get race's first result date (for cutoff) from race results
   3. Fetch historical results: findByRiderIdsBeforeDate(riderIds, raceDateCutoff)
   4. Fetch actual results: findByRace(raceSlug, year)
   5. For each startlist rider:
      a. Filter historical results for this rider
      b. computeRiderScore(riderId, riderHistoricalResults, raceType, raceYear) → predictedPts
      c. Filter actual results for this rider
      d. computeRiderScore(riderId, riderActualResults, raceType, raceYear, 1) → actualPts
   6. Compute rankings for predicted and actual score arrays
   7. Compute Spearman ρ
   8. Return BenchmarkResult
   ```
3. Implementation:

   ```typescript
   @Injectable()
   export class RunBenchmarkUseCase {
     constructor(
       private readonly fetchStartlist: FetchStartlistUseCase,
       @Inject(RACE_RESULT_REPOSITORY_PORT) private readonly resultRepo: RaceResultRepositoryPort,
       @Inject(RIDER_REPOSITORY_PORT) private readonly riderRepo: RiderRepositoryPort,
     ) {}

     async execute(input: RunBenchmarkInput): Promise<BenchmarkResult> {
       // 1. Get startlist
       const { entries } = await this.fetchStartlist.execute({
         raceSlug: input.raceSlug,
         year: input.year,
       });
       const riderIds = entries.map((e) => e.riderId);

       // 2. Get the race date cutoff from actual results
       const actualResults = await this.resultRepo.findByRace(input.raceSlug, input.year);
       const raceDates = actualResults.filter((r) => r.raceDate).map((r) => r.raceDate!);
       const earliestDate =
         raceDates.length > 0 ? new Date(Math.min(...raceDates.map((d) => d.getTime()))) : null;

       if (!earliestDate) {
         throw new Error(
           `No race dates found for ${input.raceSlug} ${input.year}. Run seed first.`,
         );
       }

       // 3. Fetch historical results (before this race)
       const historicalResults = await this.resultRepo.findByRiderIdsBeforeDate(
         riderIds,
         earliestDate,
       );

       // 4. Build rider name lookup
       const riders = await this.riderRepo.findByPcsSlugs(
         entries.map((e) => e.riderId), // Need slug → use riderRepo.findAll or add method
       );
       // Alternative: build name map from entries + separate rider lookup
       // For now, fetch all riders by IDs
       const allRiders =
         riderIds.length > 0 ? ((await this.riderRepo.findByIds?.(riderIds)) ?? []) : [];
       const riderNameMap = new Map(allRiders.map((r) => [r.id, r.fullName]));

       // 5. Compute scores per rider
       const riderEntries: RiderBenchmarkEntry[] = [];
       for (const riderId of riderIds) {
         const riderHistorical = historicalResults.filter((r) => r.riderId === riderId);
         const riderActual = actualResults.filter((r) => r.riderId === riderId);

         const predicted = computeRiderScore(riderId, riderHistorical, input.raceType, input.year);
         const actual = computeRiderScore(riderId, riderActual, input.raceType, input.year, 1);

         riderEntries.push({
           riderId,
           riderName: riderNameMap.get(riderId) ?? 'Unknown',
           predictedPts: predicted.totalProjectedPts,
           actualPts: actual.totalProjectedPts,
           predictedRank: 0, // Filled below
           actualRank: 0, // Filled below
         });
       }

       // 6. Compute rankings
       const predictedScores = riderEntries.map((e) => e.predictedPts);
       const actualScores = riderEntries.map((e) => e.actualPts);
       const predictedRanks = computeRankings(predictedScores);
       const actualRanks = computeRankings(actualScores);

       const rankedEntries = riderEntries.map((e, i) => ({
         ...e,
         predictedRank: predictedRanks[i],
         actualRank: actualRanks[i],
       }));

       // 7. Compute Spearman ρ
       const rho = computeSpearmanRho(predictedScores, actualScores);

       return {
         raceSlug: input.raceSlug,
         raceName: input.raceName,
         year: input.year,
         raceType: input.raceType,
         riderResults: rankedEntries,
         spearmanRho: rho,
         riderCount: riderEntries.length,
       };
     }
   }
   ```

**Files**: `apps/api/src/application/benchmark/run-benchmark.use-case.ts` (new)

**Notes**:

- **Race date cutoff**: Use the EARLIEST `raceDate` from the actual results (first stage or race day). This ensures no data from the race itself leaks into predictions.
- **Rider name lookup**: The existing `RiderRepositoryPort` has `findByPcsSlugs` but not `findByIds`. You may need to add a `findByIds(ids: string[]): Promise<Rider[]>` method to the port/adapter, or use a different approach to get rider names.
- **maxSeasons = 1 for actual**: Pass `1` so only the race year's data is scored (no temporal decay across years for actual results from a single race).

---

### Subtask T026 – Create `RunBenchmarkSuiteUseCase`

**Purpose**: Run benchmark across multiple races and compute aggregate statistics.

**Steps**:

1. Create `apps/api/src/application/benchmark/run-benchmark-suite.use-case.ts`
2. Implementation:

   ```typescript
   @Injectable()
   export class RunBenchmarkSuiteUseCase {
     constructor(private readonly runBenchmark: RunBenchmarkUseCase) {}

     async execute(
       races: ReadonlyArray<RunBenchmarkInput>,
       onProgress?: (completed: number, total: number, result: BenchmarkResult) => void,
     ): Promise<BenchmarkSuiteResult> {
       const results: BenchmarkResult[] = [];

       for (let i = 0; i < races.length; i++) {
         const result = await this.runBenchmark.execute(races[i]);
         results.push(result);
         onProgress?.(i + 1, races.length, result);
       }

       // Mean ρ excluding nulls
       const validRhos = results
         .map((r) => r.spearmanRho)
         .filter((rho): rho is number => rho !== null);
       const meanRho =
         validRhos.length > 0
           ? validRhos.reduce((sum, rho) => sum + rho, 0) / validRhos.length
           : null;

       return {
         races: results,
         meanSpearmanRho: meanRho,
         raceCount: results.length,
       };
     }
   }
   ```

**Files**: `apps/api/src/application/benchmark/run-benchmark-suite.use-case.ts` (new)

**Notes**: The `onProgress` callback enables the CLI to show real-time progress (e.g., "Race 3/7: Paris-Nice 2025 — ρ = 0.72"). Races run sequentially to avoid overwhelming the DB and PCS scraper.

---

### Subtask T027 – Tests for `FetchStartlistUseCase`

**Purpose**: Verify startlist fetch-or-scrape logic with mocked dependencies.

**Steps**:

1. Create `apps/api/src/application/benchmark/__tests__/fetch-startlist.use-case.spec.ts`
2. Test cases:
   - **Cache hit**: `existsForRace` returns true → returns cached entries, no PCS call.
   - **Cache miss**: `existsForRace` returns false → calls PCS, parses, creates riders, persists.
   - **New riders created**: Parsed riders not in DB → `riderRepo.saveMany` called with new riders.
   - **Empty startlist**: PCS returns empty → returns empty entries, no persistence.
3. Mock all injected ports (startlistRepo, riderRepo, pcsClient).

**Files**: `apps/api/src/application/benchmark/__tests__/fetch-startlist.use-case.spec.ts` (new)

---

### Subtask T028 – Tests for `RunBenchmarkUseCase`

**Purpose**: Verify the benchmark correctly computes predicted vs actual scores and Spearman ρ.

**Steps**:

1. Create `apps/api/src/application/benchmark/__tests__/run-benchmark.use-case.spec.ts`
2. Test cases:
   - **Basic benchmark**: 3 riders with known historical results and known race results. Verify predicted and actual `totalProjectedPts` match manual computation. Verify Spearman ρ.
   - **No historical data**: Rider on startlist with zero prior results → predictedPts = 0. Should still appear in output.
   - **DNF rider**: Rider DNF'd the race → actual score reflects partial points (only finished stages/classifications).
   - **No race dates**: `findByRace` returns results with null raceDate → throws error.
3. Mock: `fetchStartlist`, `resultRepo`, `riderRepo`.
4. Use the actual `computeRiderScore` and `computeSpearmanRho` (don't mock domain functions — they're pure and fast).

**Files**: `apps/api/src/application/benchmark/__tests__/run-benchmark.use-case.spec.ts` (new)

**Notes**: To make tests deterministic, create `RaceResult` fixtures using `RaceResult.reconstitute()` with known values. Verify that the predicted score computation uses ONLY results with raceDate before the cutoff.

---

## Risks & Mitigations

- **Rider name lookup**: `RiderRepositoryPort` may not have a `findByIds` method. You may need to add it (simple: `inArray(riders.id, ids)` query) or derive names from the startlist entries + existing rider data.
- **Race date cutoff**: Use the EARLIEST date from actual results, not the latest. For a 3-week grand tour, using the first stage date as cutoff ensures no data from ANY stage leaks.
- **Memory**: 200 riders × 3 years of results = ~20K result objects in memory. This is fine for Node.js.

## Review Guidance

- Verify predicted scores use `findByRiderIdsBeforeDate` with the earliest race date (not latest).
- Verify actual scores use `computeRiderScore` with `maxSeasons = 1`.
- Verify `FetchStartlistUseCase` creates missing riders before persisting startlist entries (FK constraint).
- Verify `onProgress` callback is optional and doesn't break if omitted.
- No `any` types. Use case follows existing `TriggerScrapeUseCase` DI pattern.

## Activity Log

- 2026-03-19T18:18:14Z – system – lane=planned – Prompt created.
- 2026-03-19T19:04:35Z – unknown – lane=for_review – Ready for review: FetchStartlistUseCase, RunBenchmarkUseCase, RunBenchmarkSuiteUseCase with tests
