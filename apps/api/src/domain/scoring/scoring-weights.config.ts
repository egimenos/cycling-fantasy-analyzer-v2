import { ResultCategory } from '../shared/result-category.enum';
import { RaceType } from '../shared/race-type.enum';
import { RaceClass } from '../shared/race-class.enum';
import { ParcoursType } from '../shared/parcours-type.enum';

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

// Daily GC classification — same for all stage race types (top 10)
const GC_DAILY_POINTS: PositionPointsMap = {
  1: 15,
  2: 10,
  3: 8,
  4: 7,
  5: 6,
  6: 5,
  7: 4,
  8: 3,
  9: 2,
  10: 1,
};

// Mountain pass points by climb category
const MOUNTAIN_PASS_HC: PositionPointsMap = { 1: 12, 2: 8, 3: 6, 4: 5, 5: 4, 6: 3, 7: 2, 8: 1 };
const MOUNTAIN_PASS_CAT1: PositionPointsMap = { 1: 8, 2: 6, 3: 4, 4: 2, 5: 1 };
const MOUNTAIN_PASS_CAT2: PositionPointsMap = { 1: 5, 2: 3, 3: 1 };
const MOUNTAIN_PASS_CAT3: PositionPointsMap = { 1: 3, 2: 2 };
const MOUNTAIN_PASS_CAT4: PositionPointsMap = { 1: 1 };

const MOUNTAIN_PASS_TABLES: Record<string, PositionPointsMap> = {
  HC: MOUNTAIN_PASS_HC,
  '1': MOUNTAIN_PASS_CAT1,
  '2': MOUNTAIN_PASS_CAT2,
  '3': MOUNTAIN_PASS_CAT3,
  '4': MOUNTAIN_PASS_CAT4,
};

// Intermediate sprint points (single sprint per stage)
const SPRINT_INTERMEDIATE_SINGLE: PositionPointsMap = { 1: 6, 2: 4, 3: 2 };
// Intermediate sprint points (multiple sprints per stage)
const SPRINT_INTERMEDIATE_MULTI: PositionPointsMap = { 1: 3, 2: 2, 3: 1 };

// Regularidad daily classification (top 3)
const REGULARIDAD_DAILY_POINTS: PositionPointsMap = { 1: 6, 2: 4, 3: 2 };

/**
 * Cross-race-type weight matrix.
 * When computing scores for a target race type, results from other race types
 * contribute with a reduced weight (on top of the temporal weight).
 *
 * GT ↔ Mini Tour = 0.7 (both stage races, transferable skills)
 * Classic ↔ Stage races = 0.3 (different style, but quality indicator)
 */
export const CROSS_TYPE_WEIGHTS: Readonly<Record<RaceType, Readonly<Record<RaceType, number>>>> = {
  [RaceType.GRAND_TOUR]: {
    [RaceType.GRAND_TOUR]: 1.0,
    [RaceType.MINI_TOUR]: 0.7,
    [RaceType.CLASSIC]: 0.3,
  },
  [RaceType.MINI_TOUR]: {
    [RaceType.GRAND_TOUR]: 0.7,
    [RaceType.MINI_TOUR]: 1.0,
    [RaceType.CLASSIC]: 0.3,
  },
  [RaceType.CLASSIC]: {
    [RaceType.GRAND_TOUR]: 0.3,
    [RaceType.MINI_TOUR]: 0.3,
    [RaceType.CLASSIC]: 1.0,
  },
} as const;

/**
 * Returns the cross-type weight for a source race type relative to the target.
 */
export function getCrossTypeWeight(targetRaceType: RaceType, sourceRaceType: RaceType): number {
  return CROSS_TYPE_WEIGHTS[targetRaceType][sourceRaceType] ?? 0;
}

/**
 * Race class prestige multiplier.
 * Differentiates the level of competition within the same race type.
 *
 * UWT (WorldTour): top-tier — Grand Tours, Monuments, WT stage races → full weight
 * Pro (ProSeries): mid-tier — Tour of Turkey, Arctic Race, etc. → half weight
 * 1 (.1 races): lower-tier — continental-level races → reduced weight
 */
export const RACE_CLASS_WEIGHTS: Readonly<Record<RaceClass, number>> = {
  [RaceClass.UWT]: 1.0,
  [RaceClass.PRO]: 0.5,
  [RaceClass.ONE]: 0.3,
} as const;

/**
 * Returns the prestige multiplier for a given race class.
 */
export function getRaceClassWeight(raceClass: RaceClass): number {
  return RACE_CLASS_WEIGHTS[raceClass] ?? 0.3;
}

/**
 * Returns the fantasy points awarded for a given position in a specific category and race type.
 *
 * @param category - The result category
 * @param position - The finishing position (1-indexed), or null for DNF
 * @param raceType - The race type (affects GC, mountain, sprint point tables)
 * @param opts - Optional: climbCategory for mountain_pass, sprintCount for sprint_intermediate
 * @returns Points for that position, or 0 if position is null, out of range, or below 1
 */
export function getPointsForPosition(
  category: ResultCategory,
  position: number | null,
  raceType: RaceType,
  opts?: { climbCategory?: string | null; sprintCount?: number },
): number {
  if (position === null || position < 1) {
    return 0;
  }

  const table = getPointsTable(category, raceType, opts);
  return table[position] ?? 0;
}

function getPointsTable(
  category: ResultCategory,
  raceType: RaceType,
  opts?: { climbCategory?: string | null; sprintCount?: number },
): PositionPointsMap {
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
    case ResultCategory.GC_DAILY:
      return GC_DAILY_POINTS;
    case ResultCategory.MOUNTAIN_PASS:
      return MOUNTAIN_PASS_TABLES[opts?.climbCategory ?? ''] ?? {};
    case ResultCategory.SPRINT_INTERMEDIATE:
      return (opts?.sprintCount ?? 1) >= 2 ? SPRINT_INTERMEDIATE_MULTI : SPRINT_INTERMEDIATE_SINGLE;
    case ResultCategory.REGULARIDAD_DAILY:
      return REGULARIDAD_DAILY_POINTS;
  }
  return {};
}

// ─── Profile-aware scoring constants ────────────────────────────────────────

/**
 * Minimum weight that any parcours type can receive.
 * Prevents complete exclusion of riders who don't match the target profile.
 */
export const PROFILE_WEIGHT_FLOOR = 0.25;

/**
 * Bonus factor applied when a result comes from an ITT or TTT stage.
 * Rewards riders with proven time-trial ability on races that include TTs.
 */
export const ITT_BONUS_FACTOR = 0.15;

/**
 * Maps result categories to their affinity parcours types.
 * - MOUNTAIN → P4, P5 (mountain stages)
 * - SPRINT → P1, P2 (flat/sprint stages)
 * - GC, STAGE → null (no specific affinity)
 */
export const CATEGORY_AFFINITY_MAP: Record<string, ParcoursType[] | null> = {
  [ResultCategory.MOUNTAIN]: [ParcoursType.P4, ParcoursType.P5],
  [ResultCategory.SPRINT]: [ParcoursType.P1, ParcoursType.P2],
  [ResultCategory.GC]: null,
  [ResultCategory.STAGE]: null,
};

/**
 * Returns the affinity parcours types for a given result category,
 * or null if the category has no specific parcours affinity.
 */
export function getCategoryAffinity(category: ResultCategory): ParcoursType[] | null {
  return CATEGORY_AFFINITY_MAP[category] ?? null;
}
