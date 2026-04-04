import * as cheerio from 'cheerio';
import type {
  ClassificationType,
  ClassificationUrl,
} from '../../../application/scraping/ports/scraping.types';

export type { ClassificationType, ClassificationUrl };

const PREV_NEXT_REGEX = /PREV|NEXT|«|»/i;

export function extractClassificationUrls(html: string): ClassificationUrl[] {
  const $ = cheerio.load(html);
  const results: ClassificationUrl[] = [];

  $('div.selectNav').each((_, container) => {
    const linkTexts = $(container)
      .find('a')
      .map((__, a) => $(a).text())
      .get();
    const hasPrevNext = linkTexts.some((t) => PREV_NEXT_REGEX.test(t));
    if (!hasPrevNext) return;

    $(container)
      .find('select option')
      .each((__, option) => {
        let urlPath = $(option).attr('value');
        const rawText = $(option).text().trim();
        const optionText = rawText.toLowerCase();
        if (!urlPath) return;

        // Normalize: strip /result/result or /result suffix
        urlPath = urlPath.replace(/\/result\/result$/, '').replace(/\/result$/, '');

        // Skip irrelevant classifications
        if (urlPath.includes('teams') || urlPath.includes('youth')) return;

        const stageMatch = urlPath.match(/stage-(\d+)/);
        if (stageMatch && !urlPath.includes('points') && !urlPath.includes('kom')) {
          results.push({
            urlPath,
            classificationType: 'STAGE',
            stageNumber: parseInt(stageMatch[1], 10),
            label: rawText,
          });
          return;
        }

        if (optionText.includes('points classification') || urlPath.endsWith('/points')) {
          results.push({
            urlPath,
            classificationType: 'SPRINT',
            stageNumber: null,
            label: rawText,
          });
          return;
        }

        if (optionText.includes('mountains classification') || urlPath.endsWith('/kom')) {
          results.push({
            urlPath,
            classificationType: 'MOUNTAIN',
            stageNumber: null,
            label: rawText,
          });
          return;
        }

        if (optionText.includes('gc') || urlPath.endsWith('/gc')) {
          results.push({
            urlPath,
            classificationType: 'GC',
            stageNumber: null,
            label: rawText,
          });
          return;
        }
      });
  });

  return results;
}
