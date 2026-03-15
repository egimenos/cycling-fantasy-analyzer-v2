import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { OptimizeController } from './optimize.controller';
import { OptimizeTeamUseCase } from '../application/optimize/optimize-team.use-case';
import {
  InsufficientRidersError,
  ConflictingConstraintsError,
  BudgetExceededByLockedRidersError,
  RiderNotFoundError,
} from '../domain/optimizer/errors';

describe('OptimizeController', () => {
  let controller: OptimizeController;
  let mockUseCase: jest.Mocked<Pick<OptimizeTeamUseCase, 'execute'>>;

  const sampleResponse = {
    optimalTeam: {
      riders: [],
      totalCostHillios: 900,
      totalProjectedPts: 500,
      budgetRemaining: 100,
      scoreBreakdown: { gc: 200, stage: 100, mountain: 50, sprint: 50, final: 100 },
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

  it('should call use case and return response', () => {
    const dto = {
      riders: [
        {
          id: 'r1',
          name: 'Rider 1',
          priceHillios: 100,
          totalProjectedPts: 50,
          categoryScores: { gc: 10, stage: 10, mountain: 10, sprint: 10, final: 10 },
        },
      ],
      budget: 1000,
      mustInclude: [] as string[],
      mustExclude: [] as string[],
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test DTO
    const result = controller.optimize(dto as any);

    expect(mockUseCase.execute).toHaveBeenCalledWith({
      riders: dto.riders,
      budget: dto.budget,
      mustInclude: dto.mustInclude,
      mustExclude: dto.mustExclude,
    });
    expect(result).toEqual(sampleResponse);
  });

  it('should map InsufficientRidersError to 422', () => {
    mockUseCase.execute.mockImplementation(() => {
      throw new InsufficientRidersError(5, 9);
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test DTO
    expect(() => controller.optimize({ riders: [], budget: 1000, mustInclude: [], mustExclude: [] } as any)).toThrow(
      HttpException,
    );

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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test DTO
    expect(() => controller.optimize({ riders: [], budget: 1000, mustInclude: [], mustExclude: [] } as any)).toThrow(
      'unexpected',
    );
  });
});
