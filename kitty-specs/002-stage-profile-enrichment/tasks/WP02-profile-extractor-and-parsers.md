---
work_package_id: WP02
title: Profile Extractor & Parser Updates
lane: planned
dependencies: [WP01]
base_branch: main
subtasks:
  - T007
  - T008
  - T009
  - T010
  - T011
  - T012
history:
  - timestamp: '2026-03-19T11:19:08Z'
    lane: planned
    agent: system
    shell_pid: ''
    action: Prompt generated via /spec-kitty.tasks
depends_on: [WP01]
estimated_prompt_size: ~500 lines
priority: P0
requirement_refs:
  - FR-001
  - FR-002
  - FR-003
  - FR-004
  - FR-010
type: feature
---

# Work Package Prompt: WP02 – Profile Extractor & Parser Updates

## Objectives & Success Criteria

- Create a shared `profile-extractor.ts` utility that extracts parcours type (p1-p5), ProfileScore (integer), and ITT/TTT flags from PCS HTML
- Modify `stage-race.parser.ts` and `classic.parser.ts` to produce `ParsedResult` objects with profile data populated
- Update `trigger-scrape.use-case.ts` to pass profile data through to `RaceResult.create()`
- All parser tests pass with profile data assertions
- `pnpm build` and `pnpm test` succeed

## Context & Constraints

- **Spec**: `kitty-specs/002-stage-profile-enrichment/spec.md` — FR-001 through FR-004, FR-010
- **Research**: `kitty-specs/002-stage-profile-enrichment/research.md` — RQ1-RQ4 findings
- **Constitution**: DDD/Hexagonal — parsers are infrastructure adapters, no domain logic
- **Existing parsers**: `stage-race.parser.ts` delegates to `parseResultsTable()` which parses HTML tables. Profile data is NOT in the results table — it's in the page sidebar. The parser needs access to the full page HTML (which it already receives) to extract profile from the sidebar.
- **PCS HTML structure**: Profile icon is `<span class="icon profile p{N} mg_rp4 ">` in the sidebar under "Parcours type:" label. ProfileScore is a sibling item under "ProfileScore:" label.

**Implementation command**: `spec-kitty implement WP02 --base WP01`

## Subtasks & Detailed Guidance

### Subtask T007 – Create profile-extractor.ts

- **Purpose**: Shared utility for extracting profile data from PCS page HTML (sidebar). Used by both stage-race and classic parsers.
- **Files**: `apps/api/src/infrastructure/scraping/parsers/profile-extractor.ts` (NEW)
- **Steps**:
  1. Create the file with three exported functions:

     ```typescript
     import * as cheerio from 'cheerio';

     export interface ExtractedProfile {
       parcoursType: string | null; // 'p1'-'p5' or null
       profileScore: number | null;
     }

     export function extractProfile(html: string): ExtractedProfile {
       const $ = cheerio.load(html);
       return {
         parcoursType: extractParcoursType($),
         profileScore: extractProfileScore($),
       };
     }

     export function extractParcoursType($: cheerio.CheerioAPI): string | null {
       // Find span.icon.profile and extract p1-p5 from class list
       const profileSpan = $('span.icon.profile').first();
       if (profileSpan.length === 0) return null;
       const classes = profileSpan.attr('class') || '';
       const match = classes.match(/\bp([1-5])\b/);
       return match ? `p${match[1]}` : null;
     }

     export function extractProfileScore($: cheerio.CheerioAPI): number | null {
       // Find sidebar item with title "ProfileScore"
       const items = $('ul.infolist li, .infolist li');
       let score: number | null = null;
       items.each((_, li) => {
         const title = $(li).find('.title').text().trim();
         if (title.toLowerCase().includes('profilescore')) {
           const value = $(li).find('.value').text().trim();
           const parsed = parseInt(value, 10);
           if (!isNaN(parsed)) score = parsed;
         }
       });
       return score;
     }

     export function detectTimeTrialType(stageNameText: string): {
       isItt: boolean;
       isTtt: boolean;
     } {
       return {
         isItt: /\(ITT\)/i.test(stageNameText),
         isTtt: /\(TTT\)/i.test(stageNameText),
       };
     }
     ```

  2. **Important**: The `extractParcoursType` function looks for `span.icon.profile` — this appears both in the sidebar (individual pages) and in the stage list table (overview pages). The function works for both contexts.

- **Notes**: If the profile span is not found or has no `p1`-`p5` class, return `null` (FR-010 — graceful degradation).

### Subtask T008 – Modify stage-race.parser.ts

- **Purpose**: Stage result pages contain profile data in the sidebar. Extract it alongside the results table data.
- **Files**: `apps/api/src/infrastructure/scraping/parsers/stage-race.parser.ts`
- **Steps**:
  1. The current `parseStageResults(html, stageNumber)` only extracts result table data. Extend it to also extract profile from the sidebar:

     ```typescript
     import { extractProfile, detectTimeTrialType } from './profile-extractor';

     export function parseStageResults(
       html: string,
       stageNumber: number,
       stageNameText?: string, // NEW: pass stage name for ITT/TTT detection
     ): ParsedResult[] {
       const results = parseResultsTable(html, ResultCategory.STAGE, stageNumber);
       const profile = extractProfile(html);
       const tt = stageNameText
         ? detectTimeTrialType(stageNameText)
         : { isItt: false, isTtt: false };

       return results.map((r) => ({
         ...r,
         parcoursType: profile.parcoursType,
         isItt: tt.isItt,
         isTtt: tt.isTtt,
         profileScore: profile.profileScore,
       }));
     }
     ```

  2. The `stageNameText` parameter comes from the classification URL extraction (e.g., "Stage 7 (ITT) | Nuits-Saint-Georges - Gevrey-Chambertin"). This is available in `trigger-scrape.use-case.ts` via `classUrl.label` or similar.
  3. For `parseGcResults`, `parseMountainClassification`, `parseSprintClassification` — these are race-level classifications. Add default profile values (`null`, `false`, `false`, `null`) so they comply with the updated `ParsedResult` interface.

- **Notes**: The same HTML page that contains the results table also contains the sidebar with profile data. No additional HTTP requests needed.

### Subtask T009 – Modify classic.parser.ts

- **Purpose**: Classic race result pages have profile data in the sidebar. Extract it alongside results.
- **Files**: `apps/api/src/infrastructure/scraping/parsers/classic.parser.ts`
- **Steps**:
  1. Update `parseClassicResults`:

     ```typescript
     import { extractProfile } from './profile-extractor';

     export function parseClassicResults(html: string): ParsedResult[] {
       const results = parseResultsTable(html, ResultCategory.GC);
       const profile = extractProfile(html);

       return results.map((r) => ({
         ...r,
         parcoursType: profile.parcoursType,
         isItt: false,
         isTtt: false,
         profileScore: profile.profileScore,
       }));
     }
     ```

  2. Classics are never ITT/TTT, so flags are always `false`.

- **Notes**: The profile for a classic applies to ALL riders equally (race-level profile, not per-stage).

### Subtask T010 – Update trigger-scrape.use-case.ts

- **Purpose**: Pass the new profile fields from `ParsedResult` through to `RaceResult.create()`.
- **Files**: `apps/api/src/application/scraping/trigger-scrape.use-case.ts`
- **Steps**:
  1. In the `persistResults()` method, update the `RaceResult.create()` call (around line 352):
     ```typescript
     RaceResult.create({
       riderId: riderIdMap.get(r.riderSlug)!,
       raceSlug: raceSlug,
       raceName: metadata.name,
       raceType: metadata.raceType,
       raceClass: metadata.raceClass,
       year,
       category: r.category,
       position: r.position,
       stageNumber: r.stageNumber,
       dnf: r.dnf,
       scrapedAt: new Date(),
       // NEW profile fields
       parcoursType: r.parcoursType,
       isItt: r.isItt,
       isTtt: r.isTtt,
       profileScore: r.profileScore,
     }),
     ```
  2. Also check `parseByClassificationType()` — when calling `parseStageResults()`, pass the stage name text if available from the classification URL data, so ITT/TTT can be detected.
  3. Look at `classificationUrls[i]` — it should have the label/name text. Pass it to `parseStageResults()`.
- **Notes**: The `classUrl` object from `extractClassificationUrls()` may need inspection to see if it carries the stage name text. If not, the stage HTML page itself may contain the stage name in the title or breadcrumb.

### Subtask T011 – Create HTML fixture files

- **Purpose**: Test fixtures with profile sidebar data for parser testing.
- **Files**: `apps/api/test/fixtures/pcs/` (directory already exists)
- **Steps**:
  1. Create or update these fixtures:
     - `tdf-2024-stage-1-with-profile.html` — Stage result page with sidebar containing parcours type p4 and ProfileScore
     - `msr-2024-result-with-profile.html` — Classic result page with sidebar containing parcours type p2 and ProfileScore
  2. The fixtures should include the sidebar HTML structure:
     ```html
     <ul class="infolist">
       <li>
         <div class="title">Parcours type:</div>
         <div class="value"><span class="icon profile p4 mg_rp4 "></span></div>
       </li>
       <li>
         <div class="title">ProfileScore:</div>
         <div class="value">176</div>
       </li>
     </ul>
     ```
  3. Existing fixtures (`tdf-2024-stage-1.html`, `msr-2024-result.html`) may already contain this data — check first. If so, reuse them instead of creating new ones.
- **Parallel?**: Yes — can be prepared while T007-T010 are being implemented.

### Subtask T012 – Write unit tests

- **Purpose**: Verify profile extraction and parser integration works correctly.
- **Files**: `apps/api/src/infrastructure/scraping/parsers/__tests__/` or `apps/api/test/`
- **Steps**:
  1. **profile-extractor tests**:
     - `extractParcoursType` returns `p4` for HTML with `span.icon.profile.p4`
     - `extractParcoursType` returns `null` for HTML without profile span
     - `extractProfileScore` returns `176` for HTML with ProfileScore sidebar item
     - `extractProfileScore` returns `null` for HTML without ProfileScore
     - `detectTimeTrialType` returns `{ isItt: true, isTtt: false }` for "Stage 7 (ITT) | ..."
     - `detectTimeTrialType` returns `{ isItt: false, isTtt: true }` for "Stage 3 (TTT) | ..."
     - `detectTimeTrialType` returns `{ isItt: false, isTtt: false }` for "Stage 1 | ..."
  2. **stage-race.parser tests**:
     - `parseStageResults` returns results with profile data from fixture HTML
     - `parseGcResults` returns results with null profile fields
  3. **classic.parser tests**:
     - `parseClassicResults` returns results with profile data from fixture HTML

## Risks & Mitigations

- PCS sidebar HTML structure may vary — `extractProfile()` gracefully returns null on failure.
- The `stageNameText` for ITT/TTT detection may not be easily available from the classification URL extraction. If not, check the page's `<title>` or `<h1>` for "(ITT)" pattern.
- Existing test fixtures may not have profile sidebar HTML — create new fixtures or augment existing ones.

## Review Guidance

- Verify `extractParcoursType` regex correctly matches `p1`-`p5` only (not `p` without number, not `p6`+).
- Verify classic results have `isItt: false, isTtt: false` always.
- Verify GC/MOUNTAIN/SPRINT results from stage races have null profile fields.
- Verify all tests pass: `pnpm --filter api test`.

## Activity Log

- 2026-03-19T11:19:08Z – system – lane=planned – Prompt created.
