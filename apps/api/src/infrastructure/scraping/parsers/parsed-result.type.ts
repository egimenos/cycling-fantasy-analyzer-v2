import { ResultCategory } from '../../../domain/shared/result-category.enum';

export interface ParsedResult {
  readonly riderName: string;
  readonly riderSlug: string;
  readonly teamName: string;
  readonly position: number | null;
  readonly category: ResultCategory;
  readonly stageNumber: number | null;
  readonly dnf: boolean;
  readonly parcoursType: string | null;
  readonly isItt: boolean;
  readonly isTtt: boolean;
  readonly profileScore: number | null;
}
