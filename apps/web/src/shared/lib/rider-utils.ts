import type { AnalyzedRider } from '@cycling-analyzer/shared-types';

/** Returns the ML predicted score, or null when unavailable */
export function getEffectiveScore(rider: AnalyzedRider): number | null {
  return rider.totalProjectedPts;
}

/** Points per hillio — returns null if score is null or price is zero */
export function calculateValue(score: number | null, price: number): number | null {
  return score !== null && price > 0 ? score / price : null;
}
