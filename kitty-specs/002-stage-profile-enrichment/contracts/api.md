# REST API Contract: Stage Profile Enrichment

**Version**: 1.1.0 (extends 1.0.0)
**Base URL**: `/api`

---

## New Endpoints

### GET /api/race-profile

Fetch the stage profile distribution for a race from its PCS URL. Used by the frontend to display race context and auto-detect race type.

**Query Parameters:**

| Param | Type   | Required | Description                                                                          |
| ----- | ------ | -------- | ------------------------------------------------------------------------------------ |
| `url` | string | YES      | Full PCS race URL (e.g., `https://www.procyclingstats.com/race/tour-de-france/2025`) |

**Response Body (200):**

```typescript
interface RaceProfileResponse {
  raceSlug: string; // e.g., "tour-de-france"
  raceName: string; // e.g., "Tour de France"
  raceType: RaceType; // Auto-detected: "grand_tour" | "classic" | "mini_tour"
  year: number;
  totalStages: number; // 0 for classics
  stages: StageInfo[]; // Empty array for classics
  profileSummary: ProfileSummary;
}

interface StageInfo {
  stageNumber: number;
  parcoursType: ParcoursType | null; // "p1" | "p2" | "p3" | "p4" | "p5"
  isItt: boolean;
  isTtt: boolean;
  distanceKm: number | null;
  departure: string | null;
  arrival: string | null;
}

interface ProfileSummary {
  p1Count: number; // Flat
  p2Count: number; // Hills, flat finish
  p3Count: number; // Hills, uphill finish
  p4Count: number; // Mountains, flat finish
  p5Count: number; // Mountains, uphill finish
  ittCount: number;
  tttCount: number;
  unknownCount: number; // Stages with null parcours type
}
```

**Error Responses:**

- `400`: Missing or malformed `url` parameter
- `404`: PCS page not found or unparseable (includes future classics with no fallback)
- `502`: PCS unreachable or rate-limited

---

## Modified Endpoints

### POST /api/analyze

**Changes to request:**

```typescript
interface AnalyzeRequest {
  riders: PriceListEntryDto[];
  raceType: RaceType; // NOW auto-detected from PCS URL (frontend sends the value from /api/race-profile)
  budget: number;
  raceUrl?: string; // NEW optional — PCS URL for traceability
}
```

No changes to response body. The `raceType` field is still required but now auto-populated by the frontend from the `/api/race-profile` response instead of a manual selector.

---

## New Shared Types

Added to `packages/shared-types/src/enums.ts`:

```typescript
enum ParcoursType {
  P1 = 'p1', // Flat
  P2 = 'p2', // Hills, flat finish
  P3 = 'p3', // Hills, uphill finish
  P4 = 'p4', // Mountains, flat finish
  P5 = 'p5', // Mountains, uphill finish
}
```

Added to `packages/shared-types/src/api.ts`:

```typescript
interface RaceProfileResponse { ... } // As defined above
interface StageInfo { ... }
interface ProfileSummary { ... }
```
