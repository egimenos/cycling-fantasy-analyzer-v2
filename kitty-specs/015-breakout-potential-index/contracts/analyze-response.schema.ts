/**
 * Contract: Analyze endpoint response changes for BPI feature (015)
 *
 * This file documents the shape of new/modified types in the analyze response.
 * It is NOT executable code — it serves as the contract between backend and frontend.
 */

// --- NEW TYPES ---

export enum BreakoutFlag {
  EmergingTalent = 'EMERGING_TALENT',
  HotStreak = 'HOT_STREAK',
  DeepValue = 'DEEP_VALUE',
  CeilingPlay = 'CEILING_PLAY',
  SprintOpportunity = 'SPRINT_OPPORTUNITY',
  BreakawayHunter = 'BREAKAWAY_HUNTER',
}

export interface BreakoutSignals {
  /** Career trajectory slope adjusted by age factor (0-25) */
  trajectory: number;
  /** Current season burst relative to historical average (0-25) */
  recency: number;
  /** Gap between historical peak and current prediction (0-20) */
  ceiling: number;
  /** Rider category profile × race route profile fit (0-15) */
  routeFit: number;
  /** Season-to-season variance indicating upside potential (0-15) */
  variance: number;
}

export interface BreakoutResult {
  /** Composite Breakout Potential Index (0-100) */
  index: number;
  /** Optimistic P80 points estimate via bootstrap or heuristic */
  upsideP80: number;
  /** Triggered breakout flags — empty array if none apply */
  flags: BreakoutFlag[];
  /** Individual signal scores for the detail panel breakdown */
  signals: BreakoutSignals;
}

// --- MODIFIED TYPE (showing new field only) ---
// AnalyzedRider gains: breakout: BreakoutResult | null

// --- EXAMPLE RESPONSE (single rider) ---

export const exampleRider = {
  rawName: 'Juan Ayuso',
  rawTeam: 'UAE Team Emirates',
  priceHillios: 80,
  matchedRider: {
    id: 'uuid',
    pcsSlug: 'juan-ayuso',
    fullName: 'Juan Ayuso',
    currentTeam: 'UAE Team Emirates',
  },
  matchConfidence: 0.95,
  unmatched: false,
  pointsPerHillio: 2.1,
  totalProjectedPts: 168,
  categoryScores: { gc: 100, stage: 40, mountain: 20, sprint: 8 },
  seasonsUsed: 3,
  seasonBreakdown: [
    { year: 2026, gc: 80, stage: 30, mountain: 15, sprint: 5, total: 130, weight: 1.0 },
    { year: 2025, gc: 60, stage: 25, mountain: 10, sprint: 3, total: 98, weight: 0.75 },
    { year: 2024, gc: 20, stage: 10, mountain: 5, sprint: 2, total: 37, weight: 0.5 },
  ],
  scoringMethod: 'hybrid',
  mlPredictedScore: 168,
  mlBreakdown: { gc: 100, stage: 40, mountain: 20, sprint: 8 },

  // NEW
  breakout: {
    index: 74,
    upsideP80: 215,
    flags: ['EMERGING_TALENT', 'HOT_STREAK'],
    signals: {
      trajectory: 22,
      recency: 20,
      ceiling: 14,
      routeFit: 8,
      variance: 10,
    },
  },
};
