# Work Packages: Scoring Benchmark Harness

**Inputs**: Design documents from `kitty-specs/004-scoring-benchmark-harness/`
**Prerequisites**: plan.md (required), spec.md (user stories), research.md, data-model.md, quickstart.md

**Tests**: Included where constitution requires 100% coverage (scoring/correlation logic) and for parser correctness.

**Organization**: Fine-grained subtasks (`Txxx`) roll up into work packages (`WPxx`). Each work package is independently deliverable and testable.

**Prompt Files**: Each work package references a matching prompt file in `tasks/`.

---

## Work Package WP01: Race Date — Schema, Entity & Repository (Priority: P0)

**Goal**: Add `raceDate` (DATE, nullable) column to the `race_results` table, propagate through entity and repository layers, and add date-filtered query method.
**Independent Test**: Generate migration, apply it. Manually insert a race result with `raceDate` populated and query it back via the adapter. Verify `findByRiderIdsBeforeDate` returns only results before a given date.
**Prompt**: `tasks/WP01-race-date-schema-entity-repository.md`
**Estimated Size**: ~350 lines

**Requirements Refs**: FR-001, FR-006

### Included Subtasks

- [ ] T001 Add `raceDate` column to `apps/api/src/infrastructure/database/schema/race-results.ts`
- [ ] T002 Add `raceDate` to `RaceResultProps` and `RaceResult` entity in `apps/api/src/domain/race-result/race-result.entity.ts`
- [ ] T003 Update `RaceResultRepositoryAdapter` — `toDomain()` and `saveMany()` to handle `raceDate`
- [ ] T004 Add `findByRiderIdsBeforeDate()` to `RaceResultRepositoryPort` and implement in adapter
- [ ] T004b Add `findByIds()` to `RiderRepositoryPort` and implement in adapter (needed by WP06 for rider name lookup)
- [ ] T005 Generate Drizzle migration for the new `raceDate` column

### Implementation Notes

- `raceDate` is `date('race_date')` in Drizzle (not timestamp — calendar date only).
- Nullable initially to allow migration without breaking existing data.
- `findByRiderIdsBeforeDate` uses `lt(raceResults.raceDate, cutoffDate)` with `inArray` on riderIds.
- Upsert conflict set must include `raceDate` so re-seeds update it.

### Parallel Opportunities

- WP01, WP02, WP03, and WP05 are fully independent and can run in parallel.

### Dependencies

- None (foundation package).

### Risks & Mitigations

- Drizzle `date()` type maps to JS `string` by default, not `Date`. Verify column type and consider using `{ mode: 'date' }` for native `Date` mapping.

---

## Work Package WP02: Startlist — Schema, Entity & Repository (Priority: P0)

**Goal**: Create `startlist_entries` table, `StartlistEntry` domain entity, repository port and Drizzle adapter.
**Independent Test**: Generate migration, apply it. Persist a startlist entry and retrieve it via `findByRace`. Verify unique constraint prevents duplicates.
**Prompt**: `tasks/WP02-startlist-schema-entity-repository.md`
**Estimated Size**: ~350 lines

**Requirements Refs**: FR-004, FR-012

### Included Subtasks

- [ ] T006 Create `startlist-entries.ts` Drizzle schema with unique constraint and composite index
- [ ] T007 Export from `schema/index.ts` and generate Drizzle migration
- [ ] T008 Create `StartlistEntry` domain entity with `create`/`reconstitute` factory methods
- [ ] T009 Create `StartlistRepositoryPort` — `findByRace`, `existsForRace`, `saveMany`
- [ ] T010 Create `StartlistRepositoryAdapter` Drizzle implementation

### Implementation Notes

- Unique constraint: `(race_slug, year, rider_id)`.
- Foreign key: `rider_id → riders.id` with cascade delete.
- Composite index on `(race_slug, year)` for lookup performance.
- Follow existing adapter pattern (see `race-result.repository.adapter.ts`).

### Parallel Opportunities

- WP01, WP02, WP03, and WP05 can all run in parallel.

### Dependencies

- None (foundation package).

### Risks & Mitigations

- Ensure `saveMany` uses upsert (onConflictDoUpdate) to handle re-scraping same startlist gracefully.

---

## Work Package WP03: PCS Parsers — Race Date & Startlist (Priority: P0)

**Goal**: Create parsers to extract race dates and startlists from PCS HTML pages, with tests using fixture HTML.
**Independent Test**: Feed fixture HTML to parsers and verify correct date extraction and rider list parsing.
**Prompt**: `tasks/WP03-pcs-parsers-race-date-startlist.md`
**Estimated Size**: ~450 lines

**Requirements Refs**: FR-002, FR-005

### Included Subtasks

- [ ] T011 Create `race-date.parser.ts` — extract dates from PCS race/stage HTML
- [ ] T012 Create `startlist.parser.ts` — parse PCS startlist page (rider slugs, teams, bibs)
- [ ] T013 [P] Tests for race-date parser with fixture HTML (classic + stage race)
- [ ] T014 [P] Tests for startlist parser with fixture HTML

### Implementation Notes

- Use cheerio (already a project dependency) for HTML parsing.
- Race date format on PCS: look for date in the `.infolist` div or `.sub > .w50` containers.
- Startlist HTML: rider links in `/rider/{slug}` format, team groups with bib numbers in table rows.
- Save fixture HTML files in `__tests__/fixtures/` alongside parser tests.
- Reuse pattern from existing `results-table.parser.ts`.

### Parallel Opportunities

- T013 and T014 (test writing) can proceed in parallel once parsers are drafted.
- WP03 is fully independent of WP01, WP02, WP05.

### Dependencies

- None (uses existing cheerio dependency and parser patterns).

### Risks & Mitigations

- PCS HTML structure may vary between race types. Mitigate by testing with fixtures from at least one classic, one stage race, and one grand tour.
- Startlist page structure may differ from results page. Inspect actual HTML structure before implementing.

---

## Work Package WP04: Scraping Integration — Wire Race Date into Scraper (Priority: P1)

**Goal**: Integrate race date parsing into the existing scraping pipeline so that new and re-seeded results include `raceDate`.
**Independent Test**: Run `trigger-scrape` for a known race and verify the resulting `race_results` rows have `raceDate` populated. Run `seed-database` and confirm backfill.
**Prompt**: `tasks/WP04-scraping-integration-race-date.md`
**Estimated Size**: ~400 lines

**Requirements Refs**: FR-002, FR-003

### Included Subtasks

- [ ] T015 Update `TriggerScrapeUseCase` to fetch and extract race dates from PCS during scraping
- [ ] T016 Update `persistResults()` to pass `raceDate` into `RaceResult.create()`
- [ ] T017 Update `SeedDatabaseCommand` to extract and backfill race dates during re-seed
- [ ] T018 Update existing scraping tests to account for `raceDate` field

### Implementation Notes

- For classics: fetch the result page, extract date from header.
- For stage races: each stage page already fetched — extract stage date from that page.
- GC/classification results: use the last stage date (final day of race).
- `ParsedResult` type may need a `raceDate` field or the date can be passed separately per-race.
- Seed command must handle races already in DB: upsert updates `raceDate` via conflict resolution.

### Parallel Opportunities

- T015-T016 (use case changes) and T017 (seed command) modify different files.

### Dependencies

- Depends on **WP01** (raceDate in schema/entity) and **WP03** (race-date parser).

### Risks & Mitigations

- Classic race pages may have dates in different positions than stage race pages. Handle both cases in the parser.
- Seed command runs many scrapes sequentially — adding date extraction adds minimal overhead per request.

---

## Work Package WP05: Benchmark Domain — Spearman Correlation & Value Objects (Priority: P0)

**Goal**: Implement Spearman rank correlation as a pure function with 100% test coverage, plus `BenchmarkResult` and `BenchmarkSuiteResult` value objects.
**Independent Test**: Run Spearman tests with known vectors. Verify ρ = 1.0 for identical rankings, ρ = -1.0 for reversed, correct handling of ties.
**Prompt**: `tasks/WP05-benchmark-domain-spearman-value-objects.md`
**Estimated Size**: ~400 lines

**Requirements Refs**: FR-008

### Included Subtasks

- [ ] T019 Implement `spearman-correlation.ts` pure function with average rank method for ties
- [ ] T020 100% test coverage for Spearman (perfect, inverse, zero, ties, n=1, n=2, empty)
- [ ] T021 Create `BenchmarkResult` interface in `domain/benchmark/benchmark-result.ts`
- [ ] T022 Create `BenchmarkSuiteResult` interface in `domain/benchmark/benchmark-result.ts`
- [ ] T023 Utility: `computeRankings(scores: number[]): number[]` — assigns ranks with average tie method

### Implementation Notes

- Spearman formula: ρ = 1 - (6 × Σd²) / (n × (n² - 1)) for no ties.
- With ties: use correction formula ρ = (Σx² + Σy² - Σd²) / (2 × √(Σx² × Σy²)).
- `computeRankings` is a reusable helper used by both Spearman and the benchmark display.
- Value objects are plain `readonly` interfaces — not classes, no persistence.
- All domain code in `apps/api/src/domain/scoring/` (Spearman) and `apps/api/src/domain/benchmark/` (value objects).

### Parallel Opportunities

- WP05 is fully independent — can run in parallel with all other WPs.
- T019 (implementation) and T021-T022 (interfaces) can proceed in parallel.

### Dependencies

- None (pure domain logic, no infrastructure deps).

### Risks & Mitigations

- Constitution requires 100% coverage on scoring logic. Spearman is scoring-adjacent — treat it the same.
- Edge case: all riders with same score → all tied → ρ undefined. Return null (callers distinguish "no data" from "zero correlation").

---

## Work Package WP06: Benchmark Application Layer — Use Cases (Priority: P1) 🎯 MVP

**Goal**: Create the application-layer use cases that orchestrate benchmark execution: fetching startlists, computing predicted vs actual scores, and aggregating multi-race results.
**Independent Test**: Unit test `RunBenchmarkUseCase` with mocked repos: verify it computes predicted scores from pre-date results, actual scores from race results, and returns correct `BenchmarkResult` with Spearman ρ.
**Prompt**: `tasks/WP06-benchmark-application-use-cases.md`
**Estimated Size**: ~500 lines

**Requirements Refs**: FR-005, FR-006, FR-007, FR-010, FR-012

### Included Subtasks

- [ ] T024 Create `FetchStartlistUseCase` — check DB → scrape PCS if missing → persist → create missing riders
- [ ] T025 Create `RunBenchmarkUseCase` — single race benchmark orchestration
- [ ] T026 Create `RunBenchmarkSuiteUseCase` — multi-race iteration with aggregate results
- [ ] T027 Tests for `FetchStartlistUseCase` (mock startlist repo + PCS client)
- [ ] T028 Tests for `RunBenchmarkUseCase` (mock repos, verify predicted vs actual computation)

### Implementation Notes

- `FetchStartlistUseCase` mirrors the startlist-fetch pattern from `TriggerScrapeUseCase` (batch rider upsert).
- `RunBenchmarkUseCase` flow:
  1. Fetch startlist (via `FetchStartlistUseCase`)
  2. Get all rider IDs from startlist
  3. Fetch historical results before race date (`findByRiderIdsBeforeDate`)
  4. Fetch race results (`findByRace`)
  5. For each rider: `computeRiderScore(riderId, historicalResults, raceType, raceYear)` → predicted
  6. For each rider: `computeRiderScore(riderId, raceResults, raceType, raceYear, 1)` → actual
  7. Rank both, compute Spearman ρ
  8. Return `BenchmarkResult`
- `RunBenchmarkSuiteUseCase` iterates races, delegates to `RunBenchmarkUseCase`, aggregates.
- Use `@Injectable()` decorator and inject ports via constructor.

### Parallel Opportunities

- T024 (FetchStartlistUseCase) and T025-T026 (benchmark use cases) modify different files.
- T027-T028 (tests) follow after corresponding implementations.

### Dependencies

- Depends on **WP01** (findByRiderIdsBeforeDate, raceDate on entity), **WP02** (StartlistRepositoryPort), **WP03** (startlist parser), **WP05** (Spearman, value objects).

### Risks & Mitigations

- Riders on startlist with zero historical results get `totalProjectedPts = 0`. This is correct behavior (not an error).
- DNF riders: `computeRiderScore` with their actual results naturally accounts for partial race data (only scored positions count).
- Large startlists (~200 riders) × many results: batch query avoids N+1. Already handled by `findByRiderIds`.

---

## Work Package WP07: Interactive CLI & Module Wiring (Priority: P1)

**Goal**: Create the NestJS CLI command with interactive prompts, wire up the NestJS module with DI, and register it in the application.
**Independent Test**: Run `benchmark` command interactively. Select a race, verify the terminal output shows predicted vs actual table and Spearman ρ. Run `benchmark --suite`, select multiple races, verify aggregate output.
**Prompt**: `tasks/WP07-interactive-cli-module-wiring.md`
**Estimated Size**: ~450 lines

**Requirements Refs**: FR-009, FR-010, FR-011, FR-013

### Included Subtasks

- [ ] T029 Install `@inquirer/prompts` dependency in `apps/api`
- [ ] T029b Add `findDistinctRacesWithDate()` to `RaceResultRepositoryPort` and adapter (needed by CLI for race selection)
- [ ] T030 Create `BenchmarkCommand` — interactive CLI with nest-commander + inquirer prompts
- [ ] T031 Create `BenchmarkModule` — NestJS module with all DI providers for benchmark feature
- [ ] T032 Register `BenchmarkModule` in `AppModule` and verify CLI entry point picks it up

### Implementation Notes

- Follow `TriggerScrapeCommand` pattern: `@Command`, `@Option`, extend `CommandRunner`.
- `--suite` flag switches between single-race and multi-race mode.
- Interactive race selection: query DB for races with `raceDate IS NOT NULL`, present via `@inquirer/prompts` `select` (single) or `checkbox` (suite mode).
- Terminal output: use `console.table()` or a simple aligned format for rider results.
- Display columns: Rank, Rider, Predicted Pts, Actual Pts, Pred Rank, Act Rank.
- Final line: `Spearman ρ = 0.XX` (or per-race + aggregate for suite).
- `BenchmarkModule` imports `DatabaseModule`, provides all use cases, repos, PCS client.

### Parallel Opportunities

- T029 (npm install) is trivial and instant.
- T031-T032 (module wiring) and T030 (command) modify different files.

### Dependencies

- Depends on **WP06** (benchmark use cases).

### Risks & Mitigations

- `@inquirer/prompts` is ESM-first. If CJS compatibility issues arise, consider `inquirer` v9 CJS builds as fallback.
- Large race lists (96 races): paginated selection or type-ahead filter in inquirer prompt.

---

## Dependency & Execution Summary

```
Phase 0 (parallel foundation):
  WP01 ──┐
  WP02 ──┤
  WP03 ──┤ (all independent, run in parallel)
  WP05 ──┘

Phase 1 (integration):
  WP04 (depends on WP01 + WP03)
  WP06 (depends on WP01 + WP02 + WP03 + WP05) 🎯 MVP

Phase 2 (presentation):
  WP07 (depends on WP06)
```

- **Parallelization**: Phase 0 offers maximum parallelism (4 WPs). Phase 1 has WP04 and WP06 partially parallelizable (WP04 only needs WP01+WP03, WP06 needs all Phase 0).
- **MVP Scope**: WP01 + WP02 + WP03 + WP05 + WP06 + WP07 = complete single-race benchmark. WP04 (scraping integration) provides the data but can be tested with manual DB inserts initially.
- **Critical Path**: WP01/WP02/WP03/WP05 → WP06 → WP07.

---

## Subtask Index (Reference)

| Subtask ID | Summary                                          | Work Package | Priority | Parallel? |
| ---------- | ------------------------------------------------ | ------------ | -------- | --------- |
| T001       | Add `raceDate` to Drizzle schema                 | WP01         | P0       | No        |
| T002       | Add `raceDate` to RaceResult entity              | WP01         | P0       | No        |
| T003       | Update RaceResultRepositoryAdapter for raceDate  | WP01         | P0       | No        |
| T004       | Add `findByRiderIdsBeforeDate` to port + adapter | WP01         | P0       | No        |
| T004b      | Add `findByIds` to `RiderRepositoryPort`         | WP01         | P0       | No        |
| T005       | Generate Drizzle migration for raceDate          | WP01         | P0       | No        |
| T006       | Create `startlist-entries.ts` Drizzle schema     | WP02         | P0       | No        |
| T007       | Export schema + generate migration               | WP02         | P0       | No        |
| T008       | Create `StartlistEntry` domain entity            | WP02         | P0       | No        |
| T009       | Create `StartlistRepositoryPort` interface       | WP02         | P0       | No        |
| T010       | Create `StartlistRepositoryAdapter`              | WP02         | P0       | No        |
| T011       | Create `race-date.parser.ts`                     | WP03         | P0       | No        |
| T012       | Create `startlist.parser.ts`                     | WP03         | P0       | No        |
| T013       | Tests for race-date parser                       | WP03         | P0       | Yes       |
| T014       | Tests for startlist parser                       | WP03         | P0       | Yes       |
| T015       | Update TriggerScrapeUseCase for race dates       | WP04         | P1       | No        |
| T016       | Update persistResults for raceDate               | WP04         | P1       | No        |
| T017       | Update SeedDatabaseCommand for date backfill     | WP04         | P1       | No        |
| T018       | Update scraping tests for raceDate               | WP04         | P1       | No        |
| T019       | Implement `spearman-correlation.ts`              | WP05         | P0       | No        |
| T020       | 100% tests for Spearman correlation              | WP05         | P0       | No        |
| T021       | Create `BenchmarkResult` interface               | WP05         | P0       | Yes       |
| T022       | Create `BenchmarkSuiteResult` interface          | WP05         | P0       | Yes       |
| T023       | Utility: `computeRankings` helper function       | WP05         | P0       | Yes       |
| T024       | Create `FetchStartlistUseCase`                   | WP06         | P1       | No        |
| T025       | Create `RunBenchmarkUseCase`                     | WP06         | P1       | No        |
| T026       | Create `RunBenchmarkSuiteUseCase`                | WP06         | P1       | No        |
| T027       | Tests for FetchStartlistUseCase                  | WP06         | P1       | No        |
| T028       | Tests for RunBenchmarkUseCase                    | WP06         | P1       | No        |
| T029       | Install `@inquirer/prompts`                      | WP07         | P1       | No        |
| T029b      | Add `findDistinctRacesWithDate` to repo          | WP07         | P1       | No        |
| T030       | Create `BenchmarkCommand` CLI                    | WP07         | P1       | No        |
| T031       | Create `BenchmarkModule` NestJS module           | WP07         | P1       | No        |
| T032       | Register module in AppModule                     | WP07         | P1       | No        |
