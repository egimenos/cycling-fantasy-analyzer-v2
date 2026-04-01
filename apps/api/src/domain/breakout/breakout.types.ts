import type {
  SeasonBreakdown,
  CategoryScores,
  ProfileSummary,
} from '@cycling-analyzer/shared-types';

export interface ComputeBreakoutInput {
  readonly seasonBreakdown: readonly SeasonBreakdown[];
  readonly prediction: number;
  readonly priceHillios: number;
  readonly birthDate: Date | null;
  readonly profileSummary?: ProfileSummary;
  readonly medianPtsPerHillio: number;
  readonly categoryScores: CategoryScores | null;
}
