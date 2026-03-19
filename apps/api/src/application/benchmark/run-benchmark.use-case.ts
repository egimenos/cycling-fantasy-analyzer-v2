import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  RaceResultRepositoryPort,
  RACE_RESULT_REPOSITORY_PORT,
} from '../../domain/race-result/race-result.repository.port';
import {
  RiderRepositoryPort,
  RIDER_REPOSITORY_PORT,
} from '../../domain/rider/rider.repository.port';
import { RaceType } from '../../domain/shared/race-type.enum';
import { computeRiderScore } from '../../domain/scoring/scoring.service';
import { computeSpearmanRho, computeRankings } from '../../domain/scoring/spearman-correlation';
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
  ) {}

  async execute(input: RunBenchmarkInput): Promise<BenchmarkResult> {
    // 1. Get startlist
    const { entries } = await this.fetchStartlist.execute({
      raceSlug: input.raceSlug,
      year: input.year,
    });
    const riderIds = entries.map((e) => e.riderId);

    // 2. Get the race date cutoff from actual results
    const actualResults = await this.resultRepo.findByRace(input.raceSlug, input.year);
    const raceDates = actualResults
      .filter((r) => r.raceDate !== null)
      .map((r) => r.raceDate as Date);

    const earliestDate =
      raceDates.length > 0 ? new Date(Math.min(...raceDates.map((d) => d.getTime()))) : null;

    if (!earliestDate) {
      throw new Error(`No race dates found for ${input.raceSlug} ${input.year}. Run seed first.`);
    }

    // 3. Fetch historical results (before this race)
    const historicalResults = await this.resultRepo.findByRiderIdsBeforeDate(
      riderIds,
      earliestDate,
    );

    // 4. Build rider name lookup
    const allRiders = riderIds.length > 0 ? await this.riderRepo.findByIds(riderIds) : [];
    const riderNameMap = new Map(allRiders.map((r) => [r.id, r.fullName]));

    // 5. Compute scores per rider
    const riderEntries: RiderBenchmarkEntry[] = [];
    for (const riderId of riderIds) {
      const riderHistorical = historicalResults.filter((r) => r.riderId === riderId);
      const riderActual = actualResults.filter((r) => r.riderId === riderId);

      const predicted = computeRiderScore(riderId, riderHistorical, input.raceType, input.year);
      const actual = computeRiderScore(riderId, riderActual, input.raceType, input.year, 1);

      riderEntries.push({
        riderId,
        riderName: riderNameMap.get(riderId) ?? 'Unknown',
        predictedPts: predicted.totalProjectedPts,
        actualPts: actual.totalProjectedPts,
        predictedRank: 0, // Filled below
        actualRank: 0, // Filled below
      });
    }

    // 6. Compute rankings
    const predictedScores = riderEntries.map((e) => e.predictedPts);
    const actualScores = riderEntries.map((e) => e.actualPts);
    const predictedRanks = computeRankings(predictedScores);
    const actualRanks = computeRankings(actualScores);

    const rankedEntries: RiderBenchmarkEntry[] = riderEntries.map((e, i) => ({
      ...e,
      predictedRank: predictedRanks[i],
      actualRank: actualRanks[i],
    }));

    // 7. Compute Spearman rho
    const rho = computeSpearmanRho(predictedScores, actualScores);

    this.logger.log(
      `Benchmark ${input.raceSlug} ${input.year}: ${riderEntries.length} riders, rho=${rho?.toFixed(4) ?? 'null'}`,
    );

    return {
      raceSlug: input.raceSlug,
      raceName: input.raceName,
      year: input.year,
      raceType: input.raceType,
      riderResults: rankedEntries,
      spearmanRho: rho,
      riderCount: riderEntries.length,
    };
  }
}
