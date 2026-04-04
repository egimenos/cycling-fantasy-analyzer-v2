# Research: Race Selector with Auto Price Import

## R1: Combobox Component Approach

**Decision**: Use `cmdk` (Command Menu) package with Radix UI Popover

**Rationale**: The project uses shadcn/ui which has a [Combobox pattern](https://ui.shadcn.com/docs/components/combobox) built on `cmdk` + `@radix-ui/react-popover`. This is the idiomatic choice and provides:
- Built-in fuzzy search filtering
- Keyboard navigation (arrow keys, enter, escape)
- Accessible (WAI-ARIA combobox pattern)
- Lightweight (~3KB gzipped)
- Already compatible with the project's Tailwind + Radix setup

**Alternatives considered**:
- Custom implementation with Radix Dialog: More work, no search built-in
- `react-select`: Heavy, different styling paradigm (CSS-in-JS), doesn't match shadcn/ui
- `@headlessui/react`: Different ecosystem (Tailwind Labs), not Radix-based

## R2: Fuzzy Matching for GMV Posts

**Decision**: Simple normalized string similarity — no external library needed

**Rationale**: The matching problem is small (~50-100 posts vs 1 race name). A simple approach:
1. Normalize both strings: lowercase, remove accents, remove year, remove common prefixes ("la ", "le ", "il ")
2. Check if the normalized race name tokens are a subset of the post title tokens
3. Score by token overlap ratio
4. Threshold: require ≥ 70% token overlap for a match

Edge cases handled:
- "Ronde van Vlaanderen" → GMV uses "Tour de Flandes ME" → needs a static alias map for ~5 known mismatches (race name in different languages)
- Year stripping: "Tour de France 2025" → compare "tour france" vs "tour france"
- "ME" suffix in GMV posts (men's edition) → strip before matching

**Alternatives considered**:
- `fuzzysort` (already in project for rider matching): Overkill for this use case, designed for character-level fuzzy matching
- Levenshtein distance: Too sensitive to string length differences
- Full-text search: No infrastructure for ~50 items

## R3: In-Memory Cache for GMV Posts

**Decision**: NestJS singleton service with Map + timestamp-based TTL

**Rationale**: 
- Dataset is tiny (~50-100 posts, ~5KB)
- No need for Redis or DB persistence
- Single-user app — no cache invalidation complexity
- TTL of 4 hours (posts don't change frequently, new races posted days before)
- Cache refreshes transparently on first request after TTL expires

Implementation pattern:
```typescript
@Injectable()
export class GmvPostCacheService {
  private cache: GmvPost[] = [];
  private lastFetchedAt = 0;
  private readonly ttlMs = 4 * 60 * 60 * 1000; // 4 hours

  async getPosts(client: GmvClientPort): Promise<GmvPost[]> {
    if (Date.now() - this.lastFetchedAt < this.ttlMs && this.cache.length > 0) {
      return this.cache;
    }
    this.cache = await client.fetchRecentPosts();
    this.lastFetchedAt = Date.now();
    return this.cache;
  }
}
```

**Alternatives considered**:
- `@nestjs/cache-manager`: Adds dependency, configuration overhead for a trivial cache
- PostgreSQL table: Overkill, adds migration, stale data management
- Redis: Not in the stack, massive overkill for 50 items

## R4: Race Catalog Query

**Decision**: Reuse existing `findDistinctRacesWithDate()` in `RaceResultRepositoryAdapter`, add year filter

**Rationale**: The method already exists and returns `{ raceSlug, raceName, year, raceType }`. Only change: add `WHERE year >= 2024` filter. This avoids a new repository method — just add an optional parameter.

The existing `RACE_RESULT_REPOSITORY_PORT` already exports this capability, so no new port needed.

## R5: Race Profile Endpoint Modification

**Decision**: Extend `FetchRaceProfileUseCase` to accept slug+year as alternative to URL

**Rationale**: Currently `execute(pcsUrl: string)` parses slug+year from the URL, then fetches from PCS. The logic after URL parsing is slug+year based anyway. Add an overload or alternative method that accepts `{ raceSlug, year }` directly, skipping URL parsing. The controller gets a new route: `GET /api/race-profile?raceSlug=volta-a-catalunya&year=2026`.

## R6: GMV WordPress API Categories

**Decision**: Filter posts by categories 23 (masculinas-carreras) + 21 (grandes-vueltas-carreras)

**Rationale**: Verified empirically:
- Category 23 (`masculinas-carreras`): All men's minor races — only has `[4, 23]` categories
- Category 21 (`grandes-vueltas-carreras`): All grand tours — only has `[4, 21]` categories, no women's GV posts found
- Post title filter: Exclude posts containing "Equipos y elecciones" (post-close summaries) or "Calendario" (season calendar)

Request: `GET /wp-json/wp/v2/posts?categories=23,21&per_page=100&_fields=id,title,link`

## R7: Static Alias Map for Cross-Language Race Names

**Decision**: Maintain a small static map (~10 entries) for races where PCS slug ≠ GMV post title language

**Rationale**: Known mismatches:
| PCS Slug | PCS Name | GMV Post Title |
|----------|----------|----------------|
| `ronde-van-vlaanderen` | Ronde van Vlaanderen | Tour de Flandes ME |
| `giro-d-italia` | Giro d'Italia | Giro de Italia |
| `vuelta-a-espana` | Vuelta a España | La Vuelta |
| `tour-de-france` | Tour de France | Tour de Francia / Tour de France |

This map lives in the GMV auto-import use case as a constant. Tried before fuzzy matching — if slug matches an alias, use the alias for matching instead.
