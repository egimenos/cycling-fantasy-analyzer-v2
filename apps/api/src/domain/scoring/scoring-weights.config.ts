import { ResultCategory } from '../shared/result-category.enum';

/**
 * Position-to-points mapping for each result category.
 * Key: finishing position (1-indexed)
 * Value: fantasy points awarded
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

/**
 * Scoring tables for each result category.
 *
 * - GC (General Classification): Highest points — primary competition in stage races. Top-20 score.
 * - Stage: Daily stage wins. Lower per-event but accumulated over many stages. Top-10 score.
 * - Mountain: KOM classification. Moderate points, top-10 score.
 * - Sprint: Sprint/points classification. Lowest per-position points, top-4 score.
 * - Final: Used for classic races. Same weight structure as GC because a classic is a
 *   single decisive result.
 */
export const SCORING_WEIGHTS: Readonly<ScoringWeightsConfig> = {
  gc: {
    1: 200,
    2: 150,
    3: 120,
    4: 100,
    5: 90,
    6: 80,
    7: 70,
    8: 60,
    9: 50,
    10: 45,
    11: 40,
    12: 36,
    13: 32,
    14: 28,
    15: 24,
    16: 20,
    17: 16,
    18: 12,
    19: 8,
    20: 5,
  },
  stage: {
    1: 15,
    2: 12,
    3: 10,
    4: 8,
    5: 6,
    6: 5,
    7: 4,
    8: 3,
    9: 2,
    10: 1,
  },
  mountain: {
    1: 12,
    2: 10,
    3: 8,
    4: 6,
    5: 5,
    6: 4,
    7: 3,
    8: 2,
    9: 1,
    10: 1,
  },
  sprint: {
    1: 6,
    2: 4,
    3: 2,
    4: 1,
  },
  final: {
    1: 200,
    2: 150,
    3: 120,
    4: 100,
    5: 90,
    6: 80,
    7: 70,
    8: 60,
    9: 50,
    10: 45,
    11: 40,
    12: 36,
    13: 32,
    14: 28,
    15: 24,
    16: 20,
    17: 16,
    18: 12,
    19: 8,
    20: 5,
  },
} as const;

/**
 * Composite score weights controlling the balance between raw talent and price efficiency.
 *
 * - rawPerformance (α=0.6): Weight for normalized projected points — ensures elite riders rank high.
 * - priceEfficiency (β=0.4): Weight for normalized points-per-hillio — surfaces mid-tier value picks.
 */
export const COMPOSITE_SCORE_WEIGHTS = {
  rawPerformance: 0.6,
  priceEfficiency: 0.4,
} as const;

/**
 * Returns the fantasy points awarded for a given position in a specific category.
 *
 * @param category - The result category (gc, stage, mountain, sprint, final)
 * @param position - The finishing position (1-indexed), or null for DNF
 * @returns Points for that position, or 0 if position is null, out of range, or below 1
 */
export function getPointsForPosition(category: ResultCategory, position: number | null): number {
  if (position === null || position < 1) {
    return 0;
  }
  const categoryMap = SCORING_WEIGHTS[category];
  return categoryMap[position] ?? 0;
}
