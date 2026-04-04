import { GmvPost } from '../../domain/gmv/gmv-post';
import { getSearchTerms } from './race-name-aliases';

const CONFIDENCE_THRESHOLD = 0.7;

export interface GmvFuzzyMatchResult {
  post: GmvPost;
  confidence: number;
}

export function fuzzyMatchGmvPost(
  raceSlug: string,
  raceName: string,
  year: number,
  posts: GmvPost[],
): GmvFuzzyMatchResult | null {
  const searchTerms = getSearchTerms(raceSlug, raceName);
  let bestMatch: GmvFuzzyMatchResult | null = null;

  for (const term of searchTerms) {
    for (const post of posts) {
      const confidence = computeTokenOverlap(term, year, post.title);
      if (confidence >= CONFIDENCE_THRESHOLD && (!bestMatch || confidence > bestMatch.confidence)) {
        bestMatch = { post, confidence };
      }
    }
  }

  return bestMatch;
}

function computeTokenOverlap(searchTerm: string, year: number, postTitle: string): number {
  const searchTokens = tokenize(stripYear(searchTerm, year));
  const titleTokens = tokenize(stripYear(postTitle, year));

  if (searchTokens.length === 0 || titleTokens.length === 0) return 0;

  // Strip "ME" suffix from GMV titles (men's edition marker)
  const cleanTitleTokens = titleTokens.filter((t) => t !== 'me');

  const matches = searchTokens.filter((t) => cleanTitleTokens.includes(t));
  return matches.length / searchTokens.length;
}

function tokenize(text: string): string[] {
  return normalize(text)
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripYear(text: string, year: number): string {
  return text.replace(String(year), '').trim();
}
