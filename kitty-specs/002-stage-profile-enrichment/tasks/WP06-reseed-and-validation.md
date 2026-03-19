---
work_package_id: WP06
title: Database Re-seed & Validation
lane: 'done'
dependencies: [WP02]
base_branch: main
subtasks:
  - T028
  - T029
  - T030
  - T031
agent: 'egimenos'
shell_pid: 'manual'
reviewed_by: 'egimenos'
review_status: 'approved'
history:
  - timestamp: '2026-03-19T11:19:08Z'
    lane: planned
    agent: system
    shell_pid: ''
    action: Prompt generated via /spec-kitty.tasks
  - timestamp: '2026-03-19T17:00:00Z'
    lane: done
    agent: egimenos
    action: 'Re-seed complete: 206 races, 113888 records. SC-001 pass (0 null parcours stages). TdF 2024 21 stages verified. Milano-Sanremo p2/59 confirmed.'
depends_on: [WP02]
estimated_prompt_size: ~300 lines
priority: P1
requirement_refs:
  - FR-011
type: validation
---

# Work Package Prompt: WP06 – Database Re-seed & Validation

## Objectives & Success Criteria

- Verify `seed-database` CLI command works with the updated schema (new columns populated by updated parsers)
- Run a full re-seed from scratch
- Validate profile data accuracy for at least 3 known races (SC-005)
- Verify existing scoring pipeline and `/api/analyze` endpoint work correctly with enriched data (no regression)

## Context & Constraints

- **Spec**: `kitty-specs/002-stage-profile-enrichment/spec.md` — FR-011, SC-001 through SC-005
- **Constitution**: No production data — database can be wiped freely
- **Existing CLI**: `seed-database` command at `apps/api/src/presentation/cli/seed-database.command.ts` handles race discovery and scraping orchestration
- **Expected behavior**: The updated parsers (WP02) now produce `ParsedResult` objects with profile data. The `trigger-scrape.use-case.ts` (also updated in WP02) passes these through to `RaceResult.create()`. So re-seeding automatically populates the new columns.

**Implementation command**: `spec-kitty implement WP06 --base WP02`

## Subtasks & Detailed Guidance

### Subtask T028 – Verify seed-database works with new schema

- **Purpose**: Ensure the CLI command runs without errors after schema and parser changes.
- **Files**: No code changes expected — this is a verification task.
- **Steps**:
  1. Drop the existing database: `docker compose exec db psql -U postgres -c "DROP DATABASE cycling_analyzer; CREATE DATABASE cycling_analyzer;"`
  2. Apply the new migration: run `pnpm --filter api drizzle-kit push` or the migration command.
  3. Run a dry-run to verify race discovery works: `pnpm --filter api cli seed-database --years 2024 --dry-run`
  4. Run a single race scrape to verify profile data flows through:
     ```bash
     pnpm --filter api cli scrape --race tour-de-france --year 2024
     ```
  5. Query the database to check profile columns are populated:
     ```sql
     SELECT category, stage_number, parcours_type, is_itt, is_ttt, profile_score
     FROM race_results
     WHERE race_slug = 'tour-de-france' AND year = 2024 AND category = 'stage'
     LIMIT 10;
     ```
  6. Verify: STAGE rows have non-null `parcours_type`, GC/MOUNTAIN/SPRINT rows have null `parcours_type`.
- **Notes**: If any issues are found, fix them in the relevant WP (likely WP01 or WP02) before proceeding.

### Subtask T029 – Run full re-seed

- **Purpose**: Populate the database with enriched data for all scraped races.
- **Steps**:
  1. Wipe the database completely.
  2. Apply fresh migration/schema.
  3. Run: `pnpm --filter api cli seed-database --years 2023,2024,2025`
  4. Monitor for errors — some races may fail due to PCS page structure variations. Note any failures.
  5. Expected duration: Several hours (polite scraping with 1.5s delays, ~70 races × ~25 pages each).
- **Notes**: This is a long-running operation. Run in a tmux/screen session or with `nohup`.

### Subtask T030 – Validate profile data for 3 known races

- **Purpose**: Manual verification that profile data matches PCS source (SC-005).
- **Steps**:
  1. **Tour de France 2024** (stage race, Grand Tour):
     - Query: `SELECT stage_number, parcours_type, is_itt, is_ttt, profile_score FROM race_results WHERE race_slug = 'tour-de-france' AND year = 2024 AND category = 'stage' AND stage_number IS NOT NULL GROUP BY stage_number, parcours_type, is_itt, is_ttt, profile_score ORDER BY stage_number;`
     - Verify against known data:
       - Stage 1: p4 (Mountains, flat finish)
       - Stage 7: p1 + is_itt=true (Flat ITT)
       - Stage 11: p5 (Mountains, uphill finish)
       - Stage 21: p4 + is_itt=true (Mountains ITT)
     - GC/MOUNTAIN/SPRINT rows should have null parcours_type.
  2. **Paris-Nice 2024** (stage race, Mini Tour):
     - Verify at least some stage results have profile data.
  3. **Milano-Sanremo 2024** (classic):
     - Query: `SELECT parcours_type, profile_score FROM race_results WHERE race_slug LIKE '%milano-sanremo%' AND year = 2024 AND category = 'gc' LIMIT 1;`
     - Verify: parcours_type = 'p2' (Hills, flat finish).
  4. **SC-001 check**: Count stage results with null parcours_type:
     ```sql
     SELECT COUNT(*) FROM race_results
     WHERE category = 'stage' AND parcours_type IS NULL;
     ```
     Should be 0 or very close to 0 (some edge cases may have null).
  5. **SC-002 check**: Count classic results with null parcours_type:
     ```sql
     SELECT COUNT(*) FROM race_results
     WHERE race_type = 'classic' AND category = 'gc' AND parcours_type IS NULL;
     ```

### Subtask T031 – Verify scoring pipeline regression

- **Purpose**: Ensure the existing scoring and analysis flow works correctly with enriched data.
- **Steps**:
  1. Start the API server: `pnpm --filter api start:dev`
  2. Send a test request to `/api/analyze` with a known rider list (e.g., TdF 2024 top riders):
     ```bash
     curl -X POST http://localhost:3000/api/analyze \
       -H "Content-Type: application/json" \
       -d '{
         "riders": [
           {"name": "Tadej Pogačar", "team": "UAE Team Emirates", "price": 200},
           {"name": "Jonas Vingegaard", "team": "Visma-Lease a Bike", "price": 180}
         ],
         "raceType": "grand_tour",
         "budget": 2000
       }'
     ```
  3. Verify response contains valid scores (not null, reasonable values).
  4. Verify the scoring engine handles the new profile fields without errors (it should ignore them since the scoring algorithm is not yet profile-aware).
- **Notes**: This confirms backward compatibility. The new columns exist but the scoring engine doesn't use them yet.

## Risks & Mitigations

- Re-seed may take several hours. Mitigation: run in background, expected behavior.
- Some races may fail to parse ProfileScore. Mitigation: null values are acceptable (FR-010).
- PCS rate limiting during bulk scrape. Mitigation: existing throttling in PCS client handles this.

## Review Guidance

- Verify SC-001: stage results have non-null parcours_type after re-seed.
- Verify SC-002: classic results have non-null parcours_type after re-seed.
- Verify SC-005: manual validation of 3 races matches PCS source.
- Verify no regression in existing `/api/analyze` endpoint.

## Activity Log

- 2026-03-19T11:19:08Z – system – lane=planned – Prompt created.
- 2026-03-19T17:00:00Z – egimenos – lane=done – Re-seed complete: 206 races, 113888 records. SC-001 pass (0 null parcours stages). TdF 2024 verified. Milano-Sanremo p2/59 confirmed.
