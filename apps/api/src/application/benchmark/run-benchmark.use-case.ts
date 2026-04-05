import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  RaceResultRepositoryPort,
  RACE_RESULT_REPOSITORY_PORT,
} from '../../domain/race-result/race-result.repository.port';
import {
  RiderRepositoryPort,
  RIDER_REPOSITORY_PORT,
} from '../../domain/rider/rider.repository.port';
import { MlScoringPort, ML_SCORING_PORT } from '../../domain/scoring/ml-scoring.port';
import { RaceType } from '../../domain/shared/race-type.enum';
import { computeSpearmanRho, computeRankings } from '../../domain/scoring/spearman-correlation';
import { buildSameRaceHistory } from '../../domain/scoring/race-history.service';
import { BenchmarkResult, RiderBenchmarkEntry } from '../../domain/benchmark/benchmark-result';
import { FetchStartlistUseCase } from './fetch-startlist.use-case';

export interface RunBenchmarkInput {
  readonly raceSlug: string;
  readonly year: number;
  readonly raceType: RaceType;
  readonly raceName: string;
}

@Injectable()
export class RunBenchmarkUseCase {
  private readonly logger = new Logger(RunBenchmarkUseCase.name);

  constructor(
    private readonly fetchStartlist: FetchStartlistUseCase,
    @Inject(RACE_RESULT_REPOSITORY_PORT)
    private readonly resultRepo: RaceResultRepositoryPort,
    @Inject(RIDER_REPOSITORY_PORT)
    private readonly riderRepo: RiderRepositoryPort,
    @Inject(ML_SCORING_PORT)
    private readonly mlScoring: MlScoringPort,
  ) {}

  async execute(input: RunBenchmarkInput): Promise<BenchmarkResult> {
    // 1. Get startlist
    const { entries } = await this.fetchStartlist.execute({
      raceSlug: input.raceSlug,
      year: input.year,
    });
    const riderIds = entries.map((e) => e.riderId);

    // 2. Get actual race results
    const actualResults = await this.resultRepo.findByRace(input.raceSlug, input.year);

    // 3. Build rider name lookup
    const allRiders = riderIds.length > 0 ? await this.riderRepo.findByIds(riderIds) : [];
    const riderNameMap = new Map(allRiders.map((r) => [r.id, r.fullName]));

    // 4. Compute actual fantasy points per rider from race results
    const riderEntries: RiderBenchmarkEntry[] = [];
    for (const riderId of riderIds) {
      const riderActual = actualResults.filter((r) => r.riderId === riderId);
      const history = buildSameRaceHistory(riderActual, input.raceSlug);
      const actualPts = history[0]?.total ?? 0;

      riderEntries.push({
        riderId,
        riderName: riderNameMap.get(riderId) ?? 'Unknown',
        predictedPts: 0, // Filled from ML below
        actualPts,
        predictedRank: 0,
        actualRank: 0,
      });
    }

    // 5. Compute actual rankings
    const actualScores = riderEntries.map((e) => e.actualPts);
    const actualRanks = computeRankings(actualScores);

    // 6. ML predictions
    let mlRho: number | null = null;
    try {
      const mlPredictions = await this.mlScoring.predictRace(
        input.raceSlug,
        input.year,
        undefined,
        undefined,
        input.raceType,
      );
      if (mlPredictions) {
        const mlScoreMap = new Map(mlPredictions.map((p) => [p.riderId, p.predictedScore]));

        // Fill predicted scores from ML
        for (const entry of riderEntries) {
          (entry as { predictedPts: number }).predictedPts = mlScoreMap.get(entry.riderId) ?? 0;
        }

        const predictedScores = riderEntries.map((e) => e.predictedPts);
        const predictedRanks = computeRankings(predictedScores);

        // Fill rankings
        const rankedEntries = riderEntries.map((e, i) => {
          (e as { predictedRank: number }).predictedRank = predictedRanks[i];
          (e as { actualRank: number }).actualRank = actualRanks[i];
          return e;
        });

        mlRho = computeSpearmanRho(
          rankedEntries.map((e) => e.predictedPts),
          actualScores,
        );
      }
    } catch {
      this.logger.warn(
        `ML scoring unavailable for ${input.raceSlug} ${input.year} — skipping ML rho`,
      );
    }

    // Fill actual ranks even when ML is unavailable
    for (let i = 0; i < riderEntries.length; i++) {
      (riderEntries[i] as { actualRank: number }).actualRank = actualRanks[i];
    }

    this.logger.log(
      `Benchmark ${input.raceSlug} ${input.year}: ${riderEntries.length} riders, mlRho=${mlRho?.toFixed(4) ?? 'null'}`,
    );

    return {
      raceSlug: input.raceSlug,
      raceName: input.raceName,
      year: input.year,
      raceType: input.raceType,
      riderResults: riderEntries,
      mlSpearmanRho: mlRho,
      riderCount: riderEntries.length,
    };
  }
}
