---
work_package_id: WP12
title: 'Dynamic Race Discovery from PCS Calendar'
lane: 'planned'
dependencies: '[]'
base_branch: main
depends_on: []
estimated_prompt_size: ~200 lines
priority: P0
type: feature
---

# WP12 — Dynamic Race Discovery from PCS Calendar

## Context

The current system uses a hardcoded `RACE_CATALOG` (18 UWT races) for scraping. The research
document (Section 1) specifies **dynamic race discovery** from PCS calendar pages, which would
cover all WorldTour (~36 races) and ProSeries (~30-40 races) automatically each season.

This WP replaces the static catalog with a dynamic discovery pipeline and adds a `seed` CLI
command to bulk-scrape all races for a given year range.

## Scope

### 1. Calendar Parser — New infrastructure adapter

**File**: `apps/api/src/infrastructure/scraping/parsers/calendar.parser.ts`

Parse the PCS calendar page (`races.php?year={year}&circuit={circuit_id}&filter=Filter`).

Input: HTML string from calendar page.
Output: Array of discovered races:

```typescript
interface DiscoveredRace {
  slug: string; // e.g. "tour-de-france"
  name: string; // e.g. "Tour de France"
  raceType: 'stage_race' | 'one_day'; // derived from Class column (2.xxx = stage, 1.xxx = one_day)
  raceClass: string; // e.g. "2.UWT", "1.Pro"
  year: number;
}
```

Parsing rules (from research Section 1.3):

- Selector: `table.basic` (or `table[class*="basic"]`)
- For each row: extract href from Race column `<a>`, read Class column text
- Class starts with "2." → stage_race; starts with "1." → one_day
- Strip `/gc`, `/result`, `/results` suffixes from href to get base slug
- Deduplicate by slug

Guardrails:

- WorldTour must yield >= 25 races per year
- No duplicate slugs after deduplication

### 2. Race Discovery Use Case

**File**: `apps/api/src/application/scraping/discover-races.use-case.ts`

New use case that:

1. Fetches calendar pages for given year + circuits (1=WT, 26=ProSeries)
2. Parses discovered races
3. Maps `one_day` → `RaceType.CLASSIC`, `stage_race` → infer from name/stages (GT vs mini tour)
4. Returns list of discovered races

### 3. Seed CLI Command

**File**: `apps/api/src/presentation/cli/seed-database.command.ts`

New nest-commander command:

```bash
node dist/cli.js seed-database --from 2023 --to 2025 [--circuit 1,26] [--dry-run]
```

Options:

- `--from <year>`: Start year (required)
- `--to <year>`: End year (required)
- `--circuit <ids>`: Comma-separated circuit IDs (default: "1,26" = WT + ProSeries)
- `--dry-run`: Show discovered races without scraping

Flow:

1. For each year in range, discover races from calendar
2. For each discovered race, run existing `TriggerScrapeUseCase`
3. Skip races already scraped (check scrape_jobs for existing success entries)
4. Log progress: "Scraping race 15/72: tour-de-france 2024..."
5. Summary at end: total races, records upserted, failures

### 4. Extend Race Catalog

Keep `RACE_CATALOG` as domain knowledge for validation (expectedStages for GTs), but make
`TriggerScrapeUseCase` accept any valid race slug+type, not just catalog entries.

The use case currently calls `findRaceBySlug()` — make this lookup optional, falling back
to the discovered race metadata when the race isn't in the hardcoded catalog.

### 5. Map race class to RaceType

Mapping rules:

- Known Grand Tours (tour-de-france, giro-d-italia, vuelta-a-espana) → `GRAND_TOUR`
- `stage_race` with class `2.UWT` or `2.Pro` → `MINI_TOUR`
- `one_day` → `CLASSIC`

## Validation

1. `pnpm build` succeeds
2. `pnpm lint` passes
3. All existing tests pass
4. New tests for calendar parser (with HTML fixture)
5. `--dry-run` shows correct race list for a known year
6. Full seed of 1 year works end-to-end

## Definition of Done

- [ ] Calendar parser implemented with tests
- [ ] Discover races use case implemented
- [ ] seed-database CLI command works
- [ ] TriggerScrapeUseCase accepts non-catalog races
- [ ] Dry-run mode shows discovered races
- [ ] Skip already-scraped races
- [ ] Full seed of 1 year completes successfully
