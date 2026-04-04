import type { SeasonBreakdown, ProfileSummary, RaceHistory } from '@cycling-analyzer/shared-types';

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

export interface ComputeBreakoutInput {
  readonly seasonBreakdown: readonly SeasonBreakdown[];
  readonly racePerformances: readonly RacePerformance[];
  readonly prediction: number;
  readonly priceHillios: number;
  readonly birthDate: Date | null;
  readonly profileSummary?: ProfileSummary;
  readonly medianPtsPerHillio: number;
  readonly categoryScores: CoreCategoryScores | null;
  readonly sameRaceHistory?: readonly RaceHistory[];
}
