---
work_package_id: WP03
title: PCS Parsers — Race Date & Startlist
lane: 'doing'
dependencies: []
base_branch: main
base_commit: cd5029b8dd56635f2a094bdaf09587d69b0c1b63
created_at: '2026-03-19T18:45:06.537055+00:00'
subtasks:
  - T011
  - T012
  - T013
  - T014
phase: Phase 0 - Foundation
assignee: ''
agent: 'claude-opus'
shell_pid: '14839'
review_status: ''
reviewed_by: ''
history:
  - timestamp: '2026-03-19T18:18:14Z'
    lane: planned
    agent: system
    shell_pid: ''
    action: Prompt generated via /spec-kitty.tasks
requirement_refs:
  - FR-002
  - FR-005
---

# Work Package Prompt: WP03 – PCS Parsers — Race Date & Startlist

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
spec-kitty implement WP03
```

No dependencies — this is a foundation work package.

---

## Objectives & Success Criteria

- Create a parser that extracts race dates from PCS HTML pages (both classics and stage races).
- Create a parser that extracts startlists from PCS startlist pages (rider slugs, team names, bib numbers).
- Both parsers must have tests with fixture HTML covering at least one classic, one stage race, and one grand tour.

**Done when**: Parsers produce correct output when fed fixture HTML. Tests pass and cover happy paths + edge cases.

## Context & Constraints

- **Existing pattern**: `apps/api/src/infrastructure/scraping/parsers/results-table.parser.ts` uses cheerio for HTML parsing. Follow this pattern.
- **Cheerio is already a dependency** — no new dependencies needed.
- **Parser location**: `apps/api/src/infrastructure/scraping/parsers/`
- **Test location**: `apps/api/src/infrastructure/scraping/parsers/__tests__/`
- **Key references**:
  - Existing parser: `apps/api/src/infrastructure/scraping/parsers/results-table.parser.ts`
  - Existing parsed result type: `apps/api/src/infrastructure/scraping/parsers/parsed-result.type.ts`
  - Research: `kitty-specs/004-scoring-benchmark-harness/research.md` (R1, R2)

**IMPORTANT**: Before writing parsers, you should inspect real PCS HTML structure to understand the actual DOM. Use the existing `PcsClientAdapter` to fetch a sample page, or download HTML manually. The guidance below is based on known PCS patterns but may need adjustment.

---

## Subtasks & Detailed Guidance

### Subtask T011 – Create `race-date.parser.ts`

**Purpose**: Extract the actual race date from PCS race pages. This date is needed to determine the temporal cutoff for benchmark predictions.

**Steps**:

1. Create `apps/api/src/infrastructure/scraping/parsers/race-date.parser.ts`
2. Implement a function that extracts dates from PCS HTML:

   ```typescript
   import * as cheerio from 'cheerio';

   /**
    * Extracts the race date from a PCS race page or stage page.
    * Returns null if the date cannot be parsed.
    */
   export function parseRaceDate(html: string): Date | null {
     const $ = cheerio.load(html);
     // PCS typically displays the date in the .infolist or .sub container
     // Look for date patterns like "1 July 2025" or "01/07/2025"
     // Implementation depends on actual PCS HTML structure
   }
   ```

3. Handle two cases:
   - **Classic/one-day race**: Single date on the result page.
   - **Stage race stage page**: Each stage shows its own date.
4. Date parsing:
   - PCS typically uses formats like `1 July 2025` in the page header/infolist.
   - Parse with a simple regex + month name mapping (avoid heavy date libraries).
   - Return a `Date` object set to UTC midnight of that date.
5. Export from `apps/api/src/infrastructure/scraping/parsers/` if there's a barrel file, otherwise import directly.

**Files**: `apps/api/src/infrastructure/scraping/parsers/race-date.parser.ts` (new)

**Notes**:

- PCS infolist area contains race metadata including date, distance, start/finish cities.
- For grand tour GC pages, the date shown is typically the final stage date.
- Be defensive: return `null` if parsing fails rather than throwing.

---

### Subtask T012 – Create `startlist.parser.ts`

**Purpose**: Parse PCS startlist pages to extract rider entries (slug, team, bib number).

**Steps**:

1. Create `apps/api/src/infrastructure/scraping/parsers/startlist.parser.ts`
2. Define a parsed startlist entry type:
   ```typescript
   export interface ParsedStartlistEntry {
     readonly riderName: string;
     readonly riderSlug: string;
     readonly teamName: string;
     readonly bibNumber: number | null;
   }
   ```
3. Implement the parser:

   ```typescript
   import * as cheerio from 'cheerio';

   export function parseStartlist(html: string): ParsedStartlistEntry[] {
     const $ = cheerio.load(html);
     const entries: ParsedStartlistEntry[] = [];

     // PCS startlist pages show riders grouped by team
     // Each team block has a team name header and rider rows
     // Rider rows contain: bib number, rider name (link), nationality
     // Rider links: <a href="/rider/{slug}">{name}</a>

     // Implementation: iterate team blocks and rider rows
     // Extract rider slug from href, team from block header, bib from first cell

     return entries;
   }
   ```

4. Key extraction points:
   - **Rider slug**: From `<a href="/rider/{slug}">` — extract `{slug}` part (strip leading `/rider/`).
   - **Team name**: From the team header in each startlist block.
   - **Bib number**: First column of rider row (integer, may not always be present).
   - **Rider name**: Text content of the rider link.
5. Filter out empty/invalid entries.

**Files**: `apps/api/src/infrastructure/scraping/parsers/startlist.parser.ts` (new)

**Notes**:

- PCS startlist structure differs from results tables. Startlists are grouped by team, not a single flat table.
- Expect ~8 riders per team, ~20-25 teams per race (160-200 riders total for a grand tour, less for one-day races).
- The `riderSlug` extraction pattern is the same as in `results-table.parser.ts` — reuse the href parsing logic.

---

### Subtask T013 – Tests for race-date parser

**Purpose**: Verify race date extraction works correctly with real-world HTML fixtures.

**Steps**:

1. Create fixture HTML files:
   - `apps/api/src/infrastructure/scraping/parsers/__tests__/fixtures/classic-result.html` — a saved PCS classic result page
   - `apps/api/src/infrastructure/scraping/parsers/__tests__/fixtures/stage-result.html` — a saved PCS stage result page
2. Create test file: `apps/api/src/infrastructure/scraping/parsers/__tests__/race-date.parser.spec.ts`
3. Test cases:
   - Parse date from a classic race page → returns correct `Date`
   - Parse date from a stage race stage page → returns correct `Date`
   - Pass HTML with no date info → returns `null`
   - Pass empty HTML → returns `null`

**Files**:

- `apps/api/src/infrastructure/scraping/parsers/__tests__/race-date.parser.spec.ts` (new)
- `apps/api/src/infrastructure/scraping/parsers/__tests__/fixtures/` (new directory + HTML fixtures)

**Parallel?**: Yes — can be written alongside T014.

**Notes**: Get fixture HTML by fetching a real PCS page (e.g., `race/milano-sanremo/2025/result` or `race/tour-de-france/2025/stage-1`). Strip unnecessary `<script>`/`<style>` tags to keep fixtures small.

---

### Subtask T014 – Tests for startlist parser

**Purpose**: Verify startlist parsing works correctly with real-world HTML fixtures.

**Steps**:

1. Create fixture:
   - `apps/api/src/infrastructure/scraping/parsers/__tests__/fixtures/startlist.html` — a saved PCS startlist page
2. Create test file: `apps/api/src/infrastructure/scraping/parsers/__tests__/startlist.parser.spec.ts`
3. Test cases:
   - Parse grand tour startlist → returns ~150-200 entries with rider slugs, teams, bibs
   - Verify rider slug format (no leading `/rider/`)
   - Verify team names are non-empty strings
   - Verify bib numbers are positive integers (where available)
   - Pass empty HTML → returns empty array
   - Pass HTML with no startlist table → returns empty array

**Files**:

- `apps/api/src/infrastructure/scraping/parsers/__tests__/startlist.parser.spec.ts` (new)
- Fixture reuse from T013 or new fixture file

**Parallel?**: Yes — can be written alongside T013.

---

## Risks & Mitigations

- **PCS HTML structure varies**: Different race types may have slightly different HTML layouts. Mitigate by testing with multiple fixture types and making parsers defensive (return empty/null on unexpected structure).
- **PCS may change their HTML**: Parsers are inherently fragile against website changes. This is acceptable — the existing results parser has the same risk. Document the expected HTML selectors clearly.
- **Fixture size**: Full PCS pages are large (100KB+). Strip unnecessary content from fixtures to keep test files manageable.

## Review Guidance

- Verify parsers use cheerio (not regex for HTML parsing).
- Verify rider slug extraction strips `/rider/` prefix correctly.
- Verify date parser handles both classic and stage race formats.
- Verify fixture HTML files are included and tests actually use them.
- Verify defensive returns (null/empty) on bad input rather than throwing.

## Activity Log

- 2026-03-19T18:18:14Z – system – lane=planned – Prompt created.
- 2026-03-19T18:45:07Z – claude-opus – shell_pid=14839 – lane=doing – Assigned agent via workflow command
