import * as cheerio from 'cheerio';

export type DiscoveredRaceType = 'STAGE_RACE' | 'ONE_DAY';

export interface DiscoveredRace {
  readonly urlPath: string;
  readonly slug: string;
  readonly name: string;
  readonly raceType: DiscoveredRaceType;
  readonly classText: string;
}

export function parseRaceList(html: string): DiscoveredRace[] {
  const $ = cheerio.load(html);
  const races: DiscoveredRace[] = [];

  const table = $('table.basic, table[class*="basic"]').first();
  if (table.length === 0) return [];

  const headers: string[] = [];
  table.find('thead th').each((_, th) => {
    headers.push($(th).text().trim());
  });

  const raceCol = headers.indexOf('Race');
  const classCol = headers.indexOf('Class');
  if (raceCol === -1 || classCol === -1) return [];

  table.find('tbody tr').each((_, row) => {
    const cells = $(row).find('td');
    if (cells.length <= Math.max(raceCol, classCol)) return;

    const classText = $(cells[classCol]).text().trim();
    if (!classText.startsWith('1.') && !classText.startsWith('2.')) return;

    const raceType: DiscoveredRaceType = classText.startsWith('2.') ? 'STAGE_RACE' : 'ONE_DAY';

    const link = $(cells[raceCol]).find('a').first();
    if (link.length === 0) return;

    const href = link.attr('href');
    if (!href) return;

    const urlPath = href.replace(/\/(gc|result|results)$/, '');
    const slugMatch = urlPath.match(/^race\/([^/]+)\//);
    const slug = slugMatch ? slugMatch[1] : '';
    if (!slug) return;

    const name = link.text().trim();

    races.push({ urlPath, slug, name, raceType, classText });
  });

  return races;
}
