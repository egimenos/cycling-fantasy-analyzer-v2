# Contract: Updated Analyze Request

**Endpoint**: `POST /api/analyze`
**Change type**: Backward-compatible extension (new optional field)

## Current Request Schema

```typescript
interface AnalyzeRequest {
  riders: PriceListEntryDto[]; // required, min 1
  raceType: RaceType; // required, enum
  budget: number; // required, min 1
  seasons?: number; // optional, 1-3, default 3
}
```

## Updated Request Schema

```typescript
interface AnalyzeRequest {
  riders: PriceListEntryDto[]; // required, min 1
  raceType: RaceType; // required, enum
  budget: number; // required, min 1
  seasons?: number; // optional, 1-3, default 3
  profileSummary?: ProfileSummary; // NEW: optional, target race profile
}
```

## ProfileSummary (already defined in shared-types)

```typescript
interface ProfileSummary {
  p1Count: number;
  p2Count: number;
  p3Count: number;
  p4Count: number;
  p5Count: number;
  ittCount: number;
  tttCount: number;
  unknownCount: number;
}
```

## Behavior

| profileSummary            | Behavior                                                              |
| ------------------------- | --------------------------------------------------------------------- |
| Absent / undefined        | All profile weights = 1.0 (backward compatible, identical to current) |
| Present with valid counts | Profile-aware weighting applied to scoring                            |
| Present with all zeros    | Treated as absent (no meaningful distribution)                        |

## Response Schema

No changes to `AnalyzeResponse`. The scoring numbers (`totalProjectedPts`, `compositeScore`, `categoryScores`) will simply reflect profile-aware weighting when applicable.

## Validation Rules

- `profileSummary` is optional (no validation if absent)
- When present, all count fields must be non-negative integers
- `totalStages` is computed as sum of all counts (not sent by client)
