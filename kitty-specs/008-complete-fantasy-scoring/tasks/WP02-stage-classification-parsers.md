---
work_package_id: WP02
title: Stage Classification Parsers
lane: planned
dependencies: [WP01]
subtasks:
  - T004
  - T005
  - T006
  - T007
  - T008
  - T009
phase: Phase 1 - Core Parsing
assignee: ''
agent: ''
shell_pid: ''
review_status: ''
reviewed_by: ''
history:
  - timestamp: '2026-03-21T13:44:59Z'
    lane: planned
    agent: system
    shell_pid: ''
    action: Prompt generated via /spec-kitty.tasks
requirement_refs:
  - FR-001
  - FR-002
  - FR-003
---

# Work Package Prompt: WP02 – Stage Classification Parsers

## ⚠️ IMPORTANT: Review Feedback Status

- **Has review feedback?**: Check the `review_status` field above.
- **Mark as acknowledged**: Update `review_status: acknowledged` when addressing feedback.

---

## Review Feedback

_[This section is empty initially.]_

---

## Objectives & Success Criteria

- Parse all hidden `div.resTab` tabs from PCS stage pages
- Extract: daily GC (top 10), mountain passes (all categories HC–Cat4), intermediate sprints (skip "Points at finish"), daily regularidad (top 3)
- Each parser returns structured data ready for persistence
- Unit tests with real PCS HTML fixtures validate all parser functions

## Context & Constraints

- **Existing pattern**: Parsers live in `apps/api/src/infrastructure/scraping/parsers/`. See existing parsers for the code style and Cheerio usage patterns.
- **HTML structure verified**: Research confirmed PCS stage pages have 6 `div.resTab` elements. Tab 0 is visible (stage results), Tabs 1-5 are hidden. See `kitty-specs/008-complete-fantasy-scoring/research.md` for evidence.
- **Constitution**: Infrastructure layer — parsers are adapters, no domain logic here.
- **Key decision from plan**: One parser per classification type, dispatched by a coordinator.
- **Implementation command**: `spec-kitty implement WP02 --base WP01`

## Subtasks & Detailed Guidance

### Subtask T004 – Create tab coordinator

- **Purpose**: Iterate all hidden `div.resTab` elements on a stage page and dispatch to the correct parser based on content analysis.
- **Steps**:
  1. Create `apps/api/src/infrastructure/scraping/parsers/stage-classifications.parser.ts`
  2. Export a main function: `parseStageClassifications(html: string, stageNumber: number): StageClassificationResult`
  3. The coordinator should:
     - Load HTML with Cheerio
     - Select all `div.resTab` elements
     - For each tab, analyze headers and headings to determine type:
       - Tab with `h3`/`h4` containing `"KOM Sprint"` → mountain passes (call T006 parser)
       - Tab with `h3`/`h4` containing `"Sprint |"` → intermediate sprints (call T007 parser)
       - Tab with table headers including `"Time won/lost"` AND no "Prev" column in first position → daily GC (call T005 parser)
       - Regularidad is extracted from the Points tab "Today" column (call T008 within sprint tab processing)
     - Skip Tab 0 (visible, already parsed by existing scraper)
     - Skip tabs with "Youth", "Team" in headings
  4. Return a combined result object:
     ```typescript
     interface StageClassificationResult {
       dailyGC: ClassificationEntry[]; // top 10
       mountainPasses: MountainPassEntry[]; // per pass, all scoring positions
       intermediateSprints: SprintEntry[]; // per sprint, top 3
       dailyRegularidad: ClassificationEntry[]; // top 3
     }
     ```
- **Files**: `apps/api/src/infrastructure/scraping/parsers/stage-classifications.parser.ts`
- **Parallel?**: No — other parsers are called by this coordinator
- **Notes**: Tab identification by INDEX is unreliable (varies by race). Use CONTENT-based detection.

### Subtask T005 – Implement `parseDailyGC()`

- **Purpose**: Extract the top 10 GC standings after a stage from the hidden GC tab.
- **Steps**:
  1. The GC tab is identified by having table headers like `Rnk | Prev | ▼▲ | BIB | ... | Rider | Team | ... | Time | Time won/lost`
  2. Parse the results table: extract position (1-10 only), rider link (href for slug), rider name
  3. Return array of `ClassificationEntry`:
     ```typescript
     interface ClassificationEntry {
       riderSlug: string; // from `<a>` href attribute
       riderName: string;
       position: number;
     }
     ```
  4. Only return positions 1-10 (game scores top 10 for daily GC)
  5. Handle the case where fewer than 10 riders are in the table (e.g., after mass DNF)
- **Files**: Same file as T004 (or a helper module)
- **Parallel?**: No
- **Notes**: The GC tab looks similar to the stage result tab but has "Prev" and "▼▲" columns. Use this to distinguish from Tab 0.

### Subtask T006 – Implement `parseMountainPasses()`

- **Purpose**: Extract individual mountain pass results from the KOM tab, including climb category and name.
- **Steps**:
  1. The KOM tab contains multiple sub-tables, each with a heading like:
     - `"KOM Sprint (HC) Plateau de Beille (197.7 km)"`
     - `"KOM Sprint (1) Col de Peyresourde (7 km)"`
     - `"KOM Sprint (2) Côte de Saint-Just (45.3 km)"`
  2. For each sub-table heading, extract category, name, and km using regex:
     ```
     /KOM Sprint \((HC|[1-4])\)\s+(.+?)\s*\((\d+(?:\.\d+)?)\s*km\)/
     ```
  3. Parse the results table under each heading: extract position, rider slug, rider name
  4. Number of scoring positions per category:
     - HC: top 8 (12/8/6/5/4/3/2/1)
     - Cat 1: top 5 (8/6/4/2/1)
     - Cat 2: top 3 (5/3/1)
     - Cat 3: top 2 (3/2)
     - Cat 4: top 1 (1)
  5. Return array of `MountainPassEntry`:
     ```typescript
     interface MountainPassEntry {
       riderSlug: string;
       riderName: string;
       position: number;
       climbCategory: 'HC' | '1' | '2' | '3' | '4';
       climbName: string;
       kmMarker: number;
     }
     ```
  6. Also handle the cumulative KOM classification subtable (has "General" heading) — this is the overall KOM standing, NOT individual passes. **Skip it** — we already capture the final KOM classification.
- **Files**: Same parser file
- **Parallel?**: No
- **Notes**: Some tabs may show the cumulative "General" KOM table first, then individual passes below. Distinguish by heading content.

### Subtask T007 – Implement `parseIntermediateSprints()`

- **Purpose**: Extract intermediate sprint results from the Points tab.
- **Steps**:
  1. The Points tab contains sub-tables with headings like:
     - `"Sprint | Marignac (37 km)"` → CAPTURE (intermediate sprint)
     - `"Points at finish"` → SKIP (duplicates stage results)
     - Cumulative "General" points table → SKIP
  2. For each intermediate sprint heading, extract location and km:
     ```
     /Sprint\s*\|\s*(.+?)\s*\((\d+(?:\.\d+)?)\s*km\)/
     ```
  3. Parse the results table: extract top 3 positions, rider slug, rider name
  4. Count total intermediate sprints in the stage to determine point table:
     - 1 sprint: full points (6/4/2)
     - 2+ sprints: reduced points (3/2/1)
     - Store this count in the result so the scoring engine can apply the right table
  5. Return array of `SprintEntry`:
     ```typescript
     interface SprintEntry {
       riderSlug: string;
       riderName: string;
       position: number;
       sprintName: string;
       kmMarker: number;
       totalSprintsInStage: number; // for multi-sprint detection
     }
     ```
  6. For daily regularidad: extract the "Today" column from the cumulative Points table (the "General" sub-table). The top 3 riders by "Today" points are the daily regularidad winners. Return separately.
- **Files**: Same parser file
- **Parallel?**: No
- **Notes**: "Points at finish" sometimes has a different heading format. Be defensive — skip any subtable that isn't clearly `"Sprint | Location"`.

### Subtask T008 – Save PCS HTML fixtures

- **Purpose**: Capture real PCS HTML for reliable unit testing.
- **Steps**:
  1. Create directory: `apps/api/src/infrastructure/scraping/parsers/__fixtures__/`
  2. Save HTML from these pages (use the existing `gotScraping` or curl):
     - TdF 2024 Stage 15 (mountain stage with passes + sprints): `race/tour-de-france/2024/stage-15`
     - Paris-Nice 2026 Stage 1 (flat stage, minimal classifications): `race/paris-nice/2026/stage-1`
     - A stage with TTT or cancelled (if available) for edge case testing
  3. Name files: `tdf-2024-stage-15.html`, `paris-nice-2026-stage-1.html`
  4. These are static fixtures — no network calls during tests
- **Files**: `apps/api/src/infrastructure/scraping/parsers/__fixtures__/*.html`
- **Parallel?**: Yes — can be done while writing parsers

### Subtask T009 – Unit tests for all parsers

- **Purpose**: Verify parsers extract correct data from PCS HTML fixtures.
- **Steps**:
  1. Create `apps/api/src/infrastructure/scraping/parsers/__tests__/stage-classifications.parser.spec.ts`
  2. Test `parseStageClassifications()` with TdF 2024 Stage 15 fixture:
     - Assert `dailyGC` has 10 entries, position 1 is Pogačar
     - Assert `mountainPasses` has entries for each climb (verify category HC, 1, etc.)
     - Assert `intermediateSprints` has entries with sprint location
     - Assert no "Points at finish" data leaked into sprints
  3. Test with Paris-Nice 2026 Stage 1 (flat):
     - Assert `mountainPasses` is empty
     - Assert `dailyGC` has entries (GC exists even on flat stages)
  4. Test edge cases:
     - Empty HTML → returns empty arrays, no crash
     - Missing tabs → returns partial results
- **Files**: `apps/api/src/infrastructure/scraping/parsers/__tests__/stage-classifications.parser.spec.ts`
- **Parallel?**: No — needs parsers and fixtures complete

## Risks & Mitigations

- **Risk**: PCS HTML structure changes between race years → **Mitigation**: Test with fixtures from different years; log warnings on parse failures instead of crashing
- **Risk**: Heading regex doesn't match edge cases (e.g., accented characters, special formatting) → **Mitigation**: Make regex lenient; capture group for name allows any characters
- **Risk**: Tab identification by content is ambiguous → **Mitigation**: Use multiple signals (headers + headings); fall back to skipping unidentified tabs

## Review Guidance

- Verify parsers follow existing code patterns in `apps/api/src/infrastructure/scraping/parsers/`
- Verify no domain logic in parsers (pure infrastructure)
- Verify "Points at finish" is correctly skipped
- Verify mountain pass categories match game rules (HC through Cat 4)
- Verify multi-sprint detection logic

## Activity Log

- 2026-03-21T13:44:59Z – system – lane=planned – Prompt created.
