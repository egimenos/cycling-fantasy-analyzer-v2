import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { OptimizeController } from '../optimize.controller';
import { OptimizeTeamUseCase } from '../../application/optimize/optimize-team.use-case';
import {
  InsufficientRidersError,
  ConflictingConstraintsError,
  BudgetExceededByLockedRidersError,
  RiderNotFoundError,
} from '../../domain/optimizer/errors';

describe('OptimizeController', () => {
  let controller: OptimizeController;
  let mockUseCase: jest.Mocked<Pick<OptimizeTeamUseCase, 'execute'>>;

  const analyzedRider = {
    rawName: 'Pogacar Tadej',
    rawTeam: 'UAE',
    priceHillios: 100,
    matchedRider: {
      id: 'pogacar-tadej',
      pcsSlug: 'pogacar-tadej',
      fullName: 'Tadej Pogacar',
      currentTeam: 'UAE',
    },
    matchConfidence: 1,
    unmatched: false,
    compositeScore: 50,
    pointsPerHillio: 0.5,
    totalProjectedPts: 50,
    categoryScores: { gc: 10, stage: 10, mountain: 10, sprint: 10 },
    seasonsUsed: 3,
    seasonBreakdown: [],
    scoringMethod: 'rules' as const,
    mlPredictedScore: null,
    mlBreakdown: null,
    breakout: null,
  };

  const domainRider = {
    id: 'Pogacar Tadej',
    name: 'Pogacar Tadej',
    priceHillios: 100,
    totalProjectedPts: 50,
    mlPredictedScore: undefined,
    categoryScores: { gc: 10, stage: 10, mountain: 10, sprint: 10 },
  };

  const sampleResponse = {
    optimalTeam: {
      riders: [domainRider],
      totalCostHillios: 100,
      totalProjectedPts: 50,
      budgetRemaining: 900,
      scoreBreakdown: { gc: 10, stage: 10, mountain: 10, sprint: 10 },
    },
    alternativeTeams: [],
  };

  beforeEach(async () => {
    mockUseCase = {
      execute: jest.fn().mockReturnValue(sampleResponse),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OptimizeController],
      providers: [{ provide: OptimizeTeamUseCase, useValue: mockUseCase }],
    }).compile();

    controller = module.get<OptimizeController>(OptimizeController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should map AnalyzedRider to ScoredRider and call use case', () => {
    const dto = {
      riders: [analyzedRider],
      budget: 1000,
      mustInclude: [] as string[],
      mustExclude: [] as string[],
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test DTO
    const result = controller.optimize(dto as any);

    expect(mockUseCase.execute).toHaveBeenCalledWith({
      riders: [domainRider],
      budget: 1000,
      mustInclude: [],
      mustExclude: [],
    });

    // Response should map domain riders back to AnalyzedRider
    expect(result.optimalTeam.riders).toEqual([analyzedRider]);
  });

  it('should filter out unmatched riders', () => {
    const unmatchedRider = {
      ...analyzedRider,
      rawName: 'Unknown',
      unmatched: true,
      totalProjectedPts: null,
      categoryScores: null,
    };
    const dto = {
      riders: [analyzedRider, unmatchedRider],
      budget: 1000,
      mustInclude: [] as string[],
      mustExclude: [] as string[],
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test DTO
    controller.optimize(dto as any);

    expect(mockUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({ riders: [domainRider] }),
    );
  });

  it('should map InsufficientRidersError to 422', () => {
    mockUseCase.execute.mockImplementation(() => {
      throw new InsufficientRidersError(5, 9);
    });

    expect(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test DTO
      controller.optimize({ riders: [], budget: 1000, mustInclude: [], mustExclude: [] } as any),
    ).toThrow(HttpException);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test DTO
      controller.optimize({ riders: [], budget: 1000, mustInclude: [], mustExclude: [] } as any);
    } catch (e) {
      expect((e as HttpException).getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    }
  });

  it('should map ConflictingConstraintsError to 400', () => {
    mockUseCase.execute.mockImplementation(() => {
      throw new ConflictingConstraintsError(['r1']);
    });

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test DTO
      controller.optimize({ riders: [], budget: 1000, mustInclude: [], mustExclude: [] } as any);
    } catch (e) {
      expect((e as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
    }
  });

  it('should map BudgetExceededByLockedRidersError to 400', () => {
    mockUseCase.execute.mockImplementation(() => {
      throw new BudgetExceededByLockedRidersError(1500, 1000);
    });

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test DTO
      controller.optimize({ riders: [], budget: 1000, mustInclude: [], mustExclude: [] } as any);
    } catch (e) {
      expect((e as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
    }
  });

  it('should map RiderNotFoundError to 400', () => {
    mockUseCase.execute.mockImplementation(() => {
      throw new RiderNotFoundError('unknown');
    });

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test DTO
      controller.optimize({ riders: [], budget: 1000, mustInclude: [], mustExclude: [] } as any);
    } catch (e) {
      expect((e as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
    }
  });

  it('should re-throw unknown errors', () => {
    mockUseCase.execute.mockImplementation(() => {
      throw new Error('unexpected');
    });

    expect(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test DTO
      controller.optimize({ riders: [], budget: 1000, mustInclude: [], mustExclude: [] } as any),
    ).toThrow('unexpected');
  });
});
