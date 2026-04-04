import * as cheerio from 'cheerio';

export type { ExtractedProfile } from '../../../application/analyze/ports/race-profile-parser.port';
import type { ExtractedProfile } from '../../../application/analyze/ports/race-profile-parser.port';

export function extractProfile(html: string): ExtractedProfile {
  const $ = cheerio.load(html);
  return {
    parcoursType: extractParcoursType($),
    profileScore: extractProfileScore($),
  };
}

export function extractParcoursType($: cheerio.CheerioAPI): string | null {
  const profileSpan = $('span.icon.profile').first();
  if (profileSpan.length === 0) return null;
  const classes = profileSpan.attr('class') || '';
  const match = classes.match(/\bp([1-5])\b/);
  return match ? `p${match[1]}` : null;
}

export function extractProfileScore($: cheerio.CheerioAPI): number | null {
  // PCS uses various list classes: ul.infolist, ul.list.keyvalueList, etc.
  // Match any li containing .title and .value children
  const items = $('ul.infolist li, ul.list li, .infolist li');
  let score: number | null = null;
  items.each((_, li) => {
    const title = $(li).find('.title').text().trim();
    if (title.toLowerCase().includes('profilescore')) {
      const value = $(li).find('.value').text().trim();
      const parsed = parseInt(value, 10);
      if (!isNaN(parsed)) score = parsed;
    }
  });
  return score;
}

export function detectTimeTrialType(stageNameText: string): {
  isItt: boolean;
  isTtt: boolean;
} {
  return {
    isItt: /\(ITT\)/i.test(stageNameText),
    isTtt: /\(TTT\)/i.test(stageNameText),
  };
}
