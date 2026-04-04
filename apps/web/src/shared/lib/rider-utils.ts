import type { AnalyzedRider } from '@cycling-analyzer/shared-types';

/** Returns the best available score: ML predicted if available, otherwise rules-based */
export function getEffectiveScore(rider: AnalyzedRider, hasML?: boolean): number | null {
  if (hasML !== undefined) {
    return hasML && rider.mlPredictedScore !== null
      ? rider.mlPredictedScore
      : rider.totalProjectedPts;
  }
  return rider.mlPredictedScore ?? rider.totalProjectedPts;
}

/** Points per hillio — returns null if score is null or price is zero */
export function calculateValue(score: number | null, price: number): number | null {
  return score !== null && price > 0 ? score / price : null;
}
