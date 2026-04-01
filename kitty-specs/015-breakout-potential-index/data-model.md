# Data Model: Breakout Potential Index

**Feature**: 015-breakout-potential-index
**Date**: 2026-04-01

## New Types

### BreakoutFlag (enum)

```typescript
enum BreakoutFlag {
  EmergingTalent = 'EMERGING_TALENT',
  HotStreak = 'HOT_STREAK',
  DeepValue = 'DEEP_VALUE',
  CeilingPlay = 'CEILING_PLAY',
  SprintOpportunity = 'SPRINT_OPPORTUNITY',
  BreakawayHunter = 'BREAKAWAY_HUNTER',
}
```

### BreakoutSignals (interface)

Individual signal scores for the detail panel breakdown.

```typescript
interface BreakoutSignals {
  trajectory: number; // 0-25 — career slope × age factor
  recency: number; // 0-25 — current season vs historical avg
  ceiling: number; // 0-20 — historical peak vs current prediction
  routeFit: number; // 0-15 — rider profile × race profile dot product
  variance: number; // 0-15 — coefficient of variation of season totals
}
```

### BreakoutResult (interface)

The complete BPI output attached to each matched rider.

```typescript
interface BreakoutResult {
  index: number; // 0-100 — composite BPI score (sum of signals)
  upsideP80: number; // Optimistic scenario points estimate
  flags: BreakoutFlag[]; // Triggered breakout flags (may be empty)
  signals: BreakoutSignals; // Individual signal scores for detail panel
}
```

### AnalyzedRider (modified)

```typescript
interface AnalyzedRider {
  // ... existing fields unchanged ...
  breakout: BreakoutResult | null; // NEW — null for unmatched riders
}
```

## Modified Types

### RiderProps (domain entity)

```typescript
interface RiderProps {
  readonly id: string;
  readonly pcsSlug: string;
  readonly fullName: string;
  readonly normalizedName: string;
  readonly currentTeam: string | null;
  readonly nationality: string | null;
  readonly birthDate: Date | null; // NEW — loaded from existing DB column
  readonly lastScrapedAt: Date | null;
}
```

## No Database Changes

The `riders.birth_date` column already exists in the PostgreSQL schema. No migration required — only the domain entity mapping and repository adapter need updating.

## Type Location

| Type                     | Package      | File                                        |
| ------------------------ | ------------ | ------------------------------------------- |
| BreakoutFlag             | shared-types | `packages/shared-types/src/api.ts`          |
| BreakoutSignals          | shared-types | `packages/shared-types/src/api.ts`          |
| BreakoutResult           | shared-types | `packages/shared-types/src/api.ts`          |
| AnalyzedRider (modified) | shared-types | `packages/shared-types/src/api.ts`          |
| RiderProps (modified)    | api          | `apps/api/src/domain/rider/rider.entity.ts` |

## BPI Function Signature

```typescript
// domain/breakout/breakout.service.ts

interface ComputeBreakoutInput {
  seasonBreakdown: SeasonBreakdown[];
  prediction: number; // mlPredictedScore ?? totalProjectedPts ?? 0
  priceHillios: number;
  birthDate: Date | null; // null → default age 28
  profileSummary?: ProfileSummary; // optional race profile
  medianPtsPerHillio: number; // median across all riders in the list
  categoryScores: CategoryScores | null; // for mountain/sprint % calculation
}

function computeBreakout(input: ComputeBreakoutInput): BreakoutResult;
```

## Relationships

```
AnalyzePriceListUseCase
  │
  ├── ScoringService.computeSeasonBreakdown() → SeasonBreakdown[]
  ├── MlScoringPort.predictRace() → mlPredictedScore
  │
  └── computeBreakout(input) → BreakoutResult   ← NEW (pure function call)
        │
        ├── reads: SeasonBreakdown[], prediction, price, birthDate
        ├── reads: profileSummary (optional), medianPtsPerHillio
        └── produces: { index, upsideP80, flags, signals }
```
