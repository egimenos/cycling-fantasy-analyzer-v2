import * as cheerio from 'cheerio';
import { ResultCategory } from '../../../domain/shared/result-category.enum';
import { ParsedResult } from './parsed-result.type';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- cheerio internal node type
type AnyNode = any;
type $ = cheerio.CheerioAPI;

/* ── Scoring position limits per game rules ─────────────── */

const MOUNTAIN_PASS_POSITIONS: Record<string, number> = {
  HC: 8,
  '1': 5,
  '2': 3,
  '3': 2,
  '4': 1,
};

const DAILY_GC_MAX_POSITION = 10;
const DAILY_REGULARIDAD_MAX_POSITION = 3;
const SPRINT_INTERMEDIATE_MAX_POSITION = 3;

/* ── Heading regexes ────────────────────────────────────── */

const MOUNTAIN_PASS_RE = /KOM Sprint \((HC|[1-4])\)\s+(.+?)\s*\((\d+(?:\.\d+)?)\s*km\)/;
const SPRINT_INTERMEDIATE_RE = /Sprint\s*\|\s*(.+?)\s*\((\d+(?:\.\d+)?)\s*km\)/;

/* ── Result type — canonical definition in application layer port ── */

export type { StageClassificationResult } from '../../../application/scraping/ports/scraping.types';
import type { StageClassificationResult } from '../../../application/scraping/ports/scraping.types';

/* ── Main coordinator ───────────────────────────────────── */

export function parseStageClassifications(
  html: string,
  stageNumber: number,
): StageClassificationResult {
  const q = cheerio.load(html);

  const result: StageClassificationResult = {
    dailyGC: [],
    mountainPasses: [],
    intermediateSprints: [],
    dailyRegularidad: [],
  };

  const tabs = q('div.resTab').toArray();
  let sprintTabParsed = false;

  for (const tab of tabs) {
    // Skip Tab 0 (visible stage results — already parsed by existing scraper)
    if (!q(tab).hasClass('hide')) continue;

    const headings = collectHeadings(q, tab);
    const headerRow = collectHeaderText(q, tab);

    if (isGCTab(headerRow, headings)) {
      result.dailyGC.push(...parseDailyGC(q, tab, stageNumber));
    } else if (isMountainTab(headings)) {
      result.mountainPasses.push(...parseMountainPasses(q, tab, stageNumber));
    } else if (isPointsTab(headings, headerRow) && !sprintTabParsed) {
      sprintTabParsed = true;
      const parsed = parsePointsTab(q, tab, stageNumber);
      result.intermediateSprints.push(...parsed.sprints);
      result.dailyRegularidad.push(...parsed.regularidad);
    }
  }

  return result;
}

/* ── Tab identification helpers ─────────────────────────── */

function collectHeadings(q: $, tab: AnyNode): string[] {
  const headings: string[] = [];
  q(tab)
    .find('h3, h4')
    .each((_, el) => {
      headings.push(q(el).text().trim());
    });
  return headings;
}

function collectHeaderText(q: $, tab: AnyNode): string {
  return q(tab)
    .find('table.results thead th')
    .map((_, th) => q(th).text().trim())
    .get()
    .join(' ');
}

function isGCTab(headerRow: string, headings: string[]): boolean {
  const hasTimeWonLost = headerRow.includes('Time won/lost');
  const hasNoKomSprint = !headings.some(
    (h) => MOUNTAIN_PASS_RE.test(h) || SPRINT_INTERMEDIATE_RE.test(h),
  );
  // Exclude Youth and Teams tabs which also have "Time won/lost"
  const isYouthOrTeam = headings.some((h) => /youth|team/i.test(h)) || headerRow.includes('Class');
  return hasTimeWonLost && hasNoKomSprint && !isYouthOrTeam;
}

function isMountainTab(headings: string[]): boolean {
  return headings.some((h) => MOUNTAIN_PASS_RE.test(h));
}

function isPointsTab(headings: string[], headerRow: string): boolean {
  const hasSprint = headings.some(
    (h) => SPRINT_INTERMEDIATE_RE.test(h) || h.includes('Points at finish'),
  );
  const hasPntToday =
    headerRow.includes('Pnt') &&
    headerRow.includes('Today') &&
    !headerRow.includes('Time won/lost');
  return hasSprint || hasPntToday;
}

/* ── Daily GC parser ────────────────────────────────────── */

function parseDailyGC(q: $, tab: AnyNode, stageNumber: number): ParsedResult[] {
  const results: ParsedResult[] = [];
  const table = q(tab).find('table.results').first();
  if (table.length === 0) return results;

  table.find('tbody tr').each((_, row) => {
    const cells = q(row).find('td');
    const position = parsePosition(q, cells);
    if (position === null || position > DAILY_GC_MAX_POSITION) return;

    const rider = parseRider(q, cells);
    if (!rider) return;

    results.push(buildResult(rider, position, ResultCategory.GC_DAILY, stageNumber));
  });

  return results;
}

/* ── Mountain passes parser ─────────────────────────────── */

function parseMountainPasses(q: $, tab: AnyNode, stageNumber: number): ParsedResult[] {
  const results: ParsedResult[] = [];
  const subTables = q(tab).find('table.results').toArray();

  for (const table of subTables) {
    const heading = findPrecedingHeading(q, table);
    const match = MOUNTAIN_PASS_RE.exec(heading);
    if (!match) continue; // Skip cumulative "General" KOM table

    const climbCategory = match[1];
    const climbName = match[2].trim();
    const kmMarker = parseFloat(match[3]);
    const maxPositions = MOUNTAIN_PASS_POSITIONS[climbCategory] ?? 1;

    q(table)
      .find('tbody tr')
      .each((_, row) => {
        const cells = q(row).find('td');
        const position = parsePosition(q, cells);
        if (position === null || position > maxPositions) return;

        const rider = parseRider(q, cells);
        if (!rider) return;

        results.push(
          buildResult(rider, position, ResultCategory.MOUNTAIN_PASS, stageNumber, {
            climbCategory,
            climbName,
            kmMarker,
          }),
        );
      });
  }

  return results;
}

/* ── Points tab parser (sprints + regularidad) ──────────── */

function parsePointsTab(
  q: $,
  tab: AnyNode,
  stageNumber: number,
): { sprints: ParsedResult[]; regularidad: ParsedResult[] } {
  const sprints: ParsedResult[] = [];
  const regularidad: ParsedResult[] = [];

  const subTables = q(tab).find('table.results').toArray();

  for (const table of subTables) {
    const heading = findPrecedingHeading(q, table);

    // Intermediate sprint
    const sprintMatch = SPRINT_INTERMEDIATE_RE.exec(heading);
    if (sprintMatch) {
      const sprintName = sprintMatch[1].trim();
      const kmMarker = parseFloat(sprintMatch[2]);

      q(table)
        .find('tbody tr')
        .each((_, row) => {
          const cells = q(row).find('td');
          const position = parsePosition(q, cells);
          if (position === null || position > SPRINT_INTERMEDIATE_MAX_POSITION) return;

          const rider = parseRider(q, cells);
          if (!rider) return;

          sprints.push(
            buildResult(rider, position, ResultCategory.SPRINT_INTERMEDIATE, stageNumber, {
              sprintName,
              kmMarker,
            }),
          );
        });
      continue;
    }

    // Skip "Points at finish"
    if (/points at finish/i.test(heading)) continue;

    // Cumulative Points table — extract daily regularidad from "Today" column
    const headers: string[] = [];
    q(table)
      .find('thead th')
      .each((_, th) => {
        headers.push(q(th).text().trim());
      });
    const todayIdx = headers.indexOf('Today');

    if (todayIdx !== -1) {
      const riders: { rider: RiderInfo; todayPts: number }[] = [];
      q(table)
        .find('tbody tr')
        .each((_, row) => {
          const cells = q(row).find('td');
          const rider = parseRider(q, cells);
          if (!rider) return;
          const todayText = q(cells[todayIdx]).text().trim();
          const todayPts = parseInt(todayText.replace(/[^0-9-]/g, ''), 10);
          if (!isNaN(todayPts) && todayPts > 0) {
            riders.push({ rider, todayPts });
          }
        });

      riders
        .sort((a, b) => b.todayPts - a.todayPts)
        .slice(0, DAILY_REGULARIDAD_MAX_POSITION)
        .forEach((entry, idx) => {
          regularidad.push(
            buildResult(entry.rider, idx + 1, ResultCategory.REGULARIDAD_DAILY, stageNumber),
          );
        });
    }
  }

  return { sprints, regularidad };
}

/* ── Shared helpers ─────────────────────────────────────── */

interface RiderInfo {
  readonly riderName: string;
  readonly riderSlug: string;
  readonly teamName: string;
}

function parsePosition(q: $, cells: cheerio.Cheerio<AnyNode>): number | null {
  const text = q(cells[0]).text().trim();
  const pos = parseInt(text, 10);
  return isNaN(pos) || pos < 1 ? null : pos;
}

function parseRider(q: $, cells: cheerio.Cheerio<AnyNode>): RiderInfo | null {
  let riderName = '';
  let riderSlug = '';
  let teamName = '';

  cells.each((_, cell) => {
    if (riderSlug) return; // already found
    const link = q(cell).find('a[href*="rider/"]').first();
    if (link.length > 0) {
      riderName = link.text().trim();
      riderSlug = (link.attr('href') ?? '').replace(/^\/?rider\//, '');
    }
  });

  if (!riderSlug) return null;

  cells.each((_, cell) => {
    if (teamName) return;
    const teamLink = q(cell).find('a[href*="team/"]').first();
    if (teamLink.length > 0) {
      teamName = teamLink.text().trim();
    }
  });

  return { riderName, riderSlug, teamName };
}

function findPrecedingHeading(q: $, table: AnyNode): string {
  let el = q(table).prev();
  while (el.length > 0) {
    const tag = el.prop('tagName')?.toLowerCase();
    if (tag === 'h3' || tag === 'h4') return el.text().trim();
    if (tag === 'table') break;
    el = el.prev();
  }
  return '';
}

interface BuildResultOptions {
  readonly climbCategory?: string;
  readonly climbName?: string;
  readonly sprintName?: string;
  readonly kmMarker?: number;
}

function buildResult(
  rider: RiderInfo,
  position: number,
  category: ResultCategory,
  stageNumber: number,
  options?: BuildResultOptions,
): ParsedResult {
  return {
    riderName: rider.riderName,
    riderSlug: rider.riderSlug,
    teamName: rider.teamName,
    position,
    category,
    stageNumber,
    dnf: false,
    parcoursType: null,
    isItt: false,
    isTtt: false,
    profileScore: null,
    raceDate: null,
    climbCategory: options?.climbCategory ?? null,
    climbName: options?.climbName ?? null,
    sprintName: options?.sprintName ?? null,
    kmMarker: options?.kmMarker ?? null,
  };
}
