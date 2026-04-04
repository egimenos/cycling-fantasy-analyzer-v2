import * as cheerio from 'cheerio';

export type { ParsedStageInfo } from '../../../application/analyze/ports/race-profile-parser.port';
import type { ParsedStageInfo } from '../../../application/analyze/ports/race-profile-parser.port';

export function parseRaceOverview(html: string): ParsedStageInfo[] {
  const $ = cheerio.load(html);
  const stages: ParsedStageInfo[] = [];

  // Find the stage list table — look for table.basic after h4 containing "Stages"
  // or fall back to the first table.basic in the page
  const stagesHeading = $('h4').filter((_, el) =>
    $(el).text().trim().toLowerCase().includes('stages'),
  );

  const table =
    stagesHeading.length > 0 ? stagesHeading.next('table.basic') : $('table.basic').first();

  if (table.length === 0) return [];

  let stageCounter = 0;

  table.find('tbody tr').each((_, row) => {
    const cells = $(row).find('td');
    if (cells.length < 4) return;

    // Column layout: 0=date, 1=day, 2=profile icon, 3=stage link, 4=distance
    const stageLink = $(cells[3]).find('a').first();
    const stageLinkText = stageLink.text().trim();

    // Skip rest days
    if (stageLinkText.toLowerCase() === 'restday' || stageLinkText === '') return;

    stageCounter++;

    // Extract parcours type from profile icon span (column 2)
    const profileSpan = $(cells[2]).find('span.icon.profile');
    let parcoursType: string | null = null;
    if (profileSpan.length > 0) {
      const classes = profileSpan.attr('class') || '';
      const match = classes.match(/\bp([1-5])\b/);
      parcoursType = match ? `p${match[1]}` : null;
    }

    // Detect ITT/TTT inline (no import from profile-extractor — WP02 runs in parallel)
    const isItt = /\(ITT\)/i.test(stageLinkText);
    const isTtt = /\(TTT\)/i.test(stageLinkText);

    // Extract distance (last column)
    const distanceText = $(cells[cells.length - 1])
      .text()
      .trim();
    const distanceKm = distanceText ? parseFloat(distanceText) : null;

    // Extract departure/arrival from stage name
    // Format: "Stage N | Departure - Arrival" or "Stage N (ITT) | Departure - Arrival"
    let departure: string | null = null;
    let arrival: string | null = null;
    const pipeIndex = stageLinkText.indexOf('|');
    if (pipeIndex !== -1) {
      const route = stageLinkText.substring(pipeIndex + 1).trim();
      const dashParts = route.split(/\s+-\s+/);
      if (dashParts.length >= 2) {
        departure = dashParts[0].trim();
        arrival = dashParts[dashParts.length - 1].trim();
      }
    }

    // Extract stage number from text — support Stage, Etape, Tappa, Prologue
    const stageNumMatch = stageLinkText.match(/(?:Stage|Etape|Tappa|Prologue)\s*(\d+)?/i);
    const stageNumber = stageNumMatch
      ? stageNumMatch[1]
        ? parseInt(stageNumMatch[1], 10)
        : 0 // Prologue without number → stage 0
      : stageCounter;

    stages.push({
      stageNumber,
      parcoursType,
      isItt,
      isTtt,
      distanceKm: distanceKm && !isNaN(distanceKm) ? distanceKm : null,
      departure,
      arrival,
    });
  });

  return stages;
}
