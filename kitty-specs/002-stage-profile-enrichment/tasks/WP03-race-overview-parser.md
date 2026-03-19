---
work_package_id: WP03
title: Race Overview Parser
lane: planned
dependencies: [WP01]
base_branch: main
subtasks:
  - T013
  - T014
  - T015
  - T016
history:
  - timestamp: '2026-03-19T11:19:08Z'
    lane: planned
    agent: system
    shell_pid: ''
    action: Prompt generated via /spec-kitty.tasks
depends_on: [WP01]
estimated_prompt_size: ~350 lines
priority: P1
requirement_refs:
  - FR-006
  - FR-009
type: feature
---

# Work Package Prompt: WP03 – Race Overview Parser

## Objectives & Success Criteria

- Create `race-overview.parser.ts` that parses a PCS race overview page and extracts the stage list with profile distribution
- Handle edge cases: rest days, TBD stages, prologues, ITT/TTT detection
- Parser tests pass with correct stage list extraction from fixture HTML
- `pnpm build` succeeds

## Context & Constraints

- **Spec**: `kitty-specs/002-stage-profile-enrichment/spec.md` — FR-006, FR-009
- **Research**: `kitty-specs/002-stage-profile-enrichment/research.md` — RQ1 findings on overview page HTML structure
- **Constitution**: Infrastructure adapter — no domain logic, pure parsing function
- **PCS overview page structure**: Stage list is a `table.basic` under `<h4>Stages</h4>`. Columns: date (DD/MM), day, profile icon, stage link, distance (km).
- **This WP is independent of WP02** — different parser concern (overview page vs result page sidebar)

**Implementation command**: `spec-kitty implement WP03 --base WP01`

## Subtasks & Detailed Guidance

### Subtask T013 – Create race-overview.parser.ts

- **Purpose**: Parse the stage list table from a PCS race overview page to get all stages with their profiles.
- **Files**: `apps/api/src/infrastructure/scraping/parsers/race-overview.parser.ts` (NEW)
- **Steps**:
  1. Create the parser file:

     ```typescript
     import * as cheerio from 'cheerio';

     export interface ParsedStageInfo {
       stageNumber: number;
       parcoursType: string | null; // 'p1'-'p5' or null
       isItt: boolean;
       isTtt: boolean;
       distanceKm: number | null;
       departure: string | null;
       arrival: string | null;
     }

     export function parseRaceOverview(html: string): ParsedStageInfo[] {
       const $ = cheerio.load(html);
       const stages: ParsedStageInfo[] = [];

       // Find the stage list table — look for table.basic after h4 containing "Stages"
       // or the first table.basic in the page
       const stagesHeading = $('h4').filter((_, el) =>
         $(el).text().trim().toLowerCase().includes('stages'),
       );

       let table: cheerio.Cheerio;
       if (stagesHeading.length > 0) {
         table = stagesHeading.next('table.basic');
       } else {
         table = $('table.basic').first();
       }

       if (table.length === 0) return [];

       let stageCounter = 0;

       table.find('tbody tr').each((_, row) => {
         const cells = $(row).find('td');
         if (cells.length < 4) return;

         // Column 2: profile icon
         const profileSpan = $(cells[1]).find('span.icon.profile'); // or cells[2] depending on table structure
         // Column 3: stage link with name
         const stageLink = $(cells[3]).find('a').first(); // or cells[3]
         const stageLinkText = stageLink.text().trim();

         // Skip rest days
         if (stageLinkText.toLowerCase() === 'restday' || stageLinkText === '') return;

         stageCounter++;

         // Extract parcours type
         let parcoursType: string | null = null;
         if (profileSpan.length > 0) {
           const classes = profileSpan.attr('class') || '';
           const match = classes.match(/\bp([1-5])\b/);
           parcoursType = match ? `p${match[1]}` : null;
         }

         // Detect ITT/TTT (inline — profile-extractor.ts is created in WP02, which runs in parallel)
         const isItt = /\(ITT\)/i.test(stageLinkText);
         const isTtt = /\(TTT\)/i.test(stageLinkText);

         // Extract distance (last column)
         const distanceText = $(cells[cells.length - 1])
           .text()
           .trim();
         const distanceKm = distanceText ? parseFloat(distanceText) : null;

         // Extract departure/arrival from stage name
         // Format: "Stage N | Departure - Arrival" or "Stage N (ITT) | Departure - Arrival"
         let departure: string | null = null;
         let arrival: string | null = null;
         const pipeIndex = stageLinkText.indexOf('|');
         if (pipeIndex !== -1) {
           const route = stageLinkText.substring(pipeIndex + 1).trim();
           const dashParts = route.split(/\s*-\s*/);
           if (dashParts.length >= 2) {
             departure = dashParts[0].trim();
             arrival = dashParts[dashParts.length - 1].trim();
           }
         }

         // Extract stage number from text
         const stageNumMatch = stageLinkText.match(/Stage\s+(\d+)/i);
         const stageNumber = stageNumMatch ? parseInt(stageNumMatch[1], 10) : stageCounter;

         stages.push({
           stageNumber,
           parcoursType,
           isItt,
           isTtt,
           distanceKm: distanceKm && !isNaN(distanceKm) ? distanceKm : null,
           departure,
           arrival,
         });
       });

       return stages;
     }
     ```

  2. **Important**: The exact column indices may vary. Inspect the fixture HTML (T015) to determine correct indices. The research found: col 0 = date, col 1 = day, col 2 = profile icon, col 3 = stage link, col 4 = distance. But verify against real HTML.

### Subtask T014 – Handle edge cases

- **Purpose**: Ensure robust parsing for non-standard stage list entries.
- **Files**: Same as T013 (`race-overview.parser.ts`)
- **Edge cases to handle**:
  1. **Rest days**: Profile class is `p` (no digit), link text is "Restday" → skip row, don't increment stage counter.
  2. **TBD stages**: No profile icon or empty span → `parcoursType: null`.
  3. **Prologues**: May appear as "Prologue | City - City" instead of "Stage 1 | ...". Detect via text pattern and treat as stage 0 or 1.
  4. **No stage table**: If the overview page has no stage table (e.g., future race with no stages announced), return empty array.
  5. **Stage name format variations**: Some races use "Etape" instead of "Stage" (non-English). Use flexible regex: `/(?:Stage|Etape|Tappa)\s+(\d+)/i`.
- **Notes**: All edge cases should result in graceful behavior — never throw, always return parseable data or null fields.

### Subtask T015 – Create HTML fixture for overview page

- **Purpose**: Test fixture based on a real PCS race overview page.
- **Files**: `apps/api/test/fixtures/pcs/tdf-2024-overview.html` (NEW)
- **Steps**:
  1. Create a simplified fixture based on the TdF 2024 overview page structure. Include:
     - At least 5-6 stages with different parcours types (p1, p2, p4, p5)
     - At least 1 ITT stage (e.g., Stage 7 with p1)
     - 1 rest day row
     - Distance column with realistic values
     - Stage links with "Stage N | Departure - Arrival" format
  2. The fixture should be minimal but representative — don't need all 21 stages.
  3. Include the `<h4>Stages</h4>` heading and `<table class="basic">` structure.
- **Parallel?**: Yes — can be prepared before the parser is implemented.

### Subtask T016 – Write unit tests for parseRaceOverview()

- **Purpose**: Verify correct parsing of the overview page fixture.
- **Files**: `apps/api/src/infrastructure/scraping/parsers/__tests__/race-overview.parser.spec.ts` (NEW)
- **Steps**:
  1. Test cases:
     - Parses stage list and returns correct number of stages (excluding rest days)
     - Each stage has correct `parcoursType` matching the fixture HTML
     - ITT stage is correctly flagged (`isItt: true`)
     - Rest days are excluded from results
     - Distance is parsed as number
     - Departure and arrival cities are extracted from stage name
     - Stage numbers are correctly extracted
  2. Edge case tests:
     - Empty HTML returns empty array
     - HTML without stage table returns empty array
     - Stage with no profile icon returns `parcoursType: null`

## Risks & Mitigations

- Column indices in the stage table may differ between races or years. Mitigation: use flexible selectors rather than hardcoded indices where possible.
- Some races may use different heading text (not "Stages"). Mitigation: fallback to first `table.basic` if heading not found.

## Review Guidance

- Verify rest days are correctly skipped (no entry in output, no stage number consumed).
- Verify ITT/TTT detection works correctly alongside parcours type.
- Verify the parser gracefully handles missing or malformed HTML.
- Verify tests cover the main happy path and key edge cases.

## Activity Log

- 2026-03-19T11:19:08Z – system – lane=planned – Prompt created.
