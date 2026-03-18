import { ResultCategory } from '../shared/result-category.enum';
import { RaceType } from '../shared/race-type.enum';

/**
 * Position-to-points mapping for each result category.
 * Key: finishing position (1-indexed)
 * Value: fantasy points awarded
 */
export interface PositionPointsMap {
  readonly [position: number]: number;
}

/**
 * Race-type specific scoring tables.
 * Based on grandesminivueltas.com official scoring rules.
 *
 * Stage classification points are CUMULATIVE (summed across all stages),
 * while GC/Mountain/Sprint are final classification scores (one per race).
 */

// Stage classification — same for all race types, top 20
const STAGE_POINTS: PositionPointsMap = {
  1: 40,
  2: 25,
  3: 22,
  4: 19,
  5: 17,
  6: 15,
  7: 14,
  8: 13,
  9: 12,
  10: 11,
  11: 10,
  12: 9,
  13: 8,
  14: 7,
  15: 6,
  16: 5,
  17: 4,
  18: 3,
  19: 2,
  20: 1,
};

// Final GC — Classics (top 10)
const GC_CLASSIC: PositionPointsMap = {
  1: 200,
  2: 125,
  3: 100,
  4: 80,
  5: 60,
  6: 50,
  7: 45,
  8: 40,
  9: 35,
  10: 30,
};

// Final GC — Mini Tours (top 15)
const GC_MINI_TOUR: PositionPointsMap = {
  1: 100,
  2: 80,
  3: 65,
  4: 55,
  5: 45,
  6: 40,
  7: 35,
  8: 30,
  9: 25,
  10: 20,
  11: 18,
  12: 16,
  13: 14,
  14: 12,
  15: 10,
};

// Final GC — Grand Tours (top 20)
const GC_GRAND_TOUR: PositionPointsMap = {
  1: 150,
  2: 125,
  3: 100,
  4: 80,
  5: 60,
  6: 50,
  7: 45,
  8: 40,
  9: 35,
  10: 30,
  11: 28,
  12: 26,
  13: 24,
  14: 22,
  15: 20,
  16: 18,
  17: 16,
  18: 14,
  19: 12,
  20: 10,
};

// Final Mountain/Sprint classification — Mini Tours (top 3)
const FINAL_CLASS_MINI_TOUR: PositionPointsMap = {
  1: 40,
  2: 25,
  3: 15,
};

// Final Mountain/Sprint classification — Grand Tours (top 5)
const FINAL_CLASS_GRAND_TOUR: PositionPointsMap = {
  1: 50,
  2: 35,
  3: 25,
  4: 15,
  5: 10,
};

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
 * Returns the fantasy points awarded for a given position in a specific category and race type.
 *
 * @param category - The result category (gc, stage, mountain, sprint)
 * @param position - The finishing position (1-indexed), or null for DNF
 * @param raceType - The race type (affects GC, mountain, sprint point tables)
 * @returns Points for that position, or 0 if position is null, out of range, or below 1
 */
export function getPointsForPosition(
  category: ResultCategory,
  position: number | null,
  raceType: RaceType,
): number {
  if (position === null || position < 1) {
    return 0;
  }

  const table = getPointsTable(category, raceType);
  return table[position] ?? 0;
}

function getPointsTable(category: ResultCategory, raceType: RaceType): PositionPointsMap {
  switch (category) {
    case ResultCategory.STAGE:
      return STAGE_POINTS;
    case ResultCategory.GC:
      switch (raceType) {
        case RaceType.CLASSIC:
          return GC_CLASSIC;
        case RaceType.MINI_TOUR:
          return GC_MINI_TOUR;
        case RaceType.GRAND_TOUR:
          return GC_GRAND_TOUR;
      }
      break;
    case ResultCategory.MOUNTAIN:
    case ResultCategory.SPRINT:
      switch (raceType) {
        case RaceType.CLASSIC:
          return {}; // Classics don't have mountain/sprint classifications
        case RaceType.MINI_TOUR:
          return FINAL_CLASS_MINI_TOUR;
        case RaceType.GRAND_TOUR:
          return FINAL_CLASS_GRAND_TOUR;
      }
      break;
  }
  return {};
}
