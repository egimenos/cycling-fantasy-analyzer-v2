# REST API Contract: Cycling Fantasy Team Optimizer

**Version**: 1.0.0
**Base URL**: `/api`

---

## Endpoints

### POST /api/analyze

Parse a pasted price list, match riders against PCS database, and compute scores.

**Request Body:**
```typescript
interface AnalyzeRequest {
  rawText: string;           // Pasted price list from Grandes miniVueltas
  raceType: RaceType;        // "grand_tour" | "classic" | "mini_tour"
  budget: number;            // Budget in hillios (e.g., 2000)
}
```

**Response Body (200):**
```typescript
interface AnalyzeResponse {
  riders: AnalyzedRider[];   // Sorted by totalProjectedPts descending
  unmatchedCount: number;    // Riders with no PCS match
  parseErrors: string[];     // Lines that could not be parsed
}

interface AnalyzedRider {
  rawName: string;
  rawTeam: string;
  priceHillios: number;
  matchedRider: MatchedRider | null;
  matchConfidence: number;   // 0–1 from fuzzysort
  score: RiderScore | null;  // null if unmatched
}

interface MatchedRider {
  id: string;                // UUID
  pcsSlug: string;
  fullName: string;
  currentTeam: string;
}

interface RiderScore {
  projectedGcPts: number;
  projectedStagePts: number;
  projectedMountainPts: number;
  projectedSprintPts: number;
  projectedDailyPts: number;
  totalProjectedPts: number;
  seasonsUsed: number;       // 1–3
}
```

**Error Responses:**
- `400`: Invalid raceType or empty rawText
- `422`: rawText could not be parsed (zero riders extracted)

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
    daily: number;
  };
}
```

**Error Responses:**
- `400`: Budget too low to select 9 riders
- `422`: Not enough eligible riders after must-exclude filtering

---

### GET /api/scraping/jobs

List recent scraping jobs.

**Query Parameters:**
- `limit` (optional, default: 20)
- `status` (optional): `pending` | `running` | `success` | `failed`

**Response Body (200):**
```typescript
interface ScrapingJobsResponse {
  jobs: ScrapeJob[];
}

interface ScrapeJob {
  id: string;
  raceSlug: string;
  year: number;
  status: "pending" | "running" | "success" | "failed";
  startedAt: string;         // ISO 8601
  completedAt: string | null;
  errorMessage: string | null;
  recordsUpserted: number;
}
```

---

### POST /api/scraping/trigger

Trigger a scraping pipeline run for a specific race or all races.

**Request Body:**
```typescript
interface TriggerScrapeRequest {
  raceSlug: string;
  year: number;
}
```

**Response Body (202):**
```typescript
interface TriggerScrapeResponse {
  jobId: string;
  status: "pending";
}
```

---

### GET /api/scraping/health

Check auto-health status of scraping infrastructure.

**Response Body (200):**
```typescript
interface ScrapingHealthResponse {
  lastCheckAt: string | null;     // ISO 8601
  overallStatus: "healthy" | "degraded" | "failing";
  parsers: {
    stageRace: ParserHealth;
    classic: ParserHealth;
  };
}

interface ParserHealth {
  status: "healthy" | "failing";
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  failureReason: string | null;
}
```

---

## Shared Types

All request/response types are defined in `packages/shared-types/src/api.ts` and imported by both frontend and backend.

## Type Enums

```typescript
type RaceType = "grand_tour" | "classic" | "mini_tour";
type RaceClass = "UWT" | "Pro" | "1";
type ResultCategory = "gc" | "stage" | "mountain" | "sprint" | "final";
type ScrapeStatus = "pending" | "running" | "success" | "failed";
type HealthStatus = "healthy" | "degraded" | "failing";
```
