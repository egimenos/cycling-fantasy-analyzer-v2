import { ResultCategory } from '../../../domain/shared/result-category.enum';
import { ParsedResult } from './parsed-result.type';
import { extractProfile, detectTimeTrialType } from './profile-extractor';
import { parseResultsTable } from './results-table.parser';

export function parseGcResults(html: string): ParsedResult[] {
  return parseResultsTable(html, ResultCategory.GC);
}

export function parseStageResults(
  html: string,
  stageNumber: number,
  stageNameText?: string,
): ParsedResult[] {
  const results = parseResultsTable(html, ResultCategory.STAGE, stageNumber);
  const profile = extractProfile(html);
  const tt = stageNameText ? detectTimeTrialType(stageNameText) : { isItt: false, isTtt: false };

  return results.map((r) => ({
    ...r,
    parcoursType: profile.parcoursType,
    isItt: tt.isItt,
    isTtt: tt.isTtt,
    profileScore: profile.profileScore,
  }));
}

export function parseMountainClassification(html: string): ParsedResult[] {
  return parseResultsTable(html, ResultCategory.MOUNTAIN);
}

export function parseSprintClassification(html: string): ParsedResult[] {
  return parseResultsTable(html, ResultCategory.SPRINT);
}
