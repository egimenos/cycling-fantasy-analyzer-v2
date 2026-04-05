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

@Injectable()
export class OptimizeTeamUseCase {
  execute(input: OptimizeInput): OptimizeResponse {
    const { filteredRiders, lockedRiders, adjustedBudget, adjustedTeamSize } = applyConstraints(
      input.riders,
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
