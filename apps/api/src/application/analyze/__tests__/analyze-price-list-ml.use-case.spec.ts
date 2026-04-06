/**
 * Tests for AnalyzePriceListUseCase — ML integration behavior.
 *
 * The use case relies exclusively on ML predictions for scoring.
 * These tests verify that the analyze use case:
 *   - Produces ML-based scores for stage races and classics
 *   - Scoring output structure is consistent regardless of race type
 *   - Produces deterministic results for identical inputs
 */

import { AnalyzePriceListUseCase } from '../analyze-price-list.use-case';
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

function createMockRider(
  overrides: Partial<{
    id: string;
    pcsSlug: string;
    fullName: string;
    normalizedName: string;
    currentTeam: string | null;
    nationality: string | null;
    avatarUrl: string | null;
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
    avatarUrl: overrides.avatarUrl ?? null,
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
      findMissingAvatars: jest.fn(),
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
      createMockRaceResult({
        riderId: 'r1',
        raceType: RaceType.GRAND_TOUR,
        category: ResultCategory.STAGE,
        position: 1,
        stageNumber: 1,
        year: currentYear,
      }),
    ]);

    // Mock ML predictions
    mockMlScoring.getModelVersion.mockResolvedValue('v1');
    mockMlScoreRepo.findByRace.mockResolvedValue([
      {
        id: '1',
        riderId: 'r1',
        raceSlug: 'tour-de-france',
        year: currentYear,
        predictedScore: 250,
        modelVersion: 'v1',
        gcPts: 150,
        stagePts: 60,
        mountainPts: 25,
        sprintPts: 15,
        createdAt: new Date(),
      },
    ]);

    const result = await useCase.execute({
      riders: [{ name: 'POGACAR Tadej', team: 'UAE', price: 300 }],
      raceType: RaceType.GRAND_TOUR,
      raceSlug: 'tour-de-france',
      year: currentYear,
      budget: 2000,
    });

    // Use case uses ML-only scoring
    expect(result.riders).toHaveLength(1);
    const rider = result.riders[0];
    expect(rider.totalProjectedPts).not.toBeNull();
    expect(rider.totalProjectedPts).toBe(250);
    expect(rider.categoryScores).not.toBeNull();
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

    // Mock ML predictions for classic
    mockMlScoring.getModelVersion.mockResolvedValue('v1');
    mockMlScoreRepo.findByRace.mockResolvedValue([
      {
        id: '1',
        riderId: 'r1',
        raceSlug: 'milano-sanremo',
        year: currentYear,
        predictedScore: 180,
        modelVersion: 'v1',
        gcPts: 0,
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
    const rider = result.riders[0];
    expect(rider.totalProjectedPts).not.toBeNull();
    expect(rider.totalProjectedPts).toBe(180);
    // Classics use ML total score; breakdown has zeroed-out categories
    expect(rider.categoryScores).toBeNull();
  });

  it('should produce deterministic results for identical inputs', async () => {
    setupMatchedRider('r1', 'Pogacar Tadej');

    const currentYear = new Date().getFullYear();
    const results = [
      createMockRaceResult({
        riderId: 'r1',
        raceType: RaceType.GRAND_TOUR,
        category: ResultCategory.GC,
        position: 2,
        year: currentYear,
      }),
    ];
    mockResultRepo.findByRiderIds.mockResolvedValue(results);

    // Mock ML predictions
    const cachedMlScores = [
      {
        id: '1',
        riderId: 'r1',
        raceSlug: 'tour-de-france',
        year: currentYear,
        predictedScore: 180,
        modelVersion: 'v1',
        gcPts: 100,
        stagePts: 50,
        mountainPts: 20,
        sprintPts: 10,
        createdAt: new Date(),
      },
    ];
    mockMlScoring.getModelVersion.mockResolvedValue('v1');
    mockMlScoreRepo.findByRace.mockResolvedValue(cachedMlScores);

    const executeInput = {
      riders: [{ name: 'POGACAR Tadej', team: 'UAE', price: 300 }],
      raceType: RaceType.GRAND_TOUR,
      raceSlug: 'tour-de-france',
      year: currentYear,
      budget: 2000,
    };

    const result = await useCase.execute(executeInput);

    const rider = result.riders[0];
    expect(rider.totalProjectedPts).not.toBeNull();

    // Run again with same inputs to verify determinism
    mockRiderRepo.findAll.mockResolvedValue([
      createMockRider({ id: 'r1', fullName: 'Pogacar Tadej', pcsSlug: 'pogacar-tadej' }),
    ]);
    mockMatcher.matchRider.mockResolvedValue({
      matchedRiderId: 'r1',
      confidence: 0.95,
      unmatched: false,
    });
    mockResultRepo.findByRiderIds.mockResolvedValue(results);
    mockMlScoreRepo.findByRace.mockResolvedValue(cachedMlScores);

    const result2 = await useCase.execute(executeInput);

    expect(result2.riders[0].totalProjectedPts).toBe(rider.totalProjectedPts);
    expect(result2.riders[0].categoryScores).toEqual(rider.categoryScores);
  });

  it('should preserve full category breakdown in scoring response', async () => {
    setupMatchedRider('r1', 'Evenepoel Remco');

    const currentYear = new Date().getFullYear();
    mockResultRepo.findByRiderIds.mockResolvedValue([
      createMockRaceResult({
        riderId: 'r1',
        raceType: RaceType.GRAND_TOUR,
        category: ResultCategory.GC,
        position: 1,
        year: currentYear,
      }),
      createMockRaceResult({
        riderId: 'r1',
        raceType: RaceType.GRAND_TOUR,
        category: ResultCategory.STAGE,
        position: 2,
        stageNumber: 5,
        year: currentYear,
      }),
      createMockRaceResult({
        riderId: 'r1',
        raceType: RaceType.GRAND_TOUR,
        category: ResultCategory.MOUNTAIN,
        position: 3,
        year: currentYear,
      }),
    ]);

    // Mock ML predictions with full category breakdown
    mockMlScoring.getModelVersion.mockResolvedValue('v1');
    mockMlScoreRepo.findByRace.mockResolvedValue([
      {
        id: '1',
        riderId: 'r1',
        raceSlug: 'tour-de-france',
        year: currentYear,
        predictedScore: 220,
        modelVersion: 'v1',
        gcPts: 120,
        stagePts: 50,
        mountainPts: 30,
        sprintPts: 20,
        createdAt: new Date(),
      },
    ]);

    const result = await useCase.execute({
      riders: [{ name: 'EVENEPOEL Remco', team: 'Soudal', price: 280 }],
      raceType: RaceType.GRAND_TOUR,
      raceSlug: 'tour-de-france',
      year: currentYear,
      budget: 2000,
    });

    const rider = result.riders[0];
    expect(rider.categoryScores).not.toBeNull();
    // Verify all four category score keys exist
    expect(rider.categoryScores).toHaveProperty('gc');
    expect(rider.categoryScores).toHaveProperty('stage');
    expect(rider.categoryScores).toHaveProperty('mountain');
    expect(rider.categoryScores).toHaveProperty('sprint');
  });
});
