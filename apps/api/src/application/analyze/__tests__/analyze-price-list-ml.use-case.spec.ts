/**
 * Tests for AnalyzePriceListUseCase — ML integration behavior.
 *
 * The use case relies exclusively on ML predictions for scoring.
 * When ML is unavailable (no raceSlug/year, service down), the use case
 * throws MlServiceUnavailableError.
 */

import { AnalyzePriceListUseCase } from '../analyze-price-list.use-case';
import { MlServiceUnavailableError } from '../../../domain/analyze/errors';
import { RiderMatcherPort } from '../../../domain/matching/rider-matcher.port';
import { RiderRepositoryPort } from '../../../domain/rider/rider.repository.port';
import { RaceResultRepositoryPort } from '../../../domain/race-result/race-result.repository.port';
import { MlScoringPort } from '../../../domain/scoring/ml-scoring.port';
import { MlScoreRepositoryPort } from '../../../domain/ml-score/ml-score.repository.port';
import { Rider } from '../../../domain/rider/rider.entity';
import { RaceResult } from '../../../domain/race-result/race-result.entity';
import { RaceType } from '../../../domain/shared/race-type.enum';
import { RaceClass } from '../../../domain/shared/race-class.enum';
import { ResultCategory } from '../../../domain/shared/result-category.enum';
import { FetchStartlistUseCase } from '../../benchmark/fetch-startlist.use-case';
import { ScoringService } from '../../../domain/scoring/scoring.service';

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

    const mockFetchStartlist = {
      execute: jest.fn().mockResolvedValue({ entries: [], fromCache: true }),
    } as unknown as FetchStartlistUseCase;

    useCase = new AnalyzePriceListUseCase(
      mockMatcher,
      mockRiderRepo,
      mockResultRepo,
      new ScoringService(),
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

  function setupMlCache(riderScores: { riderId: string; score: number }[]) {
    const year = new Date().getFullYear();
    mockMlScoring.getModelVersion.mockResolvedValue('v1');
    mockMlScoreRepo.findByRace.mockResolvedValue(
      riderScores.map((rs, i) => ({
        id: String(i),
        riderId: rs.riderId,
        raceSlug: 'tour-de-france',
        year,
        predictedScore: rs.score,
        modelVersion: 'v1',
        gcPts: rs.score,
        stagePts: 0,
        mountainPts: 0,
        sprintPts: 0,
        createdAt: new Date(),
      })),
    );
  }

  it('should throw MlServiceUnavailableError when no raceSlug provided', async () => {
    setupMatchedRider('r1', 'Pogacar Tadej');
    mockResultRepo.findByRiderIds.mockResolvedValue([]);

    await expect(
      useCase.execute({
        riders: [{ name: 'POGACAR Tadej', team: 'UAE', price: 300 }],
        raceType: RaceType.GRAND_TOUR,
        budget: 2000,
      }),
    ).rejects.toThrow(MlServiceUnavailableError);
  });

  it('should throw MlServiceUnavailableError when ML service is down', async () => {
    setupMatchedRider('r1', 'Pogacar Tadej');
    mockResultRepo.findByRiderIds.mockResolvedValue([]);
    // getModelVersion returns null → ML unavailable
    mockMlScoring.getModelVersion.mockResolvedValue(null);

    await expect(
      useCase.execute({
        riders: [{ name: 'POGACAR Tadej', team: 'UAE', price: 300 }],
        raceType: RaceType.GRAND_TOUR,
        raceSlug: 'tour-de-france',
        year: new Date().getFullYear(),
        budget: 2000,
      }),
    ).rejects.toThrow(MlServiceUnavailableError);
  });

  it('should produce ML-based scoring for stage races', async () => {
    setupMatchedRider('r1', 'Pogacar Tadej');

    const currentYear = new Date().getFullYear();
    mockResultRepo.findByRiderIds.mockResolvedValue([
      createMockRaceResult({
        riderId: 'r1',
        raceType: RaceType.GRAND_TOUR,
        category: ResultCategory.GC,
        position: 1,
        year: currentYear,
      }),
    ]);
    setupMlCache([{ riderId: 'r1', score: 250 }]);

    const result = await useCase.execute({
      riders: [{ name: 'POGACAR Tadej', team: 'UAE', price: 300 }],
      raceType: RaceType.GRAND_TOUR,
      raceSlug: 'tour-de-france',
      year: currentYear,
      budget: 2000,
    });

    expect(result.riders).toHaveLength(1);
    const rider = result.riders[0];
    expect(rider.totalProjectedPts).toBe(250);
  });

  it('should produce ML-based scoring for classics', async () => {
    setupMatchedRider('r1', 'Van der Poel Mathieu');

    const currentYear = new Date().getFullYear();
    mockResultRepo.findByRiderIds.mockResolvedValue([
      createMockRaceResult({
        riderId: 'r1',
        raceType: RaceType.CLASSIC,
        category: ResultCategory.GC,
        position: 1,
        year: currentYear,
      }),
    ]);

    mockMlScoring.getModelVersion.mockResolvedValue('v1');
    mockMlScoreRepo.findByRace.mockResolvedValue([
      {
        id: '1',
        riderId: 'r1',
        raceSlug: 'milano-sanremo',
        year: currentYear,
        predictedScore: 180,
        modelVersion: 'v1',
        gcPts: 180,
        stagePts: 0,
        mountainPts: 0,
        sprintPts: 0,
        createdAt: new Date(),
      },
    ]);

    const result = await useCase.execute({
      riders: [{ name: 'VAN DER POEL Mathieu', team: 'Alpecin', price: 300 }],
      raceType: RaceType.CLASSIC,
      raceSlug: 'milano-sanremo',
      year: currentYear,
      budget: 2000,
    });

    expect(result.riders).toHaveLength(1);
    expect(result.riders[0].totalProjectedPts).toBe(180);
  });

  it('should produce deterministic results for identical inputs', async () => {
    setupMatchedRider('r1', 'Pogacar Tadej');

    const currentYear = new Date().getFullYear();
    mockResultRepo.findByRiderIds.mockResolvedValue([
      createMockRaceResult({
        riderId: 'r1',
        raceType: RaceType.GRAND_TOUR,
        category: ResultCategory.GC,
        position: 2,
        year: currentYear,
      }),
    ]);
    setupMlCache([{ riderId: 'r1', score: 180 }]);

    const executeInput = {
      riders: [{ name: 'POGACAR Tadej', team: 'UAE', price: 300 }],
      raceType: RaceType.GRAND_TOUR as const,
      raceSlug: 'tour-de-france',
      year: currentYear,
      budget: 2000,
    };

    const result1 = await useCase.execute(executeInput);

    // Run again with same mocks
    mockRiderRepo.findAll.mockResolvedValue([
      createMockRider({ id: 'r1', fullName: 'Pogacar Tadej', pcsSlug: 'pogacar-tadej' }),
    ]);
    mockMatcher.matchRider.mockResolvedValue({
      matchedRiderId: 'r1',
      confidence: 0.95,
      unmatched: false,
    });

    const result2 = await useCase.execute(executeInput);

    expect(result2.riders[0].totalProjectedPts).toBe(result1.riders[0].totalProjectedPts);
  });
});
