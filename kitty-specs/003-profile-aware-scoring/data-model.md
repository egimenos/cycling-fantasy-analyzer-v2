# Data Model: Profile-Aware Scoring

**Feature**: 003-profile-aware-scoring
**Date**: 2026-03-19

## New Domain Value Objects

### ProfileDistribution

Normalized representation of target race terrain composition. Ephemeral (not persisted) — computed on demand from `ProfileSummary`.

| Field       | Type             | Description                        |
| ----------- | ---------------- | ---------------------------------- |
| p1Share     | number (0.0–1.0) | Fraction of flat stages            |
| p2Share     | number (0.0–1.0) | Fraction of hilly-flat stages      |
| p3Share     | number (0.0–1.0) | Fraction of hilly-uphill stages    |
| p4Share     | number (0.0–1.0) | Fraction of mountain-flat stages   |
| p5Share     | number (0.0–1.0) | Fraction of mountain-summit stages |
| ittShare    | number (0.0–1.0) | Fraction of ITT stages             |
| tttShare    | number (0.0–1.0) | Fraction of TTT stages             |
| totalStages | number           | Total stage count (denominator)    |

**Factory**: `ProfileDistribution.fromProfileSummary(summary: ProfileSummary): ProfileDistribution`

**Invariants**:

- All shares sum to ≤ 1.0 (unknowns are excluded from share calculation)
- totalStages > 0
- ITT/TTT shares overlap with parcours shares (a P5 ITT counts in both p5Share and ittShare)

### ProfileWeightConfig

Configuration for profile weight computation. Defined as constants alongside existing scoring weights.

| Field               | Type                                           | Description                                      |
| ------------------- | ---------------------------------------------- | ------------------------------------------------ |
| floor               | number (0.0–1.0)                               | Minimum profile weight (e.g., 0.25)              |
| ittBonusFactor      | number (0.0–1.0)                               | Additional weight for ITT relevance (e.g., 0.15) |
| categoryAffinityMap | Record<ResultCategory, ParcoursType[] \| null> | Profile affinity for non-stage categories        |

## Modified Entities

### AnalyzeRequest (shared-types)

Add optional field:

| Field          | Type                        | Description                                  |
| -------------- | --------------------------- | -------------------------------------------- |
| profileSummary | ProfileSummary \| undefined | Target race profile from `/api/race-profile` |

No breaking change — field is optional. Existing clients without it get backward-compatible behavior.

## No Database Changes

- No schema changes. All profile data on RaceResult already exists (Feature 002).
- ProfileDistribution is computed at runtime, not persisted.
- Profile weight config is code-level constants, not stored in DB.

## Entity Relationships

```
ProfileSummary (from /api/race-profile)
    ↓ fromProfileSummary()
ProfileDistribution (value object)
    ↓ passed to
ScoringService.computeStageScore(results, ..., profileDistribution)
ScoringService.computeCategoryScore(results, ..., profileDistribution)
    ↓ uses
ProfileWeightConfig (from scoring-weights.config.ts)
    ↓ produces
profileMatchWeight (number) × existing weights
```
