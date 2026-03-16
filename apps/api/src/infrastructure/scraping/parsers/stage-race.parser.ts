import { ResultCategory } from '../../../domain/shared/result-category.enum';
import { ParsedResult } from './parsed-result.type';
import { parseResultsTable } from './results-table.parser';

export function parseGcResults(html: string): ParsedResult[] {
  return parseResultsTable(html, ResultCategory.GC);
}

export function parseStageResults(html: string, stageNumber: number): ParsedResult[] {
  return parseResultsTable(html, ResultCategory.STAGE, stageNumber);
}

export function parseMountainClassification(html: string): ParsedResult[] {
  return parseResultsTable(html, ResultCategory.MOUNTAIN);
}

export function parseSprintClassification(html: string): ParsedResult[] {
  return parseResultsTable(html, ResultCategory.SPRINT);
}
