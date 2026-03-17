# REST API Contract: Cycling Fantasy Team Optimizer

**Version**: 1.0.0
**Base URL**: `/api`

---

## Endpoints

### POST /api/analyze

Match riders against PCS database and compute scores from a structured rider list.

**Request Body:**
```typescript
interface PriceListEntryDto {
  name: string;              // Rider name (as shown in price list)
  team: string;              // Team name (may be empty if unknown)
  price: number;             // Price in hillios
}

interface AnalyzeRequest {
  riders: PriceListEntryDto[];  // Structured rider list (frontend constructs this)
  raceType: RaceType;           // "grand_tour" | "classic" | "mini_tour"
  budget: number;               // Budget in hillios (e.g., 2000)
}
```

> **V2 enhancement**: A future iteration may add a `rawText` field as an alternative input,
> using an LLM to extract the structured rider list from pasted plain text.

**Response Body (200):**
```typescript
interface AnalyzeResponse {
  riders: AnalyzedRider[];   // Sorted by compositeScore descending
  totalSubmitted: number;    // Total riders in request
  totalMatched: number;      // Riders matched to PCS database
  unmatchedCount: number;    // Riders with no PCS match
}

interface AnalyzedRider {
  rawName: string;
  rawTeam: string;
  priceHillios: number;
  matchedRider: MatchedRider | null;
  matchConfidence: number;   // 0–1 from fuzzysort
  unmatched: boolean;
  compositeScore: number | null;    // Price-aware value score (primary ranking metric)
  pointsPerHillio: number | null;   // totalProjectedPts / priceHillios
  totalProjectedPts: number | null; // Raw historical projection (for transparency)
  categoryScores: {
    gc: number;
    stage: number;
    mountain: number;
    sprint: number;
  } | null;
  seasonsUsed: number | null;
}

interface MatchedRider {
  id: string;                // UUID
  pcsSlug: string;
  fullName: string;
  currentTeam: string;
}
```

**Error Responses:**
- `400`: Invalid raceType, empty riders array, or budget <= 0
- `422`: Zero valid riders in the request

---

### POST /api/optimize

Compute optimal 9-rider team via knapsack optimization.

**Request Body:**
```typescript
interface OptimizeRequest {
  riders: AnalyzedRider[];   // From /api/analyze response
  budget: number;
  mustInclude: string[];     // Rider UUIDs to force-include
  mustExclude: string[];     // Rider UUIDs to force-exclude
}
```

**Response Body (200):**
```typescript
interface OptimizeResponse {
  optimalTeam: TeamSelection;
  alternativeTeams: TeamSelection[];  // Up to 4 alternatives
}

interface TeamSelection {
  riders: AnalyzedRider[];   // Exactly 9
  totalCostHillios: number;
  totalProjectedPts: number;
  budgetRemaining: number;
  scoreBreakdown: {
    gc: number;
    stage: number;
    mountain: number;
    sprint: number;
  };
}
```

**Error Responses:**
- `400`: Budget too low to select 9 riders
- `422`: Not enough eligible riders after must-exclude filtering

---

### Scraping Operations (CLI only — no REST endpoints)

Scraping is an administrative operation. For security reasons (prevent abuse, IP bans, DB saturation), scraping is triggered only via NestJS CLI commands and internal cron jobs.

- `pnpm --filter api scrape --race <slug> --year <year>` — trigger a specific race scrape
- `pnpm --filter api scrape --all --year <year>` — scrape all catalog races
- `pnpm --filter api scrape:health` — check parser integrity

Health checks run internally via `@nestjs/schedule` (no endpoint).

---

## Shared Types

All request/response types are defined in `packages/shared-types/src/api.ts` and imported by both frontend and backend.

## Type Enums

```typescript
type RaceType = "grand_tour" | "classic" | "mini_tour";
type RaceClass = "UWT" | "Pro" | "1";
type ResultCategory = "gc" | "stage" | "mountain" | "sprint";
type ScrapeStatus = "pending" | "running" | "success" | "failed";
type HealthStatus = "healthy" | "degraded" | "failing";
```
