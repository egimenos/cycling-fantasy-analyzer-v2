import type {
  SeasonBreakdown,
  ProfileSummary,
  BreakoutSignals,
  BreakoutResult,
  BreakoutFlag,
} from '@cycling-analyzer/shared-types';
import type { ComputeBreakoutInput, CoreCategoryScores, RacePerformance } from './breakout.types';

const EMERGING_TALENT: BreakoutFlag = 'EMERGING_TALENT' as BreakoutFlag;
const HOT_STREAK: BreakoutFlag = 'HOT_STREAK' as BreakoutFlag;
const DEEP_VALUE: BreakoutFlag = 'DEEP_VALUE' as BreakoutFlag;
const COMEBACK_FLAG: BreakoutFlag = 'COMEBACK' as BreakoutFlag;
const SPRINT_OPPORTUNITY: BreakoutFlag = 'SPRINT_OPPORTUNITY' as BreakoutFlag;
const BREAKAWAY_HUNTER: BreakoutFlag = 'BREAKAWAY_HUNTER' as BreakoutFlag;
const RACE_SPECIALIST: BreakoutFlag = 'RACE_SPECIALIST' as BreakoutFlag;

const DEFAULT_AGE = 28;
const FORM_WINDOW_DAYS = 90;

// ── Helpers ───────────────────────────────��──────────────────────────

export function computeAge(birthDate: Date | null, currentDate: Date = new Date()): number {
  if (!birthDate) return DEFAULT_AGE;
  return (currentDate.getTime() - birthDate.getTime()) / (365.25 * 86_400_000);
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
// Uses only completed seasons (excludes current year) to avoid
// partial-season depression of the slope.

export function computeTrajectory(
  seasons: readonly SeasonBreakdown[],
  birthDate: Date | null,
  currentDate: Date = new Date(),
): number {
  const currentYear = currentDate.getFullYear();
  const completedSeasons = seasons.filter((s) => s.year < currentYear);

  const slope = computeRawSlope(completedSeasons);
  if (slope <= 0) return 0;

  const age = computeAge(birthDate, currentDate);
  let ageFactor: number;
  if (age < 25) ageFactor = 1.5;
  else if (age <= 27) ageFactor = 1.0;
  else if (age <= 31) ageFactor = 0.5;
  else ageFactor = 0.2;

  return Math.min(25, Math.max(0, slope * ageFactor));
}

// ── Signal 2: Form (0-25) ───────────────────────────────────────────
// Rolling 90-day window: compares recent pts/race vs career pts/race.
// Replaces the broken calendar-year Recency signal.

export function computeForm(
  racePerformances: readonly RacePerformance[],
  currentDate: Date = new Date(),
): number {
  if (racePerformances.length === 0) return 0;

  const cutoff = new Date(currentDate.getTime() - FORM_WINDOW_DAYS * 86_400_000);
  const recent = racePerformances.filter((r) => r.raceDate >= cutoff && r.raceDate <= currentDate);

  if (recent.length === 0) return 0;

  const recentAvg = recent.reduce((s, r) => s + r.total, 0) / recent.length;
  const allAvg = racePerformances.reduce((s, r) => s + r.total, 0) / racePerformances.length;

  if (allAvg === 0) return 0;

  const ratio = recentAvg / allAvg;
  return Math.min(25, Math.max(0, (ratio - 1) * 25));
}

// ── Signal 3: Comeback (0-20) ─────────────────────────────��─────────
// Ceiling gap (peak vs prediction) gated by recovery evidence.
// Only scores if trajectory or form show the rider is bouncing back.

export function computeComeback(
  seasons: readonly SeasonBreakdown[],
  prediction: number,
  birthDate: Date | null,
  trajectoryScore: number,
  formScore: number,
  currentDate: Date = new Date(),
): number {
  const age = computeAge(birthDate, currentDate);
  if (age > 33) return 0;
  if (seasons.length === 0) return 0;
  if (prediction <= 0) return 0;

  const peak = Math.max(...seasons.map((s) => s.total));
  const ratio = peak / prediction;
  const gapScore = Math.min(20, Math.max(0, (ratio - 1) * 5));

  const hasRecoveryEvidence = trajectoryScore > 5 || formScore > 5;
  return hasRecoveryEvidence ? gapScore : 0;
}

// ── Signal 4: Route Fit (0-15) ──────────────────────────���───────────

export function computeRouteFit(
  categoryScores: CoreCategoryScores | null,
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

// ── Signal 5: Variance (0-15) ──────────────────────────────���────────
// Normalized by pts/race per season to avoid penalizing riders
// with fewer races in a given year.

export function computeVariance(racePerformances: readonly RacePerformance[]): number {
  const byYear = new Map<number, number[]>();
  for (const r of racePerformances) {
    const existing = byYear.get(r.year);
    if (existing) existing.push(r.total);
    else byYear.set(r.year, [r.total]);
  }

  const seasonAverages = [...byYear.values()]
    .map((totals) => totals.reduce((a, b) => a + b, 0) / totals.length)
    .filter((avg) => avg > 0);

  if (seasonAverages.length < 2) return 7.5;

  const mean = seasonAverages.reduce((a, b) => a + b, 0) / seasonAverages.length;
  if (mean === 0) return 0;

  const variance =
    seasonAverages.reduce((sum, v) => sum + (v - mean) ** 2, 0) / seasonAverages.length;
  const cv = Math.sqrt(variance) / mean;

  return Math.min(15, Math.max(0, cv * 15));
}

// ── Composite Index (0-100) ─────────────────────────────────────────

export function computeBpiIndex(signals: BreakoutSignals): number {
  const raw =
    signals.trajectory + signals.form + signals.comeback + signals.routeFit + signals.variance;
  return Math.min(100, Math.max(0, Math.round(raw)));
}

// ── Upside P80 ──────────────────────────────────────────────────────

function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

export function computeUpsideP80(seasons: readonly SeasonBreakdown[], prediction: number): number {
  if (seasons.length < 3) {
    return prediction > 0 ? Math.round(prediction * 1.8) : 0;
  }

  const sorted = [...seasons].sort((a, b) => b.year - a.year);
  const pool: number[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const copies = i === 0 ? 4 : i === 1 ? 3 : 2;
    for (let c = 0; c < copies; c++) pool.push(sorted[i].total);
  }

  if (pool.every((v) => v === 0)) return 0;

  const seed = seasons.reduce((s, r) => s + r.total * 1000 + r.year, 0);
  const rng = seededRandom(seed);
  const n = pool.length;
  const means: number[] = [];

  for (let iter = 0; iter < 1000; iter++) {
    let sum = 0;
    for (let j = 0; j < n; j++) {
      sum += pool[Math.floor(rng() * n)];
    }
    means.push(sum / n);
  }

  means.sort((a, b) => a - b);
  return Math.round(means[799]);
}

// ── Flag Evaluation ─────────────────────────────────────────────────

export function evaluateFlags(
  input: ComputeBreakoutInput,
  signals: BreakoutSignals,
): BreakoutFlag[] {
  const flags: BreakoutFlag[] = [];
  const age = computeAge(input.birthDate);
  const seasons = input.seasonBreakdown;

  const cs = input.categoryScores;
  const totalPts = cs ? cs.gc + cs.stage + cs.mountain + cs.sprint : 0;

  // EMERGING_TALENT — young rider with steep career growth
  if (age < 25 && seasons.length <= 3) {
    const slope = computeRawSlope(seasons);
    if (slope > 30) flags.push(EMERGING_TALENT);
  }

  // HOT_STREAK — strong recent form (form signal > 12.5 ≈ recent avg 1.5× career)
  if (signals.form > 12.5) {
    flags.push(HOT_STREAK);
  }

  // DEEP_VALUE — cheap rider with high efficiency and meaningful prediction
  const ptsPerHillio = input.priceHillios > 0 ? input.prediction / input.priceHillios : 0;
  if (input.priceHillios <= 100 && input.prediction >= 20 && ptsPerHillio > input.p75PtsPerHillio) {
    flags.push(DEEP_VALUE);
  }

  // COMEBACK — significant ceiling gap with recovery evidence
  if (signals.comeback > 10) {
    flags.push(COMEBACK_FLAG);
  }

  // SPRINT_OPPORTUNITY
  if (input.priceHillios <= 125 && input.profileSummary && totalPts > 0 && cs) {
    const sprintStageRatio = (cs.sprint + cs.stage) / totalPts;
    const ps = input.profileSummary;
    const totalStages =
      ps.p1Count +
      ps.p2Count +
      ps.p3Count +
      ps.p4Count +
      ps.p5Count +
      ps.ittCount +
      ps.tttCount +
      ps.unknownCount;
    const flatPct = totalStages > 0 ? ps.p1Count / totalStages : 0;
    if (sprintStageRatio > 0.15 && flatPct > 0.35) {
      flags.push(SPRINT_OPPORTUNITY);
    }
  }

  // BREAKAWAY_HUNTER
  if (input.priceHillios <= 100 && totalPts > 0 && cs) {
    const mtnRatio = cs.mountain / totalPts;
    if (mtnRatio > 0.1) flags.push(BREAKAWAY_HUNTER);
  }

  // RACE_SPECIALIST — historical median in this race exceeds prediction
  const raceHist = input.sameRaceHistory ?? [];
  if (raceHist.length >= 2 && input.prediction > 0) {
    const sorted = [...raceHist].map((h) => h.total).sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const medianHistorical =
      sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    if (medianHistorical > input.prediction * 1.15) {
      flags.push(RACE_SPECIALIST);
    }
  }

  return flags;
}

// ── Compose ─────────────────────────────────────────────────────────

export function computeBreakout(input: ComputeBreakoutInput): BreakoutResult {
  const trajectoryScore = computeTrajectory(input.seasonBreakdown, input.birthDate);
  const formScore = computeForm(input.racePerformances);

  const signals: BreakoutSignals = {
    trajectory: trajectoryScore,
    form: formScore,
    comeback: computeComeback(
      input.seasonBreakdown,
      input.prediction,
      input.birthDate,
      trajectoryScore,
      formScore,
    ),
    routeFit: computeRouteFit(input.categoryScores, input.profileSummary),
    variance: computeVariance(input.racePerformances),
  };

  return {
    index: computeBpiIndex(signals),
    upsideP80: computeUpsideP80(input.seasonBreakdown, input.prediction),
    flags: evaluateFlags(input, signals),
    signals,
  };
}

// ── P75 helper ──────────────────────────────────────────────────────

export function computeP75PtsPerHillio(
  riders: readonly { pointsPerHillio: number | null }[],
): number {
  const values = riders
    .map((r) => r.pointsPerHillio)
    .filter((v): v is number => v != null && v > 0)
    .sort((a, b) => a - b);

  if (values.length === 0) return 0;
  const idx = Math.floor(values.length * 0.75);
  return values[Math.min(idx, values.length - 1)];
}
