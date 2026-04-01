import type {
  SeasonBreakdown,
  CategoryScores,
  ProfileSummary,
  BreakoutSignals,
} from '@cycling-analyzer/shared-types';

const DEFAULT_AGE = 28;

// ── Helpers ──────────────────────────────────────────────────────────

export function computeAge(birthDate: Date | null): number {
  if (!birthDate) return DEFAULT_AGE;
  const now = new Date();
  return (now.getTime() - birthDate.getTime()) / (365.25 * 86_400_000);
}

export function computeRawSlope(seasons: readonly SeasonBreakdown[]): number {
  if (seasons.length < 2) return 0;
  const sorted = [...seasons].sort((a, b) => a.year - b.year);
  const n = sorted.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  for (const s of sorted) {
    sumX += s.year;
    sumY += s.total;
    sumXY += s.year * s.total;
    sumX2 += s.year * s.year;
  }
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

// ── Signal 1: Trajectory (0-25) ─────────────────────────────────────

export function computeTrajectory(
  seasons: readonly SeasonBreakdown[],
  birthDate: Date | null,
): number {
  const slope = computeRawSlope(seasons);
  if (slope <= 0) return 0;

  const age = computeAge(birthDate);
  let ageFactor: number;
  if (age < 25) ageFactor = 1.5;
  else if (age <= 27) ageFactor = 1.0;
  else if (age <= 31) ageFactor = 0.5;
  else ageFactor = 0.2;

  return Math.min(25, Math.max(0, slope * ageFactor));
}

// ── Signal 2: Recency Burst (0-25) ──────────────────────────────────

export function computeRecencyBurst(seasons: readonly SeasonBreakdown[]): number {
  if (seasons.length === 0) return 0;

  const current = seasons.reduce((a, b) => (a.year > b.year ? a : b));
  if (current.total <= 20) return 0;

  const others = seasons.filter((s) => s.year !== current.year);
  if (others.length === 0) return 0;

  const avgOthers = others.reduce((sum, s) => sum + s.total, 0) / others.length;
  if (avgOthers === 0) return 25;

  const ratio = current.total / avgOthers;
  return Math.min(25, Math.max(0, (ratio - 1) * 25));
}

// ── Signal 3: Ceiling Gap (0-20) ────────────────────────────────────

export function computeCeilingGap(
  seasons: readonly SeasonBreakdown[],
  prediction: number,
  birthDate: Date | null,
): number {
  const age = computeAge(birthDate);
  if (age > 33) return 0;
  if (seasons.length === 0) return 0;
  if (prediction <= 0) return 0;

  const peak = Math.max(...seasons.map((s) => s.total));
  const ratio = peak / prediction;
  return Math.min(20, Math.max(0, (ratio - 1) * 5));
}

// ── Signal 4: Route Fit (0-15) ──────────────────────────────────────

export function computeRouteFit(
  categoryScores: CategoryScores | null,
  profileSummary?: ProfileSummary,
): number {
  if (!profileSummary || !categoryScores) return 0;

  const riderTotal =
    categoryScores.gc + categoryScores.stage + categoryScores.mountain + categoryScores.sprint;
  if (riderTotal === 0) return 0;

  const riderProfile = {
    gc: categoryScores.gc / riderTotal,
    stage: categoryScores.stage / riderTotal,
    mountain: categoryScores.mountain / riderTotal,
    sprint: categoryScores.sprint / riderTotal,
  };

  const totalStages =
    profileSummary.p1Count +
    profileSummary.p2Count +
    profileSummary.p3Count +
    profileSummary.p4Count +
    profileSummary.p5Count +
    profileSummary.ittCount +
    profileSummary.tttCount +
    profileSummary.unknownCount;
  if (totalStages === 0) return 0;

  const raceProfile = {
    gc: (profileSummary.ittCount + profileSummary.tttCount) / totalStages,
    stage: (profileSummary.p2Count + profileSummary.p3Count) / totalStages,
    mountain: (profileSummary.p4Count + profileSummary.p5Count) / totalStages,
    sprint: profileSummary.p1Count / totalStages,
  };

  const dot =
    riderProfile.gc * raceProfile.gc +
    riderProfile.stage * raceProfile.stage +
    riderProfile.mountain * raceProfile.mountain +
    riderProfile.sprint * raceProfile.sprint;

  return Math.min(15, Math.max(0, dot * 15));
}

// ── Signal 5: Variance (0-15) ───────────────────────────────────────

export function computeVariance(seasons: readonly SeasonBreakdown[]): number {
  const nonZero = seasons.filter((s) => s.total > 0).map((s) => s.total);
  if (nonZero.length < 2) return 7.5;

  const mean = nonZero.reduce((a, b) => a + b, 0) / nonZero.length;
  if (mean === 0) return 0;

  const variance = nonZero.reduce((sum, v) => sum + (v - mean) ** 2, 0) / nonZero.length;
  const cv = Math.sqrt(variance) / mean;

  return Math.min(15, Math.max(0, cv * 15));
}

// ── Composite Index (0-100) ─────────────────────────────────────────

export function computeBpiIndex(signals: BreakoutSignals): number {
  const raw =
    signals.trajectory + signals.recency + signals.ceiling + signals.routeFit + signals.variance;
  return Math.min(100, Math.max(0, Math.round(raw)));
}
