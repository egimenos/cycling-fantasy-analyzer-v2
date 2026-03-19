# Data Model: Scoring Benchmark Harness

**Feature**: 004-scoring-benchmark-harness
**Date**: 2026-03-19

## Schema Changes

### Modified: `race_results` table

Add `race_date` column to the existing table.

| Column    | Type | Nullable        | Default | Description                                                                                                                                  |
| --------- | ---- | --------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| race_date | DATE | YES (initially) | NULL    | Actual calendar date of the race/stage. For stage results: date of the specific stage. For GC/classification results: final day of the race. |

**Migration strategy**: Add column as nullable, backfill via re-seed, then consider making NOT NULL in a future migration once all data is populated.

**Impact on existing entity**: `RaceResult` entity gains `raceDate: Date | null` property. `RaceResultProps` interface extended. `reconstitute` and `create` factory methods updated. All existing code continues to work (new field is optional).

**Impact on unique constraint**: No change — `race_date` is not part of the unique constraint `(riderId, raceSlug, year, category, stageNumber)`.

### New: `startlist_entries` table

| Column     | Type                  | Nullable | Default | Description                |
| ---------- | --------------------- | -------- | ------- | -------------------------- |
| id         | UUID                  | NO       | random  | Primary key                |
| race_slug  | VARCHAR(255)          | NO       | —       | PCS race identifier        |
| year       | INTEGER               | NO       | —       | Race edition year          |
| rider_id   | UUID (FK → riders.id) | NO       | —       | Reference to rider         |
| team_name  | VARCHAR(255)          | YES      | NULL    | Team at time of race       |
| bib_number | INTEGER               | YES      | NULL    | Rider's bib number         |
| scraped_at | TIMESTAMP WITH TZ     | NO       | NOW()   | When startlist was scraped |

**Unique constraint**: `(race_slug, year, rider_id)` — one entry per rider per race edition.

**Foreign key**: `rider_id → riders.id` with `ON DELETE CASCADE`.

**Index**: Composite index on `(race_slug, year)` for efficient startlist lookups by race.

## Domain Entities

### StartlistEntry (new)

```
StartlistEntry {
  id: string (UUID)
  raceSlug: string
  year: number
  riderId: string
  teamName: string | null
  bibNumber: number | null
  scrapedAt: Date
}
```

Factory methods:

- `create(input)` — new entry with generated UUID
- `reconstitute(props)` — from DB row

### BenchmarkResult (new value object)

```
BenchmarkResult {
  raceSlug: string
  raceName: string
  year: number
  raceType: RaceType
  riderResults: ReadonlyArray<{
    riderId: string
    riderName: string
    predictedPts: number
    actualPts: number
    predictedRank: number
    actualRank: number
  }>
  spearmanRho: number
  riderCount: number
}
```

Not persisted — computed in-memory during benchmark execution and displayed in CLI output.

### BenchmarkSuiteResult (new value object)

```
BenchmarkSuiteResult {
  races: ReadonlyArray<BenchmarkResult>
  meanSpearmanRho: number
  raceCount: number
}
```

Aggregation of multiple single-race benchmarks.

## Repository Port Changes

### RaceResultRepositoryPort (modified)

New method:

```
findByRiderIdsBeforeDate(riderIds: string[], cutoffDate: Date): Promise<RaceResult[]>
```

Returns all results for the given riders where `race_date < cutoffDate`. Used by the benchmark to get historical data before a target race.

### StartlistRepositoryPort (new)

```
interface StartlistRepositoryPort {
  findByRace(raceSlug: string, year: number): Promise<StartlistEntry[]>
  existsForRace(raceSlug: string, year: number): Promise<boolean>
  saveMany(entries: StartlistEntry[]): Promise<number>
}
```

## Relationships

```
riders (1) ──→ (N) race_results     [existing, add raceDate]
riders (1) ──→ (N) startlist_entries [new]
```

Both `race_results` and `startlist_entries` reference `riders.id` with cascade delete.

A race edition is identified by `(race_slug, year)` — this is a virtual grouping, not a separate table. Both startlists and results use this composite key.
