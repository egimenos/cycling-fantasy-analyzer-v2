export class InsufficientRidersError extends Error {
  constructor(available: number, required: number) {
    super(`Not enough riders: ${available} available, ${required} required`);
    this.name = 'InsufficientRidersError';
  }
}

export class ConflictingConstraintsError extends Error {
  constructor(riderIds: string[]) {
    super(`Rider IDs appear in both mustInclude and mustExclude: ${riderIds.join(', ')}`);
    this.name = 'ConflictingConstraintsError';
  }
}

export class RiderNotFoundError extends Error {
  constructor(riderId: string) {
    super(`Rider not found in pool: ${riderId}`);
    this.name = 'RiderNotFoundError';
  }
}

export class BudgetExceededByLockedRidersError extends Error {
  constructor(lockedCost: number, budget: number) {
    super(`Locked riders cost ${lockedCost} hillios, exceeding budget of ${budget}`);
    this.name = 'BudgetExceededByLockedRidersError';
  }
}
