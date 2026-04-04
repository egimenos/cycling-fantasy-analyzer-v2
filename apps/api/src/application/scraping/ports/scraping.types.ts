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
  readonly raceDate: Date | null;
  readonly climbCategory?: string | null;
  readonly climbName?: string | null;
  readonly sprintName?: string | null;
  readonly kmMarker?: number | null;
}

export type ClassificationType = 'GC' | 'STAGE' | 'SPRINT' | 'MOUNTAIN';

export interface ClassificationUrl {
  readonly urlPath: string;
  readonly classificationType: ClassificationType;
  readonly stageNumber: number | null;
  readonly label: string;
}

export interface StageClassificationResult {
  readonly dailyGC: ParsedResult[];
  readonly mountainPasses: ParsedResult[];
  readonly intermediateSprints: ParsedResult[];
  readonly dailyRegularidad: ParsedResult[];
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly warnings: string[];
  readonly errors: string[];
}

export interface ClassificationValidationContext {
  readonly raceSlug: string;
  readonly classificationType: string;
  readonly stageNumber?: number;
  readonly expectedMinRiders?: number;
  readonly expectedMaxRiders?: number;
}

export interface StageRaceCompletenessInput {
  readonly type: string;
  readonly stageNumber?: number;
}
