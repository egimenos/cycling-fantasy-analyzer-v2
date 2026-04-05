import { RunBenchmarkUseCase } from '../run-benchmark.use-case';
import { FetchStartlistUseCase, FetchStartlistOutput } from '../fetch-startlist.use-case';
import { RaceResultRepositoryPort } from '../../../domain/race-result/race-result.repository.port';
import { RiderRepositoryPort } from '../../../domain/rider/rider.repository.port';
import { MlScoringPort } from '../../../domain/scoring/ml-scoring.port';
import { RaceResult } from '../../../domain/race-result/race-result.entity';
import { Rider } from '../../../domain/rider/rider.entity';
import { StartlistEntry } from '../../../domain/startlist/startlist-entry.entity';
import { RaceType } from '../../../domain/shared/race-type.enum';
import { RaceClass } from '../../../domain/shared/race-class.enum';
import { ResultCategory } from '../../../domain/shared/result-category.enum';

/**
 * Helper to build a RaceResult using reconstitute with sensible defaults.
 */
function makeResult(
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
    raceDate: Date | null;
  }>,
): RaceResult {
  return RaceResult.reconstitute({
    id: overrides.id ?? `result-${Math.random().toString(36).slice(2, 8)}`,
    riderId: overrides.riderId ?? 'rider-1',
    raceSlug: overrides.raceSlug ?? 'test-race',
    raceName: overrides.raceName ?? 'Test Race',
    raceType: overrides.raceType ?? RaceType.CLASSIC,
    raceClass: overrides.raceClass ?? RaceClass.UWT,
    year: overrides.year ?? 2025,
    category: overrides.category ?? ResultCategory.GC,
    position: overrides.position ?? 1,
    stageNumber: overrides.stageNumber ?? null,
    dnf: overrides.dnf ?? false,
    scrapedAt: new Date('2025-06-01'),
    parcoursType: null,
    isItt: false,
    isTtt: false,
    profileScore: null,
    raceDate: 'raceDate' in overrides ? overrides.raceDate! : new Date('2025-03-15'),
    climbCategory: null,
    climbName: null,
    sprintName: null,
    kmMarker: null,
  });
}

function makeRider(id: string, name: string): Rider {
  return Rider.reconstitute({
    id,
    pcsSlug: name.toLowerCase().replace(/\s+/g, '-'),
    fullName: name,
    normalizedName: name.toLowerCase(),
    currentTeam: 'Team A',
    nationality: null,
    birthDate: null,
    lastScrapedAt: new Date('2025-01-01'),
  });
}

function makeStartlistEntry(riderId: string): StartlistEntry {
  return StartlistEntry.create({
    raceSlug: 'milano-sanremo',
    year: 2025,
    riderId,
    teamName: 'Team A',
    bibNumber: 1,
    scrapedAt: new Date('2025-01-01'),
  });
}

describe('RunBenchmarkUseCase', () => {
  let useCase: RunBenchmarkUseCase;
  let fetchStartlist: jest.Mocked<Pick<FetchStartlistUseCase, 'execute'>>;
  let resultRepo: jest.Mocked<RaceResultRepositoryPort>;
  let riderRepo: jest.Mocked<RiderRepositoryPort>;
  let mlScoring: jest.Mocked<MlScoringPort>;

  beforeEach(() => {
    fetchStartlist = {
      execute: jest.fn(),
    };
    resultRepo = {
      findByRider: jest.fn(),
      findByRiderIds: jest.fn(),
      findByRace: jest.fn(),
      findByRiderIdsBeforeDate: jest.fn(),
      findByRiderIdsAndRaceSlug: jest.fn().mockResolvedValue([]),
      findDistinctRacesWithDate: jest.fn(),
      saveMany: jest.fn(),
    };
    riderRepo = {
      findByPcsSlug: jest.fn(),
      findByPcsSlugs: jest.fn(),
      findByIds: jest.fn(),
      findAll: jest.fn(),
      save: jest.fn(),
      saveMany: jest.fn(),
    };
    mlScoring = {
      predictRace: jest.fn().mockResolvedValue(null),
      getModelVersion: jest.fn().mockResolvedValue(null),
      isHealthy: jest.fn().mockResolvedValue(false),
    };

    useCase = new RunBenchmarkUseCase(
      fetchStartlist as unknown as FetchStartlistUseCase,
      resultRepo,
      riderRepo,
      mlScoring,
    );
  });

  describe('basic benchmark', () => {
    it('computes predicted and actual scores with Spearman rho', async () => {
      const riderA = makeRider('rider-a', 'Rider Alpha');
      const riderB = makeRider('rider-b', 'Rider Bravo');
      const riderC = makeRider('rider-c', 'Rider Charlie');

      // Setup: startlist with 3 riders
      fetchStartlist.execute.mockResolvedValue({
        entries: [
          makeStartlistEntry('rider-a'),
          makeStartlistEntry('rider-b'),
          makeStartlistEntry('rider-c'),
        ],
        fromCache: true,
      } as FetchStartlistOutput);

      // Actual race results (GC results for the target race, with raceDate)
      const raceDate = new Date('2025-03-15');
      resultRepo.findByRace.mockResolvedValue([
        makeResult({
          riderId: 'rider-a',
          raceSlug: 'milano-sanremo',
          year: 2025,
          category: ResultCategory.GC,
          position: 1,
          raceType: RaceType.CLASSIC,
          raceDate,
        }),
        makeResult({
          riderId: 'rider-b',
          raceSlug: 'milano-sanremo',
          year: 2025,
          category: ResultCategory.GC,
          position: 5,
          raceType: RaceType.CLASSIC,
          raceDate,
        }),
        makeResult({
          riderId: 'rider-c',
          raceSlug: 'milano-sanremo',
          year: 2025,
          category: ResultCategory.GC,
          position: 10,
          raceType: RaceType.CLASSIC,
          raceDate,
        }),
      ]);

      riderRepo.findByIds.mockResolvedValue([riderA, riderB, riderC]);

      // ML predictions with scores that match the actual ranking order
      mlScoring.predictRace.mockResolvedValue([
        {
          riderId: 'rider-a',
          predictedScore: 200,
          breakdown: { gc: 200, stage: 0, mountain: 0, sprint: 0 },
        },
        {
          riderId: 'rider-b',
          predictedScore: 100,
          breakdown: { gc: 100, stage: 0, mountain: 0, sprint: 0 },
        },
        {
          riderId: 'rider-c',
          predictedScore: 50,
          breakdown: { gc: 50, stage: 0, mountain: 0, sprint: 0 },
        },
      ]);

      const result = await useCase.execute({
        raceSlug: 'milano-sanremo',
        year: 2025,
        raceType: RaceType.CLASSIC,
        raceName: 'Milano-Sanremo',
      });

      // Verify basic structure
      expect(result.raceSlug).toBe('milano-sanremo');
      expect(result.raceName).toBe('Milano-Sanremo');
      expect(result.year).toBe(2025);
      expect(result.raceType).toBe(RaceType.CLASSIC);
      expect(result.riderCount).toBe(3);
      expect(result.riderResults).toHaveLength(3);

      // Verify that ML Spearman rho is a valid number (not null)
      expect(result.mlSpearmanRho).not.toBeNull();
      expect(typeof result.mlSpearmanRho).toBe('number');

      // Verify that predicted and actual scores are computed
      for (const entry of result.riderResults) {
        expect(entry.predictedRank).toBeGreaterThan(0);
        expect(entry.actualRank).toBeGreaterThan(0);
        expect(typeof entry.predictedPts).toBe('number');
        expect(typeof entry.actualPts).toBe('number');
      }

      // Rider A should have the highest predicted score (best ML prediction)
      const riderAEntry = result.riderResults.find((r) => r.riderId === 'rider-a');
      const riderCEntry = result.riderResults.find((r) => r.riderId === 'rider-c');
      expect(riderAEntry).toBeDefined();
      expect(riderCEntry).toBeDefined();
      expect(riderAEntry!.predictedPts).toBeGreaterThan(riderCEntry!.predictedPts);

      // Rider A should have the highest actual score (position 1)
      expect(riderAEntry!.actualPts).toBeGreaterThan(riderCEntry!.actualPts);

      // Verify rider names were resolved
      expect(riderAEntry!.riderName).toBe('Rider Alpha');
    });
  });

  describe('ML unavailable', () => {
    it('rider gets predictedPts = 0 when ML returns null', async () => {
      fetchStartlist.execute.mockResolvedValue({
        entries: [makeStartlistEntry('rider-new')],
        fromCache: true,
      } as FetchStartlistOutput);

      const raceDate = new Date('2025-03-15');
      resultRepo.findByRace.mockResolvedValue([
        makeResult({
          riderId: 'rider-new',
          raceSlug: 'milano-sanremo',
          year: 2025,
          category: ResultCategory.GC,
          position: 5,
          raceType: RaceType.CLASSIC,
          raceDate,
        }),
      ]);

      riderRepo.findByIds.mockResolvedValue([makeRider('rider-new', 'New Rider')]);

      // ML returns null (default mock)
      const result = await useCase.execute({
        raceSlug: 'milano-sanremo',
        year: 2025,
        raceType: RaceType.CLASSIC,
        raceName: 'Milano-Sanremo',
      });

      expect(result.riderCount).toBe(1);
      const entry = result.riderResults[0];
      expect(entry.predictedPts).toBe(0);
      expect(entry.actualPts).toBeGreaterThan(0);
      expect(entry.riderName).toBe('New Rider');

      // ML unavailable, so Spearman rho is null
      expect(result.mlSpearmanRho).toBeNull();
    });
  });

  describe('ML error handling', () => {
    it('sets mlSpearmanRho to null when ML service throws', async () => {
      fetchStartlist.execute.mockResolvedValue({
        entries: [makeStartlistEntry('rider-1')],
        fromCache: true,
      } as FetchStartlistOutput);

      resultRepo.findByRace.mockResolvedValue([
        makeResult({
          riderId: 'rider-1',
          raceSlug: 'milano-sanremo',
          year: 2025,
          category: ResultCategory.GC,
          position: 1,
        }),
      ]);

      riderRepo.findByIds.mockResolvedValue([makeRider('rider-1', 'Test Rider')]);

      // ML service throws an error
      mlScoring.predictRace.mockRejectedValue(new Error('ML service down'));

      const result = await useCase.execute({
        raceSlug: 'milano-sanremo',
        year: 2025,
        raceType: RaceType.CLASSIC,
        raceName: 'Milano-Sanremo',
      });

      expect(result.mlSpearmanRho).toBeNull();
      expect(result.riderCount).toBe(1);
    });
  });

  describe('DNF rider', () => {
    it('DNF rider scores partial points from completed stages', async () => {
      fetchStartlist.execute.mockResolvedValue({
        entries: [makeStartlistEntry('rider-finisher'), makeStartlistEntry('rider-dnf')],
        fromCache: true,
      } as FetchStartlistOutput);

      const raceDate = new Date('2025-07-01');

      // A stage race where one rider finished and one DNF'd after stage 5
      resultRepo.findByRace.mockResolvedValue([
        // Finisher: GC + 3 stage wins
        makeResult({
          riderId: 'rider-finisher',
          raceSlug: 'tour-de-france',
          year: 2025,
          category: ResultCategory.GC,
          position: 1,
          raceType: RaceType.GRAND_TOUR,
          raceDate,
        }),
        makeResult({
          riderId: 'rider-finisher',
          raceSlug: 'tour-de-france',
          year: 2025,
          category: ResultCategory.STAGE,
          position: 1,
          stageNumber: 1,
          raceType: RaceType.GRAND_TOUR,
          raceDate,
        }),
        // DNF rider: only one stage result before DNF, no GC
        makeResult({
          riderId: 'rider-dnf',
          raceSlug: 'tour-de-france',
          year: 2025,
          category: ResultCategory.STAGE,
          position: 3,
          stageNumber: 1,
          dnf: false,
          raceType: RaceType.GRAND_TOUR,
          raceDate,
        }),
      ]);

      riderRepo.findByIds.mockResolvedValue([
        makeRider('rider-finisher', 'Full Finisher'),
        makeRider('rider-dnf', 'DNF Rider'),
      ]);

      const result = await useCase.execute({
        raceSlug: 'tour-de-france',
        year: 2025,
        raceType: RaceType.GRAND_TOUR,
        raceName: 'Tour de France',
      });

      expect(result.riderCount).toBe(2);

      const finisher = result.riderResults.find((r) => r.riderId === 'rider-finisher');
      const dnfRider = result.riderResults.find((r) => r.riderId === 'rider-dnf');

      expect(finisher).toBeDefined();
      expect(dnfRider).toBeDefined();

      // Finisher should have higher actual points (GC + stage vs just 1 partial stage)
      expect(finisher!.actualPts).toBeGreaterThan(dnfRider!.actualPts);

      // DNF rider should still have some actual points from the completed stage
      expect(dnfRider!.actualPts).toBeGreaterThan(0);
    });
  });
});
