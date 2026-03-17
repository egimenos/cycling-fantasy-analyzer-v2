import { OptimizeTeamUseCase } from './optimize-team.use-case';
import { ScoredRider } from '../../domain/optimizer/types';
import {
  InsufficientRidersError,
  ConflictingConstraintsError,
} from '../../domain/optimizer/errors';

function createRider(overrides: Partial<ScoredRider> & { id: string }): ScoredRider {
  return {
    name: 'Test Rider',
    priceHillios: 100,
    totalProjectedPts: 50,
    categoryScores: { gc: 10, stage: 10, mountain: 10, sprint: 10, final: 10 },
    ...overrides,
  };
}

describe('OptimizeTeamUseCase', () => {
  let useCase: OptimizeTeamUseCase;

  beforeEach(() => {
    useCase = new OptimizeTeamUseCase();
  });

  it('should return optimal team and alternatives', () => {
    const riders = Array.from({ length: 12 }, (_, i) =>
      createRider({
        id: `r${i}`,
        priceHillios: 100,
        totalProjectedPts: 10 + i * 10,
      }),
    );

    const result = useCase.execute({
      riders,
      budget: 1000,
      mustInclude: [],
      mustExclude: [],
    });

    expect(result.optimalTeam.riders).toHaveLength(9);
    expect(result.optimalTeam.totalCostHillios).toBeLessThanOrEqual(1000);
    expect(result.alternativeTeams.length).toBeGreaterThanOrEqual(0);
  });

  it('should include locked riders in the optimal team', () => {
    const riders = Array.from({ length: 12 }, (_, i) =>
      createRider({
        id: `r${i}`,
        priceHillios: 100,
        totalProjectedPts: 10 + i * 10,
      }),
    );

    const result = useCase.execute({
      riders,
      budget: 1200,
      mustInclude: ['r0'],
      mustExclude: [],
    });

    const selectedIds = result.optimalTeam.riders.map((r) => r.id);
    expect(selectedIds).toContain('r0');
    expect(result.optimalTeam.riders).toHaveLength(9);
  });

  it('should exclude riders from all teams', () => {
    const riders = Array.from({ length: 12 }, (_, i) =>
      createRider({
        id: `r${i}`,
        priceHillios: 100,
        totalProjectedPts: 10 + i * 10,
      }),
    );

    const result = useCase.execute({
      riders,
      budget: 1000,
      mustInclude: [],
      mustExclude: ['r11'],
    });

    const optimalIds = result.optimalTeam.riders.map((r) => r.id);
    expect(optimalIds).not.toContain('r11');

    for (const alt of result.alternativeTeams) {
      const altIds = alt.riders.map((r) => r.id);
      expect(altIds).not.toContain('r11');
    }
  });

  it('should handle all team slots filled by locked riders', () => {
    const riders = Array.from({ length: 9 }, (_, i) =>
      createRider({
        id: `r${i}`,
        priceHillios: 100,
        totalProjectedPts: 50,
      }),
    );

    const result = useCase.execute({
      riders,
      budget: 1000,
      mustInclude: riders.map((r) => r.id),
      mustExclude: [],
    });

    expect(result.optimalTeam.riders).toHaveLength(9);
    expect(result.alternativeTeams).toHaveLength(0);
  });

  it('should throw for conflicting constraints', () => {
    const riders = [createRider({ id: 'r0' })];

    expect(() =>
      useCase.execute({
        riders,
        budget: 1000,
        mustInclude: ['r0'],
        mustExclude: ['r0'],
      }),
    ).toThrow(ConflictingConstraintsError);
  });

  it('should throw for insufficient riders', () => {
    const riders = Array.from({ length: 5 }, (_, i) => createRider({ id: `r${i}` }));

    expect(() =>
      useCase.execute({
        riders,
        budget: 1000,
        mustInclude: [],
        mustExclude: [],
      }),
    ).toThrow(InsufficientRidersError);
  });
});
