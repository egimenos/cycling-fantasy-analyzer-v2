import { RaceType } from '../shared/race-type.enum';

export interface RiderBenchmarkEntry {
  readonly riderId: string;
  readonly riderName: string;
  readonly predictedPts: number;
  readonly actualPts: number;
  readonly predictedRank: number;
  readonly actualRank: number;
}

export interface BenchmarkResult {
  readonly raceSlug: string;
  readonly raceName: string;
  readonly year: number;
  readonly raceType: RaceType;
  readonly riderResults: ReadonlyArray<RiderBenchmarkEntry>;
  readonly rulesSpearmanRho: number | null;
  readonly mlSpearmanRho: number | null;
  readonly hybridSpearmanRho: number | null;
  readonly riderCount: number;
}

export interface BenchmarkSuiteResult {
  readonly races: ReadonlyArray<BenchmarkResult>;
  readonly meanRulesRho: number | null;
  readonly meanMlRho: number | null;
  readonly meanHybridRho: number | null;
  readonly raceCount: number;
}
