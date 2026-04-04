import type { AnalyzedRider } from '@cycling-analyzer/shared-types';

/** Returns the projected score (ML-only, null when unavailable) */
export function getEffectiveScore(rider: AnalyzedRider): number | null {
  return rider.totalProjectedPts;
}

/** Points per hillio — returns null if score is null or price is zero */
export function calculateValue(score: number | null, price: number): number | null {
  return score !== null && price > 0 ? score / price : null;
}
