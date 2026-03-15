---
work_package_id: WP03
title: PCS HTTP Client & Parsers
lane: "for_review"
dependencies: [WP02]
base_branch: 001-cycling-fantasy-team-optimizer-WP02
base_commit: 09cedac4ebbc7faeb1aa8a6d1a48f96e77e97a5f
created_at: '2026-03-15T18:38:47.965815+00:00'
subtasks:
- T013
- T014
- T015
- T016
- T017
- T017b
phase: Phase 2 - Scraping Pipeline
assignee: ''
agent: "claude-opus"
shell_pid: "19665"
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

# WP03 — PCS HTTP Client, Parsers & Validation Guardrails

## Objectives

Build the complete scraping infrastructure for extracting race results from ProCyclingStats
(PCS). This work package delivers:

1. **An HTTP client** with rate limiting, retry logic, and Cloudflare mitigation
2. **A race discovery parser** that dynamically obtains the list of races for a season
3. **Results parsers** for stage races and classics with exact CSS selectors
4. **A classification URL extractor** for discovering all stages/classifications in a stage race
5. **A validation module** with guardrails to detect silent parsing failures
6. **Comprehensive tests** backed by real HTML fixtures with known-result assertions

By completion, the parsers must correctly extract rider names, positions, and classifications
from captured PCS HTML pages, and the validation module must catch cases where "data is
parsed but incorrect."

> **Key reference**: `research-pcs-scraping.md` contains the detailed HTML analysis,
> selector reference, and validation rules derived from analyzing the previous Python
> project (egimenos/cycling-fantasy-league-analyzer) and the `themm1/procyclingstats`
> community package.

## Project Context

- **Stack**: NestJS backend, **`got-scraping`** for HTTP (Cloudflare TLS bypass), Cheerio
  for HTML parsing. POC confirmed Axios/node-fetch/Python requests ALL blocked by Cloudflare.
- **Architecture**: All scraping infrastructure lives under
  `apps/api/src/infrastructure/scraping/`. Parsers are **pure functions** with no NestJS
  dependencies — they accept HTML strings and return typed data structures. The validation
  module is also a pure function layer.
- **Constitution**: TypeScript strict, no `any`, 90% unit coverage minimum. Parser tests
  must use real HTML fixtures to catch regressions if PCS changes their markup.
- **Depends on**: WP02 (domain entities and enums must exist for type definitions).
- **Key reference files**: `research-pcs-scraping.md` for PCS HTML structure and selectors,
  `research.md` for general findings, `data-model.md` for result types.

## Detailed Subtask Guidance

### T013 — PCS HTTP Client & Scraper Port

**Goal**: Create a robust HTTP client for fetching pages from PCS with rate limiting, retry
logic, Cloudflare TLS bypass via `got-scraping`, and a clean port interface.

> **POC result (2026-03-15)**: Axios, node-fetch, and Python requests are ALL blocked by
> Cloudflare TLS fingerprinting (403). `got-scraping` from Apify impersonates browser TLS
> and successfully returns full HTML (~85ms/request). See `research-pcs-scraping.md` §5.

**Steps**:

1. Install dependencies:
   ```bash
   pnpm --filter api add got-scraping cheerio
   pnpm --filter api add -D @types/cheerio
   ```

2. Create the driven port that the application layer will depend on:
   ```typescript
   // apps/api/src/application/scraping/ports/pcs-scraper.port.ts
   export interface PcsScraperPort {
     fetchPage(path: string): Promise<string>;
   }
   export const PCS_SCRAPER_PORT = Symbol('PcsScraperPort');
   ```
   The application layer (use cases) depends on `PcsScraperPort`, never on the adapter directly.

3. Create `apps/api/src/infrastructure/scraping/pcs-client.adapter.ts`:
   ```typescript
   import { gotScraping } from 'got-scraping';

   @Injectable()
   export class PcsClientAdapter implements PcsScraperPort {
     private readonly baseUrl = 'https://www.procyclingstats.com/';
     private readonly requestDelayMs: number;
     private lastRequestAt = 0;

     constructor() {
       this.requestDelayMs = parseInt(process.env.PCS_REQUEST_DELAY_MS ?? '1500', 10);
     }

     async fetchPage(path: string): Promise<string> {
       await this.throttle();
       const response = await gotScraping({
         url: `${this.baseUrl}${path}`,
         headerGeneratorOptions: {
           browsers: [{ name: 'chrome', minVersion: 100 }],
           locales: ['en-US'],
           operatingSystems: ['windows'],
         },
         timeout: { request: 30000 },
       });
       return response.body;
     }
   }
   ```
   > **Why `got-scraping`**: PCS uses Cloudflare TLS fingerprinting. Standard HTTP clients
   > produce non-browser JA3/JA4 hashes → 403. `got-scraping` impersonates Chrome TLS.
   > The `PcsScraperPort` interface ensures the transport can be swapped to Playwright
   > if `got-scraping` stops working, without changing parsers or use cases.

4. Implement rate limiting:
   ```typescript
   private async throttle(): Promise<void> {
     const now = Date.now();
     const elapsed = now - this.lastRequestAt;
     if (elapsed < this.requestDelayMs) {
       await new Promise(resolve => setTimeout(resolve, this.requestDelayMs - elapsed));
     }
     this.lastRequestAt = Date.now();
   }
   ```

5. Implement retry logic:
   - HTTP 429 (Too Many Requests): retry up to 3 times with exponential backoff (2s, 4s, 8s)
   - HTTP 5xx: retry once after 5s
   - HTTP 403 (Cloudflare TLS change): log error with clear message, do not retry
   - HTTP 4xx (except 429, 403): throw immediately, do not retry
   - Network errors (ECONNRESET, ETIMEDOUT): retry once after 3s

**Validation**: Unit test the retry logic by mocking `gotScraping`. Test that:
- A 429 response triggers exponential backoff and retries
- A 200 response returns the HTML body
- Three consecutive 429 responses followed by a 200 succeeds
- Four consecutive 429 responses throws an error
- Rate limiting enforces the minimum delay between requests
- A 403 response throws with a descriptive error (not silently retried forever)

---

### T014 — Results Table Parser (shared for all page types)

**Goal**: Parse PCS HTML results tables. This is the core parsing logic shared by GC,
stage, classic, and classification pages — they all use the same table structure.

> **POC verified** (2026-03-15): All PCS result pages use `div.resTab:not(.hide)
> table.results`. Actual TdF 2024 GC headers have **14 columns**:
> `[Rnk, Prev, ▼▲, BIB, H2H, Specialty, Age, Rider, Team, UCI, Pnt, , Time, Time won/lost]`
> — Rider at index 7, Team at index 8. **Always use `indexOf('Rider')` for column
> detection, never hardcode indices.** Header count varies by page type.

**Steps**:

1. Create `apps/api/src/infrastructure/scraping/parsers/parsed-result.type.ts`:
   ```typescript
   import { ResultCategory } from '../../../domain/shared/result-category.enum';

   export interface ParsedResult {
     readonly riderName: string;    // "POGAČAR Tadej" (as displayed on PCS)
     readonly riderSlug: string;    // "rider/tadej-pogacar" (from href)
     readonly teamName: string;     // "UAE Team Emirates"
     readonly position: number | null;  // 1, 2, 3... or null for DNF/DNS
     readonly category: ResultCategory; // GC, STAGE, MOUNTAIN, SPRINT, FINAL
     readonly stageNumber: number | null; // stage number or null
     readonly dnf: boolean;         // true if DNF, DNS, OTL, DSQ
   }
   ```

2. Create `apps/api/src/infrastructure/scraping/parsers/results-table.parser.ts`:

   This is the **core parsing function** used by all page-specific parsers:
   ```typescript
   import * as cheerio from 'cheerio';
   import { ParsedResult } from './parsed-result.type';
   import { ResultCategory } from '../../../domain/shared/result-category.enum';

   /**
    * Parses a PCS results table from an HTML string.
    * Pure function: HTML in, ParsedResult[] out. No side effects.
    *
    * @param html - Raw HTML string of the page
    * @param category - The classification category (GC, STAGE, etc.)
    * @param stageNumber - Stage number (null for non-stage classifications)
    */
   export function parseResultsTable(
     html: string,
     category: ResultCategory,
     stageNumber: number | null = null,
   ): ParsedResult[] {
     const $ = cheerio.load(html);
     const results: ParsedResult[] = [];

     // KEY SELECTOR: active results table (not hidden tabs)
     const table = $('div.resTab:not(.hide) table.results');
     if (table.length === 0) return [];

     // Determine column indices from headers
     const headers: string[] = [];
     table.find('thead th').each((_, th) => {
       headers.push($(th).text().trim());
     });

     const riderCol = headers.indexOf('Rider');
     // Team header varies: "Team" or "Tm" depending on page
     const teamCol = Math.max(headers.indexOf('Team'), headers.indexOf('Tm'));

     if (riderCol === -1 || teamCol === -1) return []; // structure changed

     table.find('tbody tr').each((_, row) => {
       const cells = $(row).find('td');
       if (cells.length <= Math.max(riderCol, teamCol)) return;

       // Position: first cell text
       const posText = $(cells[0]).text().trim();
       const isNonFinisher = /^(DNF|DNS|OTL|DSQ)$/i.test(posText);
       const position = isNonFinisher ? null : parseInt(posText, 10);
       if (!isNonFinisher && isNaN(position!)) return; // skip header/separator rows

       // Rider: find <a> with rider link
       const riderLink = $(cells[riderCol]).find('a').first();
       if (riderLink.length === 0) return;
       const riderName = riderLink.text().trim();
       const riderSlug = riderLink.attr('href') ?? '';

       // Team name
       const teamName = $(cells[teamCol]).text().trim();

       results.push({
         riderName,
         riderSlug,
         teamName,
         position: position ?? null,
         category,
         stageNumber,
         dnf: isNonFinisher,
       });
     });

     return results;
   }
   ```

3. Create thin wrapper functions for each classification type:
   ```typescript
   // apps/api/src/infrastructure/scraping/parsers/stage-race.parser.ts
   export function parseGcResults(html: string): ParsedResult[] {
     return parseResultsTable(html, ResultCategory.GC);
   }

   export function parseStageResults(html: string, stageNumber: number): ParsedResult[] {
     return parseResultsTable(html, ResultCategory.STAGE, stageNumber);
   }

   export function parseMountainClassification(html: string): ParsedResult[] {
     return parseResultsTable(html, ResultCategory.MOUNTAIN);
   }

   export function parseSprintClassification(html: string): ParsedResult[] {
     return parseResultsTable(html, ResultCategory.SPRINT);
   }
   ```

4. Handle edge cases in `parseResultsTable`:
   - Riders who abandon mid-stage (listed as DNF/DNS/OTL/DSQ in position cell)
   - Tables with different column counts (header detection handles this)
   - Empty tables (race not yet started or no data) → return `[]`
   - Rows with insufficient cells → skip silently
   - Missing rider link → skip row

**Validation**: Parser functions must be **pure** (no side effects, no HTTP calls). They
accept an HTML string and return `ParsedResult[]`. Test with real fixtures (T017).

---

### T015 — Classic Race Parser & Classification URL Extractor

**Goal**: Parse classic race results AND implement the classification URL extractor for
stage races.

**Steps**:

1. Create `apps/api/src/infrastructure/scraping/parsers/classic.parser.ts`:
   ```typescript
   import { parseResultsTable } from './results-table.parser';
   import { ResultCategory } from '../../../domain/shared/result-category.enum';
   import { ParsedResult } from './parsed-result.type';

   export function parseClassicResults(html: string): ParsedResult[] {
     return parseResultsTable(html, ResultCategory.FINAL);
   }
   ```
   Classics use the exact same table structure — they're just a one-table page with
   category `FINAL` and no `stageNumber`.

   > **POC finding**: Classic URLs **require** the `/result` suffix. The base URL
   > `/race/{slug}/{year}` returns an overview page WITHOUT a results table.
   > `/race/{slug}/{year}/result` returns the actual results (175 riders for MSR 2024).
   > The use case (WP04) must construct the correct URL.

2. Create `apps/api/src/infrastructure/scraping/parsers/classification-extractor.ts`:

   This extracts the list of classification/stage URLs from a stage race GC page:
   ```typescript
   import * as cheerio from 'cheerio';

   export interface ClassificationUrl {
     readonly urlPath: string;          // "race/tour-de-france/2024/stage-1"
     readonly classificationType: 'GC' | 'STAGE' | 'SPRINT' | 'MOUNTAIN';
     readonly stageNumber: number | null;
   }

   /**
    * Extracts classification URLs from a stage race GC page.
    *
    * PCS stage race pages have a <div class="selectNav"> containing a <select>
    * element with PREV/NEXT links. Each <option> has a value attribute pointing
    * to a classification or stage URL.
    *
    * @param html - HTML of the GC page (entry point for stage races)
    * @returns List of classification URLs to scrape
    */
   export function extractClassificationUrls(html: string): ClassificationUrl[] {
     const $ = cheerio.load(html);
     const results: ClassificationUrl[] = [];

     // Find the selectNav that has PREV/NEXT navigation links
     $('div.selectNav').each((_, container) => {
       const linkTexts = $(container).find('a').map((_, a) => $(a).text()).get();
       const hasPrevNext = linkTexts.some(t =>
         /PREV|NEXT|«|»/i.test(t)
       );
       if (!hasPrevNext) return;

       // Found the right nav container — parse its <select> options
       $(container).find('select option').each((_, option) => {
         const urlPath = $(option).attr('value');
         if (!urlPath) return;

         const optionText = $(option).text().toLowerCase();

         // Skip irrelevant classifications
         if (urlPath.includes('teams') || urlPath.includes('youth')) return;

         // Stage results: URL contains /stage-{n} but NOT /points or /kom
         const stageMatch = urlPath.match(/stage-(\d+)/);
         if (stageMatch && !urlPath.includes('points') && !urlPath.includes('kom')) {
           results.push({
             urlPath,
             classificationType: 'STAGE',
             stageNumber: parseInt(stageMatch[1], 10),
           });
           return;
         }

         // Points/Sprint classification
         if (optionText.includes('points classification')) {
           results.push({ urlPath, classificationType: 'SPRINT', stageNumber: null });
           return;
         }

         // Mountain/KOM classification
         if (optionText.includes('mountains classification')) {
           results.push({ urlPath, classificationType: 'MOUNTAIN', stageNumber: null });
           return;
         }

         // Final GC
         if (optionText.includes('final gc')) {
           results.push({ urlPath, classificationType: 'GC', stageNumber: null });
           return;
         }
       });
     });

     return results;
   }
   ```

   > **Source**: This logic is directly adapted from the working Python implementation in
   > `ProCyclingStatsRaceDataScraper._extract_classification_urls()` and
   > `_parse_select_menu_options()`.

   > **POC finding**: The `<select>` option values contain a `/result/result` suffix
   > (e.g., `race/tour-de-france/2024/stage-1/result/result`). URLs work with or without
   > this suffix. The extractor should **normalize URLs** by stripping `/result/result`
   > before returning them. POC found **26 total URLs** for TdF 2024: 21 stages + points
   > + KOM + GC + 2 others (teams, youth — filtered out).

**Validation**:
- Test `parseClassicResults` with Milano-Sanremo 2024 fixture — must return Philipsen as winner, 175 riders
- Test `extractClassificationUrls` with TdF 2024 GC fixture — must return 21 stages +
  points + KOM + GC (at least 24 entries)
- Verify stage numbers are sequential (1, 2, ..., 21)
- Verify no "teams" or "youth" entries are included
- Verify returned URLs do NOT contain `/result/result` suffix

---

### T016 — Race Discovery Parser & Domain Catalog

**Goal**: Implement two complementary systems:
1. A **race list parser** that dynamically discovers races from PCS calendar pages
2. A **domain race catalog** that defines expected/known races for validation

> **Architecture decision**: Race discovery is **infrastructure** (it scrapes PCS). The
> race catalog is **domain knowledge** (it defines what races we care about). The use case
> (WP04) intersects them: discover available races, validate against known races, scrape
> the intersection.

**Steps**:

1. Create `apps/api/src/infrastructure/scraping/parsers/race-list.parser.ts`:
   ```typescript
   import * as cheerio from 'cheerio';

   export type DiscoveredRaceType = 'STAGE_RACE' | 'ONE_DAY';

   export interface DiscoveredRace {
     readonly urlPath: string;        // "race/tour-de-france/2025" (base, stripped of /gc /result)
     readonly slug: string;           // "tour-de-france" (extracted from URL)
     readonly name: string;           // "Tour de France" (from link text)
     readonly raceType: DiscoveredRaceType;
     readonly classText: string;      // "2.UWT", "1.Pro" etc. (raw from page)
   }

   /**
    * Parses a PCS race calendar page to discover available races.
    *
    * URL pattern: /races.php?year={year}&circuit={circuitId}&filter=Filter
    * Circuit IDs: 1 = WorldTour, 26 = ProSeries
    *
    * HTML structure: table.basic (or table[class*="basic"])
    *   thead: [Date, Date, Race, Winner, Class] — POC verified 2026-03-15
    *   tbody tr: one row per race
    *     - Race column: <a href="race/{slug}/{year}/gc">Race Name</a>
    *     - Class column: "2.UWT" (stage race) or "1.UWT" (one-day)
    *   NOTE: No "Cat." column on circuit-filtered pages. No ME filtering needed.
    *   POC result: WorldTour 2025 → 36 races (15 stage, 21 one-day)
    *
    * @param html - Raw HTML of the calendar page
    * @returns List of discovered races
    */
   export function parseRaceList(html: string): DiscoveredRace[] {
     const $ = cheerio.load(html);
     const races: DiscoveredRace[] = [];

     const table = $('table.basic, table[class*="basic"]').first();
     if (table.length === 0) return [];

     // Determine column indices from headers
     const headers: string[] = [];
     table.find('thead th').each((_, th) => {
       headers.push($(th).text().trim());
     });

     const raceCol = headers.indexOf('Race');
     const classCol = headers.indexOf('Class');
     if (raceCol === -1 || classCol === -1) return [];

     // NOTE: No "Cat." column on circuit-filtered pages (POC verified).
     // Circuit filter already limits to relevant races.

     table.find('tbody tr').each((_, row) => {
       const cells = $(row).find('td');
       if (cells.length <= Math.max(raceCol, classCol)) return;

       // Race type from Class column
       const classText = $(cells[classCol]).text().trim();
       const raceType: DiscoveredRaceType = classText.startsWith('2.')
         ? 'STAGE_RACE'
         : 'ONE_DAY';

       // Race URL from link
       const link = $(cells[raceCol]).find('a').first();
       if (link.length === 0) return;

       const href = link.attr('href');
       if (!href) return;

       // Strip trailing /gc, /result, /results
       const urlPath = href.replace(/\/(gc|result|results)$/, '');
       // Extract slug: "race/tour-de-france/2025" → "tour-de-france"
       const slugMatch = urlPath.match(/^race\/([^/]+)\//);
       const slug = slugMatch ? slugMatch[1] : '';

       const name = link.text().trim();

       races.push({ urlPath, slug, name, raceType, classText });
     });

     return races;
   }
   ```

   **Calendar URL construction** (used by the use case in WP04):
   ```
   WorldTour:  /races.php?year={year}&circuit=1&filter=Filter
   ProSeries:  /races.php?year={year}&circuit=26&filter=Filter
   ```

2. Create `apps/api/src/domain/race/race-catalog.ts` (domain layer — validation data):
   ```typescript
   import { RaceType } from '../shared/race-type.enum';
   import { RaceClass } from '../shared/race-class.enum';

   export interface RaceCatalogEntry {
     readonly slug: string;
     readonly name: string;
     readonly raceType: RaceType;
     readonly raceClass: RaceClass;
     readonly expectedStages?: number;  // for stage races: expected number of stages
   }

   export const RACE_CATALOG: readonly RaceCatalogEntry[] = [
     // Grand Tours (21 stages each)
     { slug: 'tour-de-france', name: 'Tour de France', raceType: RaceType.GRAND_TOUR, raceClass: RaceClass.UWT, expectedStages: 21 },
     { slug: 'giro-d-italia', name: "Giro d'Italia", raceType: RaceType.GRAND_TOUR, raceClass: RaceClass.UWT, expectedStages: 21 },
     { slug: 'vuelta-a-espana', name: 'Vuelta a España', raceType: RaceType.GRAND_TOUR, raceClass: RaceClass.UWT, expectedStages: 21 },

     // Monument Classics
     { slug: 'milano-sanremo', name: 'Milano-Sanremo', raceType: RaceType.CLASSIC, raceClass: RaceClass.UWT },
     { slug: 'ronde-van-vlaanderen', name: 'Tour of Flanders', raceType: RaceType.CLASSIC, raceClass: RaceClass.UWT },
     { slug: 'paris-roubaix', name: 'Paris-Roubaix', raceType: RaceType.CLASSIC, raceClass: RaceClass.UWT },
     { slug: 'liege-bastogne-liege', name: 'Liège-Bastogne-Liège', raceType: RaceType.CLASSIC, raceClass: RaceClass.UWT },
     { slug: 'il-lombardia', name: 'Il Lombardia', raceType: RaceType.CLASSIC, raceClass: RaceClass.UWT },

     // Other UWT Classics
     { slug: 'strade-bianche', name: 'Strade Bianche', raceType: RaceType.CLASSIC, raceClass: RaceClass.UWT },
     { slug: 'amstel-gold-race', name: 'Amstel Gold Race', raceType: RaceType.CLASSIC, raceClass: RaceClass.UWT },
     { slug: 'la-fleche-wallone', name: 'La Flèche Wallonne', raceType: RaceType.CLASSIC, raceClass: RaceClass.UWT },
     { slug: 'san-sebastian', name: 'Clásica San Sebastián', raceType: RaceType.CLASSIC, raceClass: RaceClass.UWT },

     // Mini Tours (Stage Races)
     { slug: 'paris-nice', name: 'Paris-Nice', raceType: RaceType.MINI_TOUR, raceClass: RaceClass.UWT, expectedStages: 8 },
     { slug: 'tirreno-adriatico', name: 'Tirreno-Adriatico', raceType: RaceType.MINI_TOUR, raceClass: RaceClass.UWT, expectedStages: 7 },
     { slug: 'volta-a-catalunya', name: 'Volta a Catalunya', raceType: RaceType.MINI_TOUR, raceClass: RaceClass.UWT, expectedStages: 7 },
     { slug: 'criterium-du-dauphine', name: 'Critérium du Dauphiné', raceType: RaceType.MINI_TOUR, raceClass: RaceClass.UWT, expectedStages: 8 },
     { slug: 'tour-de-romandie', name: 'Tour de Romandie', raceType: RaceType.MINI_TOUR, raceClass: RaceClass.UWT, expectedStages: 6 },
     { slug: 'tour-de-suisse', name: 'Tour de Suisse', raceType: RaceType.MINI_TOUR, raceClass: RaceClass.UWT, expectedStages: 8 },
     { slug: 'itzulia-basque-country', name: 'Itzulia Basque Country', raceType: RaceType.MINI_TOUR, raceClass: RaceClass.UWT, expectedStages: 6 },
   ];

   /** Lookup by slug. Returns undefined if not in catalog. */
   export function findRaceBySlug(slug: string): RaceCatalogEntry | undefined {
     return RACE_CATALOG.find(race => race.slug === slug);
   }

   /** Returns true if this slug is a known/expected race. */
   export function isKnownRace(slug: string): boolean {
     return RACE_CATALOG.some(race => race.slug === slug);
   }
   ```

   > **Role of the catalog**: The catalog is NOT the source of truth for which races to
   > scrape. That comes from the PCS calendar (dynamic discovery). The catalog serves as:
   > - **Validation**: "did we find the races we expected?"
   > - **Metadata enrichment**: maps slugs to our domain RaceType/RaceClass enums
   > - **Expected stage counts**: used by guardrails to validate completeness

**Validation**:
- Race list parser test: parse the calendar fixture, verify correct extraction
- Catalog test: no duplicate slugs, Grand Tours + Monuments present, `findRaceBySlug` works
- Race list must parse at least 25 races from a WorldTour calendar fixture
- All href values match pattern `race/[a-z0-9-]+/\d{4}`

---

### T017 — Validation Guardrails Module

**Goal**: Create a dedicated validation layer that runs after each parse operation to
detect silent failures — cases where scraping "works" but produces incorrect data.

> **Why this matters**: A broken parser might return 3 riders for a Grand Tour GC instead
> of 150, or duplicate positions, or all positions as null. Without guardrails, this bad
> data would be silently persisted. The validation module catches these cases BEFORE
> data enters the database.

**Steps**:

1. Create `apps/api/src/infrastructure/scraping/validation/parse-validator.ts`:
   ```typescript
   export interface ValidationResult {
     readonly valid: boolean;
     readonly warnings: string[];
     readonly errors: string[];
   }
   ```

2. Implement classification results validation:
   ```typescript
   export function validateClassificationResults(
     results: ParsedResult[],
     context: {
       raceSlug: string;
       classificationType: string;
       stageNumber?: number;
       expectedMinRiders?: number;
       expectedMaxRiders?: number;
     },
   ): ValidationResult
   ```

   **Checks to implement**:

   | # | Check | Severity | Rule |
   |---|-------|----------|------|
   | 1 | **Non-empty results** | ERROR | `results.length > 0` — empty means page structure changed |
   | 2 | **Position sequence** | ERROR | Positions must be sequential: 1, 2, 3, ... with no gaps. DNFs appear with `position = null` |
   | 3 | **No duplicate positions** | ERROR | No two riders share the same numeric position |
   | 4 | **Rider count in range** | WARN | Must be within expected range (see table below) |
   | 5 | **DNF consistency** | ERROR | If `dnf = true` then `position` must be `null`. If `position = null` and not DNF, warn |
   | 6 | **Rider name non-empty** | ERROR | Every parsed rider must have a non-empty `riderName` |
   | 7 | **Rider slug format** | WARN | Every `riderSlug` should match `rider/[a-z0-9-]+` |
   | 8 | **Team name present** | WARN | Every rider should have a non-empty `teamName` |
   | 9 | **Category consistency** | ERROR | All results must have the same `category` as the declared classification |

   **Expected rider count ranges**:

   | Race Type | Classification | Min | Max |
   |-----------|---------------|-----|-----|
   | Grand Tour | GC Final | 100 | 180 |
   | Grand Tour | Stage | 80 | 200 |
   | Grand Tour | Points/KOM | 20 | 180 |
   | Mini Tour | GC Final | 60 | 200 |
   | Mini Tour | Stage | 50 | 200 |
   | Classic | Final | 80 | 250 |

3. Implement stage race completeness validation:
   ```typescript
   export function validateStageRaceCompleteness(
     classifications: { type: string; stageNumber?: number }[],
     raceSlug: string,
     expectedStages?: number,
   ): ValidationResult
   ```

   **Checks**:

   | # | Check | Severity | Rule |
   |---|-------|----------|------|
   | 1 | **GC present** | ERROR | Must have a GC classification |
   | 2 | **Sprint/Points present** | WARN | Should have sprint/points classification |
   | 3 | **Mountain/KOM present** | WARN | Should have mountain/KOM classification |
   | 4 | **Stage count** | WARN | If `expectedStages` provided, actual count should match |
   | 5 | **Stage sequence** | WARN | Stage numbers should be sequential (1, 2, ..., N) |
   | 6 | **Select menu found** | ERROR | The `div.selectNav` with `<select>` must exist |

4. Implement race discovery validation:
   ```typescript
   export function validateRaceDiscovery(
     discovered: DiscoveredRace[],
     catalog: RaceCatalogEntry[],
   ): ValidationResult
   ```

   **Checks**:

   | # | Check | Severity | Rule |
   |---|-------|----------|------|
   | 1 | **Minimum race count** | ERROR | WorldTour must yield >= 25 races per year |
   | 2 | **Grand Tours present** | WARN | All 3 Grand Tour slugs should appear |
   | 3 | **No duplicate slugs** | ERROR | After deduplication, no race appears twice |
   | 4 | **Valid URL format** | WARN | Every urlPath matches `race/[a-z0-9-]+/\d{4}` |

**Validation**: The validator itself must be thoroughly tested:
- Test with valid data → `valid: true`, no errors/warnings
- Test with empty results → `valid: false`, error about empty results
- Test with duplicate positions → error detected
- Test with gap in positions → error detected
- Test with DNF having numeric position → error detected
- Test with rider count out of range → warning generated

---

### T017b — Unit Tests with HTML Fixtures

**Goal**: Create comprehensive unit tests for all parsers using real HTML captured from PCS,
with **known-result assertions** that verify parsed data matches actual race outcomes.

**Steps**:

1. Create the fixture directory: `apps/api/test/fixtures/pcs/`

2. Capture real HTML pages from PCS and save as fixtures. **`got-scraping` bypasses
   Cloudflare** — fixtures can be captured automatically (see POC script
   `poc-save-fixtures.mjs`). Pre-captured fixtures exist in `/tmp/pcs/fixtures/`.
   - Copy from `/tmp/pcs/fixtures/` to `apps/api/test/fixtures/pcs/`
   - Or capture fresh using `got-scraping` in a one-time script
   - If file > 500KB, trim to keep only the `<div class="resTab">` and
     `<div class="selectNav">` sections plus any necessary wrapping elements

   **Required fixtures**:

   | Fixture File | Source URL | Tests |
   |-------------|-----------|-------|
   | `races-calendar-2024-uwt.html` | `/races.php?year=2024&circuit=1&filter=Filter` | Race list parser |
   | `tdf-2024-gc.html` | `/race/tour-de-france/2024/gc` | GC parser + classification extractor |
   | `tdf-2024-stage-1.html` | `/race/tour-de-france/2024/stage-1` | Stage parser |
   | `tdf-2024-points.html` | `/race/tour-de-france/2024/points` | Sprint classification parser |
   | `tdf-2024-kom.html` | `/race/tour-de-france/2024/kom` | Mountain classification parser |
   | `msr-2024.html` | `/race/milano-sanremo/2024/result` | Classic parser |
   | `paris-nice-2024-gc.html` | `/race/paris-nice/2024/gc` | Mini tour + classification extractor |

3. Create test files with **known-result assertions**:

   ```typescript
   // apps/api/test/infrastructure/scraping/parsers/stage-race.parser.spec.ts
   describe('StageRaceParser', () => {
     describe('parseGcResults (TdF 2024)', () => {
       it('should identify Tadej Pogačar as GC winner (position 1)', () => { });
       it('should identify rider slug as "rider/tadej-pogacar"', () => { });
       it('should extract >= 140 riders in GC', () => { });
       it('should have sequential positions starting from 1', () => { });
       it('should have no duplicate positions', () => { });
       it('should set category to GC for all results', () => { });
       it('should handle DNF entries with position = null', () => { });
       it('should extract valid rider slugs matching rider/[a-z0-9-]+', () => { });
     });

     describe('parseStageResults (TdF 2024 Stage 1)', () => {
       it('should identify Romain Bardet as stage winner', () => { });
       it('should attach stageNumber = 1 to all results', () => { });
       it('should set category to STAGE for all results', () => { });
     });

     describe('parseMountainClassification (TdF 2024)', () => {
       it('should identify Richard Carapaz as KOM winner', () => { });
       it('should set category to MOUNTAIN for all results', () => { });
     });

     describe('parseSprintClassification (TdF 2024)', () => {
       it('should identify Biniam Girmay as sprint winner', () => { });
       it('should set category to SPRINT for all results', () => { });
     });
   });

   // apps/api/test/infrastructure/scraping/parsers/classification-extractor.spec.ts
   describe('extractClassificationUrls (TdF 2024)', () => {
     it('should find 21 individual stage URLs', () => { });
     it('should find points classification URL', () => { });
     it('should find mountains classification URL', () => { });
     it('should find final GC URL', () => { });
     it('should NOT include teams or youth classifications', () => { });
     it('should have sequential stage numbers from 1 to 21', () => { });
   });
   ```

   ```typescript
   // apps/api/test/infrastructure/scraping/parsers/classic.parser.spec.ts
   describe('ClassicParser', () => {
     describe('parseClassicResults (Milano-Sanremo 2024)', () => {
       it('should identify Jasper Philipsen as winner', () => { });
       it('should set category to FINAL for all results', () => { });
       it('should have stageNumber = null for all results', () => { });
       it('should have sequential positions', () => { });
       it('should extract >= 100 riders', () => { });
     });
   });
   ```

   ```typescript
   // apps/api/test/infrastructure/scraping/parsers/race-list.parser.spec.ts
   describe('RaceListParser', () => {
     it('should extract >= 25 races from WorldTour calendar', () => { });
     it('should identify Tour de France as STAGE_RACE', () => { });
     it('should identify Milano-Sanremo as ONE_DAY', () => { });
     it('should extract valid slugs matching [a-z0-9-]+', () => { });
     it('should not include duplicate slugs', () => { });
   });
   ```

   ```typescript
   // apps/api/test/infrastructure/scraping/validation/parse-validator.spec.ts
   describe('ParseValidator', () => {
     describe('validateClassificationResults', () => {
       it('should pass for valid sequential results', () => { });
       it('should fail for empty results', () => { });
       it('should fail for duplicate positions', () => { });
       it('should fail for position gaps', () => { });
       it('should fail for DNF with numeric position', () => { });
       it('should warn for rider count out of range', () => { });
       it('should fail for empty rider names', () => { });
       it('should warn for invalid rider slug format', () => { });
     });

     describe('validateStageRaceCompleteness', () => {
       it('should pass when GC + stages + points + KOM all present', () => { });
       it('should fail when GC is missing', () => { });
       it('should warn when expected stage count does not match', () => { });
     });

     describe('validateRaceDiscovery', () => {
       it('should pass when >= 25 races and Grand Tours present', () => { });
       it('should fail when < 25 races', () => { });
       it('should warn when a Grand Tour is missing', () => { });
     });
   });
   ```

4. PCS client tests (mock Axios):
   ```typescript
   // apps/api/test/infrastructure/scraping/pcs-client.adapter.spec.ts
   describe('PcsClientAdapter', () => {
     it('should enforce rate limiting between requests', () => { });
     it('should retry on 429 with exponential backoff', () => { });
     it('should retry once on 5xx errors', () => { });
     it('should not retry on 4xx errors (except 429)', () => { });
     it('should throw after max retries exceeded', () => { });
     it('should throw descriptive error on 403 (Cloudflare)', () => { });
   });
   ```

5. Domain catalog tests:
   ```typescript
   // apps/api/test/domain/race/race-catalog.spec.ts
   describe('RaceCatalog', () => {
     it('should have no duplicate slugs', () => { });
     it('should include all three Grand Tours', () => { });
     it('should include all five Monuments', () => { });
     it('should have expectedStages for all stage races', () => { });
     it('should findRaceBySlug return correct entry', () => { });
     it('should isKnownRace return false for unknown slug', () => { });
   });
   ```

**Validation**: All tests must pass with `pnpm --filter api test`. Coverage for parser and
validation files must be at least 90%.

**Notes**: Fixture files must be committed to the repository (they are test data, not
secrets). If PCS changes their HTML structure, fixture-based tests will continue to pass
(testing our parser against known HTML), but live scraping will break — this is detected
by the health monitor in WP04.

---

## CSS Selectors Quick Reference

| Page | Element | Selector | Notes |
|------|---------|----------|-------|
| Calendar | Race table | `table.basic` or `table[class*="basic"]` | All races for a circuit/year |
| Calendar | Race link | `tbody tr td a` (Race column) | href = race URL |
| Calendar | Race class | `tbody tr td` (Class column) | "2.UWT", "1.Pro" etc. |
| Any race | Results table | `div.resTab:not(.hide) table.results` | Active tab's results |
| Any race | Table headers | `thead th` | "Rider", "Team"/"Tm", "Pnt" |
| Any race | Result row | `tbody tr` | Each row = one rider |
| Any race | Rider link | `td a` (Rider column) | Name in text, slug in href |
| Any race | Position | First `td` text | Numeric or "DNF"/"DNS"/"OTL"/"DSQ" |
| Stage race | Navigation | `div.selectNav` with PREV/NEXT links | Contains `<select>` with all URLs |
| Stage race | Classification URLs | `div.selectNav select option` | `value` attr = URL path |
| Any race | Race title | `h1` | Year + race name |

---

## Test Strategy

| Subtask | Test Type | What to verify | Coverage Target |
|---------|-----------|----------------|-----------------|
| T013 | Unit | Rate limiting, retry logic, Cloudflare 403 handling | 90% |
| T014 | Unit | Results table parsing with real fixtures, known winners | 95% |
| T015 | Unit | Classic parsing + classification URL extraction | 95% |
| T016 | Unit | Race list parsing, catalog validation, no duplicate slugs | 100% |
| T017 | Unit | All guardrail checks (valid, invalid, edge cases) | 100% |
| T017b | — | Test infrastructure (fixtures, integration of all parsers) | — |

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| PCS changes HTML structure | High | High | Fixtures test against known HTML; validation guardrails detect live breakage; selectors based on working Python project |
| Cloudflare blocks HTTP client | Medium | High | **MITIGATED**: `got-scraping` (TLS impersonation) confirmed working via POC. PcsScraperPort interface allows swapping to Playwright if got-scraping stops working |
| Parser returns data but wrong data | Medium | Critical | **Validation guardrails** catch: position gaps, duplicate positions, rider count anomalies, empty results, DNF inconsistencies |
| PCS returns different HTML for different locales | Medium | Medium | Set `Accept-Language: en-US` header |
| Large HTML fixtures bloat repository | Low | Low | Trim to relevant sections; .gitattributes for LFS if needed |
| Calendar page structure differs from research | Low | Medium | **MITIGATED**: POC verified actual headers `[Date, Date, Race, Winner, Class]`. No Cat. column. 36 races found for 2025 UWT. |
| Classic URL missing /result suffix | Low | Medium | **MITIGATED**: POC confirmed `/result` suffix required. Use case must construct correct URL. |
| Classification URLs have /result/result suffix | Low | Low | **MITIGATED**: POC confirmed. Extractor normalizes URLs by stripping suffix. |

## Review Guidance

When reviewing this work package, verify:

1. **Cloudflare awareness**: Client must use `got-scraping` (NOT Axios — POC confirmed
   Axios is blocked). Must throw descriptive error on 403, not retry indefinitely.
2. **Rate limiting**: Consecutive calls enforce minimum delay. Test covers timing.
3. **Retry behavior**: Exponential backoff on 429, single retry on 5xx, no retry on 4xx.
4. **Selector correctness**: Verify `div.resTab:not(.hide) table.results` is the primary
   selector. Verify `div.selectNav select option` for classification URLs.
5. **Parser purity**: All parser functions are pure — HTML in, data out. No HTTP, no DB.
6. **Known-result assertions**: Fixture tests verify actual race winners, not just "parsed
   something." TdF 2024 GC winner must be Pogačar, MSR 2024 winner must be Philipsen.
7. **Validation guardrails**: Check that every guardrail rule is implemented AND tested.
   Test both valid and invalid inputs.
8. **Race discovery**: Calendar parser extracts >= 25 races, correctly classifies stage vs
   one-day from class text.
9. **Catalog role**: Catalog is validation/enrichment only, NOT the source of scraping targets.

## Definition of Done

- [ ] PCS HTTP client uses `got-scraping` with TLS impersonation (NOT Axios)
- [ ] Rate limiting with configurable delay (default 1500ms)
- [ ] Retry logic handles 429 (exponential backoff), 5xx (single retry), 403 (descriptive error)
- [ ] `PcsScraperPort` interface defined for transport swappability
- [ ] Results table parser with exact selector: `div.resTab:not(.hide) table.results`
- [ ] Parsers for GC, stage, mountain, sprint, and classic classifications
- [ ] Classification URL extractor from `div.selectNav select option`
- [ ] Race list parser for PCS calendar pages (`table.basic`)
- [ ] Domain race catalog with `expectedStages` for stage races
- [ ] All parsers handle DNF/DNS/OTL/DSQ correctly (position = null, dnf = true)
- [ ] **Validation guardrails module** with checks for:
  - [ ] Position sequence (no gaps, no duplicates)
  - [ ] Rider count in expected range
  - [ ] DNF consistency
  - [ ] Rider name/slug format
  - [ ] Stage race completeness (GC + stages + points + KOM)
  - [ ] Race discovery minimum count and expected races
- [ ] HTML fixtures from real PCS pages committed as test data
- [ ] **Known-result assertions** in tests (Pogačar wins TdF 2024, Philipsen wins MSR 2024)
- [ ] All parser + validation tests pass with >= 90% coverage
- [ ] No `any` types; `pnpm lint` passes
- [ ] Domain layer (race catalog) has zero infrastructure imports

## Implementation Command

```bash
spec-kitty implement WP03 --base WP02
```

## Activity Log

| Timestamp | Agent | Action |
|-----------|-------|--------|
| 2026-03-14T23:51:57Z | system | Prompt generated via /spec-kitty.tasks |
| 2026-03-15T13:30:00Z | claude-opus | Updated with PCS scraping research findings: exact selectors, race discovery, validation guardrails |
| 2026-03-15T15:00:00Z | claude-opus | Updated with POC results: Axios→got-scraping, actual header structure, URL suffix corrections, fixture capture confirmed |
- 2026-03-15T18:38:48Z – claude-opus – shell_pid=19665 – lane=doing – Assigned agent via workflow command
- 2026-03-15T18:55:07Z – claude-opus – shell_pid=19665 – lane=for_review – Ready for review: PCS HTTP client with Cloudflare bypass (got-scraping), HTML parsers (results, classic, classification, race-list), race catalog, validation guardrails. 93 tests passing, lint clean.
