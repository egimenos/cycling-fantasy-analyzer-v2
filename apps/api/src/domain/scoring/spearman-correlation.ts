/**
 * Assigns ranks to scores (highest score = rank 1).
 * Ties are resolved with the average rank method.
 *
 * Example: [100, 80, 80, 60] → [1, 2.5, 2.5, 4]
 */
export function computeRankings(scores: readonly number[]): number[] {
  const n = scores.length;
  const indexed = scores.map((score, i) => ({ score, index: i }));
  indexed.sort((a, b) => b.score - a.score);

  const ranks = new Array<number>(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j < n && indexed[j].score === indexed[i].score) {
      j++;
    }
    const avgRank = (i + 1 + j) / 2;
    for (let k = i; k < j; k++) {
      ranks[indexed[k].index] = avgRank;
    }
    i = j;
  }
  return ranks;
}

/**
 * Computes tie correction for a set of ranks.
 * For each group of t tied ranks, adds (t³ - t) / 12 to the correction sum.
 */
function computeTieCorrection(ranks: readonly number[]): number {
  const counts = new Map<number, number>();
  for (const r of ranks) {
    counts.set(r, (counts.get(r) ?? 0) + 1);
  }
  let correction = 0;
  for (const t of counts.values()) {
    if (t > 1) {
      correction += (t * t * t - t) / 12;
    }
  }
  return correction;
}

/**
 * Computes Spearman's rank correlation coefficient (ρ) between two score arrays.
 * Both arrays must have the same length and correspond to the same items (by index).
 *
 * @param predicted - Predicted scores (higher = better)
 * @param actual - Actual scores (higher = better)
 * @returns ρ ∈ [-1, +1], or null if correlation is undefined (n < 2 or all tied)
 */
export function computeSpearmanRho(
  predicted: readonly number[],
  actual: readonly number[],
): number | null {
  if (predicted.length !== actual.length) {
    throw new Error('Arrays must have equal length');
  }
  const n = predicted.length;
  if (n < 2) return null;

  const ranksX = computeRankings(predicted);
  const ranksY = computeRankings(actual);

  let sumD2 = 0;
  for (let i = 0; i < n; i++) {
    const d = ranksX[i] - ranksY[i];
    sumD2 += d * d;
  }

  const tieCorrectX = computeTieCorrection(ranksX);
  const tieCorrectY = computeTieCorrection(ranksY);

  if (tieCorrectX === 0 && tieCorrectY === 0) {
    return 1 - (6 * sumD2) / (n * (n * n - 1));
  }

  const sumX2 = (n * (n * n - 1)) / 12 - tieCorrectX;
  const sumY2 = (n * (n * n - 1)) / 12 - tieCorrectY;

  if (sumX2 === 0 || sumY2 === 0) return null;

  return (sumX2 + sumY2 - sumD2) / (2 * Math.sqrt(sumX2 * sumY2));
}
