import * as cheerio from 'cheerio';

export type { ParsedStartlistEntry } from '../../../application/benchmark/ports/startlist-parser.port';
import type { ParsedStartlistEntry } from '../../../application/benchmark/ports/startlist-parser.port';

/**
 * Parses a PCS startlist page and extracts rider entries.
 *
 * PCS startlist pages use a `ul.startlist_v4` container where each `<li>`
 * represents a team block. Inside each team block:
 * - `.ridersCont` wraps the team data
 * - `a.team` contains the team name
 * - Inner `<ul>` contains `<li>` elements for each rider
 * - Each rider `<li>` has: `<span class="bib">{number}</span>`,
 *   a flag span, and `<a href="rider/{slug}">{NAME}</a>`
 *
 * @returns Array of parsed startlist entries, or empty array on failure.
 */
export function parseStartlist(html: string): ParsedStartlistEntry[] {
  if (!html || html.trim().length === 0) {
    return [];
  }

  const $ = cheerio.load(html);
  const entries: ParsedStartlistEntry[] = [];

  const startlistContainer = $('ul.startlist_v4');
  if (startlistContainer.length === 0) {
    // Fallback: try table.basic format (older startlist pages)
    return parseTableStartlist($);
  }

  // Iterate over team blocks
  startlistContainer.children('li').each((_, teamLi) => {
    const ridersCont = $(teamLi).find('.ridersCont');
    if (ridersCont.length === 0) return;

    // Extract team name from `a.team` link
    const teamLink = ridersCont.find('a.team').first();
    const teamName = cleanTeamName(teamLink.text().trim());

    if (!teamName) return;

    // Iterate over rider list items inside the inner <ul>
    const ridersUl = ridersCont.find('ul').first();
    if (ridersUl.length === 0) return;

    ridersUl.children('li').each((_, riderLi) => {
      const riderLink = $(riderLi).find('a[href*="rider/"]').first();
      if (riderLink.length === 0) return;

      const riderName = riderLink.text().trim();
      if (!riderName) return;

      const href = riderLink.attr('href') ?? '';
      const riderSlug = extractRiderSlug(href);
      if (!riderSlug) return;

      const bibSpan = $(riderLi).find('.bib').first();
      const bibNumber = parseBibNumber(bibSpan.text().trim());

      entries.push({
        riderName,
        riderSlug,
        teamName,
        bibNumber,
      });
    });
  });

  return entries;
}

/**
 * Fallback parser for older PCS startlist pages that use a flat `table.basic` layout.
 */
function parseTableStartlist($: cheerio.CheerioAPI): ParsedStartlistEntry[] {
  const entries: ParsedStartlistEntry[] = [];
  const table = $('table.basic');
  if (table.length === 0) return [];

  table.find('tbody tr').each((_, row) => {
    const cells = $(row).find('td');
    if (cells.length === 0) return;

    const riderLink = $(row).find('a[href*="rider/"]').first();
    if (riderLink.length === 0) return;

    const riderName = riderLink.text().trim();
    if (!riderName) return;

    const href = riderLink.attr('href') ?? '';
    const riderSlug = extractRiderSlug(href);
    if (!riderSlug) return;

    // Team name from team link
    const teamLink = $(row).find('a[href*="team/"]').first();
    const teamName = cleanTeamName(teamLink.text().trim());

    // Bib number from first cell
    const bibText = $(cells[0]).text().trim();
    const bibNumber = parseBibNumber(bibText);

    entries.push({
      riderName,
      riderSlug,
      teamName,
      bibNumber,
    });
  });

  return entries;
}

/**
 * Extracts the rider slug from an href like "rider/tadej-pogacar" or "/rider/tadej-pogacar".
 * Returns the slug without the "rider/" prefix.
 */
function extractRiderSlug(href: string): string {
  const match = href.match(/(?:^|\/)rider\/([a-z0-9-]+)/);
  return match ? match[1] : '';
}

/**
 * Strips classification suffixes like "(WT)", "(PRT)", "(CT)" from team names.
 */
function cleanTeamName(raw: string): string {
  return raw.replace(/\s*\((?:WT|PRT|CT|PCT|CTM)\)\s*$/i, '').trim();
}

/**
 * Parses a bib number string into a number, or null if invalid.
 */
function parseBibNumber(text: string): number | null {
  if (!text) return null;
  // Take only the first numeric part (bib numbers are sometimes like "1" or "11")
  const match = text.match(/^\d+/);
  if (!match) return null;
  const num = parseInt(match[0], 10);
  return isNaN(num) || num <= 0 ? null : num;
}
