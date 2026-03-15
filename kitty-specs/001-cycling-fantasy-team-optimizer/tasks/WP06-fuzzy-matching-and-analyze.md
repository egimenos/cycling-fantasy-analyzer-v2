---
work_package_id: WP06
title: Fuzzy Matching & Analyze Endpoint
lane: planned
dependencies:
- WP02
- WP05
subtasks:
- T028
- T029
- T030
- T031
- T032
phase: Phase 3 - Scoring & Matching
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
- FR-001
- FR-002
- FR-003
- FR-004
- FR-011
---

# WP06 — Fuzzy Matching & Analyze Endpoint

## Review Feedback

_No review feedback yet._

---

## Objectives

1. Build a robust price list parser that handles the messy, variable formatting of pasted text from Grandes miniVueltas race pages.
2. Implement a fuzzy matching adapter using `fuzzysort` that reliably maps raw rider names from price lists to canonical riders stored in the database.
3. Wire up the full `/api/analyze` endpoint that combines parsing, matching, scoring, and ranking into a single request-response cycle.
4. Establish the `@cycling-analyzer/shared-types` package with all API contract types so frontend and backend stay aligned.

---

## Context

This work package bridges the data layer (riders + race results from WP02/WP05) with the user-facing analysis feature. The user pastes a raw price list from a fantasy cycling site, and the system must parse it, identify each rider, compute projected scores, and return a ranked list. The fuzzy matching step is critical because rider names in price lists rarely match the canonical names exactly — accents, abbreviations, and formatting differences are the norm.

**Key references:**
- `plan.md` — Phase 3 description and data flow diagrams
- `spec.md` — AnalyzeResponse contract and matching requirements
- `data-model.md` — Rider and RaceResult schemas
- `contracts/api.md` — POST /api/analyze request/response shapes
- `.kittify/memory/constitution.md` — TypeScript strict mode, no `any`, 90% unit coverage

**Stack reminder:** NestJS backend, Drizzle ORM, PostgreSQL, DDD/hexagonal architecture. All domain logic must be framework-independent pure functions.

---

## Subtasks

### T028: Price List Parser

**File:** `apps/api/src/application/analyze/price-list-parser.ts`

> **DDD note**: Parsing raw text from an external source (pasted from a fantasy cycling
> website) is **input adaptation**, not domain logic. This function lives in the
> application layer, close to the use case that consumes it. The domain layer only
> receives already-structured `PriceListEntry` value objects.

**Purpose:** Parse raw text pasted from Grandes miniVueltas race pages into structured `PriceListEntry[]` objects.

**Step-by-step instructions:**

1. Define the `PriceListEntry` interface:
   ```typescript
   interface PriceListEntry {
     rawName: string;
     rawTeam: string;
     priceHillios: number;
   }
   ```

2. Define the `ParseResult` interface:
   ```typescript
   interface ParseResult {
     entries: PriceListEntry[];
     errors: ParseError[];
   }

   interface ParseError {
     line: number;
     rawText: string;
     reason: string;
   }
   ```

3. Implement `parsePriceList(rawText: string): ParseResult` as a pure function:
   - Split input by newline characters (`\n`, `\r\n`)
   - Trim each line; skip empty lines and header lines (detect via heuristics: lines containing "Rider", "Name", "Team", "Price" as column headers)
   - For each candidate line, attempt to extract three fields: rider name, team name, price
   - Handle multiple whitespace separators: tabs (`\t`), multiple spaces, pipe characters (`|`)
   - Price extraction: look for numeric value (possibly with decimators), strip non-numeric characters except decimal point
   - Normalize whitespace within extracted name and team fields
   - If a line cannot be parsed into all three fields, add it to the errors array with a descriptive reason

4. Handle edge cases:
   - Lines with only two fields (missing team) — attempt to parse as name + price, set rawTeam to empty string
   - Price values with currency symbols or suffixes (e.g., "H", "hillios")
   - Lines with trailing comments or extra columns — take first three meaningful columns
   - Accented characters: preserve as-is in rawName/rawTeam (normalization happens in the matcher)
   - Completely blank or whitespace-only lines: skip silently without adding to errors

5. Export the function and all interfaces from the module.

**Validation criteria:**
- Given a well-formatted 3-column tab-separated input, returns all entries with zero errors
- Given a mixed-format input (tabs + spaces), still extracts all valid entries
- Given lines with accented names like "POGACAR Tadej" or "POGACAR Tadej", preserves characters
- Given a header line "Rider Team Price", skips it
- Given a completely unparseable line "???!!!", adds it to errors with reason

**Edge cases to test:**
- Empty string input returns empty entries and empty errors
- Single rider input returns exactly one entry
- Input with Windows-style line endings (`\r\n`)
- Price values: "150", "150H", "150.5", "1,500", "1.500" (European format)
- Unicode BOM at start of input

---

### T029: Fuzzysort Matcher Adapter

**File:** `apps/api/src/infrastructure/matching/fuzzysort-matcher.adapter.ts`

**Port interface file:** `apps/api/src/domain/matching/rider-matcher.port.ts`

**Step-by-step instructions:**

1. First, define the port interface in the domain layer:
   ```typescript
   // rider-matcher.port.ts
   export interface RiderMatchResult {
     matchedRiderId: string | null;
     confidence: number;
     unmatched: boolean;
   }

   export interface RiderMatcherPort {
     matchRider(rawName: string, rawTeam: string): Promise<RiderMatchResult>;
     loadRiders(riders: RiderTarget[]): void;
   }

   export interface RiderTarget {
     id: string;
     normalizedName: string;
     currentTeam: string;
   }

   export const RIDER_MATCHER_PORT = Symbol('RiderMatcherPort');
   ```

2. Install `fuzzysort` package:
   ```bash
   cd apps/api && pnpm add fuzzysort
   ```
   Also install types if available: `pnpm add -D @types/fuzzysort` (check if bundled).

3. Implement the adapter class `FuzzysortMatcherAdapter implements RiderMatcherPort`:
   - `private riders: RiderTarget[] = []`
   - `loadRiders(riders: RiderTarget[]): void` — store riders, pre-compute normalized fields
   - Normalization helper: `normalizeText(str: string): string`
     - Apply NFD unicode normalization: `str.normalize('NFD').replace(/[\u0300-\u036f]/g, '')`
     - Convert to lowercase
     - Trim whitespace
   - `matchRider(rawName: string, rawTeam: string): Promise<RiderMatchResult>`:
     - Normalize the incoming rawName and rawTeam
     - Use `fuzzysort.go()` with multi-key weighted search:
       ```typescript
       fuzzysort.go(normalizedQuery, this.riders, {
         keys: [
           { key: 'normalizedName', weight: 2 },
           { key: 'currentTeam', weight: 1 }
         ],
         threshold: this.confidenceThreshold
       })
       ```
     - If results array is empty: return `{ matchedRiderId: null, confidence: 0, unmatched: true }`
     - Otherwise: take first result, return `{ matchedRiderId: result.obj.id, confidence: result.score, unmatched: false }`

4. Configuration:
   - Read `FUZZY_MATCH_THRESHOLD` from environment (default: `-10000`)
   - Inject via NestJS `ConfigService` or constructor parameter
   - Register as a provider implementing `RiderMatcherPort` injection token

5. Register in NestJS module:
   ```typescript
   // matching.module.ts
   import { RIDER_MATCHER_PORT } from '../../domain/matching/rider-matcher.port';

   providers: [
     { provide: RIDER_MATCHER_PORT, useClass: FuzzysortMatcherAdapter }
   ]
   ```

**Validation criteria:**
- Exact match "POGACAR Tadej" against target "Pogacar Tadej" returns high confidence
- Accented match "POGACAR" vs "POGAČAR" returns a match after normalization
- Completely unrelated name "ZZZZZ XXXXX" returns unmatched: true
- Team weighting: when two riders have similar names, the one with matching team ranks higher
- Threshold is respected: matches below threshold return unmatched

**Edge cases to test:**
- Empty rider pool — all queries return unmatched
- Single rider in pool — matches or not based on threshold
- Query with only team name and empty rider name
- Very long input strings (500+ chars)
- Riders with identical names but different teams

---

### T030: Analyze Price List Use Case

**File:** `apps/api/src/application/analyze/analyze-price-list.use-case.ts`

**Step-by-step instructions:**

1. Define the use case class with injected dependencies:
   ```typescript
   import { Injectable, Inject } from '@nestjs/common';
   import { RiderMatcherPort, RIDER_MATCHER_PORT } from '../../domain/matching/rider-matcher.port';
   import { RiderRepositoryPort, RIDER_REPOSITORY_PORT } from '../../domain/rider/rider.repository.port';
   import { RaceResultRepositoryPort, RACE_RESULT_REPOSITORY_PORT } from '../../domain/race-result/race-result.repository.port';
   import { ScoringService } from '../../domain/scoring/scoring.service';
   import { parsePriceList } from './price-list-parser';

   @Injectable()
   class AnalyzePriceListUseCase {
     constructor(
       @Inject(RIDER_MATCHER_PORT) private matcher: RiderMatcherPort,
       @Inject(RIDER_REPOSITORY_PORT) private riderRepo: RiderRepositoryPort,
       @Inject(RACE_RESULT_REPOSITORY_PORT) private resultRepo: RaceResultRepositoryPort,
       private scoringService: ScoringService,
     ) {}
   }
   ```
   > **Hexagonal compliance**: The use case imports `parsePriceList` from its own
   > application layer (co-located). It depends on domain ports (`RiderMatcherPort`,
   > `RiderRepositoryPort`, `RaceResultRepositoryPort`) and the domain scoring service.
   > No infrastructure imports.

2. Implement `execute(input: AnalyzeInput): Promise<AnalyzeResponse>`:
   - Step 1: Parse raw text using `parsePriceList(input.rawText)`
   - Step 2: Load all riders from DB via `riderRepo.findAll()`
   - Step 3: Feed riders into matcher via `matcher.loadRiders(riderTargets)`
   - Step 4: For each `PriceListEntry`, call `matcher.matchRider(entry.rawName, entry.rawTeam)`
   - Step 5: For matched riders, fetch race results via `resultRepo.findByRiderId(matchedRiderId)`
   - Step 6: Compute `RiderScore` per rider via `computeRiderScore(rider, results, input.raceType)`
   - Step 7: **Compute pool statistics** using `computePoolStats()` from all matched riders'
     `totalProjectedPts` + `priceHillios`. This requires ALL rider scores to be computed first.
   - Step 8: **Compute composite scores** for each rider via `computeCompositeScore(riderScore, price, poolStats)`.
     The `compositeScore` is the PRIMARY ranking metric — it inherently captures the
     price-quality relationship relative to the rider pool (FR-004b).
   - Step 9: Build `AnalyzedRider[]` combining price, match info, rider score, AND composite score
   - Step 10: Sort by `compositeScore` descending (NOT by `totalProjectedPts`)
   - Step 11: Assemble and return `AnalyzeResponse`

   **IMPORTANT**: The sorting must be by `compositeScore` (price-aware value score), not by
   raw `totalProjectedPts`. The composite score IS the score users see. The `totalProjectedPts`
   is still available in the response for transparency but is not the primary ranking metric.

3. Aggregate metadata in response:
   - `totalParsed`: number of entries from parser
   - `totalMatched`: number of entries that matched a rider
   - `unmatchedCount`: totalParsed - totalMatched
   - `parseErrors`: errors from parser step
   - `riders`: the sorted AnalyzedRider array

4. Performance consideration: batch the DB queries. Load all riders once, not per entry. Similarly, batch race result fetching if possible (use `findByRiderIds(ids[])`).

**Validation criteria:**
- Given valid rawText with 20 riders, all matching DB riders: returns 20 AnalyzedRiders sorted by `compositeScore` descending
- The `compositeScore` reflects both historical performance AND price efficiency relative to the pool
- A cheap rider with decent projected points ranks above an expensive rider with only slightly better projected points (price-quality relationship captured)
- Given rawText with 5 unmatched riders: unmatchedCount is 5, those riders appear with null compositeScore
- Given empty rawText: returns 422 error (zero riders parsed)
- Parse errors are included in response metadata

**Edge cases to test:**
- All riders unmatched — returns riders with null scores, unmatchedCount = totalParsed
- Duplicate rider names in price list — each gets independently matched
- Very large input (500+ riders) — performance should be under 5 seconds
- All riders have same price — compositeScore ranking matches totalProjectedPts ranking
- Single matched rider — pool stats degenerate, compositeScore still computed (no division by zero)

---

### T031: POST /api/analyze Endpoint

**File:** `apps/api/src/presentation/analyze.controller.ts`

**Step-by-step instructions:**

1. Create the controller:
   ```typescript
   @Controller('api')
   export class AnalyzeController {
     constructor(private readonly analyzeUseCase: AnalyzePriceListUseCase) {}

     @Post('analyze')
     async analyze(@Body() dto: AnalyzeRequestDto): Promise<AnalyzeResponse> {
       return this.analyzeUseCase.execute(dto);
     }
   }
   ```

2. Define and validate the request DTO:
   ```typescript
   class AnalyzeRequestDto {
     @IsString()
     @IsNotEmpty()
     rawText: string;

     @IsEnum(RaceType)
     raceType: 'grand_tour' | 'classic' | 'mini_tour';

     @IsNumber()
     @Min(1)
     budget: number;
   }
   ```

3. Error handling:
   - 400 Bad Request: validation failures (empty rawText, invalid raceType, budget <= 0)
   - 422 Unprocessable Entity: parser returns zero valid entries
   - 500 Internal Server Error: unexpected failures (DB down, etc.)
   - Use NestJS exception filters for consistent error response shape

4. Response shape must match `contracts/api.md` `AnalyzeResponse` definition exactly. Cross-reference and ensure field names, types, and nesting match.

5. Register controller in the appropriate NestJS module and ensure all providers are wired.

**Validation criteria:**
- POST with valid body returns 200 with AnalyzeResponse shape
- POST with empty rawText returns 400
- POST with invalid raceType returns 400
- POST with budget=0 returns 400
- POST with valid body but all unparseable text returns 422

---

### T032: Shared Types Package

**File:** `packages/shared-types/src/enums.ts`, `packages/shared-types/src/api.ts`, `packages/shared-types/src/scoring.ts`, `packages/shared-types/src/index.ts`

> **DDD note**: The canonical enum and entity definitions live in `apps/api/src/domain/`.
> `shared-types` is a **DTO/contract package** for the API boundary — it defines the
> shapes that flow between frontend and backend over HTTP. It must NOT be imported by the
> domain layer. The presentation/adapter layer maps domain entities → shared-types DTOs.

**Step-by-step instructions:**

1. In `packages/shared-types/src/enums.ts`, **duplicate** the domain enums as string
   literal types (these are the API contract types, independent of the domain enums):
   ```typescript
   export type RaceType = 'grand_tour' | 'classic' | 'mini_tour';
   export type RaceClass = 'UWT' | 'Pro' | '1';
   export type ResultCategory = 'gc' | 'stage' | 'mountain' | 'sprint' | 'final';
   export type ScrapeStatus = 'pending' | 'running' | 'success' | 'failed';
   export type HealthStatus = 'healthy' | 'degraded' | 'failing';
   ```
   Why duplicate instead of import? Because `shared-types` is consumed by the frontend
   (which cannot import from `apps/api/src/domain/`). The values are identical; the
   presentation layer ensures they stay in sync.

2. In `packages/shared-types/src/api.ts`, define API contract types aligned with domain:
   - `AnalyzeRequest`: `{ rawText: string; raceType: RaceType; budget: number }`
   - `AnalyzeResponse`: `{ riders: AnalyzedRider[]; totalParsed: number; totalMatched: number; unmatchedCount: number; parseErrors: ParseError[] }`
   - `AnalyzedRider`:
     ```typescript
     {
       id: string | null;
       rawName: string;
       rawTeam: string;
       priceHillios: number;
       matchedRider: { id: string; pcsSlug: string; fullName: string; currentTeam: string } | null;
       matchConfidence: number;
       unmatched: boolean;
       compositeScore: number | null;
       pointsPerHillio: number | null;
       totalProjectedPts: number | null;
       categoryScores: {
         gc: number; stage: number; mountain: number; sprint: number; final: number;
       } | null;
       seasonsUsed: number | null;
     }
     ```
     NOTE: `compositeScore` is the PRIMARY ranking field (price-aware value score from
     WP05). `categoryScores` mirrors the domain `RiderScore.categoryScores` structure.
     `totalProjectedPts` is the raw historical projection (for transparency).
     **No `dailyProjectedPts`** — this field does not exist in the scoring engine.
   - `OptimizeRequest`: `{ riders: AnalyzedRider[]; budget: number; mustInclude: string[]; mustExclude: string[] }`
   - `OptimizeResponse`: `{ optimalTeam: TeamSelection; alternativeTeams: TeamSelection[] }`
   - `TeamSelection`: `{ riders: AnalyzedRider[]; totalCostHillios: number; totalProjectedPts: number; budgetRemaining: number }`

3. In `packages/shared-types/src/scoring.ts`, define:
   - `ParseError`: `{ line: number; rawText: string; reason: string }`
   - Remove `RiderScore` from here — the score breakdown is inlined in `AnalyzedRider.categoryScores`
   - Remove `ScoreCategory` — use `ResultCategory` from enums instead
   - **Do NOT define `dailyProjectedPts`** — it does not exist in the domain scoring engine

4. In `packages/shared-types/src/index.ts`, re-export everything:
   ```typescript
   export * from './enums';
   export * from './api';
   export * from './scoring';
   ```

5. Ensure `packages/shared-types/package.json` has proper `main`, `types`, and `exports`
   fields pointing to the built output. Verify the package name is
   `@cycling-analyzer/shared-types`.

**Validation criteria:**
- Types compile without errors under `strict: true`
- No `any` types anywhere
- All types are exported and importable from `@cycling-analyzer/shared-types`
- Types match `contracts/api.md` definitions exactly
- Field names in `AnalyzedRider` match the domain `RiderScore` structure (e.g.,
  `categoryScores.gc`, NOT `gcPts`)
- No phantom fields (`dailyProjectedPts` must NOT exist)
- `shared-types` has ZERO imports from `apps/api/` (it's a standalone package)

---

## Test Strategy

**Unit tests (target 90%+ coverage):**

- `apps/api/test/application/analyze/price-list-parser.spec.ts`:
  - Test well-formatted input (tab-separated, space-separated, pipe-separated)
  - Test malformed lines are captured in errors array
  - Test header line detection and skipping
  - Test accented character preservation
  - Test edge cases: empty input, single line, BOM character
  - Minimum 3 different fixture formats from real race pages

- `apps/api/test/infrastructure/matching/fuzzysort-matcher.adapter.spec.ts`:
  - Test exact name match returns high confidence
  - Test accent-insensitive matching (POGACAR vs POGAČAR)
  - Test unmatched name returns null
  - Test team weighting affects ranking
  - Test threshold configuration
  - Test empty rider pool

- `apps/api/test/application/analyze/analyze-price-list.use-case.spec.ts`:
  - Mock all ports (RiderMatcherPort, RiderRepositoryPort, RaceResultRepositoryPort, ScoringService)
  - Test happy path: all riders matched and scored
  - Test partial match: some riders unmatched
  - Test zero parsed riders triggers error

- `apps/api/test/presentation/analyze.controller.spec.ts`:
  - Test 200 response with valid input
  - Test 400 for each validation failure
  - Test 422 for zero parseable riders

**Test fixtures:**
- Create `apps/api/test/fixtures/price-lists/` directory with at least 3 sample price list texts
- Create `apps/api/test/fixtures/riders/` with sample rider data for matching tests

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Price list format varies significantly across races | High | High | Capture 3+ real fixtures; build parser to handle multiple separator types; add error reporting for unparseable lines |
| Fuzzy matching false positives (similar names) | Medium | High | Use weighted multi-field matching (name + team); set conservative threshold; log low-confidence matches for review |
| fuzzysort library performance with large rider pools | Low | Medium | Pre-normalize all text; benchmark with 500+ riders; consider caching normalized targets |
| Shared types package build/export issues in monorepo | Medium | Medium | Test import from both apps/api and apps/web before merging; verify tsconfig paths |

---

## Review Guidance

When reviewing this WP, check the following:

1. **Parser robustness**: Does the parser handle at least 3 different real-world price list formats? Are error messages descriptive enough to help users fix their input?
2. **Matcher accuracy**: Run the matcher against the test fixtures — are there false positives or false negatives? Is the threshold appropriate?
3. **Hexagonal compliance**: Is the domain logic (parser, matcher port) free of framework dependencies? Is the adapter properly implementing the port interface?
4. **Type safety**: Do all shared types compile under strict mode? Are there any `as` casts or type assertions that could hide bugs?
5. **API contract alignment**: Does the endpoint response exactly match `contracts/api.md`? Test with the actual frontend client code if available.
6. **Performance**: Time the analyze endpoint with a 200-rider price list. Should complete under 3 seconds.

---

## Activity Log

| Timestamp | Action | Agent | Details |
|-----------|--------|-------|---------|
| 2026-03-14T23:51:57Z | Created | system | Prompt generated via /spec-kitty.tasks |
