import * as cheerio from 'cheerio';
import { ResultCategory } from '../../../domain/shared/result-category.enum';
import { ParsedResult } from './parsed-result.type';

const NON_FINISHER_REGEX = /^(DNF|DNS|OTL|DSQ)$/i;

export function parseResultsTable(
  html: string,
  category: ResultCategory,
  stageNumber: number | null = null,
): ParsedResult[] {
  const $ = cheerio.load(html);
  const results: ParsedResult[] = [];

  const table = $('div.resTab:not(.hide) table.results');
  if (table.length === 0) return [];

  const headers: string[] = [];
  table.find('thead th').each((_, th) => {
    headers.push($(th).text().trim());
  });

  const riderCol = headers.indexOf('Rider');
  const teamCol = Math.max(headers.indexOf('Team'), headers.indexOf('Tm'));

  if (riderCol === -1) return [];

  table.find('tbody tr').each((_, row) => {
    const cells = $(row).find('td');
    if (cells.length <= riderCol) return;

    const posText = $(cells[0]).text().trim();
    const isNonFinisher = NON_FINISHER_REGEX.test(posText);
    const position = isNonFinisher ? null : parseInt(posText, 10);
    if (!isNonFinisher && isNaN(position as number)) return;

    const riderLink = $(cells[riderCol]).find('a').first();
    if (riderLink.length === 0) return;

    const riderName = riderLink.text().trim();
    const riderSlug = riderLink.attr('href') ?? '';
    const teamName =
      teamCol !== -1 && cells.length > teamCol ? $(cells[teamCol]).text().trim() : '';

    results.push({
      riderName,
      riderSlug,
      teamName,
      position: position ?? null,
      category,
      stageNumber,
      dnf: isNonFinisher,
      parcoursType: null,
      isItt: false,
      isTtt: false,
      profileScore: null,
    });
  });

  return results;
}
