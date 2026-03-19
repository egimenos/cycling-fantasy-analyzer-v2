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
  readonly spearmanRho: number | null;
  readonly riderCount: number;
}

export interface BenchmarkSuiteResult {
  readonly races: ReadonlyArray<BenchmarkResult>;
  readonly meanSpearmanRho: number | null;
  readonly raceCount: number;
}
