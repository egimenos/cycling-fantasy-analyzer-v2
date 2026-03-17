import { RaceResult } from '../race-result/race-result.entity';
import { RaceType } from '../shared/race-type.enum';
import { ResultCategory } from '../shared/result-category.enum';
import { getPointsForPosition, COMPOSITE_SCORE_WEIGHTS } from './scoring-weights.config';
import { getTemporalWeight } from './temporal-decay';

/**
 * Pure projected score for a rider against a target race type.
 * No price context — purely historical performance.
 */
export interface RiderScore {
  readonly riderId: string;
  readonly targetRaceType: RaceType;
  readonly currentYear: number;
  readonly categoryScores: {
    readonly gc: number;
    readonly stage: number;
    readonly mountain: number;
    readonly sprint: number;
  };
  readonly totalProjectedPts: number;
  readonly seasonsUsed: number;
  readonly qualifyingResultsCount: number;
}

/**
 * Price-aware composite score extending RiderScore with value metrics.
 * This is the PRIMARY ranking metric displayed to users.
 */
export interface CompositeRiderScore {
  readonly riderScore: RiderScore;
  readonly priceHillios: number;
  readonly pointsPerHillio: number;
  readonly normalizedValueScore: number;
  readonly compositeScore: number;
}

/**
 * Pool-level statistics used for min-max normalization.
 * Computed across the entire rider pool before individual composite scores.
 */
export interface PoolStats {
  readonly minPointsPerHillio: number;
  readonly maxPointsPerHillio: number;
  readonly minProjectedPts: number;
  readonly maxProjectedPts: number;
}

/**
 * Computes the weighted average score for a rider in a specific category.
 *
 * Algorithm:
 * 1. Filter results to only those matching targetRaceType AND category
 * 2. For each matching result:
 *    a. Look up points based on position
 *    b. Look up temporal weight based on year
 *    c. Weighted contribution = points × temporalWeight
 * 3. Average = sum(weighted contributions) / sum(temporal weights used)
 *    This produces a weighted average, not a simple average.
 * 4. If no qualifying results: return 0
 *
 * DNF handling: A DNF result has position=null → 0 points via getPointsForPosition.
 * It still counts toward the denominator because the rider was present but did not score.
 * This correctly penalizes riders who frequently abandon races.
 *
 * @param results - All race results for the rider (unfiltered)
 * @param category - The result category to score
 * @param targetRaceType - The race type to filter for
 * @param currentYear - The current season year for temporal weighting
 * @returns Weighted average score for this category
 */
export function computeCategoryScore(
  results: readonly RaceResult[],
  category: ResultCategory,
  targetRaceType: RaceType,
  currentYear: number,
): number {
  const qualifying = results.filter(
    (r) => r.raceType === targetRaceType && r.category === category,
  );

  if (qualifying.length === 0) {
    return 0;
  }

  let weightedSum = 0;
  let totalWeight = 0;

  for (const result of qualifying) {
    const temporalWeight = getTemporalWeight(result.year, currentYear);
    if (temporalWeight === 0) {
      continue;
    }

    const points = getPointsForPosition(category, result.position);
    weightedSum += points * temporalWeight;
    totalWeight += temporalWeight;
  }

  if (totalWeight === 0) {
    return 0;
  }

  return weightedSum / totalWeight;
}

/**
 * Computes the full projected score for a rider against a target race type.
 * This is the PURE historical performance projection — no price context.
 *
 * totalProjectedPts = gc + stage + mountain + sprint
 * For classics, only gc has data (stage/mountain/sprint are 0).
 *
 * @param riderId - The rider's unique identifier
 * @param results - All race results for the rider (unfiltered)
 * @param targetRaceType - The race type to project for
 * @param currentYear - The current season year for temporal weighting
 * @returns Full RiderScore value object
 */
export function computeRiderScore(
  riderId: string,
  results: readonly RaceResult[],
  targetRaceType: RaceType,
  currentYear: number,
): RiderScore {
  const gcScore = computeCategoryScore(results, ResultCategory.GC, targetRaceType, currentYear);
  const stageScore = computeCategoryScore(
    results,
    ResultCategory.STAGE,
    targetRaceType,
    currentYear,
  );
  const mountainScore = computeCategoryScore(
    results,
    ResultCategory.MOUNTAIN,
    targetRaceType,
    currentYear,
  );
  const sprintScore = computeCategoryScore(
    results,
    ResultCategory.SPRINT,
    targetRaceType,
    currentYear,
  );

  const totalProjectedPts = gcScore + stageScore + mountainScore + sprintScore;

  const seasonsUsed = new Set(
    results
      .filter((r) => r.raceType === targetRaceType && getTemporalWeight(r.year, currentYear) > 0)
      .map((r) => r.year),
  ).size;

  const qualifyingResultsCount = results.filter(
    (r) => r.raceType === targetRaceType && getTemporalWeight(r.year, currentYear) > 0,
  ).length;

  return {
    riderId,
    targetRaceType,
    currentYear,
    categoryScores: {
      gc: gcScore,
      stage: stageScore,
      mountain: mountainScore,
      sprint: sprintScore,
    },
    totalProjectedPts,
    seasonsUsed,
    qualifyingResultsCount,
  };
}

/**
 * Computes pool statistics from a set of rider scores + prices.
 * Used to normalize individual scores relative to the pool.
 *
 * Riders with 0 projected points or 0 price are excluded from stats
 * because they would distort the normalization range.
 *
 * @param entries - Array of { totalProjectedPts, priceHillios } for each rider
 * @returns PoolStats with min/max values for normalization
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

/**
 * Computes the composite value score for a rider within the context of a rider pool.
 *
 * Algorithm:
 * 1. pointsPerHillio = totalProjectedPts / priceHillios
 * 2. Normalize pointsPerHillio to a 0–100 scale using the pool's min/max range
 * 3. Similarly normalize totalProjectedPts to 0–100
 * 4. compositeScore = α × normalizedPts + β × normalizedValueScore
 *    where α=0.6 (raw performance) and β=0.4 (price efficiency)
 *
 * Why not just pointsPerHillio? Because a cheap rider with 5 projected points
 * and excellent pts/H would rank above Pogačar. The composite balances both dimensions.
 *
 * @param riderScore - Pure projected score (from computeRiderScore)
 * @param priceHillios - Rider's price in hillios
 * @param poolStats - Min/max across the entire rider pool (for normalization)
 * @returns CompositeRiderScore with all value metrics
 */
export function computeCompositeScore(
  riderScore: RiderScore,
  priceHillios: number,
  poolStats: PoolStats,
): CompositeRiderScore {
  const pointsPerHillio = priceHillios > 0 ? riderScore.totalProjectedPts / priceHillios : 0;

  const pphRange = poolStats.maxPointsPerHillio - poolStats.minPointsPerHillio;
  const normalizedValueScore =
    pphRange > 0 ? ((pointsPerHillio - poolStats.minPointsPerHillio) / pphRange) * 100 : 0;

  const ptsRange = poolStats.maxProjectedPts - poolStats.minProjectedPts;
  const normalizedPts =
    ptsRange > 0
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

/**
 * Stateless domain service class wrapping pure scoring functions.
 * Provides a DI-compatible interface for NestJS use cases.
 * Delegates entirely to the pure functions — adds no logic.
 */
export class ScoringService {
  computeRiderScore(
    riderId: string,
    results: readonly RaceResult[],
    targetRaceType: RaceType,
    currentYear: number,
  ): RiderScore {
    return computeRiderScore(riderId, results, targetRaceType, currentYear);
  }

  computeCompositeScore(
    riderScore: RiderScore,
    priceHillios: number,
    poolStats: PoolStats,
  ): CompositeRiderScore {
    return computeCompositeScore(riderScore, priceHillios, poolStats);
  }

  computePoolStats(
    entries: ReadonlyArray<{ totalProjectedPts: number; priceHillios: number }>,
  ): PoolStats {
    return computePoolStats(entries);
  }
}
