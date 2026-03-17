/**
 * Temporal weights by seasons ago.
 *
 * Current season (0): full weight (1.0)
 * Previous season (1): 60% weight (0.6)
 * Two seasons ago (2): 30% weight (0.3)
 * Three or more seasons ago: excluded (0.0)
 *
 * These weights reflect diminishing predictive value of older results.
 */
export const TEMPORAL_WEIGHTS: Readonly<Record<number, number>> = {
  0: 1.0,
  1: 0.6,
  2: 0.3,
} as const;

/**
 * Returns the temporal weight for a result based on how many seasons ago it occurred.
 * The "current year" is always passed as a parameter — never derived from Date.now() —
 * making this function deterministic and testable.
 *
 * @param resultYear - The year the race result was recorded
 * @param currentYear - The current season year
 * @returns Weight between 0 and 1, or 0 if the result is too old or in the future
 */
export function getTemporalWeight(resultYear: number, currentYear: number): number {
  const seasonsAgo = currentYear - resultYear;

  if (seasonsAgo < 0) {
    return 0;
  }

  return TEMPORAL_WEIGHTS[seasonsAgo] ?? 0;
}
