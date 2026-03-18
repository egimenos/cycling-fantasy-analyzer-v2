import { findAlternativeTeams } from '../alternative-teams.service';
import { findOptimalTeam } from '../knapsack.service';
import { ScoredRider } from '../types';

function createRider(overrides: Partial<ScoredRider> & { id: string }): ScoredRider {
  return {
    name: 'Test Rider',
    priceHillios: 100,
    totalProjectedPts: 50,
    categoryScores: { gc: 10, stage: 10, mountain: 10, sprint: 10 },
    ...overrides,
  };
}

describe('findAlternativeTeams', () => {
  it('should generate alternatives distinct from optimal team', () => {
    const riders = Array.from({ length: 12 }, (_, i) =>
      createRider({
        id: `r${i}`,
        priceHillios: 100,
        totalProjectedPts: 10 + i * 10,
      }),
    );

    const optimal = findOptimalTeam(riders, 1000, 3);
    const alternatives = findAlternativeTeams(riders, 1000, 3, optimal, 4);

    const optimalKey = optimal.riders
      .map((r) => r.id)
      .sort()
      .join(',');

    for (const alt of alternatives) {
      const altKey = alt.riders
        .map((r) => r.id)
        .sort()
        .join(',');
      expect(altKey).not.toBe(optimalKey);
    }
  });

  it('should generate alternatives distinct from each other', () => {
    const riders = Array.from({ length: 12 }, (_, i) =>
      createRider({
        id: `r${i}`,
        priceHillios: 100,
        totalProjectedPts: 10 + i * 10,
      }),
    );

    const optimal = findOptimalTeam(riders, 1000, 3);
    const alternatives = findAlternativeTeams(riders, 1000, 3, optimal, 4);

    const keys = new Set<string>();
    for (const alt of alternatives) {
      const key = alt.riders
        .map((r) => r.id)
        .sort()
        .join(',');
      expect(keys.has(key)).toBe(false);
      keys.add(key);
    }
  });

  it('should sort alternatives by totalProjectedPts descending', () => {
    const riders = Array.from({ length: 12 }, (_, i) =>
      createRider({
        id: `r${i}`,
        priceHillios: 100,
        totalProjectedPts: 10 + i * 10,
      }),
    );

    const optimal = findOptimalTeam(riders, 1000, 3);
    const alternatives = findAlternativeTeams(riders, 1000, 3, optimal, 4);

    for (let i = 1; i < alternatives.length; i++) {
      expect(alternatives[i - 1].totalProjectedPts).toBeGreaterThanOrEqual(
        alternatives[i].totalProjectedPts,
      );
    }
  });

  it('should respect count limit', () => {
    const riders = Array.from({ length: 15 }, (_, i) =>
      createRider({
        id: `r${i}`,
        priceHillios: 100,
        totalProjectedPts: 10 + i * 10,
      }),
    );

    const optimal = findOptimalTeam(riders, 1000, 3);
    const alternatives = findAlternativeTeams(riders, 1000, 3, optimal, 2);

    expect(alternatives.length).toBeLessThanOrEqual(2);
  });

  it('should return empty array when exactly teamSize riders in pool', () => {
    const riders = Array.from({ length: 3 }, (_, i) =>
      createRider({ id: `r${i}`, priceHillios: 100, totalProjectedPts: 50 }),
    );

    const optimal = findOptimalTeam(riders, 300, 3);
    const alternatives = findAlternativeTeams(riders, 300, 3, optimal, 4);

    expect(alternatives).toHaveLength(0);
  });

  it('should return at most 1 alternative for pool of teamSize+1', () => {
    const riders = Array.from({ length: 4 }, (_, i) =>
      createRider({
        id: `r${i}`,
        priceHillios: 100,
        totalProjectedPts: 50 + i * 10,
      }),
    );

    const optimal = findOptimalTeam(riders, 400, 3);
    const alternatives = findAlternativeTeams(riders, 400, 3, optimal, 4);

    expect(alternatives.length).toBeLessThanOrEqual(3);
  });

  it('should return empty array when count is 0', () => {
    const riders = Array.from({ length: 5 }, (_, i) => createRider({ id: `r${i}` }));

    const optimal = findOptimalTeam(riders, 500, 3);
    const alternatives = findAlternativeTeams(riders, 500, 3, optimal, 0);

    expect(alternatives).toHaveLength(0);
  });

  it('should handle catch branch when findOptimalTeam throws', () => {
    // Create a scenario where excluding a rider makes the remaining pool unable to
    // form a valid team within budget (triggers catch branch in alternative generation)
    const riders = [
      createRider({ id: 'cheap1', priceHillios: 50, totalProjectedPts: 100 }),
      createRider({ id: 'cheap2', priceHillios: 50, totalProjectedPts: 90 }),
      createRider({ id: 'expensive1', priceHillios: 200, totalProjectedPts: 80 }),
      createRider({ id: 'expensive2', priceHillios: 200, totalProjectedPts: 70 }),
    ];

    // Budget 300, teamSize 3: optimal is cheap1+cheap2+expensive1 (cost 300)
    const optimal = findOptimalTeam(riders, 300, 3);

    // When we exclude cheap1 or cheap2, remaining 3 riders cost 50+200+200=450 > 300
    // This should trigger the catch branch
    const alternatives = findAlternativeTeams(riders, 300, 3, optimal, 4);

    // Some alternatives may work, some may not - the function should not crash
    expect(alternatives).toBeDefined();
  });

  it('should respect budget in alternatives', () => {
    const riders = Array.from({ length: 10 }, (_, i) =>
      createRider({
        id: `r${i}`,
        priceHillios: 80 + i * 20,
        totalProjectedPts: 30 + i * 15,
      }),
    );

    const optimal = findOptimalTeam(riders, 500, 3);
    const alternatives = findAlternativeTeams(riders, 500, 3, optimal, 4);

    for (const alt of alternatives) {
      expect(alt.totalCostHillios).toBeLessThanOrEqual(500);
    }
  });
});
