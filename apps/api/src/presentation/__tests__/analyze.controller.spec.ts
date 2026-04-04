import { Test, TestingModule } from '@nestjs/testing';
import { AnalyzeController } from '../analyze.controller';
import {
  AnalyzePriceListUseCase,
  AnalyzeResponse,
} from '../../application/analyze/analyze-price-list.use-case';
import { ImportPriceListUseCase } from '../../application/analyze/import-price-list.use-case';

describe('AnalyzeController', () => {
  let controller: AnalyzeController;
  let mockUseCase: jest.Mocked<Pick<AnalyzePriceListUseCase, 'execute'>>;

  const sampleResponse: AnalyzeResponse = {
    riders: [
      {
        rawName: 'POGACAR Tadej',
        rawTeam: 'UAE',
        priceHillios: 300,
        matchedRider: {
          id: 'r1',
          pcsSlug: 'pogacar-tadej',
          fullName: 'Pogacar Tadej',
          currentTeam: 'UAE Team Emirates',
        },
        matchConfidence: 0.95,
        unmatched: false,
        pointsPerHillio: 0.67,
        totalProjectedPts: 200,
        categoryScores: { gc: 150, stage: 30, mountain: 10, sprint: 10 },
        seasonsUsed: 2,
        seasonBreakdown: null,
        scoringMethod: 'none' as const,
        mlPredictedScore: null,
        mlBreakdown: null,
        breakout: null,
        sameRaceHistory: null,
      },
    ],
    totalSubmitted: 1,
    totalMatched: 1,
    unmatchedCount: 0,
  };

  beforeEach(async () => {
    mockUseCase = {
      execute: jest.fn().mockResolvedValue(sampleResponse),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalyzeController],
      providers: [
        { provide: AnalyzePriceListUseCase, useValue: mockUseCase },
        { provide: ImportPriceListUseCase, useValue: { execute: jest.fn() } },
      ],
    }).compile();

    controller = module.get<AnalyzeController>(AnalyzeController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should call use case with correct input and return response', async () => {
    const dto = {
      riders: [{ name: 'POGACAR Tadej', team: 'UAE', price: 300 }],
      raceType: 'grand_tour' as const,
      budget: 2000,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test DTO doesn't need full class instance
    const result = await controller.analyze(dto as any);

    expect(mockUseCase.execute).toHaveBeenCalledWith({
      riders: dto.riders,
      raceType: dto.raceType,
      budget: dto.budget,
      seasons: undefined,
      profileSummary: undefined,
      raceSlug: undefined,
      year: undefined,
    });
    expect(result).toEqual(sampleResponse);
  });
});
