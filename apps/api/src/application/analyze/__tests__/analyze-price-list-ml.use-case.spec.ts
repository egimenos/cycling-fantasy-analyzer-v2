/**
 * Tests for AnalyzePriceListUseCase — ML integration behavior.
 *
 * The use case uses ML predictions as the sole scoring source.
 * When ML is unavailable (no raceSlug/year, service down), totalProjectedPts
 * and categoryScores are null — rules-based scores are never exposed.
 */

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

describe('AnalyzePriceListUseCase — ML integration', () => {
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

  function setupMatchedRider(id: string, name: string) {
    const rider = createMockRider({
      id,
      fullName: name,
      pcsSlug: name.toLowerCase().replace(/\s/g, '-'),
    });
    mockRiderRepo.findAll.mockResolvedValue([rider]);
    mockMatcher.matchRider.mockResolvedValue({
      matchedRiderId: id,
      confidence: 0.95,
      unmatched: false,
    });
    return rider;
  }

  it('should return null totalProjectedPts when ML is unavailable (no raceSlug)', async () => {
    setupMatchedRider('r1', 'Pogacar Tadej');

    mockResultRepo.findByRiderIds.mockResolvedValue([
      createMockRaceResult({
        riderId: 'r1',
        raceType: RaceType.GRAND_TOUR,
        category: ResultCategory.GC,
        position: 1,
        year: new Date().getFullYear(),
      }),
    ]);

    const result = await useCase.execute({
      riders: [{ name: 'POGACAR Tadej', team: 'UAE', price: 300 }],
      raceType: RaceType.GRAND_TOUR,
      budget: 2000,
    });

    expect(result.riders).toHaveLength(1);
    const rider = result.riders[0];
    expect(rider.totalProjectedPts).toBeNull();
    expect(rider.categoryScores).toBeNull();
    expect(rider.scoringMethod).toBe('none');
    // Season breakdown is still available for transparency
    expect(rider.seasonsUsed).not.toBeNull();
  });

  it('should return null totalProjectedPts for classics without ML', async () => {
    setupMatchedRider('r1', 'Van der Poel Mathieu');

    mockResultRepo.findByRiderIds.mockResolvedValue([
      createMockRaceResult({
        riderId: 'r1',
        raceType: RaceType.CLASSIC,
        category: ResultCategory.GC,
        position: 1,
        year: new Date().getFullYear(),
      }),
    ]);

    const result = await useCase.execute({
      riders: [{ name: 'VAN DER POEL Mathieu', team: 'Alpecin', price: 300 }],
      raceType: RaceType.CLASSIC,
      budget: 2000,
    });

    expect(result.riders).toHaveLength(1);
    const rider = result.riders[0];
    expect(rider.totalProjectedPts).toBeNull();
    expect(rider.categoryScores).toBeNull();
    expect(rider.scoringMethod).toBe('none');
  });

  it('should produce deterministic null results when ML is unavailable', async () => {
    setupMatchedRider('r1', 'Pogacar Tadej');

    const results = [
      createMockRaceResult({
        riderId: 'r1',
        raceType: RaceType.GRAND_TOUR,
        category: ResultCategory.GC,
        position: 2,
        year: new Date().getFullYear(),
      }),
    ];
    mockResultRepo.findByRiderIds.mockResolvedValue(results);

    const result = await useCase.execute({
      riders: [{ name: 'POGACAR Tadej', team: 'UAE', price: 300 }],
      raceType: RaceType.GRAND_TOUR,
      budget: 2000,
    });

    const rider = result.riders[0];
    expect(rider.totalProjectedPts).toBeNull();

    // Run again — same null result
    mockRiderRepo.findAll.mockResolvedValue([
      createMockRider({ id: 'r1', fullName: 'Pogacar Tadej', pcsSlug: 'pogacar-tadej' }),
    ]);
    mockMatcher.matchRider.mockResolvedValue({
      matchedRiderId: 'r1',
      confidence: 0.95,
      unmatched: false,
    });
    mockResultRepo.findByRiderIds.mockResolvedValue(results);

    const result2 = await useCase.execute({
      riders: [{ name: 'POGACAR Tadej', team: 'UAE', price: 300 }],
      raceType: RaceType.GRAND_TOUR,
      budget: 2000,
    });

    expect(result2.riders[0].totalProjectedPts).toBe(rider.totalProjectedPts);
    expect(result2.riders[0].categoryScores).toEqual(rider.categoryScores);
  });

  it('should still populate seasonBreakdown even without ML', async () => {
    setupMatchedRider('r1', 'Evenepoel Remco');

    mockResultRepo.findByRiderIds.mockResolvedValue([
      createMockRaceResult({
        riderId: 'r1',
        raceType: RaceType.GRAND_TOUR,
        category: ResultCategory.GC,
        position: 1,
        year: new Date().getFullYear(),
      }),
      createMockRaceResult({
        riderId: 'r1',
        raceType: RaceType.GRAND_TOUR,
        category: ResultCategory.STAGE,
        position: 2,
        stageNumber: 5,
        year: new Date().getFullYear(),
      }),
      createMockRaceResult({
        riderId: 'r1',
        raceType: RaceType.GRAND_TOUR,
        category: ResultCategory.MOUNTAIN,
        position: 3,
        year: new Date().getFullYear(),
      }),
    ]);

    const result = await useCase.execute({
      riders: [{ name: 'EVENEPOEL Remco', team: 'Soudal', price: 280 }],
      raceType: RaceType.GRAND_TOUR,
      budget: 2000,
    });

    const rider = result.riders[0];
    // totalProjectedPts is null (no ML), but seasonBreakdown is still computed
    expect(rider.totalProjectedPts).toBeNull();
    expect(rider.categoryScores).toBeNull();
    expect(rider.seasonBreakdown).not.toBeNull();
    expect(rider.seasonBreakdown!.length).toBeGreaterThan(0);
  });
});
