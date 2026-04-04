import type {
  ParsedResult,
  ClassificationUrl,
  StageClassificationResult,
  ValidationResult,
  ClassificationValidationContext,
  StageRaceCompletenessInput,
} from './scraping.types';

export const RACE_RESULT_PARSER_PORT = Symbol('RACE_RESULT_PARSER_PORT');

export interface RaceResultParserPort {
  extractClassificationUrls(html: string): ClassificationUrl[];
  parseGcResults(html: string): ParsedResult[];
  parseStageResults(html: string, stageNumber: number, stageNameText?: string): ParsedResult[];
  parseMountainClassification(html: string): ParsedResult[];
  parseSprintClassification(html: string): ParsedResult[];
  parseClassicResults(html: string): ParsedResult[];
  parseRaceDate(html: string): Date | null;
  parseStageClassifications(html: string, stageNumber: number): StageClassificationResult;
  validateClassificationResults(
    results: ParsedResult[],
    context: ClassificationValidationContext,
  ): ValidationResult;
  validateStageRaceCompleteness(
    classifications: StageRaceCompletenessInput[],
    raceSlug: string,
    expectedStages?: number,
    skippedStageCount?: number,
  ): ValidationResult;
}
