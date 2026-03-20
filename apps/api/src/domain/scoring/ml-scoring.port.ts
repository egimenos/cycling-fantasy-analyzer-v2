export const ML_SCORING_PORT = Symbol('MlScoringPort');

export interface MlPrediction {
  readonly riderId: string;
  readonly predictedScore: number;
}

export interface MlScoringPort {
  predictRace(raceSlug: string, year: number): Promise<MlPrediction[] | null>;
  getModelVersion(): Promise<string | null>;
  isHealthy(): Promise<boolean>;
}
