export const ML_SCORING_PORT = Symbol('MlScoringPort');

export interface MlPrediction {
  readonly riderId: string;
  readonly predictedScore: number;
}

export interface RaceProfileSummary {
  readonly p1: number;
  readonly p2: number;
  readonly p3: number;
  readonly p4: number;
  readonly p5: number;
  readonly itt: number;
  readonly ttt: number;
}

export interface MlScoringPort {
  predictRace(
    raceSlug: string,
    year: number,
    profileSummary?: RaceProfileSummary,
    riderIds?: string[],
    raceType?: string,
  ): Promise<MlPrediction[] | null>;
  getModelVersion(): Promise<string | null>;
  isHealthy(): Promise<boolean>;
}
