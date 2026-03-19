---
work_package_id: WP04
title: Scraping Integration — Wire Race Date into Scraper
lane: planned
dependencies: []
subtasks:
  - T015
  - T016
  - T017
  - T018
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
  - FR-002
  - FR-003
---

# Work Package Prompt: WP04 – Scraping Integration — Wire Race Date into Scraper

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
spec-kitty implement WP04 --base WP01
```

Depends on WP01 (raceDate in schema/entity) and WP03 (race-date parser).

---

## Objectives & Success Criteria

- Integrate race date extraction into the existing `TriggerScrapeUseCase` so that all newly scraped results include `raceDate`.
- Update `SeedDatabaseCommand` to backfill race dates for existing results during re-seeding.
- Update existing scraping tests to pass with the new `raceDate` field.

**Done when**: Running `trigger-scrape` for a race populates `raceDate` on all result rows. Running `seed-database` backfills dates for all scraped races. Existing tests pass.

## Context & Constraints

- **Key files** (read these first):
  - Use case: `apps/api/src/application/scraping/trigger-scrape.use-case.ts`
  - Seed command: `apps/api/src/presentation/cli/seed-database.command.ts`
  - Race date parser: `apps/api/src/infrastructure/scraping/parsers/race-date.parser.ts` (from WP03)
  - Plan: `kitty-specs/004-scoring-benchmark-harness/plan.md`

---

## Subtasks & Detailed Guidance

### Subtask T015 – Update `TriggerScrapeUseCase` to extract race dates

**Purpose**: The scraping pipeline must extract dates from PCS pages so every new result has a `raceDate`.

**Steps**:

1. Open `apps/api/src/application/scraping/trigger-scrape.use-case.ts`
2. Import `parseRaceDate` from the race-date parser.
3. For **classic races** (`scrapeClassic`):
   - After fetching the result page HTML, call `parseRaceDate(html)` to extract the date.
   - Pass the date to `persistResults` (see T016).
4. For **stage races** (`scrapeStageRace`):
   - Each stage page is already fetched. Call `parseRaceDate(stageHtml)` for each stage.
   - For non-stage classifications (GC, MOUNTAIN, SPRINT):
     - Track the last stage date seen during stage scraping.
     - Use that as the classification date (final day of race).
   - Pass per-result dates to `persistResults`.
5. Consider adding `raceDate` to `ParsedResult` type:
   ```typescript
   // In parsed-result.type.ts — add:
   readonly raceDate: Date | null;
   ```
   Or pass dates separately as a race-level parameter.

**Files**:

- `apps/api/src/application/scraping/trigger-scrape.use-case.ts`
- Possibly `apps/api/src/infrastructure/scraping/parsers/parsed-result.type.ts`

**Notes**: The cleanest approach may be to add `raceDate` to `ParsedResult` so each result carries its own date. For stages, this is the stage date. For GC/classifications, this is the final race day.

---

### Subtask T016 – Update `persistResults` to pass `raceDate`

**Purpose**: The `RaceResult.create()` call in `persistResults` must include `raceDate`.

**Steps**:

1. In `TriggerScrapeUseCase.persistResults()`, update the `RaceResult.create()` call:
   ```typescript
   RaceResult.create({
     // ... existing fields ...
     raceDate: r.raceDate ?? null, // from ParsedResult or passed separately
   });
   ```
2. If `raceDate` was added to `ParsedResult`, it flows through naturally.
3. If dates are passed separately (e.g., as a `Map<string, Date>`), look up the date per result.

**Files**: `apps/api/src/application/scraping/trigger-scrape.use-case.ts`

---

### Subtask T017 – Update `SeedDatabaseCommand` for date backfill

**Purpose**: When re-seeding, existing results without `raceDate` get backfilled.

**Steps**:

1. Open `apps/api/src/presentation/cli/seed-database.command.ts`
2. The seed command already calls `TriggerScrapeUseCase.execute()` for each race.
3. Since T015-T016 wire dates into the scrape pipeline, re-running seed naturally populates `raceDate` via the upsert (onConflictDoUpdate includes `raceDate` per WP01 T003).
4. Verify this flow works end-to-end:
   - Existing results in DB have `raceDate = NULL`.
   - Seed re-runs, scrapes same races.
   - Upsert updates `raceDate` on conflict.
   - After seed, all results have `raceDate` populated.
5. Add a log message at the end of seeding reporting how many results were updated with dates.

**Files**: `apps/api/src/presentation/cli/seed-database.command.ts`

**Notes**: The existing upsert conflict resolution in `RaceResultRepositoryAdapter.saveMany()` (updated in WP01 T003) includes `raceDate` in the `set` clause. This means re-seeding naturally backfills dates without any special backfill logic.

---

### Subtask T018 – Update existing scraping tests

**Purpose**: Existing tests that create `ParsedResult` objects or call `RaceResult.create()` must include the new `raceDate` field.

**Steps**:

1. Search for all test files that reference `ParsedResult` or `RaceResult.create`:
   ```
   apps/api/src/application/scraping/__tests__/
   apps/api/src/infrastructure/scraping/__tests__/
   apps/api/src/infrastructure/scraping/parsers/__tests__/
   apps/api/src/infrastructure/scraping/validation/__tests__/
   ```
2. Add `raceDate: null` (or a test date) to all `ParsedResult` fixtures if `raceDate` was added to the type.
3. Add `raceDate: null` to all `RaceResult.create()` calls in tests.
4. Run the full test suite and fix any remaining type errors.

**Files**: Multiple test files in `__tests__/` directories.

**Notes**: This is mechanical work — adding a nullable field to existing fixtures. Use `raceDate: null` for existing tests (they don't test date behavior). New date-specific tests were written in WP03.

---

## Risks & Mitigations

- **Date parsing failures**: Some PCS pages may have dates in unexpected formats. The parser returns `null` on failure. Log a warning when date extraction fails but don't fail the scrape — `raceDate` is nullable.
- **Stage race date tracking**: Need to carefully track dates per stage and assign the final date to GC/classification results. Off-by-one errors possible — verify with a known race.
- **ParsedResult type change**: Adding `raceDate` to `ParsedResult` causes type errors in all existing parser functions. Each parser must be updated to include `raceDate` in its return values. For results parsers (not the new date parser), pass `null` initially.

## Review Guidance

- Verify that classic and stage race dates are extracted correctly.
- Verify GC/classification results get the final race day (not a stage date).
- Verify the upsert flow backfills `raceDate` on re-seed.
- Verify existing tests pass with the new field.
- No `any` types introduced.

## Activity Log

- 2026-03-19T18:18:14Z – system – lane=planned – Prompt created.
