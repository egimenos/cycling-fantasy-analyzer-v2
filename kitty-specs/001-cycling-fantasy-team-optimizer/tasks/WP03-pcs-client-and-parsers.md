---
work_package_id: WP03
title: PCS HTTP Client & Parsers
lane: planned
dependencies: [WP02]
subtasks:
- T013
- T014
- T015
- T016
- T017
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

# WP03 — PCS HTTP Client & Parsers

## Objectives

Build the scraping infrastructure for extracting race results from ProCyclingStats (PCS).
This work package delivers an HTTP client with rate limiting and retry logic, HTML parsers
for stage races and classics, a race catalog defining all tracked races, and comprehensive
unit tests backed by real HTML fixtures. By completion, the parsers must correctly extract
rider names, positions, and classifications from captured PCS HTML pages.

## Project Context

- **Stack**: NestJS backend, Axios for HTTP, Cheerio for HTML parsing.
- **Architecture**: All scraping infrastructure lives under
  `apps/api/src/infrastructure/scraping/`. Parsers are pure functions with no NestJS
  dependencies — they accept HTML strings and return typed data structures.
- **Constitution**: TypeScript strict, no `any`, 90% unit coverage minimum. Parser tests
  must use real HTML fixtures to catch regressions if PCS changes their markup.
- **Depends on**: WP02 (domain entities and enums must exist for type definitions).
- **Key reference files**: `research.md` for PCS URL patterns and HTML structure,
  `data-model.md` for result types, `contracts/api.md` for API shapes.

## Detailed Subtask Guidance

### T013 — PCS HTTP Client

**Goal**: Create a robust HTTP client for fetching pages from ProCyclingStats with rate
limiting, retry logic, and HTML parsing utilities.

**Steps**:

1. Install dependencies:
   ```bash
   pnpm --filter api add axios cheerio
   pnpm --filter api add -D @types/cheerio
   ```
2. Create `apps/api/src/infrastructure/scraping/pcs-client.adapter.ts`:
   ```typescript
   import { Injectable, Logger } from '@nestjs/common';
   import axios, { AxiosInstance, AxiosError } from 'axios';
   import * as cheerio from 'cheerio';

   @Injectable()
   export class PcsClientAdapter {
     private readonly logger = new Logger(PcsClientAdapter.name);
     private readonly client: AxiosInstance;
     private readonly requestDelayMs: number;
     private lastRequestAt = 0;

     constructor() {
       this.requestDelayMs = parseInt(process.env.PCS_REQUEST_DELAY_MS ?? '1500', 10);
       this.client = axios.create({
         baseURL: 'https://www.procyclingstats.com/',
         headers: {
           'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
         },
         timeout: 30000,
       });
     }
   }
   ```
3. Implement rate limiting in the `fetchPage` method:
   ```typescript
   async fetchPage(path: string): Promise<string> {
     await this.throttle();
     // ... fetch logic with retry
   }

   private async throttle(): Promise<void> {
     const now = Date.now();
     const elapsed = now - this.lastRequestAt;
     if (elapsed < this.requestDelayMs) {
       await this.sleep(this.requestDelayMs - elapsed);
     }
     this.lastRequestAt = Date.now();
   }

   private sleep(ms: number): Promise<void> {
     return new Promise((resolve) => setTimeout(resolve, ms));
   }
   ```
4. Implement retry logic:
   - On HTTP 429 (Too Many Requests): retry up to 3 times with exponential backoff
     (2000ms, 4000ms, 8000ms). Log a warning on each retry.
   - On HTTP 5xx: retry once after 5000ms. Log a warning.
   - On HTTP 4xx (except 429): throw immediately, do not retry.
   - On network errors (ECONNRESET, ETIMEDOUT): retry once after 3000ms.
5. Add a utility method for Cheerio parsing:
   ```typescript
   parseHtml(html: string): cheerio.CheerioAPI {
     return cheerio.load(html);
   }
   ```
6. Create the driven port that the application layer will depend on:
   ```typescript
   // apps/api/src/application/scraping/ports/pcs-scraper.port.ts
   export interface PcsScraperPort {
     fetchPage(path: string): Promise<string>;
   }
   export const PCS_SCRAPER_PORT = Symbol('PcsScraperPort');
   ```
   The `PcsClientAdapter` implements this port. The application layer (use cases) depends
   on `PcsScraperPort`, never on `PcsClientAdapter` directly.
7. Make the client injectable via NestJS but ensure the core logic (retry, throttle) is
   testable without NestJS by extracting it into pure functions if needed.

**Validation**: Unit test the retry logic by mocking Axios responses. Test that:
- A 429 response triggers exponential backoff and retries
- A 200 response returns the HTML body
- Three consecutive 429 responses followed by a 200 succeeds
- Four consecutive 429 responses throws an error
- Rate limiting enforces the minimum delay between requests

---

### T014 — Stage Race Parser

**Goal**: Parse PCS HTML pages for stage race results including GC, stage, mountain, and
sprint classifications.

**Steps**:

1. Create `apps/api/src/infrastructure/scraping/parsers/parsed-result.type.ts`:
   ```typescript
   import { ResultCategory } from '../../../domain/shared/result-category.enum';

   export interface ParsedResult {
     readonly riderName: string;
     readonly riderSlug: string;
     readonly teamName: string;
     readonly position: number | null;
     readonly category: ResultCategory;
     readonly stageNumber?: number;
     readonly dnf: boolean;
   }
   ```
2. Create `apps/api/src/infrastructure/scraping/parsers/stage-race.parser.ts`:
   ```typescript
   import * as cheerio from 'cheerio';
   import { ParsedResult } from './parsed-result.type';
   import { ResultCategory } from '../../../domain/shared/result-category.enum';

   export function parseGcResults(html: string): ParsedResult[] { /* ... */ }
   export function parseStageResults(html: string, stageNumber: number): ParsedResult[] { /* ... */ }
   export function parseMountainClassification(html: string): ParsedResult[] { /* ... */ }
   export function parseSprintClassification(html: string): ParsedResult[] { /* ... */ }
   ```
3. Implementation guidance for each parser function:
   - **parseGcResults**: Load HTML with Cheerio. Find the results table (typically
     `table.results` or the main standings table). For each row:
     - Extract position from the rank column (first `td` or column with class `rank`)
     - Extract rider name from the link (`a[href*="/rider/"]`)
     - Extract rider slug from the href attribute (last path segment)
     - Extract team name from the team column
     - Handle DNF/DNS/OTL: if position cell contains "DNF", "DNS", or "OTL", set
       `position = null` and `dnf = true`
     - Set `category = ResultCategory.GC`
   - **parseStageResults**: Same table parsing logic but with `category = ResultCategory.STAGE`
     and the `stageNumber` parameter attached to each result. Position comes from the
     finishing order, not the GC rank.
   - **parseMountainClassification**: Parse the KOM/mountain standings page. Same approach,
     `category = ResultCategory.MOUNTAIN`.
   - **parseSprintClassification**: Parse the sprint/points classification page.
     `category = ResultCategory.SPRINT`.
4. Handle edge cases:
   - Riders who abandon mid-stage (listed as DNF in stage results)
   - Riders with no time gap shown (first rider, or riders in the same group)
   - Tables with different column counts depending on race
   - Empty tables (race not yet started or no data available)

**Validation**: Parser functions must be pure (no side effects, no HTTP calls). They
accept an HTML string and return `ParsedResult[]`. Test with real fixtures (T017).

---

### T015 — Classic Race Parser

**Goal**: Parse PCS HTML pages for one-day classic race results.

**Steps**:

1. Create `apps/api/src/infrastructure/scraping/parsers/classic.parser.ts`:
   ```typescript
   import * as cheerio from 'cheerio';
   import { ParsedResult } from './parsed-result.type';
   import { ResultCategory } from '../../../domain/shared/result-category.enum';

   export function parseClassicResults(html: string): ParsedResult[] {
     const $ = cheerio.load(html);
     const results: ParsedResult[] = [];

     // Classic races have a single results table
     // Category is always ResultCategory.FINAL
     // No stage numbers
     // Parse each row for position, rider, team
     // Handle DNF/DNS entries

     return results;
   }
   ```
2. Classic results are simpler than stage races:
   - Single table with final results
   - No sub-classifications (no GC, mountain, sprint)
   - Category is always `ResultCategory.FINAL`
   - No `stageNumber` field
3. The table structure is similar to stage results but typically contains:
   - Rank column (position)
   - Rider name with link
   - Team name
   - Time gap or points
   - Sometimes UCI points column
4. Handle same edge cases as stage race parser: DNF, DNS, empty tables.

**Validation**: Test with Milan-San Remo 2024 fixture (T017). Must extract correct winner,
correct top-5 positions, and handle any DNF riders.

---

### T016 — Race Catalog

**Goal**: Define a static catalog of all races tracked by the system with their metadata.

> **DDD note**: The race catalog is **domain knowledge** — it defines which races exist
> and their classifications. It belongs in the domain layer, not infrastructure.

**Steps**:

1. Create `apps/api/src/domain/race/race-catalog.ts`:
   ```typescript
   import { RaceType } from '../shared/race-type.enum';
   import { RaceClass } from '../shared/race-class.enum';

   export interface RaceCatalogEntry {
     readonly slug: string;
     readonly name: string;
     readonly raceType: RaceType;
     readonly raceClass: RaceClass;
     readonly gender: 'men';
   }

   export const RACE_CATALOG: readonly RaceCatalogEntry[] = [
     // Grand Tours
     { slug: 'tour-de-france', name: 'Tour de France', raceType: RaceType.GRAND_TOUR, raceClass: RaceClass.UWT, gender: 'men' },
     { slug: 'giro-d-italia', name: 'Giro d\'Italia', raceType: RaceType.GRAND_TOUR, raceClass: RaceClass.UWT, gender: 'men' },
     { slug: 'vuelta-a-espana', name: 'Vuelta a Espana', raceType: RaceType.GRAND_TOUR, raceClass: RaceClass.UWT, gender: 'men' },

     // Monument Classics
     { slug: 'milan-san-remo', name: 'Milan-San Remo', raceType: RaceType.CLASSIC, raceClass: RaceClass.UWT, gender: 'men' },
     { slug: 'ronde-van-vlaanderen', name: 'Tour of Flanders', raceType: RaceType.CLASSIC, raceClass: RaceClass.UWT, gender: 'men' },
     { slug: 'paris-roubaix', name: 'Paris-Roubaix', raceType: RaceType.CLASSIC, raceClass: RaceClass.UWT, gender: 'men' },
     { slug: 'liege-bastogne-liege', name: 'Liege-Bastogne-Liege', raceType: RaceType.CLASSIC, raceClass: RaceClass.UWT, gender: 'men' },
     { slug: 'il-lombardia', name: 'Il Lombardia', raceType: RaceType.CLASSIC, raceClass: RaceClass.UWT, gender: 'men' },

     // Other UWT Classics
     { slug: 'strade-bianche', name: 'Strade Bianche', raceType: RaceType.CLASSIC, raceClass: RaceClass.UWT, gender: 'men' },
     { slug: 'amstel-gold-race', name: 'Amstel Gold Race', raceType: RaceType.CLASSIC, raceClass: RaceClass.UWT, gender: 'men' },
     { slug: 'la-fleche-wallone', name: 'La Fleche Wallonne', raceType: RaceType.CLASSIC, raceClass: RaceClass.UWT, gender: 'men' },
     // ... additional classics

     // Mini Tours (Stage Races)
     { slug: 'paris-nice', name: 'Paris-Nice', raceType: RaceType.MINI_TOUR, raceClass: RaceClass.UWT, gender: 'men' },
     { slug: 'tirreno-adriatico', name: 'Tirreno-Adriatico', raceType: RaceType.MINI_TOUR, raceClass: RaceClass.UWT, gender: 'men' },
     { slug: 'volta-a-catalunya', name: 'Volta a Catalunya', raceType: RaceType.MINI_TOUR, raceClass: RaceClass.UWT, gender: 'men' },
     { slug: 'criterium-du-dauphine', name: 'Criterium du Dauphine', raceType: RaceType.MINI_TOUR, raceClass: RaceClass.UWT, gender: 'men' },
     { slug: 'tour-de-romandie', name: 'Tour de Romandie', raceType: RaceType.MINI_TOUR, raceClass: RaceClass.UWT, gender: 'men' },
     { slug: 'tour-de-suisse', name: 'Tour de Suisse', raceType: RaceType.MINI_TOUR, raceClass: RaceClass.UWT, gender: 'men' },
     { slug: 'itzulia-basque-country', name: 'Itzulia Basque Country', raceType: RaceType.MINI_TOUR, raceClass: RaceClass.UWT, gender: 'men' },
     // ... additional mini tours
   ] as const;
   ```
2. Add a lookup helper:
   ```typescript
   export function findRaceBySlug(slug: string): RaceCatalogEntry | undefined {
     return RACE_CATALOG.find((race) => race.slug === slug);
   }
   ```
3. Ensure the catalog explicitly excludes:
   - Women's races (all entries have `gender: 'men'`)
   - Lower-category races (.2, 2.2, 1.2 classifications)
   - Non-road events (track, cyclocross, mountain bike)
4. Add inline comments explaining the inclusion criteria and how to add new races.

**Validation**: The catalog must type-check. Every entry must have valid enum values. A
unit test should verify no duplicate slugs exist and all required fields are present.

---

### T017 — Unit Tests with HTML Fixtures

**Goal**: Create comprehensive unit tests for all parsers using real HTML captured from PCS.

**Steps**:

1. Create the fixture directory: `apps/api/test/fixtures/pcs/`
2. Capture real HTML pages from PCS and save as fixtures:
   - `apps/api/test/fixtures/pcs/tdf-2024-gc.html` — Tour de France 2024 GC standings
   - `apps/api/test/fixtures/pcs/tdf-2024-stage1.html` — Tour de France 2024 Stage 1 results
   - `apps/api/test/fixtures/pcs/tdf-2024-mountain.html` — Tour de France 2024 KOM classification
   - `apps/api/test/fixtures/pcs/tdf-2024-sprint.html` — Tour de France 2024 Sprint classification
   - `apps/api/test/fixtures/pcs/milan-san-remo-2024.html` — Milan-San Remo 2024 results
3. Create test files:
   - `apps/api/test/infrastructure/scraping/parsers/stage-race.parser.spec.ts`
   - `apps/api/test/infrastructure/scraping/parsers/classic.parser.spec.ts`
   - `apps/api/test/infrastructure/scraping/pcs-client.adapter.spec.ts`
   - `apps/api/test/domain/race/race-catalog.spec.ts`
4. Stage race parser tests:
   ```typescript
   describe('StageRaceParser', () => {
     let gcHtml: string;
     let stageHtml: string;

     beforeAll(() => {
       gcHtml = fs.readFileSync('test/fixtures/pcs/tdf-2024-gc.html', 'utf-8');
       stageHtml = fs.readFileSync('test/fixtures/pcs/tdf-2024-stage1.html', 'utf-8');
     });

     describe('parseGcResults', () => {
       it('should extract the correct number of riders', () => { /* ... */ });
       it('should identify the correct GC winner', () => { /* ... */ });
       it('should extract correct top-5 positions', () => { /* ... */ });
       it('should handle DNF entries with null position', () => { /* ... */ });
       it('should set category to GC for all results', () => { /* ... */ });
       it('should extract valid rider slugs', () => { /* ... */ });
     });

     describe('parseStageResults', () => {
       it('should extract stage winner correctly', () => { /* ... */ });
       it('should attach the correct stage number', () => { /* ... */ });
       it('should handle DNS entries', () => { /* ... */ });
     });

     describe('parseMountainClassification', () => { /* ... */ });
     describe('parseSprintClassification', () => { /* ... */ });
   });
   ```
5. Classic parser tests:
   ```typescript
   describe('ClassicParser', () => {
     it('should extract Milan-San Remo 2024 winner', () => { /* ... */ });
     it('should extract correct top-5 positions', () => { /* ... */ });
     it('should set category to FINAL for all results', () => { /* ... */ });
     it('should not include stageNumber', () => { /* ... */ });
   });
   ```
6. PCS client tests (mock Axios):
   ```typescript
   describe('PcsClientAdapter', () => {
     it('should enforce rate limiting between requests', () => { /* ... */ });
     it('should retry on 429 with exponential backoff', () => { /* ... */ });
     it('should retry once on 5xx errors', () => { /* ... */ });
     it('should not retry on 4xx errors', () => { /* ... */ });
     it('should throw after max retries exceeded', () => { /* ... */ });
   });
   ```
7. Race catalog tests:
   ```typescript
   describe('RaceCatalog', () => {
     it('should have no duplicate slugs', () => { /* ... */ });
     it('should include all three Grand Tours', () => { /* ... */ });
     it('should include all five Monuments', () => { /* ... */ });
     it('should only contain men races', () => { /* ... */ });
     it('should findRaceBySlug return correct entry', () => { /* ... */ });
   });
   ```

**Validation**: All tests must pass with `pnpm --filter api test`. Coverage for parser
files must be at least 90%. Fixture files must be committed to the repository (they are
test data, not secrets).

**Notes**: When capturing HTML fixtures, save only the relevant portion of the page if the
full page is too large. Ensure fixtures are representative of the actual PCS markup
structure. If PCS changes their HTML structure, these tests will fail — this is intentional
and desirable as it alerts us to required parser updates.

---

## Test Strategy

| Subtask | Test Type | What to verify                                             | Coverage Target |
|---------|-----------|------------------------------------------------------------|-----------------|
| T013    | Unit      | Rate limiting, retry logic, error handling                 | 90%             |
| T014    | Unit      | GC/stage/mountain/sprint parsing against real HTML         | 95%             |
| T015    | Unit      | Classic race parsing against real HTML                     | 95%             |
| T016    | Unit      | No duplicate slugs, all required races present             | 100%            |
| T017    | —         | Test infrastructure setup (fixtures, test file structure)  | —               |

**Parser testing philosophy**: Parsers are the most fragile part of the system because they
depend on external HTML structure. Tests must use real HTML to detect breakage early. Each
parser function should have at minimum:
- Happy path with a real page
- DNF/DNS handling
- Empty table handling (graceful return of empty array, not a crash)
- Correct categorization (every result has the right `category` and `stageNumber`)

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| PCS changes HTML structure without notice | High | High | Fixtures capture known-good HTML; health monitor (WP04) detects breakage; parsers are isolated for targeted fixes |
| PCS blocks automated requests (IP ban, CAPTCHA) | Medium | High | Rate limiting (1500ms default), browser-like User-Agent, no concurrent requests; consider proxy rotation in future |
| Cheerio cannot parse malformed HTML | Low | Medium | Cheerio is tolerant of malformed HTML; test with edge cases |
| PCS returns different HTML for different locales | Medium | Medium | Always request English locale; set Accept-Language header |
| Large HTML fixtures bloat the repository | Low | Low | Trim fixtures to relevant sections; use .gitattributes for binary treatment if needed |
| Retry logic causes cascading delays | Low | Medium | Cap max retries at 3; total worst-case delay is under 30 seconds per request |

## Review Guidance

When reviewing this work package, verify:

1. **Rate limiting**: Review the throttle implementation. Consecutive calls to `fetchPage`
   must wait at least `requestDelayMs` milliseconds between actual HTTP requests.
2. **Retry behavior**: Review retry logic. Verify exponential backoff timings. Ensure non-
   retryable errors (4xx except 429) throw immediately.
3. **Parser accuracy**: Run parser tests against fixtures. Verify the extracted data matches
   the actual race results (cross-reference with PCS website).
4. **Type safety**: No `any` types. All parsed values must be properly typed. The
   `ParsedResult` interface must be consistently used across all parsers.
5. **Pure functions**: Parser functions must be pure — no HTTP calls, no database access,
   no side effects. They take HTML strings and return arrays.
6. **Catalog completeness**: Verify the race catalog includes all major men's UWT and Pro
   races. No women's races, no lower-category races.
7. **Fixture validity**: Open the HTML fixtures in a browser to verify they are real PCS
   pages with correct content.

## Definition of Done

- [ ] PCS HTTP client implements rate limiting with configurable delay
- [ ] Retry logic handles 429 (exponential backoff, 3 retries) and 5xx (single retry)
- [ ] Stage race parser extracts GC, stage, mountain, and sprint classifications
- [ ] Classic parser extracts final results from one-day races
- [ ] All parsers handle DNF/DNS entries correctly (position = null, dnf = true)
- [ ] Race catalog includes all Grand Tours, Monuments, and major UWT/Pro races
- [ ] Race catalog excludes women's races and lower-category events
- [ ] HTML fixtures from real PCS pages are committed as test data
- [ ] All parser tests pass with at least 90% code coverage
- [ ] PCS client tests cover rate limiting and all retry scenarios
- [ ] No `any` types in any file; `pnpm lint` passes

## Implementation Command

```bash
spec-kitty implement WP03 --base WP02
```

## Activity Log

| Timestamp | Agent | Action |
|-----------|-------|--------|
| 2026-03-14T23:51:57Z | system | Prompt generated via /spec-kitty.tasks |
