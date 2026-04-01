import type { SeasonBreakdown, ProfileSummary } from '@cycling-analyzer/shared-types';

export interface CoreCategoryScores {
  readonly gc: number;
  readonly stage: number;
  readonly mountain: number;
  readonly sprint: number;
}

export interface ComputeBreakoutInput {
  readonly seasonBreakdown: readonly SeasonBreakdown[];
  readonly prediction: number;
  readonly priceHillios: number;
  readonly birthDate: Date | null;
  readonly profileSummary?: ProfileSummary;
  readonly medianPtsPerHillio: number;
  readonly categoryScores: CoreCategoryScores | null;
}
