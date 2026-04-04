import { Injectable } from '@nestjs/common';
import type { RaceResultParserPort } from '../../application/scraping/ports/race-result-parser.port';
import type {
  ParsedResult,
  ClassificationUrl,
  StageClassificationResult,
  ValidationResult,
  ClassificationValidationContext,
  StageRaceCompletenessInput,
} from '../../application/scraping/ports/scraping.types';
import { extractClassificationUrls } from './parsers/classification-extractor';
import {
  parseGcResults,
  parseStageResults,
  parseMountainClassification,
  parseSprintClassification,
} from './parsers/stage-race.parser';
import { parseClassicResults } from './parsers/classic.parser';
import { parseRaceDate } from './parsers/race-date.parser';
import { parseStageClassifications } from './parsers/stage-classifications.parser';
import {
  validateClassificationResults,
  validateStageRaceCompleteness,
} from './validation/parse-validator';

@Injectable()
export class RaceResultParserAdapter implements RaceResultParserPort {
  extractClassificationUrls(html: string): ClassificationUrl[] {
    return extractClassificationUrls(html);
  }

  parseGcResults(html: string): ParsedResult[] {
    return parseGcResults(html);
  }

  parseStageResults(html: string, stageNumber: number, stageNameText?: string): ParsedResult[] {
    return parseStageResults(html, stageNumber, stageNameText);
  }

  parseMountainClassification(html: string): ParsedResult[] {
    return parseMountainClassification(html);
  }

  parseSprintClassification(html: string): ParsedResult[] {
    return parseSprintClassification(html);
  }

  parseClassicResults(html: string): ParsedResult[] {
    return parseClassicResults(html);
  }

  parseRaceDate(html: string): Date | null {
    return parseRaceDate(html);
  }

  parseStageClassifications(html: string, stageNumber: number): StageClassificationResult {
    return parseStageClassifications(html, stageNumber);
  }

  validateClassificationResults(
    results: ParsedResult[],
    context: ClassificationValidationContext,
  ): ValidationResult {
    return validateClassificationResults(results, context);
  }

  validateStageRaceCompleteness(
    classifications: StageRaceCompletenessInput[],
    raceSlug: string,
    expectedStages?: number,
    skippedStageCount?: number,
  ): ValidationResult {
    return validateStageRaceCompleteness(
      classifications,
      raceSlug,
      expectedStages,
      skippedStageCount,
    );
  }
}
