---
work_package_id: WP11
title: 'Refactor: Remove FINAL ResultCategory — Classic Results Use GC'
lane: "doing"
dependencies: '[]'
base_branch: main
base_commit: 75c783c381d07ec0e9c2cba3cf69c530b43997ea
created_at: '2026-03-17T21:19:15.276992+00:00'
depends_on: [WP10]
estimated_prompt_size: ~300 lines
priority: P0
type: refactor
shell_pid: "3829"
---

# WP11 — Refactor: Remove FINAL ResultCategory

## Context

The `ResultCategory.FINAL` enum value was used to represent classic race results as a
separate category from GC. After product review, we determined that **a classic race
finish IS a GC result** — winning Milano-Sanremo is the equivalent of winning the
General Classification. There's no conceptual difference.

This simplifies the model:
- **Before**: 5 categories (`gc`, `stage`, `mountain`, `sprint`, `final`), with special
  branching in the scoring engine for classics.
- **After**: 4 categories (`gc`, `stage`, `mountain`, `sprint`). The classic parser
  assigns `ResultCategory.GC`. The scoring engine always sums `gc + stage + mountain + sprint`
  with no branching — for classics, only `gc` has data, so the sum naturally equals `gcScore`.

## Scope

This is a **mechanical refactor** across the codebase. No new features, no behavior changes
beyond the simplification. All existing tests must be updated and continue to pass.

**Base branch**: `001-cycling-fantasy-team-optimizer-WP10` (has all prior WPs merged)

## Files to Modify

### 1. Domain Enum — Remove FINAL

**File**: `apps/api/src/domain/shared/result-category.enum.ts`

**Current**:
```typescript
export enum ResultCategory {
  GC = 'gc',
  STAGE = 'stage',
  MOUNTAIN = 'mountain',
  SPRINT = 'sprint',
  FINAL = 'final',
}
```

**Target**:
```typescript
export enum ResultCategory {
  GC = 'gc',
  STAGE = 'stage',
  MOUNTAIN = 'mountain',
  SPRINT = 'sprint',
}
```

### 2. DB Schema Enum — Remove 'final'

**File**: `apps/api/src/infrastructure/database/schema/enums.ts`

Remove `'final'` from the `resultCategoryEnum` pgEnum array:
```typescript
export const resultCategoryEnum = pgEnum('result_category', ['gc', 'stage', 'mountain', 'sprint']);
```

### 3. DB Migration — Alter PostgreSQL Enum

**Create new migration** via `pnpm --filter api db:generate` (Drizzle Kit).

If Drizzle Kit does not generate an enum alteration automatically, create a custom migration:
```sql
-- Remove 'final' from result_category enum
-- First, update any existing 'final' rows to 'gc' (classic results)
UPDATE race_results SET category = 'gc' WHERE category = 'final';

-- Then alter the enum (PostgreSQL does not support DROP VALUE directly,
-- so recreate via column type swap if needed)
ALTER TABLE race_results ALTER COLUMN category TYPE text;
DROP TYPE result_category;
CREATE TYPE result_category AS ENUM ('gc', 'stage', 'mountain', 'sprint');
ALTER TABLE race_results ALTER COLUMN category TYPE result_category USING category::result_category;
```

> **Important**: Verify no data with `category = 'final'` exists in test databases.
> If the database is fresh (no production data), a clean migration is sufficient.

### 4. Classic Parser — FINAL → GC

**File**: `apps/api/src/infrastructure/scraping/parsers/classic.parser.ts`

```typescript
// Before
return parseResultsTable(html, ResultCategory.FINAL);

// After
return parseResultsTable(html, ResultCategory.GC);
```

**File**: `apps/api/src/infrastructure/scraping/parsers/classic.parser.spec.ts`

Update all test assertions that check for `ResultCategory.FINAL` → `ResultCategory.GC`.
Update test descriptions (e.g., "should set category to FINAL" → "should set category to GC").

**File**: `apps/api/src/infrastructure/scraping/parsers/classification-extractor.spec.ts`

Check for any `FINAL` references and update.

### 5. Scoring Weights — Remove `final` entry

**File**: `apps/api/src/domain/scoring/scoring-weights.config.ts`

1. Remove `readonly final: PositionPointsMap` from `ScoringWeightsConfig` interface.
2. Remove the `final: { ... }` entry from `SCORING_WEIGHTS`.
3. Update the JSDoc comment — remove mention of `final` category.
4. Update `getPointsForPosition` JSDoc `@param category` description.

**File**: `apps/api/src/domain/scoring/scoring-weights.config.spec.ts`

Remove tests for the `final` category weights. Verify the remaining 4 categories still pass.

### 6. Scoring Service — Simplify (biggest change)

**File**: `apps/api/src/domain/scoring/scoring.service.ts`

1. Remove `readonly final: number` from `RiderScore.categoryScores`:
   ```typescript
   readonly categoryScores: {
     readonly gc: number;
     readonly stage: number;
     readonly mountain: number;
     readonly sprint: number;
   };
   ```

2. Simplify `computeRiderScore` — remove `finalScore` computation and branching:
   ```typescript
   // Remove these lines:
   const finalScore = computeCategoryScore(results, ResultCategory.FINAL, ...);
   let totalProjectedPts: number;
   if (targetRaceType === RaceType.CLASSIC) {
     totalProjectedPts = finalScore;
   } else {
     totalProjectedPts = gcScore + stageScore + mountainScore + sprintScore;
   }

   // Replace with:
   const totalProjectedPts = gcScore + stageScore + mountainScore + sprintScore;
   ```

3. Remove `final: finalScore` from the returned `categoryScores` object.

4. Update JSDoc — remove the classic/stage-race branching documentation.

**File**: `apps/api/src/domain/scoring/scoring.service.spec.ts`

- Remove/update tests that assert on `categoryScores.final`.
- Update "should use only final score for Classic" → test that classics naturally
  produce only a `gc` score (stage/mountain/sprint are 0).
- Update "mixed race type results" test — classic results now use `ResultCategory.GC`,
  so filter-by-race-type still excludes them correctly when targeting GRAND_TOUR.
- Verify 100% coverage is maintained.

### 7. Optimizer Types — Remove `final` from ScoreBreakdown

**File**: `apps/api/src/domain/optimizer/types.ts`

Remove `readonly final: number` from both `ScoredRider.categoryScores` and `ScoreBreakdown`:
```typescript
export interface ScoreBreakdown {
  readonly gc: number;
  readonly stage: number;
  readonly mountain: number;
  readonly sprint: number;
}
```

**Files**: `apps/api/src/domain/optimizer/knapsack.service.ts`,
`apps/api/src/domain/optimizer/knapsack.service.spec.ts`,
`apps/api/src/domain/optimizer/alternative-teams.service.spec.ts`,
`apps/api/src/domain/optimizer/constraints.service.spec.ts`

Update any test fixtures or helper functions that construct objects with `final` field.

### 8. Presentation Layer — Update controllers and specs

**Files**:
- `apps/api/src/presentation/optimize.controller.ts`
- `apps/api/src/presentation/optimize.controller.spec.ts`
- `apps/api/src/presentation/analyze.controller.spec.ts`

Remove `final` from any response mappings or test fixtures.

### 9. Use Case Layer

**File**: `apps/api/src/application/analyze/analyze-price-list.use-case.ts`

Check if it maps `final` anywhere and remove.

**File**: `apps/api/src/application/optimize/optimize-team.use-case.spec.ts`

Update test fixtures.

### 10. Shared Types — Remove 'final' from ResultCategory

**File**: `packages/shared-types/src/enums.ts`

```typescript
// Before
export type ResultCategory = 'gc' | 'stage' | 'mountain' | 'sprint' | 'final';

// After
export type ResultCategory = 'gc' | 'stage' | 'mountain' | 'sprint';
```

### 11. Frontend — Update test fixtures

**Files**:
- `apps/web/src/shared/lib/__tests__/api-client.spec.ts`
- `apps/web/src/features/optimizer/__tests__/use-optimize.spec.ts`
- `apps/web/src/features/team-builder/__tests__/use-team-builder.spec.ts`

Remove `final` from any mock data or type assertions.

### 12. Scraper Health Service

**File**: `apps/api/src/infrastructure/scraping/health/scraper-health.service.ts`

Check for any `FINAL` references and update.

### 13. Trigger Scrape Use Case

**Files**:
- `apps/api/src/application/scraping/trigger-scrape.use-case.ts`
- `apps/api/src/application/scraping/trigger-scrape.use-case.spec.ts`

Check for any `FINAL` references in test fixtures and update.

---

## Validation

After all changes:

1. **TypeScript compilation**: `pnpm build` must succeed with zero errors across all packages.
2. **Linting**: `pnpm lint` must pass.
3. **Unit tests**: `pnpm test` — all tests pass, coverage thresholds met:
   - Scoring engine: 100% coverage (constitution requirement)
   - Global: ≥ 90%
4. **Grep verification**: `grep -r "FINAL\|'final'" apps/ packages/ --include="*.ts"` returns
   zero results (excluding `node_modules`).
5. **DB migration**: Migration runs cleanly on a fresh database.

## Definition of Done

- [ ] `ResultCategory.FINAL` removed from domain enum
- [ ] `'final'` removed from pgEnum in DB schema
- [ ] DB migration created and runs cleanly
- [ ] Classic parser uses `ResultCategory.GC`
- [ ] `SCORING_WEIGHTS` has 4 categories (no `final`)
- [ ] `RiderScore.categoryScores` has 4 fields (no `final`)
- [ ] `ScoreBreakdown` has 4 fields (no `final`)
- [ ] `computeRiderScore` has no branching — always sums gc + stage + mountain + sprint
- [ ] Shared types `ResultCategory` has 4 values
- [ ] All frontend test fixtures updated
- [ ] `pnpm build` succeeds
- [ ] `pnpm lint` passes
- [ ] All tests pass with required coverage thresholds
- [ ] Zero grep hits for `FINAL` or `'final'` in `.ts` files
