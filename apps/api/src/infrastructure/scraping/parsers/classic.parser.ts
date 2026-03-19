import { ResultCategory } from '../../../domain/shared/result-category.enum';
import { ParsedResult } from './parsed-result.type';
import { extractProfile } from './profile-extractor';
import { parseResultsTable } from './results-table.parser';

export function parseClassicResults(html: string): ParsedResult[] {
  const results = parseResultsTable(html, ResultCategory.GC);
  const profile = extractProfile(html);

  return results.map((r) => ({
    ...r,
    parcoursType: profile.parcoursType,
    isItt: false,
    isTtt: false,
    profileScore: profile.profileScore,
  }));
}
