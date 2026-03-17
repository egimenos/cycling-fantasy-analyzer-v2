import { ScoredRider } from './types';
import {
  ConflictingConstraintsError,
  RiderNotFoundError,
  BudgetExceededByLockedRidersError,
  InsufficientRidersError,
} from './errors';

export interface ConstraintResult {
  readonly filteredRiders: ScoredRider[];
  readonly lockedRiders: ScoredRider[];
  readonly adjustedBudget: number;
  readonly adjustedTeamSize: number;
}

export function applyConstraints(
  riders: ScoredRider[],
  mustInclude: string[],
  mustExclude: string[],
  budget: number,
  teamSize: number,
): ConstraintResult {
  const includeSet = new Set(mustInclude);
  const excludeSet = new Set(mustExclude);

  // Check for conflicts
  const conflicts = mustInclude.filter((id) => excludeSet.has(id));
  if (conflicts.length > 0) {
    throw new ConflictingConstraintsError([...new Set(conflicts)]);
  }

  // Validate all mustInclude riders exist
  const riderById = new Map(riders.map((r) => [r.id, r]));
  for (const id of includeSet) {
    if (!riderById.has(id)) {
      throw new RiderNotFoundError(id);
    }
  }

  // Separate locked riders and filter excluded
  const lockedRiders: ScoredRider[] = [];
  const filteredRiders: ScoredRider[] = [];

  for (const rider of riders) {
    if (excludeSet.has(rider.id)) {
      continue;
    }
    if (includeSet.has(rider.id)) {
      lockedRiders.push(rider);
    } else {
      filteredRiders.push(rider);
    }
  }

  const lockedCost = lockedRiders.reduce((sum, r) => sum + r.priceHillios, 0);
  const adjustedBudget = budget - lockedCost;
  const adjustedTeamSize = teamSize - lockedRiders.length;

  if (adjustedBudget <= 0 && adjustedTeamSize > 0) {
    throw new BudgetExceededByLockedRidersError(lockedCost, budget);
  }

  if (adjustedTeamSize > 0 && filteredRiders.length < adjustedTeamSize) {
    throw new InsufficientRidersError(filteredRiders.length, adjustedTeamSize);
  }

  return {
    filteredRiders,
    lockedRiders,
    adjustedBudget,
    adjustedTeamSize,
  };
}
