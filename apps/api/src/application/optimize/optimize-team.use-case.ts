import { Injectable } from '@nestjs/common';
import {
  ScoredRider,
  TeamSelection,
  findOptimalTeam,
  applyConstraints,
  findAlternativeTeams,
  buildTeamSelection,
} from '../../domain/optimizer';

const TEAM_SIZE = 9;

export interface OptimizeInput {
  riders: ScoredRider[];
  budget: number;
  mustInclude: string[];
  mustExclude: string[];
}

export interface OptimizeResponse {
  optimalTeam: TeamSelection;
  alternativeTeams: TeamSelection[];
}

/**
 * Resolves the effective score for each rider.
 *
 * For stage races where ML predictions are available, the ML predicted score
 * replaces totalProjectedPts as the optimization target. For classics or when
 * ML predictions are unavailable, the rules-based totalProjectedPts is used.
 *
 * The knapsack algorithm is not modified — it always optimizes on
 * totalProjectedPts. We achieve ML-based optimization by mapping the effective
 * score into that field before passing riders to the optimizer.
 */
function applyEffectiveScores(riders: ScoredRider[]): ScoredRider[] {
  return riders.map((rider) => {
    const effectiveScore = rider.mlPredictedScore ?? rider.totalProjectedPts;
    if (effectiveScore === rider.totalProjectedPts) {
      return rider;
    }
    return {
      ...rider,
      totalProjectedPts: effectiveScore,
      categoryScores: rider.mlBreakdown ?? rider.categoryScores,
    };
  });
}

@Injectable()
export class OptimizeTeamUseCase {
  execute(input: OptimizeInput): OptimizeResponse {
    const ridersWithEffectiveScores = applyEffectiveScores(input.riders);

    const { filteredRiders, lockedRiders, adjustedBudget, adjustedTeamSize } = applyConstraints(
      ridersWithEffectiveScores,
      input.mustInclude,
      input.mustExclude,
      input.budget,
      TEAM_SIZE,
    );

    if (adjustedTeamSize <= 0) {
      const optimalTeam = buildTeamSelection(lockedRiders, input.budget);
      return { optimalTeam, alternativeTeams: [] };
    }

    const dpResult = findOptimalTeam(filteredRiders, adjustedBudget, adjustedTeamSize);

    const mergedRiders = [...lockedRiders, ...dpResult.riders];
    const optimalTeam = buildTeamSelection(mergedRiders, input.budget);

    const fullPool = [...filteredRiders, ...lockedRiders];
    const alternatives = findAlternativeTeams(fullPool, input.budget, TEAM_SIZE, optimalTeam, 4);

    return { optimalTeam, alternativeTeams: alternatives };
  }
}
