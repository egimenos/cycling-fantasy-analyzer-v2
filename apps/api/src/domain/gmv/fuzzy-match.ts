import { GmvPost } from './gmv-post';
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
      if (containsDifferentYear(post.title, year)) continue;
      const confidence = computeTokenOverlap(term, year, post.title);
      if (confidence >= CONFIDENCE_THRESHOLD && (!bestMatch || confidence > bestMatch.confidence)) {
        bestMatch = { post, confidence };
      }
    }
  }

  return bestMatch;
}

function computeTokenOverlap(searchTerm: string, year: number, postTitle: string): number {
  const searchTokens = dedupe(tokenize(stripYear(searchTerm, year)));
  const titleTokens = dedupe(
    tokenize(stripYear(postTitle, year)).filter((t) => t !== 'me' && t !== 'men'),
  );

  if (searchTokens.length === 0 || titleTokens.length === 0) return 0;

  const matches = searchTokens.filter((t) => titleTokens.includes(t));
  // Bidirectional: best of "how much of search is in title" vs "how much of title is in search"
  const forward = matches.length / searchTokens.length;
  const reverse = matches.length / titleTokens.length;
  return Math.max(forward, reverse);
}

function dedupe(tokens: string[]): string[] {
  return [...new Set(tokens)];
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

/** Returns true if the text mentions a 4-digit year that is NOT the target year */
function containsDifferentYear(text: string, targetYear: number): boolean {
  const yearMatches = text.match(/\b(20\d{2})\b/g);
  if (!yearMatches) return false;
  return yearMatches.every((y) => Number(y) !== targetYear);
}
