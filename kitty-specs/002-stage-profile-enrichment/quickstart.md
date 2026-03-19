# Quickstart: Stage Profile Enrichment

**Feature**: 002-stage-profile-enrichment

## What This Feature Does

Adds stage terrain profile data (flat/hilly/mountain, ITT/TTT, ProfileScore) to the scraping pipeline and exposes a target race's profile distribution via a new API endpoint and frontend URL input.

## Key Files to Understand

### Backend (apps/api)

| File                                                          | Purpose                                              |
| ------------------------------------------------------------- | ---------------------------------------------------- |
| `src/infrastructure/database/schema/enums.ts`                 | New `parcoursTypeEnum`                               |
| `src/infrastructure/database/schema/race-results.ts`          | 4 new columns on `race_results`                      |
| `src/infrastructure/scraping/parsers/profile-extractor.ts`    | NEW — shared sidebar profile/ProfileScore extraction |
| `src/infrastructure/scraping/parsers/race-overview.parser.ts` | NEW — parse stage list from overview page            |
| `src/infrastructure/scraping/parsers/stage-race.parser.ts`    | MODIFIED — uses profile-extractor for each stage     |
| `src/infrastructure/scraping/parsers/classic.parser.ts`       | MODIFIED — uses profile-extractor for race profile   |
| `src/infrastructure/scraping/parsers/parsed-result.type.ts`   | MODIFIED — adds profile fields to ParsedResult       |
| `src/application/analyze/fetch-race-profile.use-case.ts`      | NEW — orchestrates profile fetch from PCS URL        |
| `src/presentation/race-profile.controller.ts`                 | NEW — GET /api/race-profile endpoint                 |

### Frontend (apps/web)

| File                                                          | Purpose                                              |
| ------------------------------------------------------------- | ---------------------------------------------------- |
| `src/features/rider-list/components/rider-input.tsx`          | MODIFIED — PCS URL input replaces race type selector |
| `src/features/rider-list/components/race-profile-summary.tsx` | NEW — displays profile distribution                  |

### Shared Types (packages/shared-types)

| File           | Purpose                                                        |
| -------------- | -------------------------------------------------------------- |
| `src/enums.ts` | New `ParcoursType` enum                                        |
| `src/api.ts`   | New `RaceProfileResponse`, `StageInfo`, `ProfileSummary` types |

## Development Flow

1. **Schema changes first** — add enum + columns to Drizzle schema, generate migration
2. **Profile extractor** — shared utility to extract parcours type + ProfileScore from a Cheerio-parsed sidebar
3. **Modify existing parsers** — integrate profile-extractor into stage-race and classic parsers
4. **New overview parser** — parse stage list table from race overview page
5. **Use case + endpoint** — fetch-race-profile use case + REST controller
6. **Frontend** — URL input component + profile distribution display
7. **Re-seed database** — wipe and re-scrape with enriched data

## Testing Strategy

- **Parser tests**: HTML fixture files for each parser (stage result sidebar, classic sidebar, overview stage list)
- **Use case tests**: Mock PCS client, verify orchestration logic (stage race vs classic vs future classic fallback)
- **Controller tests**: HTTP-level tests for /api/race-profile
- **Frontend tests**: Component tests for URL input and profile summary display
- **E2E**: Paste URL → see profile → submit rider list flow
