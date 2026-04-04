# Data Model: Race Selector with Auto Price Import

## Entities

### RaceListItem (read projection — no new table)

Derived from existing `race_results` table via `SELECT DISTINCT`.

| Field | Type | Source |
|-------|------|--------|
| raceSlug | string | `race_results.race_slug` |
| raceName | string | `race_results.race_name` |
| raceType | RaceType enum | `race_results.race_type` |
| year | number | `race_results.year` |

**Query**: `SELECT DISTINCT race_slug, race_name, race_type, year FROM race_results WHERE year >= 2024 ORDER BY year DESC, race_name ASC`

No new database table or migration required.

---

### GmvPost (in-memory cached, not persisted)

Fetched from GMV WordPress REST API and cached in-memory.

| Field | Type | Source |
|-------|------|--------|
| id | number | WP API `id` |
| title | string | WP API `title.rendered` |
| url | string | WP API `link` |
| date | string | WP API `date` |

**Source**: `GET grandesminivueltas.com/wp-json/wp/v2/posts?categories=23,21&per_page=100&_fields=id,title,link,date`

**Filtering**: Exclude posts where title contains "Equipos y elecciones" or "Calendario"

---

### GmvMatchResult (transient — response only)

Returned by the GMV auto-import endpoint. Not persisted.

| Field | Type | Description |
|-------|------|-------------|
| matched | boolean | Whether a GMV post was found |
| postTitle | string? | Title of matched post (if matched) |
| postUrl | string? | URL of matched post (if matched) |
| confidence | number? | Match confidence 0-1 (if matched) |
| riders | ParsedPriceEntry[]? | Imported riders (if matched and import succeeded) |
| error | string? | Error message (if import failed) |

---

## Data Flow

```
User selects "Volta a Catalunya 2026" from combobox
                    │
    ┌───────────────┼───────────────┐
    ▼                               ▼
GET /api/race-profile          GET /api/gmv-match
  ?raceSlug=volta-a-catalunya    ?raceSlug=volta-a-catalunya
  &year=2026                     &year=2026
    │                               │
    ▼                               ▼
FetchRaceProfileUseCase        GmvAutoImportUseCase
  - builds PCS URL               - gets cached GMV posts
  - fetches from PCS              - fuzzy matches race name
  - returns profile               - if match: fetches + parses price list
    │                               │
    ▼                               ▼
RaceProfileResponse            GmvMatchResponse
  { raceSlug, raceName,          { matched: true,
    raceType, stages,              riders: [...],
    profileSummary }               postTitle, confidence }
```

## Existing Entities (unchanged)

- **race_results**: Source for race catalog. No schema changes.
- **riders**: Unchanged. Used during analysis after import.
- **ParsedPriceEntry**: `{ name: string, team: string, price: number }` — existing type, reused for GMV import output.
