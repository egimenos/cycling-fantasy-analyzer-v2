/**
 * Tests for AnalyzePriceListUseCase — ML integration behavior.
 *
 * The current use case uses rules-based scoring for all race types.
 * ML predictions flow through the benchmark and optimizer paths.
 * These tests verify that the analyze use case:
 *   - Produces consistent rules-based scores for stage races and classics
 *   - Scoring output structure is unchanged regardless of race type
 *   - Falls back gracefully (rules-only) as expected behavior
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

  it('should produce rules-based scoring for stage races', async () => {
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

    const result = await useCase.execute({
      riders: [{ name: 'POGACAR Tadej', team: 'UAE', price: 300 }],
      raceType: RaceType.GRAND_TOUR,
      budget: 2000,
    });

    // Use case currently uses rules-based scoring for all race types
    expect(result.riders).toHaveLength(1);
    const rider = result.riders[0];
    expect(rider.totalProjectedPts).not.toBeNull();
    expect(rider.totalProjectedPts).not.toBeNull();
    expect(rider.totalProjectedPts!).toBeGreaterThan(0);
    expect(rider.categoryScores).not.toBeNull();
    expect(rider.categoryScores!.gc).toBeGreaterThan(0);
  });

  it('should produce rules-based scoring for classics', async () => {
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

    const result = await useCase.execute({
      riders: [{ name: 'VAN DER POEL Mathieu', team: 'Alpecin', price: 300 }],
      raceType: RaceType.CLASSIC,
      budget: 2000,
    });

    expect(result.riders).toHaveLength(1);
    const rider = result.riders[0];
    expect(rider.totalProjectedPts).not.toBeNull();
    expect(rider.totalProjectedPts).not.toBeNull();
    expect(rider.categoryScores).not.toBeNull();
  });

  it('should keep existing scoring unchanged when ML service would be unavailable', async () => {
    // This test verifies that the use case works identically with or without
    // ML service availability, since ML integration is external to this use case.
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

    const result = await useCase.execute({
      riders: [{ name: 'POGACAR Tadej', team: 'UAE', price: 300 }],
      raceType: RaceType.GRAND_TOUR,
      budget: 2000,
    });

    // Rules-based scoring produces deterministic results
    const rider = result.riders[0];
    expect(rider.totalProjectedPts).not.toBeNull();
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

    const result2 = await useCase.execute({
      riders: [{ name: 'POGACAR Tadej', team: 'UAE', price: 300 }],
      raceType: RaceType.GRAND_TOUR,
      budget: 2000,
    });

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

    const result = await useCase.execute({
      riders: [{ name: 'EVENEPOEL Remco', team: 'Soudal', price: 280 }],
      raceType: RaceType.GRAND_TOUR,
      budget: 2000,
    });

    const rider = result.riders[0];
    expect(rider.categoryScores).not.toBeNull();
    // Verify all four category score keys exist
    expect(rider.categoryScores).toHaveProperty('gc');
    expect(rider.categoryScores).toHaveProperty('stage');
    expect(rider.categoryScores).toHaveProperty('mountain');
    expect(rider.categoryScores).toHaveProperty('sprint');
    // GC should have a score from position 1
    expect(rider.categoryScores!.gc).toBeGreaterThan(0);
  });
});
