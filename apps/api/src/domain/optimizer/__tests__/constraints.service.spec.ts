import { applyConstraints } from '../constraints.service';
import { ScoredRider } from '../types';
import {
  ConflictingConstraintsError,
  RiderNotFoundError,
  BudgetExceededByLockedRidersError,
  InsufficientRidersError,
} from '../errors';

function createRider(overrides: Partial<ScoredRider> & { id: string }): ScoredRider {
  return {
    name: 'Test Rider',
    priceHillios: 100,
    totalProjectedPts: 50,
    categoryScores: { gc: 10, stage: 10, mountain: 10, sprint: 10 },
    ...overrides,
  };
}

describe('applyConstraints', () => {
  const riders: ScoredRider[] = Array.from({ length: 12 }, (_, i) =>
    createRider({
      id: `r${i}`,
      priceHillios: 100 + i * 10,
      totalProjectedPts: 50 + i * 5,
    }),
  );

  it('should return unchanged riders when no constraints', () => {
    const result = applyConstraints(riders, [], [], 2000, 9);

    expect(result.filteredRiders).toHaveLength(12);
    expect(result.lockedRiders).toHaveLength(0);
    expect(result.adjustedBudget).toBe(2000);
    expect(result.adjustedTeamSize).toBe(9);
  });

  it('should lock mustInclude riders and adjust budget/teamSize', () => {
    const result = applyConstraints(riders, ['r0', 'r1'], [], 2000, 9);

    expect(result.lockedRiders).toHaveLength(2);
    expect(result.lockedRiders.map((r) => r.id)).toEqual(['r0', 'r1']);
    expect(result.filteredRiders).toHaveLength(10);
    expect(result.adjustedBudget).toBe(2000 - 100 - 110); // 1790
    expect(result.adjustedTeamSize).toBe(7);
  });

  it('should exclude mustExclude riders from the pool', () => {
    const result = applyConstraints(riders, [], ['r0', 'r1', 'r2'], 2000, 9);

    expect(result.filteredRiders).toHaveLength(9);
    expect(result.filteredRiders.find((r) => r.id === 'r0')).toBeUndefined();
    expect(result.filteredRiders.find((r) => r.id === 'r1')).toBeUndefined();
    expect(result.filteredRiders.find((r) => r.id === 'r2')).toBeUndefined();
    expect(result.lockedRiders).toHaveLength(0);
    expect(result.adjustedBudget).toBe(2000);
    expect(result.adjustedTeamSize).toBe(9);
  });

  it('should handle mustInclude and mustExclude combined', () => {
    const result = applyConstraints(riders, ['r0'], ['r1'], 2000, 9);

    expect(result.lockedRiders).toHaveLength(1);
    expect(result.lockedRiders[0].id).toBe('r0');
    expect(result.filteredRiders).toHaveLength(10);
    expect(result.filteredRiders.find((r) => r.id === 'r0')).toBeUndefined();
    expect(result.filteredRiders.find((r) => r.id === 'r1')).toBeUndefined();
  });

  it('should throw ConflictingConstraintsError when rider is in both', () => {
    expect(() => applyConstraints(riders, ['r0'], ['r0'], 2000, 9)).toThrow(
      ConflictingConstraintsError,
    );
  });

  it('should throw RiderNotFoundError for missing mustInclude rider', () => {
    expect(() => applyConstraints(riders, ['nonexistent'], [], 2000, 9)).toThrow(
      RiderNotFoundError,
    );
  });

  it('should throw BudgetExceededByLockedRidersError when locked riders exceed budget', () => {
    const expensiveRiders = [
      createRider({ id: 'r0', priceHillios: 800 }),
      createRider({ id: 'r1', priceHillios: 300 }),
      createRider({ id: 'r2', priceHillios: 100 }),
    ];

    expect(() => applyConstraints(expensiveRiders, ['r0', 'r1'], [], 1000, 3)).toThrow(
      BudgetExceededByLockedRidersError,
    );
  });

  it('should throw InsufficientRidersError when not enough riders after constraints', () => {
    const smallPool = Array.from({ length: 5 }, (_, i) => createRider({ id: `r${i}` }));

    expect(() => applyConstraints(smallPool, ['r0'], ['r1', 'r2', 'r3'], 2000, 5)).toThrow(
      InsufficientRidersError,
    );
  });

  it('should handle duplicate mustInclude IDs by deduplication', () => {
    const result = applyConstraints(riders, ['r0', 'r0'], [], 2000, 9);

    expect(result.lockedRiders).toHaveLength(1);
    expect(result.lockedRiders[0].id).toBe('r0');
  });

  it('should return early when all team slots filled by locked riders', () => {
    const smallTeam = [createRider({ id: 'r0' }), createRider({ id: 'r1' })];

    const result = applyConstraints(smallTeam, ['r0', 'r1'], [], 2000, 2);

    expect(result.lockedRiders).toHaveLength(2);
    expect(result.adjustedTeamSize).toBe(0);
    expect(result.filteredRiders).toHaveLength(0);
  });
});
