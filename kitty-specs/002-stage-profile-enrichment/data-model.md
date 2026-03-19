# Data Model: Stage Profile Enrichment

**Feature**: 002-stage-profile-enrichment
**Date**: 2026-03-19
**Status**: Draft

---

## Overview

This feature extends the existing `race_results` table with 4 new nullable columns for stage profile data. No new tables are introduced. One new enum type (`parcours_type`) is added to the database schema.

---

## Schema Changes

### New Enum: `parcours_type`

```
Values: p1 | p2 | p3 | p4 | p5
```

| Value | Meaning                  |
| ----- | ------------------------ |
| `p1`  | Flat                     |
| `p2`  | Hills, flat finish       |
| `p3`  | Hills, uphill finish     |
| `p4`  | Mountains, flat finish   |
| `p5`  | Mountains, uphill finish |

---

### Modified Table: `race_results`

4 new nullable columns added:

| Column          | Type                 | Nullable | Default | Notes                                                               |
| --------------- | -------------------- | -------- | ------- | ------------------------------------------------------------------- |
| `parcours_type` | `parcours_type` enum | YES      | null    | p1-p5; populated on STAGE rows (stage races) and GC rows (classics) |
| `is_itt`        | boolean              | YES      | false   | Individual Time Trial flag                                          |
| `is_ttt`        | boolean              | YES      | false   | Team Time Trial flag                                                |
| `profile_score` | integer              | YES      | null    | PCS ProfileScore numeric value; stored for future use               |

**Population rules:**

| Race Type  | Category   | `parcours_type` | `is_itt`   | `is_ttt`   | `profile_score` |
| ---------- | ---------- | --------------- | ---------- | ---------- | --------------- |
| Stage race | `stage`    | p1-p5           | true/false | true/false | integer         |
| Stage race | `gc`       | null            | false      | false      | null            |
| Stage race | `mountain` | null            | false      | false      | null            |
| Stage race | `sprint`   | null            | false      | false      | null            |
| Classic    | `gc`       | p1-p5           | false      | false      | integer         |

**Existing unique constraint unchanged**: `(rider_id, race_slug, year, category, stage_number)`

---

## Ephemeral Types (not persisted)

### RaceProfileDistribution

Returned by the `GET /api/race-profile` endpoint. Computed on demand from a PCS URL.

```
RaceProfileDistribution {
  raceSlug: string
  raceName: string
  raceType: RaceType (auto-detected)
  year: number
  totalStages: number
  stages: StageInfo[]
  profileSummary: ProfileSummary
}

StageInfo {
  stageNumber: number
  parcoursType: ParcoursType | null
  isItt: boolean
  isTtt: boolean
  distanceKm: number | null
  departure: string | null
  arrival: string | null
}

ProfileSummary {
  p1Count: number
  p2Count: number
  p3Count: number
  p4Count: number
  p5Count: number
  ittCount: number
  tttCount: number
  unknownCount: number
}
```

---

## Key Relationships

```
race_results (existing, extended)
├── parcours_type (new, nullable enum)
├── is_itt (new, boolean)
├── is_ttt (new, boolean)
└── profile_score (new, nullable integer)

No new tables. No new relationships.
```

---

## Migration Strategy

No migration needed — database is wiped and re-seeded from scratch (no production data exists). The Drizzle schema changes are applied via `drizzle-kit push` or a fresh migration.
