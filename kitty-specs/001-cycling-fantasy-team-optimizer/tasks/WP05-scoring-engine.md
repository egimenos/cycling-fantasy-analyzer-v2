---
work_package_id: WP05
title: Scoring Engine
lane: "doing"
dependencies: [WP02]
base_branch: 001-cycling-fantasy-team-optimizer-WP02
base_commit: 09cedac4ebbc7faeb1aa8a6d1a48f96e77e97a5f
created_at: '2026-03-15T19:34:14.717554+00:00'
subtasks:
- T023
- T024
- T025
- T026
- T027
phase: Phase 3 - Scoring & Matching
assignee: ''
agent: "claude-opus"
shell_pid: "79678"
review_status: ''
reviewed_by: ''
history:
- timestamp: '2026-03-14T23:51:57Z'
  lane: planned
  agent: system
  shell_pid: ''
  action: Prompt generated via /spec-kitty.tasks
requirement_refs:
- FR-004
- FR-006
---

# WP05 — Scoring Engine

## Objectives

Implement the pure domain scoring engine that projects fantasy points for riders based on
historical race results. This is the intellectual core of the Cycling Fantasy Team Optimizer.
The engine must compute weighted scores across multiple seasons, race categories, and result
types. By completion, the scoring engine must be fully testable with zero framework setup
and achieve 100% test coverage as mandated by the constitution.

**CRITICAL CONSTRAINT**: This is pure domain logic. There must be ZERO NestJS imports, ZERO
database imports, ZERO external framework dependencies, ZERO `@cycling-analyzer/shared-types`
imports. Every function must be testable by calling it directly with plain TypeScript objects.
The only allowed imports are from other files within `domain/` (enums from `domain/shared/`,
entities from `domain/race-result/`, etc.).

## Project Context

- **Stack**: Pure TypeScript. No framework dependencies.
- **Architecture**: Innermost ring of hexagonal architecture. Domain layer only.
- **Constitution**: TypeScript strict, no `any`, 100% test coverage for scoring engine
  (constitution mandate — not the standard 90%).
- **Depends on**: WP02 (domain entity types must exist — `RaceResult`, `RaceType`,
  `ResultCategory`). Does NOT depend on database or HTTP infrastructure.
- **Key reference files**: `spec.md` for scoring rules, `data-model.md` for entity
  definitions, `.kittify/memory/constitution.md` for coverage requirements.

## Detailed Subtask Guidance

### T023 — Scoring Weights Configuration

**Goal**: Define the complete point-to-position mapping for all race categories as a typed,
readonly constant.

**Steps**:

1. Create `apps/api/src/domain/scoring/scoring-weights.config.ts`:
   ```typescript
   import { ResultCategory } from '../shared/result-category.enum';

   /**
    * Position-to-points mapping for each result category.
    * Key: finishing position (1-indexed)
    * Value: fantasy points awarded
    *
    * These weights are used for Grand Tours and Mini Tours (stage races).
    * Classic races use the GC weights applied to the FINAL category.
    */
   export interface PositionPointsMap {
     readonly [position: number]: number;
   }

   export interface ScoringWeightsConfig {
     readonly gc: PositionPointsMap;
     readonly stage: PositionPointsMap;
     readonly mountain: PositionPointsMap;
     readonly sprint: PositionPointsMap;
     readonly final: PositionPointsMap;
   }
   ```
2. Define the actual scoring tables:
   ```typescript
   export const SCORING_WEIGHTS: Readonly<ScoringWeightsConfig> = {
     gc: {
       1: 200, 2: 150, 3: 120, 4: 100, 5: 90,
       6: 80,  7: 70,  8: 60,  9: 50,  10: 45,
       11: 40, 12: 36, 13: 32, 14: 28, 15: 24,
       16: 20, 17: 16, 18: 12, 19: 8,  20: 5,
     },
     stage: {
       1: 15, 2: 12, 3: 10, 4: 8,  5: 6,
       6: 5,  7: 4,  8: 3,  9: 2,  10: 1,
     },
     mountain: {
       1: 12, 2: 10, 3: 8, 4: 6, 5: 5,
       6: 4,  7: 3,  8: 2, 9: 1, 10: 1,
     },
     sprint: {
       1: 6, 2: 4, 3: 2, 4: 1,
     },
     final: {
       1: 200, 2: 150, 3: 120, 4: 100, 5: 90,
       6: 80,  7: 70,  8: 60,  9: 50,  10: 45,
       11: 40, 12: 36, 13: 32, 14: 28, 15: 24,
       16: 20, 17: 16, 18: 12, 19: 8,  20: 5,
     },
   } as const;
   ```
3. Add a helper function to retrieve points for a given position and category:
   ```typescript
   export function getPointsForPosition(
     category: ResultCategory,
     position: number | null,
   ): number {
     if (position === null || position < 1) {
       return 0;
     }
     const categoryMap = SCORING_WEIGHTS[category];
     return categoryMap[position] ?? 0;
   }
   ```
4. Document the scoring philosophy in code comments:
   - GC (General Classification): Highest points because GC is the primary competition in
     stage races. Top-20 score points.
   - Stage: Daily stage wins. Lower points per event but accumulated over many stages.
   - Mountain: KOM classification. Moderate points, top-10 score.
   - Sprint: Sprint/points classification. Lowest per-position points, top-4 score.
   - Final: Used for classic races. Same weight structure as GC because a classic is a
     single decisive result.

**Validation**: Unit test that every category has at least position 1 defined, that all
values are positive integers, and that `getPointsForPosition` returns 0 for positions
beyond the scoring threshold.

---

### T024 — Temporal Decay

**Goal**: Implement time-based weighting so recent seasons count more than older ones.

**Steps**:

1. Add temporal decay configuration to
   `apps/api/src/domain/scoring/scoring.service.ts` (or a dedicated file):
   ```typescript
   /**
    * Temporal weights by seasons ago.
    * Current season (0): full weight (1.0)
    * Previous season (1): 60% weight (0.6)
    * Two seasons ago (2): 30% weight (0.3)
    * Three or more seasons ago: excluded (0.0)
    */
   export const TEMPORAL_WEIGHTS: Readonly<Record<number, number>> = {
     0: 1.0,
     1: 0.6,
     2: 0.3,
   } as const;

   /**
    * Returns the temporal weight for a result based on how many seasons ago it occurred.
    *
    * @param resultYear - The year the race result was recorded
    * @param currentYear - The current season year
    * @returns Weight between 0 and 1, or 0 if the result is too old
    */
   export function getTemporalWeight(resultYear: number, currentYear: number): number {
     const seasonsAgo = currentYear - resultYear;

     if (seasonsAgo < 0) {
       // Future result — should not happen, but return 0 for safety
       return 0;
     }

     return TEMPORAL_WEIGHTS[seasonsAgo] ?? 0;
   }
   ```
2. Design considerations:
   - The "current year" is always passed as a parameter, never derived from `Date.now()`.
     This makes the function deterministic and testable.
   - A result from 3+ seasons ago returns weight 0, effectively excluding it from scoring.
   - The weights reflect diminishing predictive value of older results.
3. Edge cases to handle:
   - `resultYear === currentYear`: weight is 1.0 (current season)
   - `resultYear === currentYear - 1`: weight is 0.6 (last season)
   - `resultYear === currentYear - 2`: weight is 0.3 (two seasons ago)
   - `resultYear === currentYear - 3` or older: weight is 0 (excluded)
   - `resultYear > currentYear` (future): weight is 0 (safeguard)

**Validation**: Unit tests for every edge case listed above. Verify deterministic output
for the same inputs.

---

### T025 — Per-Category Scoring

**Goal**: Compute the weighted average score for a rider in a specific result category
across matching race results.

**Steps**:

1. Create the per-category scoring function in
   `apps/api/src/domain/scoring/scoring.service.ts`:
   ```typescript
   import { RaceResult } from '../race-result/race-result.entity';
   import { RaceType } from '../shared/race-type.enum';
   import { ResultCategory } from '../shared/result-category.enum';
   import { getPointsForPosition } from './scoring-weights.config';
   import { getTemporalWeight } from './temporal-decay';

   /**
    * Computes the weighted average score for a rider in a specific category.
    *
    * Algorithm:
    * 1. Filter results to only those matching targetRaceType AND category
    * 2. For each matching result:
    *    a. Look up points based on position
    *    b. Look up temporal weight based on year
    *    c. Weighted contribution = points * temporalWeight
    * 3. Average = sum(weighted contributions) / sum(temporal weights used)
    *    This produces a weighted average, not a simple average.
    * 4. If no qualifying results: return 0
    *
    * @param results - All race results for the rider (unfiltered)
    * @param category - The result category to score (gc, stage, mountain, sprint, final)
    * @param targetRaceType - The race type to filter for (grand_tour, classic, mini_tour)
    * @param currentYear - The current season year for temporal weighting
    * @returns Weighted average score for this category
    */
   export function computeCategoryScore(
     results: readonly RaceResult[],
     category: ResultCategory,
     targetRaceType: RaceType,
     currentYear: number,
   ): number {
     // Step 1: Filter results
     const qualifying = results.filter(
       (r) => r.raceType === targetRaceType && r.category === category,
     );

     if (qualifying.length === 0) {
       return 0;
     }

     // Step 2: Compute weighted contributions
     let weightedSum = 0;
     let totalWeight = 0;

     for (const result of qualifying) {
       const temporalWeight = getTemporalWeight(result.year, currentYear);
       if (temporalWeight === 0) {
         continue; // Skip results that are too old
       }

       const points = getPointsForPosition(category, result.position);
       weightedSum += points * temporalWeight;
       totalWeight += temporalWeight;
     }

     // Step 3: Compute weighted average
     if (totalWeight === 0) {
       return 0;
     }

     return weightedSum / totalWeight;
   }
   ```
2. Key algorithmic decisions:
   - **Weighted average, not sum**: Using a weighted average prevents riders with more race
     starts from being unfairly advantaged over riders with fewer but equally good results.
   - **Filter by race type**: A rider's classic results do not contribute to their Grand
     Tour projected score, and vice versa. This reflects different skillsets.
   - **DNF handling**: A DNF result has `position = null`, which maps to 0 points via
     `getPointsForPosition`. It still counts toward the denominator (totalWeight) because
     the rider was present but did not score. This correctly penalizes riders who frequently
     abandon races.
3. For stage-based categories (stage, mountain, sprint), a rider may have multiple results
   per race (one per stage). Each stage result is scored independently and contributes to
   the weighted average. This naturally captures consistency across stages.

**Validation**: Unit tests must verify the mathematical correctness of the weighted average
calculation with hand-computed expected values.

---

### T026 — Composite Score (Projected Points + Price-Aware Value Score)

**Goal**: Aggregate per-category scores into a single rider score projection, AND compute
a composite value score that factors in price relative to the rider pool. The composite
score is the PRIMARY ranking metric displayed to users — it inherently captures the
price-quality relationship (FR-004b).

**CRITICAL DESIGN DECISION**: The scoring engine produces TWO outputs:
1. `totalProjectedPts` — pure historical performance projection (no price context)
2. `compositeScore` — value score that combines projected points with price efficiency
   relative to the rider pool. This is what users see as "the score".

The composite score ensures that a 50-point rider costing 100H ranks higher than a
60-point rider costing 500H, because the first rider delivers more points per hillios
and leaves budget room for other strong riders.

**Steps**:

1. Define the `RiderScore` value object:
   ```typescript
   export interface RiderScore {
     readonly riderId: string;
     readonly targetRaceType: RaceType;
     readonly currentYear: number;
     readonly categoryScores: {
       readonly gc: number;
       readonly stage: number;
       readonly mountain: number;
       readonly sprint: number;
       readonly final: number;
     };
     readonly totalProjectedPts: number;
     readonly seasonsUsed: number;
     readonly qualifyingResultsCount: number;
   }
   ```

2. Define the `CompositeRiderScore` value object (extends RiderScore with price context):
   ```typescript
   export interface CompositeRiderScore {
     readonly riderScore: RiderScore;
     readonly priceHillios: number;
     readonly pointsPerHillio: number;        // totalProjectedPts / priceHillios
     readonly normalizedValueScore: number;   // 0-100 scale relative to the pool
     readonly compositeScore: number;          // Final ranking score (the "score" users see)
   }
   ```

3. Implement the projected score function (pure historical, no price):
   ```typescript
   /**
    * Computes the full projected score for a rider against a target race type.
    * This is the PURE historical performance projection — no price context.
    *
    * For stage races (GRAND_TOUR, MINI_TOUR):
    *   totalProjectedPts = gc + stage + mountain + sprint
    *
    * For classics (CLASSIC):
    *   totalProjectedPts = final (only the FINAL category matters)
    */
   export function computeRiderScore(
     riderId: string,
     results: readonly RaceResult[],
     targetRaceType: RaceType,
     currentYear: number,
   ): RiderScore {
     const gcScore = computeCategoryScore(results, ResultCategory.GC, targetRaceType, currentYear);
     const stageScore = computeCategoryScore(results, ResultCategory.STAGE, targetRaceType, currentYear);
     const mountainScore = computeCategoryScore(results, ResultCategory.MOUNTAIN, targetRaceType, currentYear);
     const sprintScore = computeCategoryScore(results, ResultCategory.SPRINT, targetRaceType, currentYear);
     const finalScore = computeCategoryScore(results, ResultCategory.FINAL, targetRaceType, currentYear);

     let totalProjectedPts: number;
     if (targetRaceType === RaceType.CLASSIC) {
       totalProjectedPts = finalScore;
     } else {
       totalProjectedPts = gcScore + stageScore + mountainScore + sprintScore;
     }

     const seasonsUsed = new Set(
       results
         .filter((r) => r.raceType === targetRaceType && getTemporalWeight(r.year, currentYear) > 0)
         .map((r) => r.year),
     ).size;

     const qualifyingResultsCount = results.filter(
       (r) => r.raceType === targetRaceType && getTemporalWeight(r.year, currentYear) > 0,
     ).length;

     return {
       riderId, targetRaceType, currentYear,
       categoryScores: { gc: gcScore, stage: stageScore, mountain: mountainScore, sprint: sprintScore, final: finalScore },
       totalProjectedPts, seasonsUsed, qualifyingResultsCount,
     };
   }
   ```

4. Implement the price-aware composite score function:
   ```typescript
   /**
    * Computes the composite value score for a rider within the context of a rider pool.
    *
    * Algorithm:
    * 1. pointsPerHillio = totalProjectedPts / priceHillios
    * 2. Normalize pointsPerHillio to a 0–100 scale using the pool's min/max range
    * 3. compositeScore = α × totalProjectedPts + β × normalizedValueScore
    *    where α and β control the balance between raw talent and price efficiency.
    *
    * Default weights: α=0.6 (raw performance matters more), β=0.4 (but value is essential).
    * These weights are configurable via COMPOSITE_SCORE_WEIGHTS.
    *
    * Why not just pointsPerHillio? Because a cheap rider with 5 projected points and
    * excellent points/H would rank above Pogačar. The composite balances both dimensions.
    *
    * @param riderScore - Pure projected score (from computeRiderScore)
    * @param priceHillios - Rider's price in hillios
    * @param poolStats - Min/max pointsPerHillio across the entire rider pool (for normalization)
    * @returns CompositeRiderScore with all value metrics
    */
   export function computeCompositeScore(
     riderScore: RiderScore,
     priceHillios: number,
     poolStats: PoolStats,
   ): CompositeRiderScore {
     const pointsPerHillio = priceHillios > 0
       ? riderScore.totalProjectedPts / priceHillios
       : 0;

     // Min-max normalization to 0–100 scale
     const range = poolStats.maxPointsPerHillio - poolStats.minPointsPerHillio;
     const normalizedValueScore = range > 0
       ? ((pointsPerHillio - poolStats.minPointsPerHillio) / range) * 100
       : 0;

     // Similarly normalize totalProjectedPts to 0–100 for fair weighting
     const ptsRange = poolStats.maxProjectedPts - poolStats.minProjectedPts;
     const normalizedPts = ptsRange > 0
       ? ((riderScore.totalProjectedPts - poolStats.minProjectedPts) / ptsRange) * 100
       : 0;

     const compositeScore =
       COMPOSITE_SCORE_WEIGHTS.rawPerformance * normalizedPts +
       COMPOSITE_SCORE_WEIGHTS.priceEfficiency * normalizedValueScore;

     return {
       riderScore,
       priceHillios,
       pointsPerHillio,
       normalizedValueScore,
       compositeScore,
     };
   }

   export interface PoolStats {
     readonly minPointsPerHillio: number;
     readonly maxPointsPerHillio: number;
     readonly minProjectedPts: number;
     readonly maxProjectedPts: number;
   }

   /**
    * Computes pool statistics from a set of rider scores + prices.
    * Used to normalize individual scores relative to the pool.
    */
   export function computePoolStats(
     entries: ReadonlyArray<{ totalProjectedPts: number; priceHillios: number }>,
   ): PoolStats {
     const scoredEntries = entries.filter((e) => e.totalProjectedPts > 0 && e.priceHillios > 0);
     if (scoredEntries.length === 0) {
       return { minPointsPerHillio: 0, maxPointsPerHillio: 0, minProjectedPts: 0, maxProjectedPts: 0 };
     }
     const pphValues = scoredEntries.map((e) => e.totalProjectedPts / e.priceHillios);
     const ptsValues = scoredEntries.map((e) => e.totalProjectedPts);
     return {
       minPointsPerHillio: Math.min(...pphValues),
       maxPointsPerHillio: Math.max(...pphValues),
       minProjectedPts: Math.min(...ptsValues),
       maxProjectedPts: Math.max(...ptsValues),
     };
   }
   ```

5. Add composite score weights configuration:
   ```typescript
   // scoring-weights.config.ts (append to existing file)
   export const COMPOSITE_SCORE_WEIGHTS = {
     rawPerformance: 0.6,   // Weight for normalized projected points
     priceEfficiency: 0.4,  // Weight for normalized points-per-hillio
   } as const;
   ```

6. Design notes:
   - The `RiderScore` is a value object — immutable, no identity, no side effects.
   - `computeRiderScore` remains pure (no price context) — useful for the optimizer which
     works directly with projected points.
   - `computeCompositeScore` requires pool context — it CANNOT be computed for a single
     rider in isolation. The analyze use case (WP06) must first compute all RiderScores,
     then derive PoolStats, then compute composite scores for the entire pool.
   - `seasonsUsed` helps consumers understand data density. A score based on 3 seasons is
     more reliable than one based on 1 season.
   - `qualifyingResultsCount` provides additional context for confidence assessment.
   - For classics, only the `final` category contributes.
   - The 0.6/0.4 weight split ensures top riders still rank high (you want Pogačar) but
     mid-tier riders with great value can surface above expensive riders with only slightly
     better stats.

7. **DI wrapper class**: To enable injection in NestJS use cases, wrap the pure functions
   in a stateless domain service class:
   ```typescript
   // apps/api/src/domain/scoring/scoring.service.ts (bottom of file or separate file)
   export class ScoringService {
     computeRiderScore(
       riderId: string, results: readonly RaceResult[],
       targetRaceType: RaceType, currentYear: number,
     ): RiderScore {
       return computeRiderScore(riderId, results, targetRaceType, currentYear);
     }

     computeCompositeScore(
       riderScore: RiderScore, priceHillios: number, poolStats: PoolStats,
     ): CompositeRiderScore {
       return computeCompositeScore(riderScore, priceHillios, poolStats);
     }

     computePoolStats(
       entries: ReadonlyArray<{ totalProjectedPts: number; priceHillios: number }>,
     ): PoolStats {
       return computePoolStats(entries);
     }
   }
   ```
   The class delegates to the pure functions — it adds no logic, only provides a
   DI-compatible interface. Tests can use either the class or the functions directly.
   WP06's `AnalyzePriceListUseCase` injects `ScoringService` as a class.

8. Future extensions (out of scope for this WP):
   - Confidence intervals based on result variance
   - Race-class weighting (UWT results worth more than Pro results)
   - Specialization detection (climber vs. sprinter vs. GC rider)
   - User-adjustable α/β weights via UI slider

**Validation**: Test with realistic scenarios covering all race types, composite score
computation with various pool compositions, and edge cases (single rider pool, all riders
with same price, riders with 0 projected points).

---

### T027 — 100% Coverage Test Suite

**Goal**: Achieve 100% line, branch, and function coverage on all scoring engine files.
This is a constitution mandate — not optional.

**Steps**:

1. Create test files in `apps/api/test/domain/scoring/`:
   - `scoring-weights.config.spec.ts`
   - `scoring.service.spec.ts` (covers temporal decay, category scoring, composite scoring)
2. Create test fixtures — factory functions for generating test data:
   ```typescript
   // apps/api/test/domain/scoring/fixtures.ts
   import { RaceResult } from '../../../src/domain/race-result/race-result.entity';
   import { RaceType } from '../../../src/domain/shared/race-type.enum';
   import { RaceClass } from '../../../src/domain/shared/race-class.enum';
   import { ResultCategory } from '../../../src/domain/shared/result-category.enum';

   export function createRaceResult(overrides: Partial<RaceResult> = {}): RaceResult {
     return {
       id: 'test-id',
       riderId: 'rider-1',
       raceSlug: 'tour-de-france',
       raceName: 'Tour de France',
       raceType: RaceType.GRAND_TOUR,
       raceClass: RaceClass.UWT,
       year: 2024,
       category: ResultCategory.GC,
       position: 1,
       stageNumber: null,
       dnf: false,
       scrapedAt: new Date('2024-07-21'),
       ...overrides,
     };
   }
   ```
3. **Scoring weights tests** (`scoring-weights.config.spec.ts`):
   ```typescript
   describe('ScoringWeightsConfig', () => {
     describe('SCORING_WEIGHTS', () => {
       it('should have all five categories defined', () => { /* ... */ });
       it('should have position 1 defined for every category', () => { /* ... */ });
       it('should have all positive integer values', () => { /* ... */ });
       it('should have descending points for ascending positions in GC', () => { /* ... */ });
       it('should have GC 1st place at 200 points', () => { /* ... */ });
       it('should have stage 1st place at 15 points', () => { /* ... */ });
     });

     describe('getPointsForPosition', () => {
       it('should return correct points for GC position 1', () => { /* ... */ });
       it('should return correct points for stage position 5', () => { /* ... */ });
       it('should return 0 for position beyond scoring threshold', () => { /* ... */ });
       it('should return 0 for null position (DNF)', () => { /* ... */ });
       it('should return 0 for position 0', () => { /* ... */ });
       it('should return 0 for negative position', () => { /* ... */ });
     });
   });
   ```
4. **Temporal decay tests**:
   ```typescript
   describe('getTemporalWeight', () => {
     it('should return 1.0 for current season', () => {
       expect(getTemporalWeight(2024, 2024)).toBe(1.0);
     });
     it('should return 0.6 for previous season', () => {
       expect(getTemporalWeight(2023, 2024)).toBe(0.6);
     });
     it('should return 0.3 for two seasons ago', () => {
       expect(getTemporalWeight(2022, 2024)).toBe(0.3);
     });
     it('should return 0 for three seasons ago', () => {
       expect(getTemporalWeight(2021, 2024)).toBe(0);
     });
     it('should return 0 for four or more seasons ago', () => {
       expect(getTemporalWeight(2020, 2024)).toBe(0);
     });
     it('should return 0 for future results', () => {
       expect(getTemporalWeight(2025, 2024)).toBe(0);
     });
   });
   ```
5. **Category scoring tests**:
   ```typescript
   describe('computeCategoryScore', () => {
     it('should return weighted average for multi-season results', () => {
       const results = [
         createRaceResult({ year: 2024, position: 1, category: ResultCategory.GC }),
         createRaceResult({ year: 2023, position: 3, category: ResultCategory.GC }),
       ];
       // Expected: (200 * 1.0 + 120 * 0.6) / (1.0 + 0.6) = 272 / 1.6 = 170
       expect(computeCategoryScore(results, ResultCategory.GC, RaceType.GRAND_TOUR, 2024))
         .toBeCloseTo(170);
     });

     it('should return 0 when no qualifying results exist', () => { /* ... */ });

     it('should filter out results from wrong race type', () => {
       const results = [
         createRaceResult({ raceType: RaceType.CLASSIC, category: ResultCategory.FINAL }),
       ];
       expect(computeCategoryScore(results, ResultCategory.GC, RaceType.GRAND_TOUR, 2024))
         .toBe(0);
     });

     it('should exclude results older than 2 seasons', () => {
       const results = [
         createRaceResult({ year: 2021, position: 1 }), // 3 seasons ago → excluded
       ];
       expect(computeCategoryScore(results, ResultCategory.GC, RaceType.GRAND_TOUR, 2024))
         .toBe(0);
     });

     it('should handle DNF results (position null) as 0 points', () => {
       const results = [
         createRaceResult({ position: null, dnf: true }),
       ];
       expect(computeCategoryScore(results, ResultCategory.GC, RaceType.GRAND_TOUR, 2024))
         .toBe(0);
     });

     it('should handle single-season results with weight 1.0', () => { /* ... */ });

     it('should handle positions beyond scoring threshold as 0 points', () => {
       const results = [
         createRaceResult({ position: 50 }), // Beyond top-20 → 0 points
       ];
       expect(computeCategoryScore(results, ResultCategory.GC, RaceType.GRAND_TOUR, 2024))
         .toBe(0);
     });
   });
   ```
6. **Composite scoring tests** (`computeRiderScore`):
   ```typescript
   describe('computeRiderScore', () => {
     it('should sum all category scores for Grand Tour', () => { /* ... */ });
     it('should use only final score for Classic', () => { /* ... */ });
     it('should return all zeros for rider with no data', () => {
       const score = computeRiderScore('rider-1', [], RaceType.GRAND_TOUR, 2024);
       expect(score.totalProjectedPts).toBe(0);
       expect(score.seasonsUsed).toBe(0);
       expect(score.qualifyingResultsCount).toBe(0);
     });
     it('should count correct number of seasons used', () => { /* ... */ });
     it('should count correct number of qualifying results', () => { /* ... */ });
     it('should handle rider with mixed race type results', () => {
       const results = [
         createRaceResult({ raceType: RaceType.GRAND_TOUR, category: ResultCategory.GC, position: 5 }),
         createRaceResult({ raceType: RaceType.CLASSIC, category: ResultCategory.FINAL, position: 1 }),
       ];
       const score = computeRiderScore('rider-1', results, RaceType.GRAND_TOUR, 2024);
       expect(score.categoryScores.final).toBe(0);
       expect(score.categoryScores.gc).toBe(90);
     });
   });
   ```
7. **Price-aware composite scoring tests** (`computeCompositeScore` + `computePoolStats`):
   ```typescript
   describe('computePoolStats', () => {
     it('should compute min/max pointsPerHillio across pool', () => {
       const entries = [
         { totalProjectedPts: 200, priceHillios: 500 },  // 0.4 pts/H
         { totalProjectedPts: 100, priceHillios: 100 },  // 1.0 pts/H
         { totalProjectedPts: 50,  priceHillios: 200 },  // 0.25 pts/H
       ];
       const stats = computePoolStats(entries);
       expect(stats.minPointsPerHillio).toBeCloseTo(0.25);
       expect(stats.maxPointsPerHillio).toBeCloseTo(1.0);
     });
     it('should return zeros for empty pool', () => { /* ... */ });
     it('should exclude riders with 0 projected points', () => { /* ... */ });
     it('should handle single-rider pool', () => { /* ... */ });
   });

   describe('computeCompositeScore', () => {
     it('should rank high-value rider above expensive low-value rider', () => {
       // Rider A: 100 pts, 100H → 1.0 pts/H (excellent value)
       // Rider B: 120 pts, 600H → 0.2 pts/H (poor value)
       // Rider A should have higher compositeScore despite lower raw pts
       const poolStats = computePoolStats([
         { totalProjectedPts: 100, priceHillios: 100 },
         { totalProjectedPts: 120, priceHillios: 600 },
       ]);
       const scoreA = computeCompositeScore(riderScoreA, 100, poolStats);
       const scoreB = computeCompositeScore(riderScoreB, 600, poolStats);
       expect(scoreA.compositeScore).toBeGreaterThan(scoreB.compositeScore);
     });
     it('should still rank elite riders high despite high price', () => {
       // Pogačar: 250 pts, 700H → 0.36 pts/H (moderate value)
       // Should still rank high because raw performance weight (0.6) dominates
     });
     it('should handle rider with 0 projected points', () => { /* ... */ });
     it('should handle rider with 0 price (edge case)', () => { /* ... */ });
     it('should normalize to 0-100 scale', () => {
       // The composite score should fall within a predictable range
     });
   });
   ```
7. Configure Jest coverage collection for the scoring module:
   ```json
   "collectCoverageFrom": [
     "src/domain/scoring/**/*.ts"
   ],
   "coverageThreshold": {
     "src/domain/scoring/": {
       "branches": 100,
       "functions": 100,
       "lines": 100,
       "statements": 100
     }
   }
   ```

**Validation**: Run `pnpm --filter api test -- --coverage --collectCoverageFrom='src/domain/scoring/**/*.ts'`.
All files must show 100% line, branch, function, and statement coverage. If any line is
uncovered, add a test case for it.

---

## Test Strategy

| Subtask | Test Type | What to verify                                       | Coverage Target |
|---------|-----------|------------------------------------------------------|-----------------|
| T023    | Unit      | Weights defined, helper returns correct values       | 100%            |
| T024    | Unit      | All temporal boundaries, deterministic output        | 100%            |
| T025    | Unit      | Weighted average math, filtering, edge cases         | 100%            |
| T026    | Unit      | Composite aggregation, race type handling, price-aware scoring, pool stats | 100% |
| T027    | —         | Test infrastructure and coverage enforcement         | —               |

**Testing philosophy**: Every test should be self-contained with no shared mutable state.
Use factory functions (like `createRaceResult`) for test data. Hand-compute expected values
and document the arithmetic in comments so reviewers can verify correctness.

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Scoring weights do not match actual fantasy league rules | High | High | Weights are configurable constants; easy to adjust once actual rules are confirmed |
| Weighted average penalizes riders with DNFs too harshly | Medium | Medium | DNF counts as 0 points but contributes to denominator; consider excluding DNFs from denominator in a future iteration if feedback warrants |
| Temporal decay may be too aggressive (0.3 for 2 seasons ago) | Medium | Low | Weights are constants that can be tuned; add A/B testing support in a future WP |
| Edge case: rider has results only from excluded seasons | Low | Low | Returns all zeros — correct behavior, tested explicitly |
| Floating point precision in weighted averages | Low | Low | Use `toBeCloseTo` in tests; scores are display values, not financial calculations |

## Review Guidance

When reviewing this work package, verify:

1. **Zero framework imports**: Run `grep -r "@nestjs\|drizzle-orm\|pg\|axios\|cheerio" apps/api/src/domain/scoring/`.
   Must return zero matches. This code must be pure domain logic.
2. **Mathematical correctness**: For each test case with a hand-computed expected value,
   verify the arithmetic independently. The weighted average formula must be correctly
   implemented.
3. **100% coverage**: Run the test suite with coverage. Every line, branch, function, and
   statement in `src/domain/scoring/` must be covered. No exceptions.
4. **Immutability**: All interfaces use `readonly` properties. All config objects use
   `as const`. No mutation of input arrays.
5. **Edge case handling**: Verify that null positions, empty arrays, out-of-range positions,
   future years, and very old results are all handled gracefully.
6. **Type safety**: No `any` types. No type assertions (`as`). No non-null assertions (`!`).
   All types must be inferred or explicitly declared.
7. **Readability**: Scoring logic must be well-documented with JSDoc comments explaining
   the algorithm, its inputs, and its outputs. A new developer should understand the
   scoring model by reading the code alone.
8. **Determinism**: Given the same inputs, the functions must always produce the same
   outputs. No reliance on `Date.now()`, `Math.random()`, or any other non-deterministic
   source.

## Definition of Done

- [ ] `SCORING_WEIGHTS` config defines points for all categories (gc, stage, mountain, sprint, final)
- [ ] `getPointsForPosition` maps position to points, returns 0 for out-of-range
- [ ] `getTemporalWeight` returns correct decay factors for 0, 1, 2, and 3+ seasons ago
- [ ] `computeCategoryScore` computes weighted average with race type and category filtering
- [ ] `computeRiderScore` aggregates all categories into a `RiderScore` value object
- [ ] `computePoolStats` computes min/max pointsPerHillio and projectedPts across a rider pool
- [ ] `computeCompositeScore` produces a price-aware value score using pool normalization
- [ ] `COMPOSITE_SCORE_WEIGHTS` defines configurable α (rawPerformance) and β (priceEfficiency) weights
- [ ] Composite score correctly balances raw performance and price efficiency
- [ ] Classic scoring uses only the `final` category
- [ ] Stage race scoring sums gc + stage + mountain + sprint categories
- [ ] DNF results (position null) contribute 0 points
- [ ] Results older than 2 seasons are excluded (weight = 0)
- [ ] All functions are pure — no side effects, no framework imports
- [ ] 100% line, branch, function, and statement coverage on `src/domain/scoring/`
- [ ] All tests use hand-computed expected values with documented arithmetic
- [ ] No `any` types; `pnpm lint` passes

## Implementation Command

```bash
spec-kitty implement WP05 --base WP02
```

## Activity Log

| Timestamp | Agent | Action |
|-----------|-------|--------|
| 2026-03-14T23:51:57Z | system | Prompt generated via /spec-kitty.tasks |
- 2026-03-15T19:34:14Z – claude-opus – shell_pid=68868 – lane=doing – Assigned agent via workflow command
- 2026-03-15T19:43:56Z – claude-opus – shell_pid=68868 – lane=for_review – Ready for review: Scoring engine with temporal decay, per-category weighted averaging, composite price-aware scoring, and ScoringService DI wrapper. 62 tests, 100% coverage on all production files.
- 2026-03-15T19:45:20Z – claude-opus – shell_pid=79678 – lane=doing – Started review via workflow command
