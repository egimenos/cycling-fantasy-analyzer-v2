import { ScoredRider, TeamSelection } from './types';
import { InsufficientRidersError } from './errors';

function buildTeamSelection(riders: ScoredRider[], budget: number): TeamSelection {
  let totalCost = 0;
  let totalPts = 0;
  let gc = 0;
  let stage = 0;
  let mountain = 0;
  let sprint = 0;
  let final_ = 0;

  for (const r of riders) {
    totalCost += r.priceHillios;
    totalPts += r.totalProjectedPts;
    gc += r.categoryScores.gc;
    stage += r.categoryScores.stage;
    mountain += r.categoryScores.mountain;
    sprint += r.categoryScores.sprint;
    final_ += r.categoryScores.final;
  }

  return {
    riders,
    totalCostHillios: totalCost,
    totalProjectedPts: totalPts,
    budgetRemaining: budget - totalCost,
    scoreBreakdown: { gc, stage, mountain, sprint, final: final_ },
  };
}

/**
 * 0/1 Knapsack with cardinality constraint.
 * Selects exactly `teamSize` riders within `budget` maximizing totalProjectedPts.
 *
 * Uses space-optimized rolling DP with decision tracking for backtracking.
 * dp[b][k] = max achievable points with budget b and k slots remaining.
 */
export function findOptimalTeam(
  riders: ScoredRider[],
  budget: number,
  teamSize: number,
): TeamSelection {
  if (teamSize === 0) {
    return buildTeamSelection([], budget);
  }

  if (riders.length < teamSize) {
    throw new InsufficientRidersError(riders.length, teamSize);
  }

  if (budget <= 0) {
    throw new InsufficientRidersError(0, teamSize);
  }

  const n = riders.length;
  const B = budget;
  const K = teamSize;

  // Use flat arrays for better memory layout: index = b * (K+1) + k
  const size = (B + 1) * (K + 1);
  let current = new Float64Array(size).fill(-1);
  current[0 * (K + 1) + 0] = 0; // base: 0 budget used, 0 riders selected = 0 points

  // For backtracking: track which riders were included
  const decisions: boolean[][] = new Array(n);

  // dp base: with 0 riders selected and any budget, score is 0
  for (let b = 0; b <= B; b++) {
    current[b * (K + 1) + 0] = 0;
  }

  for (let i = 0; i < n; i++) {
    const rider = riders[i];
    const price = rider.priceHillios;
    const score = rider.totalProjectedPts;
    const next = new Float64Array(size).fill(-1);
    decisions[i] = new Array(size).fill(false);

    for (let b = 0; b <= B; b++) {
      for (let k = 0; k <= K; k++) {
        const idx = b * (K + 1) + k;

        // Skip: don't take rider i
        if (current[idx] >= 0) {
          if (current[idx] > next[idx]) {
            next[idx] = current[idx];
            decisions[i][idx] = false;
          }
        }

        // Include: take rider i (transition from state with one fewer rider and reduced budget)
        if (k > 0 && b >= price) {
          const prevIdx = (b - price) * (K + 1) + (k - 1);
          if (current[prevIdx] >= 0) {
            const newScore = current[prevIdx] + score;
            if (newScore > next[idx]) {
              next[idx] = newScore;
              decisions[i][idx] = true;
            }
          }
        }
      }
    }

    current = next;
  }

  // Find best achievable score with exactly teamSize riders within budget
  let bestScore = -1;
  let bestBudget = -1;
  for (let b = 0; b <= B; b++) {
    const idx = b * (K + 1) + K;
    if (current[idx] > bestScore) {
      bestScore = current[idx];
      bestBudget = b;
    }
  }

  if (bestScore < 0) {
    throw new InsufficientRidersError(riders.length, teamSize);
  }

  // Backtrack to find selected riders
  const selected: ScoredRider[] = [];
  let remainingBudget = bestBudget;
  let remainingSlots = K;

  for (let i = n - 1; i >= 0; i--) {
    const idx = remainingBudget * (K + 1) + remainingSlots;
    if (decisions[i][idx]) {
      selected.push(riders[i]);
      remainingBudget -= riders[i].priceHillios;
      remainingSlots--;
    }
  }

  return buildTeamSelection(selected.reverse(), budget);
}

export { buildTeamSelection };
