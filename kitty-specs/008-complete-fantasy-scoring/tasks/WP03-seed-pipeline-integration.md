---
work_package_id: WP03
title: Seed Pipeline Integration
lane: 'for_review'
dependencies: [WP02]
base_branch: 008-complete-fantasy-scoring-WP02
base_commit: 309a3d6f67ab18e740425da75e29724dfbc84082
created_at: '2026-03-21T21:01:07.900835+00:00'
subtasks:
  - T010
  - T011
  - T012
  - T013
phase: Phase 1 - Core Parsing
assignee: ''
agent: 'claude-opus'
shell_pid: '69805'
review_status: ''
reviewed_by: ''
history:
  - timestamp: '2026-03-21T13:44:59Z'
    lane: planned
    agent: system
    shell_pid: ''
    action: Prompt generated via /spec-kitty.tasks
requirement_refs:
  - FR-004
  - FR-005
  - FR-006
  - FR-007
  - FR-009
---

# Work Package Prompt: WP03 – Seed Pipeline Integration

## ⚠️ IMPORTANT: Review Feedback Status

- **Has review feedback?**: Check the `review_status` field above.

---

## Review Feedback

_[This section is empty initially.]_

---

## Objectives & Success Criteria

- Wire the new stage classification parsers (WP02) into the existing seed-database CLI flow
- Every stage page fetched during seed also extracts and persists daily GC, mountain passes, intermediate sprints, and daily regularidad
- Seed completes for a full race without errors
- DB contains rows for all 8 category types after seeding

## Context & Constraints

- **Existing flow**: The seed-database CLI command triggers a use case that iterates races, fetches stage pages, and calls parsers. See `apps/api/src/cli.ts` and the scraping use cases in `apps/api/src/application/scraping/`.
- **Scraping is CLI/cron only** — no REST endpoints (security policy).
- **Rate limiting**: 1.5s between PCS requests (already handled by `PcsClientAdapter`).
- **Key insight**: Stage HTML is already fetched for stage results. We just need to also call `parseStageClassifications()` on the same HTML.
- **Implementation command**: `spec-kitty implement WP03 --base WP02`

## Subtasks & Detailed Guidance

### Subtask T010 – Extend scraping use case to call new parsers

- **Purpose**: After fetching a stage page HTML, also extract classification data.
- **Steps**:
  1. Find the use case that processes stage pages during seed (likely in `apps/api/src/application/scraping/`)
  2. After the existing `parseResultsTable()` call, add a call to `parseStageClassifications(html, stageNumber)`
  3. The coordinator returns `StageClassificationResult` with dailyGC, mountainPasses, intermediateSprints, dailyRegularidad arrays
  4. Pass these arrays to the persistence step (T011)
  5. Ensure the new parsing doesn't break the existing flow — if classification parsing fails, log warning and continue with stage results
- **Files**: The scraping use case file (explore `apps/api/src/application/scraping/` to find it)
- **Parallel?**: No

### Subtask T011 – Map parser output to race_results and persist

- **Purpose**: Convert parser output to `race_results` rows and save to DB.
- **Steps**:
  1. For each classification entry, create a race_results row:
     - `rider_id`: Match `riderSlug` → UUID using the same rider matching logic as existing stage results
     - `race_slug`, `race_name`, `race_type`, `year`, `race_date`: From the current race context
     - `stage_number`: From the stage being processed
     - `category`: One of `gc_daily`, `mountain_pass`, `sprint_intermediate`, `regularidad_daily`
     - `position`: From parser output
     - `climb_category`, `climb_name`: For mountain_pass entries
     - `sprint_name`: For sprint_intermediate entries
     - `km_marker`: For both mountain and sprint entries
     - `dnf`: false (classification participants aren't DNF)
  2. Use the existing repository/persistence pattern to batch-insert new rows
  3. For `gc_daily`: persist only positions 1-10
  4. For `mountain_pass`: persist positions up to the scoring limit per category (HC=8, Cat1=5, Cat2=3, Cat3=2, Cat4=1)
  5. For `sprint_intermediate`: persist top 3
  6. For `regularidad_daily`: persist top 3
- **Files**: Repository/persistence layer in `apps/api/src/infrastructure/`
- **Parallel?**: No
- **Notes**: Rider slug matching may fail for some riders (different slug formats). Log warnings but don't crash.

### Subtask T012 – Handle edge cases

- **Purpose**: Ensure seed doesn't crash on unexpected page structures.
- **Steps**:
  1. **Old races (pre-2023)**: Hidden tabs may not exist or have different structure. If `parseStageClassifications()` returns empty arrays, log info and continue.
  2. **Cancelled/shortened stages**: Some stages have no classifications (e.g., cancelled due to weather). Handle gracefully.
  3. **TTT stages**: Team time trials may have different tab structure. The coordinator should skip unrecognized tabs.
  4. **Prologue/ITT stages**: May not have mountain or sprint data. Parser returns empty arrays — fine.
  5. **Duplicate prevention**: If seed is run twice, new rows should not duplicate. Use INSERT ... ON CONFLICT DO NOTHING or check for existing rows before inserting.
  6. Add appropriate logging at INFO level for progress (e.g., "Stage 15: 10 GC daily, 5 mountain passes, 1 sprint") and WARN level for skipped data.
- **Files**: Use case + repository layer
- **Parallel?**: No

### Subtask T013 – Integration test

- **Purpose**: Verify end-to-end seed flow produces correct data.
- **Steps**:
  1. Create integration test that seeds ONE race (e.g., mock the PCS HTTP calls with saved fixtures)
  2. After seed completes, query DB and assert:
     - `race_results` has rows with `category = 'gc_daily'` for the seeded race
     - `race_results` has rows with `category = 'mountain_pass'` (if mountain stage)
     - Row counts are plausible (e.g., 10 gc_daily rows per stage, variable mountain passes)
     - `climb_category` is populated for mountain_pass rows
     - `sprint_name` is populated for sprint_intermediate rows
  3. Verify no duplicate rows on re-run
- **Files**: `apps/api/src/application/scraping/__tests__/` or similar test directory
- **Parallel?**: No

## Risks & Mitigations

- **Risk**: Rider slug mismatch between classification tabs and our rider DB → **Mitigation**: Use same fuzzy matching as existing scraper; log mismatches
- **Risk**: Seed takes significantly longer due to extra parsing → **Mitigation**: Parsing is in-memory (no extra HTTP calls), should add <1ms per stage
- **Risk**: Re-running seed creates duplicates → **Mitigation**: Use ON CONFLICT or pre-check

## Review Guidance

- Verify the seed flow doesn't add extra HTTP requests (reuses existing stage HTML)
- Verify error handling doesn't mask real bugs (log at appropriate level)
- Verify duplicate prevention works
- Verify rider matching uses the same logic as existing parsers

## Activity Log

- 2026-03-21T13:44:59Z – system – lane=planned – Prompt created.
- 2026-03-21T21:01:08Z – claude-opus – shell_pid=69805 – lane=doing – Assigned agent via workflow command
- 2026-03-21T21:07:30Z – claude-opus – shell_pid=69805 – lane=for_review – Seed pipeline extended with stage classification parsing
