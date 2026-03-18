import { RaceResult } from '../race-result/race-result.entity';
import { RaceType } from '../shared/race-type.enum';
import { ResultCategory } from '../shared/result-category.enum';
import {
  getPointsForPosition,
  getCrossTypeWeight,
  getRaceClassWeight,
  COMPOSITE_SCORE_WEIGHTS,
} from './scoring-weights.config';
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
 * Computes the cumulative weighted score for a rider in GC, Mountain, or Sprint category.
 *
 * Uses weighted sums (not averages): each result contributes
 *   points × temporalWeight × crossTypeWeight
 * and all contributions are summed. This means riders who race more AND perform well
 * accumulate more projected points — matching fantasy game incentives.
 *
 * Cross-type scoring: results from other race types contribute with a reduced weight.
 * Points use the SOURCE race type's table (what the rider actually scored).
 */
export function computeCategoryScore(
  results: readonly RaceResult[],
  category: ResultCategory,
  targetRaceType: RaceType,
  currentYear: number,
  maxSeasons = 3,
): number {
  let weightedSum = 0;

  for (const result of results) {
    if (result.category !== category) continue;

    const temporalWeight = getTemporalWeight(result.year, currentYear, maxSeasons);
    if (temporalWeight === 0) continue;

    const crossWeight = getCrossTypeWeight(targetRaceType, result.raceType);
    if (crossWeight === 0) continue;

    const classWeight = getRaceClassWeight(result.raceClass);
    const points = getPointsForPosition(category, result.position, result.raceType);
    weightedSum += points * temporalWeight * crossWeight * classWeight;
  }

  return weightedSum;
}

/**
 * Computes the cumulative weighted stage score for a rider.
 *
 * Algorithm:
 * 1. Group stage results by race (raceSlug + year)
 * 2. For each race: SUM all stage points within that race
 * 3. Multiply by effectiveWeight = temporalWeight × crossTypeWeight
 * 4. Sum across all races (cumulative, not averaged)
 *
 * This rewards riders who race frequently and score stage points consistently.
 */
export function computeStageScore(
  results: readonly RaceResult[],
  targetRaceType: RaceType,
  currentYear: number,
  maxSeasons = 3,
): number {
  // Group by race (raceSlug + year)
  const raceGroups = new Map<string, RaceResult[]>();
  for (const result of results) {
    if (result.category !== ResultCategory.STAGE) continue;
    const key = `${result.raceSlug}:${result.year}`;
    const group = raceGroups.get(key);
    if (group) {
      group.push(result);
    } else {
      raceGroups.set(key, [result]);
    }
  }

  let weightedSum = 0;

  for (const [, stageResults] of raceGroups) {
    const firstResult = stageResults[0];
    const temporalWeight = getTemporalWeight(firstResult.year, currentYear, maxSeasons);
    if (temporalWeight === 0) continue;

    const crossWeight = getCrossTypeWeight(targetRaceType, firstResult.raceType);
    if (crossWeight === 0) continue;

    const classWeight = getRaceClassWeight(firstResult.raceClass);

    let raceStageTotal = 0;
    for (const result of stageResults) {
      raceStageTotal += getPointsForPosition(
        ResultCategory.STAGE,
        result.position,
        result.raceType,
      );
    }

    weightedSum += raceStageTotal * temporalWeight * crossWeight * classWeight;
  }

  return weightedSum;
}

/**
 * Computes the full projected score for a rider against a target race type.
 * This is the PURE historical performance projection — no price context.
 *
 * totalProjectedPts = gc + stage + mountain + sprint
 *
 * All categories use cumulative weighted sums (not averages).
 * Riders who race more and perform well accumulate more projected points.
 */
export function computeRiderScore(
  riderId: string,
  results: readonly RaceResult[],
  targetRaceType: RaceType,
  currentYear: number,
  maxSeasons = 3,
): RiderScore {
  const gcScore = computeCategoryScore(
    results,
    ResultCategory.GC,
    targetRaceType,
    currentYear,
    maxSeasons,
  );
  const stageScore = computeStageScore(results, targetRaceType, currentYear, maxSeasons);
  const mountainScore = computeCategoryScore(
    results,
    ResultCategory.MOUNTAIN,
    targetRaceType,
    currentYear,
    maxSeasons,
  );
  const sprintScore = computeCategoryScore(
    results,
    ResultCategory.SPRINT,
    targetRaceType,
    currentYear,
    maxSeasons,
  );

  const totalProjectedPts = gcScore + stageScore + mountainScore + sprintScore;

  const seasonsUsed = new Set(
    results
      .filter(
        (r) =>
          getCrossTypeWeight(targetRaceType, r.raceType) > 0 &&
          getTemporalWeight(r.year, currentYear, maxSeasons) > 0,
      )
      .map((r) => r.year),
  ).size;

  const qualifyingResultsCount = results.filter(
    (r) =>
      getCrossTypeWeight(targetRaceType, r.raceType) > 0 &&
      getTemporalWeight(r.year, currentYear, maxSeasons) > 0,
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
 * Per-season raw scores for transparency.
 * Shows what the rider scored each year (unweighted) plus the applied weight.
 */
export interface SeasonBreakdown {
  readonly year: number;
  readonly gc: number;
  readonly stage: number;
  readonly mountain: number;
  readonly sprint: number;
  readonly total: number;
  readonly weight: number;
}

/**
 * Computes per-season raw scores for a rider.
 * Uses maxSeasons=1 with currentYear=year to get unweighted scores per year.
 * Includes cross-type results (any race type with non-zero cross weight).
 */
export function computeSeasonBreakdown(
  results: readonly RaceResult[],
  targetRaceType: RaceType,
  currentYear: number,
  maxSeasons = 3,
): SeasonBreakdown[] {
  const breakdown: SeasonBreakdown[] = [];

  for (let offset = 0; offset < maxSeasons; offset++) {
    const year = currentYear - offset;
    const weight = getTemporalWeight(year, currentYear, maxSeasons);
    if (weight === 0) continue;

    const yearResults = results.filter(
      (r) => r.year === year && getCrossTypeWeight(targetRaceType, r.raceType) > 0,
    );
    if (yearResults.length === 0) continue;

    // Compute raw (unweighted) scores for this year using maxSeasons=1
    // Cross-type weights are applied inside computeCategoryScore/computeStageScore
    const gc = computeCategoryScore(results, ResultCategory.GC, targetRaceType, year, 1);
    const stage = computeStageScore(results, targetRaceType, year, 1);
    const mountain = computeCategoryScore(
      results,
      ResultCategory.MOUNTAIN,
      targetRaceType,
      year,
      1,
    );
    const sprint = computeCategoryScore(results, ResultCategory.SPRINT, targetRaceType, year, 1);

    breakdown.push({
      year,
      gc,
      stage,
      mountain,
      sprint,
      total: gc + stage + mountain + sprint,
      weight,
    });
  }

  return breakdown;
}

/**
 * Computes pool statistics from a set of rider scores + prices.
 * Used to normalize individual scores relative to the pool.
 *
 * Riders with 0 projected points or 0 price are excluded from stats
 * because they would distort the normalization range.
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
 * compositeScore = α × normalizedPts + β × normalizedValueScore
 * where α=0.6 (raw performance) and β=0.4 (price efficiency)
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
    maxSeasons = 3,
  ): RiderScore {
    return computeRiderScore(riderId, results, targetRaceType, currentYear, maxSeasons);
  }

  computeSeasonBreakdown(
    results: readonly RaceResult[],
    targetRaceType: RaceType,
    currentYear: number,
    maxSeasons = 3,
  ): SeasonBreakdown[] {
    return computeSeasonBreakdown(results, targetRaceType, currentYear, maxSeasons);
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
