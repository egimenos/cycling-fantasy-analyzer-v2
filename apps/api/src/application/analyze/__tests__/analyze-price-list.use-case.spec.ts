import { EmptyPriceListError } from '../../../domain/analyze/errors';
import { AnalyzePriceListUseCase } from '../analyze-price-list.use-case';
import { RiderMatcherPort } from '../../../domain/matching/rider-matcher.port';
import { RiderRepositoryPort } from '../../../domain/rider/rider.repository.port';
import { RaceResultRepositoryPort } from '../../../domain/race-result/race-result.repository.port';
import { MlScoringPort } from '../../../domain/scoring/ml-scoring.port';
import { MlScoreRepositoryPort } from '../../../domain/ml-score/ml-score.repository.port';
import { ScoringService } from '../../../domain/scoring/scoring.service';
import { Rider } from '../../../domain/rider/rider.entity';
import { RaceResult } from '../../../domain/race-result/race-result.entity';
import { RaceType } from '../../../domain/shared/race-type.enum';
import { RaceClass } from '../../../domain/shared/race-class.enum';
import { ResultCategory } from '../../../domain/shared/result-category.enum';
import { FetchStartlistUseCase } from '../../benchmark/fetch-startlist.use-case';

function createMockRider(
  overrides: Partial<{
    id: string;
    pcsSlug: string;
    fullName: string;
    normalizedName: string;
    currentTeam: string | null;
    nationality: string | null;
    birthDate: Date | null;
    lastScrapedAt: Date | null;
  }> = {},
): Rider {
  return Rider.reconstitute({
    id: overrides.id ?? 'rider-1',
    pcsSlug: overrides.pcsSlug ?? 'pogacar-tadej',
    fullName: overrides.fullName ?? 'Pogacar Tadej',
    normalizedName: overrides.normalizedName ?? 'pogacar tadej',
    currentTeam: overrides.currentTeam ?? 'UAE Team Emirates',
    nationality: overrides.nationality ?? 'SI',
    birthDate: overrides.birthDate ?? null,
    lastScrapedAt: overrides.lastScrapedAt ?? null,
  });
}

function createMockRaceResult(
  overrides: Partial<{
    id: string;
    riderId: string;
    raceSlug: string;
    raceName: string;
    raceType: RaceType;
    raceClass: RaceClass;
    year: number;
    category: ResultCategory;
    position: number | null;
    stageNumber: number | null;
    dnf: boolean;
    scrapedAt: Date;
  }> = {},
): RaceResult {
  return RaceResult.reconstitute({
    id: overrides.id ?? 'result-1',
    riderId: overrides.riderId ?? 'rider-1',
    raceSlug: overrides.raceSlug ?? 'tour-de-france',
    raceName: overrides.raceName ?? 'Tour de France',
    raceType: overrides.raceType ?? RaceType.GRAND_TOUR,
    raceClass: overrides.raceClass ?? RaceClass.UWT,
    year: overrides.year ?? new Date().getFullYear(),
    category: overrides.category ?? ResultCategory.GC,
    position: overrides.position === undefined ? 1 : overrides.position,
    stageNumber: overrides.stageNumber ?? null,
    dnf: overrides.dnf ?? false,
    scrapedAt: overrides.scrapedAt ?? new Date(),
    parcoursType: null,
    isItt: false,
    isTtt: false,
    profileScore: null,
    raceDate: null,
    climbCategory: null,
    climbName: null,
    sprintName: null,
    kmMarker: null,
  });
}

describe('AnalyzePriceListUseCase', () => {
  let useCase: AnalyzePriceListUseCase;
  let mockMatcher: jest.Mocked<RiderMatcherPort>;
  let mockRiderRepo: jest.Mocked<RiderRepositoryPort>;
  let mockResultRepo: jest.Mocked<RaceResultRepositoryPort>;
  let mockMlScoring: jest.Mocked<MlScoringPort>;
  let mockMlScoreRepo: jest.Mocked<MlScoreRepositoryPort>;
  let scoringService: ScoringService;

  beforeEach(() => {
    mockMatcher = {
      matchRider: jest.fn(),
      loadRiders: jest.fn(),
    };

    mockRiderRepo = {
      findAll: jest.fn(),
      findByPcsSlug: jest.fn(),
      findByPcsSlugs: jest.fn(),
      findByIds: jest.fn(),
      save: jest.fn(),
      saveMany: jest.fn(),
    };

    mockResultRepo = {
      findByRider: jest.fn(),
      findByRiderIds: jest.fn(),
      findByRace: jest.fn(),
      findByRiderIdsBeforeDate: jest.fn(),
      findByRiderIdsAndRaceSlug: jest.fn().mockResolvedValue([]),
      findDistinctRacesWithDate: jest.fn(),
      saveMany: jest.fn(),
    };

    mockMlScoring = {
      predictRace: jest.fn().mockResolvedValue(null),
      getModelVersion: jest.fn().mockResolvedValue(null),
      isHealthy: jest.fn().mockResolvedValue(false),
    };

    mockMlScoreRepo = {
      findByRace: jest.fn().mockResolvedValue([]),
      findLatestModelVersion: jest.fn().mockResolvedValue(null),
      saveMany: jest.fn().mockResolvedValue(undefined),
      deleteByRace: jest.fn().mockResolvedValue(0),
      deleteAll: jest.fn().mockResolvedValue(0),
    };

    scoringService = new ScoringService();

    const mockFetchStartlist = {
      execute: jest.fn().mockResolvedValue({ entries: [], fromCache: true }),
    } as unknown as FetchStartlistUseCase;

    useCase = new AnalyzePriceListUseCase(
      mockMatcher,
      mockRiderRepo,
      mockResultRepo,
      scoringService,
      mockMlScoring,
      mockMlScoreRepo,
      mockFetchStartlist,
    );
  });

  it('should return analyzed riders sorted by score descending', async () => {
    const rider1 = createMockRider({
      id: 'r1',
      fullName: 'Pogacar Tadej',
      pcsSlug: 'pogacar-tadej',
    });
    const rider2 = createMockRider({
      id: 'r2',
      fullName: 'Vingegaard Jonas',
      pcsSlug: 'vingegaard-jonas',
      currentTeam: 'Visma',
    });

    mockRiderRepo.findAll.mockResolvedValue([rider1, rider2]);

    mockMatcher.matchRider
      .mockResolvedValueOnce({ matchedRiderId: 'r1', confidence: 0.95, unmatched: false })
      .mockResolvedValueOnce({ matchedRiderId: 'r2', confidence: 0.9, unmatched: false });

    const currentYear = new Date().getFullYear();
    mockResultRepo.findByRiderIds.mockResolvedValue([
      createMockRaceResult({
        riderId: 'r1',
        category: ResultCategory.GC,
        position: 1,
        year: currentYear,
      }),
      createMockRaceResult({
        riderId: 'r2',
        category: ResultCategory.GC,
        position: 5,
        year: currentYear,
      }),
    ]);

    const result = await useCase.execute({
      riders: [
        { name: 'POGACAR Tadej', team: 'UAE', price: 300 },
        { name: 'VINGEGAARD Jonas', team: 'Visma', price: 280 },
      ],
      raceType: RaceType.GRAND_TOUR,
      budget: 2000,
    });

    expect(result.totalSubmitted).toBe(2);
    expect(result.totalMatched).toBe(2);
    expect(result.unmatchedCount).toBe(0);
    expect(result.riders).toHaveLength(2);
    expect(result.riders[0].totalProjectedPts).not.toBeNull();
    expect(result.riders[1].totalProjectedPts).not.toBeNull();
    expect(result.riders[0].totalProjectedPts!).toBeGreaterThanOrEqual(
      result.riders[1].totalProjectedPts!,
    );
  });

  it('should handle partially unmatched riders', async () => {
    const rider1 = createMockRider({ id: 'r1' });
    mockRiderRepo.findAll.mockResolvedValue([rider1]);

    mockMatcher.matchRider
      .mockResolvedValueOnce({ matchedRiderId: 'r1', confidence: 0.95, unmatched: false })
      .mockResolvedValueOnce({ matchedRiderId: null, confidence: 0, unmatched: true });

    const currentYear = new Date().getFullYear();
    mockResultRepo.findByRiderIds.mockResolvedValue([
      createMockRaceResult({ riderId: 'r1', year: currentYear }),
    ]);

    const result = await useCase.execute({
      riders: [
        { name: 'POGACAR Tadej', team: 'UAE', price: 300 },
        { name: 'UNKNOWN RIDER', team: '', price: 100 },
      ],
      raceType: RaceType.GRAND_TOUR,
      budget: 2000,
    });

    expect(result.totalSubmitted).toBe(2);
    expect(result.totalMatched).toBe(1);
    expect(result.unmatchedCount).toBe(1);

    const matchedRider = result.riders.find((r) => !r.unmatched);
    const unmatchedRider = result.riders.find((r) => r.unmatched);

    expect(matchedRider).toBeDefined();
    expect(matchedRider!.totalProjectedPts).not.toBeNull();
    expect(unmatchedRider).toBeDefined();
    expect(unmatchedRider!.totalProjectedPts).toBeNull();
    expect(unmatchedRider!.categoryScores).toBeNull();
  });

  it('should throw EmptyPriceListError for zero valid riders', async () => {
    await expect(
      useCase.execute({
        riders: [{ name: '', team: '', price: 0 }],
        raceType: RaceType.GRAND_TOUR,
        budget: 2000,
      }),
    ).rejects.toThrow(EmptyPriceListError);
  });

  it('should handle all riders unmatched', async () => {
    mockRiderRepo.findAll.mockResolvedValue([]);
    mockMatcher.matchRider.mockResolvedValue({
      matchedRiderId: null,
      confidence: 0,
      unmatched: true,
    });
    mockResultRepo.findByRiderIds.mockResolvedValue([]);

    const result = await useCase.execute({
      riders: [
        { name: 'Unknown A', team: '', price: 100 },
        { name: 'Unknown B', team: '', price: 200 },
      ],
      raceType: RaceType.GRAND_TOUR,
      budget: 2000,
    });

    expect(result.totalMatched).toBe(0);
    expect(result.unmatchedCount).toBe(2);
    expect(result.riders.every((r) => r.totalProjectedPts === null)).toBe(true);
  });

  it('should include matchedRider info for matched riders', async () => {
    const rider = createMockRider({
      id: 'r1',
      pcsSlug: 'pogacar-tadej',
      fullName: 'Pogacar Tadej',
      currentTeam: 'UAE Team Emirates',
    });

    mockRiderRepo.findAll.mockResolvedValue([rider]);
    mockMatcher.matchRider.mockResolvedValue({
      matchedRiderId: 'r1',
      confidence: 0.95,
      unmatched: false,
    });
    mockResultRepo.findByRiderIds.mockResolvedValue([]);

    const result = await useCase.execute({
      riders: [{ name: 'POGACAR', team: 'UAE', price: 300 }],
      raceType: RaceType.GRAND_TOUR,
      budget: 2000,
    });

    expect(result.riders[0].matchedRider).toEqual({
      id: 'r1',
      pcsSlug: 'pogacar-tadej',
      fullName: 'Pogacar Tadej',
      currentTeam: 'UAE Team Emirates',
    });
    expect(result.riders[0].matchConfidence).toBe(0.95);
  });

  it('should batch race result fetching by rider IDs', async () => {
    const rider1 = createMockRider({ id: 'r1' });
    const rider2 = createMockRider({ id: 'r2', pcsSlug: 'vingegaard-jonas' });

    mockRiderRepo.findAll.mockResolvedValue([rider1, rider2]);
    mockMatcher.matchRider
      .mockResolvedValueOnce({ matchedRiderId: 'r1', confidence: 0.9, unmatched: false })
      .mockResolvedValueOnce({ matchedRiderId: 'r2', confidence: 0.9, unmatched: false });
    mockResultRepo.findByRiderIds.mockResolvedValue([]);

    await useCase.execute({
      riders: [
        { name: 'Rider A', team: '', price: 100 },
        { name: 'Rider B', team: '', price: 200 },
      ],
      raceType: RaceType.GRAND_TOUR,
      budget: 2000,
    });

    expect(mockResultRepo.findByRiderIds).toHaveBeenCalledTimes(1);
    expect(mockResultRepo.findByRiderIds).toHaveBeenCalledWith(['r1', 'r2']);
  });
});
