import type { ProfileSummary, RaceHistory } from '@cycling-analyzer/shared-types';

export interface CoreCategoryScores {
  readonly gc: number;
  readonly stage: number;
  readonly mountain: number;
  readonly sprint: number;
}

export interface RacePerformance {
  readonly raceSlug: string;
  readonly year: number;
  readonly raceDate: Date;
  readonly total: number;
}

/** Minimal per-year total, derived from aggregated race performances. */
export interface YearlyTotal {
  readonly year: number;
  readonly total: number;
}

export interface ComputeBreakoutInput {
  readonly yearlyTotals: readonly YearlyTotal[];
  readonly racePerformances: readonly RacePerformance[];
  readonly prediction: number;
  readonly priceHillios: number;
  readonly birthDate: Date | null;
  readonly profileSummary?: ProfileSummary;
  readonly p75PtsPerHillio: number;
  readonly categoryScores: CoreCategoryScores | null;
  readonly sameRaceHistory?: readonly RaceHistory[];
}
