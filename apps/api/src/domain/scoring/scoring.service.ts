import { RaceResult } from '../race-result/race-result.entity';
import { RaceType } from '../shared/race-type.enum';
import { ResultCategory } from '../shared/result-category.enum';
import { ProfileDistribution } from './profile-distribution';
import { computeProfileWeight, computeCategoryProfileWeight } from './profile-weight';
import {
  getPointsForPosition,
  getCrossTypeWeight,
  getRaceClassWeight,
  getCategoryAffinity,
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
  profileDistribution?: ProfileDistribution,
): number {
  const affinity = getCategoryAffinity(category);
  const categoryProfileWeight = affinity
    ? computeCategoryProfileWeight(affinity, profileDistribution ?? null)
    : 1.0;

  let weightedSum = 0;

  for (const result of results) {
    if (result.category !== category) continue;

    const temporalWeight = getTemporalWeight(result.year, currentYear, maxSeasons);
    if (temporalWeight === 0) continue;

    const crossWeight = getCrossTypeWeight(targetRaceType, result.raceType);
    if (crossWeight === 0) continue;

    const classWeight = getRaceClassWeight(result.raceClass);
    const points = getPointsForPosition(category, result.position, result.raceType);
    weightedSum += points * temporalWeight * crossWeight * classWeight * categoryProfileWeight;
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
  profileDistribution?: ProfileDistribution,
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

    // Profile weight is per-stage (each stage has its own parcoursType)
    let raceStageTotal = 0;
    for (const result of stageResults) {
      const points = getPointsForPosition(ResultCategory.STAGE, result.position, result.raceType);
      const profileWeight = computeProfileWeight(
        result.parcoursType,
        result.isItt,
        result.isTtt,
        profileDistribution ?? null,
      );
      raceStageTotal += points * profileWeight;
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
  profileDistribution?: ProfileDistribution,
): RiderScore {
  const gcScore = computeCategoryScore(
    results,
    ResultCategory.GC,
    targetRaceType,
    currentYear,
    maxSeasons,
    profileDistribution,
  );

  // Classics only score on final position (GC) — no stage/mountain/sprint classifications
  const isClassic = targetRaceType === RaceType.CLASSIC;

  const stageScore = isClassic
    ? 0
    : computeStageScore(results, targetRaceType, currentYear, maxSeasons, profileDistribution);
  const mountainScore = isClassic
    ? 0
    : computeCategoryScore(
        results,
        ResultCategory.MOUNTAIN,
        targetRaceType,
        currentYear,
        maxSeasons,
        profileDistribution,
      );
  const sprintScore = isClassic
    ? 0
    : computeCategoryScore(
        results,
        ResultCategory.SPRINT,
        targetRaceType,
        currentYear,
        maxSeasons,
        profileDistribution,
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
    const isClassic = targetRaceType === RaceType.CLASSIC;
    const gc = computeCategoryScore(results, ResultCategory.GC, targetRaceType, year, 1);
    const stage = isClassic ? 0 : computeStageScore(results, targetRaceType, year, 1);
    const mountain = isClassic
      ? 0
      : computeCategoryScore(results, ResultCategory.MOUNTAIN, targetRaceType, year, 1);
    const sprint = isClassic
      ? 0
      : computeCategoryScore(results, ResultCategory.SPRINT, targetRaceType, year, 1);

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
    profileDistribution?: ProfileDistribution,
  ): RiderScore {
    return computeRiderScore(
      riderId,
      results,
      targetRaceType,
      currentYear,
      maxSeasons,
      profileDistribution,
    );
  }

  computeSeasonBreakdown(
    results: readonly RaceResult[],
    targetRaceType: RaceType,
    currentYear: number,
    maxSeasons = 3,
  ): SeasonBreakdown[] {
    return computeSeasonBreakdown(results, targetRaceType, currentYear, maxSeasons);
  }
}
