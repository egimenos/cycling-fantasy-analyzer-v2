import { findOptimalTeam, buildTeamSelection } from './knapsack.service';
import { ScoredRider } from './types';
import { InsufficientRidersError } from './errors';

function createRider(overrides: Partial<ScoredRider> & { id: string }): ScoredRider {
  return {
    name: 'Test Rider',
    priceHillios: 100,
    totalProjectedPts: 50,
    categoryScores: { gc: 10, stage: 10, mountain: 10, sprint: 10, final: 10 },
    ...overrides,
  };
}

describe('findOptimalTeam', () => {
  it('should select the optimal team of exactly teamSize riders', () => {
    const riders: ScoredRider[] = [];
    for (let i = 0; i < 10; i++) {
      riders.push(
        createRider({
          id: `r${i}`,
          priceHillios: 100 + i * 10,
          totalProjectedPts: 50 + i * 20,
        }),
      );
    }

    const result = findOptimalTeam(riders, 2000, 9);

    expect(result.riders).toHaveLength(9);
    expect(result.totalCostHillios).toBeLessThanOrEqual(2000);
    expect(result.budgetRemaining).toBeGreaterThanOrEqual(0);
  });

  it('should never exceed budget', () => {
    const riders = Array.from({ length: 12 }, (_, i) =>
      createRider({
        id: `r${i}`,
        priceHillios: 50 + i * 10,
        totalProjectedPts: 100 - i * 5,
      }),
    );

    const result = findOptimalTeam(riders, 500, 5);

    expect(result.totalCostHillios).toBeLessThanOrEqual(500);
    expect(result.riders).toHaveLength(5);
  });

  it('should pick top riders by score when all have the same price', () => {
    const riders = Array.from({ length: 12 }, (_, i) =>
      createRider({
        id: `r${i}`,
        priceHillios: 100,
        totalProjectedPts: (i + 1) * 10,
      }),
    );

    const result = findOptimalTeam(riders, 1200, 9);

    expect(result.riders).toHaveLength(9);
    // Should pick the 9 riders with highest scores (r3..r11 = 40..120)
    const selectedIds = new Set(result.riders.map((r) => r.id));
    // The 3 cheapest riders by score (r0=10, r1=20, r2=30) should be excluded
    expect(selectedIds.has('r0')).toBe(false);
    expect(selectedIds.has('r1')).toBe(false);
    expect(selectedIds.has('r2')).toBe(false);
  });

  it('should not select a rider that costs too much even with high score', () => {
    const riders = [
      createRider({ id: 'expensive', priceHillios: 900, totalProjectedPts: 500 }),
      ...Array.from({ length: 9 }, (_, i) =>
        createRider({
          id: `cheap${i}`,
          priceHillios: 100,
          totalProjectedPts: 30,
        }),
      ),
    ];

    // Budget 950 can fit the expensive rider + 0 more (need 2 more but only 50 left)
    // With teamSize 3 and budget 250: expensive (900) can't fit with 2 others (200)
    const result = findOptimalTeam(riders, 350, 3);

    expect(result.riders).toHaveLength(3);
    expect(result.totalCostHillios).toBeLessThanOrEqual(350);
    // Expensive rider (900) can't fit in 350 budget with 2 others
    expect(result.riders.find((r) => r.id === 'expensive')).toBeUndefined();
  });

  it('should return all riders when exactly teamSize riders are available within budget', () => {
    const riders = Array.from({ length: 3 }, (_, i) =>
      createRider({ id: `r${i}`, priceHillios: 100, totalProjectedPts: 50 }),
    );

    const result = findOptimalTeam(riders, 300, 3);

    expect(result.riders).toHaveLength(3);
    expect(result.totalCostHillios).toBe(300);
    expect(result.budgetRemaining).toBe(0);
  });

  it('should throw InsufficientRidersError when fewer than teamSize riders available', () => {
    const riders = [createRider({ id: 'r0' }), createRider({ id: 'r1' })];

    expect(() => findOptimalTeam(riders, 1000, 3)).toThrow(InsufficientRidersError);
  });

  it('should throw when budget is 0', () => {
    const riders = [createRider({ id: 'r0' })];

    expect(() => findOptimalTeam(riders, 0, 1)).toThrow();
  });

  it('should return empty team when teamSize is 0', () => {
    const riders = [createRider({ id: 'r0' })];

    const result = findOptimalTeam(riders, 1000, 0);

    expect(result.riders).toHaveLength(0);
    expect(result.totalCostHillios).toBe(0);
    expect(result.totalProjectedPts).toBe(0);
    expect(result.budgetRemaining).toBe(1000);
  });

  it('should handle riders with 0 score', () => {
    const riders = [
      createRider({ id: 'r0', totalProjectedPts: 0, priceHillios: 50 }),
      createRider({ id: 'r1', totalProjectedPts: 100, priceHillios: 50 }),
      createRider({ id: 'r2', totalProjectedPts: 0, priceHillios: 50 }),
    ];

    const result = findOptimalTeam(riders, 150, 2);

    expect(result.riders).toHaveLength(2);
    expect(result.riders.find((r) => r.id === 'r1')).toBeDefined();
  });

  it('should complete within 1 second for 50 riders', () => {
    const riders = Array.from({ length: 50 }, (_, i) =>
      createRider({
        id: `r${i}`,
        priceHillios: 50 + Math.floor(i * 4.5),
        totalProjectedPts: 10 + i * 5,
      }),
    );

    const start = Date.now();
    const result = findOptimalTeam(riders, 2000, 9);
    const elapsed = Date.now() - start;

    expect(result.riders).toHaveLength(9);
    expect(result.totalCostHillios).toBeLessThanOrEqual(2000);
    expect(elapsed).toBeLessThan(1000);
  });

  it('should handle zero budget remaining (exact fit)', () => {
    const riders = Array.from({ length: 3 }, (_, i) =>
      createRider({
        id: `r${i}`,
        priceHillios: 100,
        totalProjectedPts: 50 + i * 10,
      }),
    );

    const result = findOptimalTeam(riders, 300, 3);

    expect(result.budgetRemaining).toBe(0);
  });

  it('should throw when budget cannot fit teamSize riders', () => {
    const riders = Array.from({ length: 5 }, (_, i) =>
      createRider({ id: `r${i}`, priceHillios: 200 }),
    );

    expect(() => findOptimalTeam(riders, 100, 3)).toThrow();
  });
});

describe('buildTeamSelection', () => {
  it('should aggregate scores correctly', () => {
    const riders = [
      createRider({
        id: 'r0',
        priceHillios: 100,
        totalProjectedPts: 50,
        categoryScores: { gc: 20, stage: 10, mountain: 5, sprint: 5, final: 10 },
      }),
      createRider({
        id: 'r1',
        priceHillios: 150,
        totalProjectedPts: 70,
        categoryScores: { gc: 30, stage: 15, mountain: 10, sprint: 5, final: 10 },
      }),
    ];

    const result = buildTeamSelection(riders, 500);

    expect(result.totalCostHillios).toBe(250);
    expect(result.totalProjectedPts).toBe(120);
    expect(result.budgetRemaining).toBe(250);
    expect(result.scoreBreakdown).toEqual({
      gc: 50,
      stage: 25,
      mountain: 15,
      sprint: 10,
      final: 20,
    });
  });
});
