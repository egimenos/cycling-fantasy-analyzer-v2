import { ResultCategory } from '../../../domain/shared/result-category.enum';
import { ParsedResult } from './parsed-result.type';
import { parseResultsTable } from './results-table.parser';

export function parseClassicResults(html: string): ParsedResult[] {
  return parseResultsTable(html, ResultCategory.FINAL);
}
