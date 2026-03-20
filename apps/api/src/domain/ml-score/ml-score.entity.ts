export interface MlScore {
  readonly id: string;
  readonly riderId: string;
  readonly raceSlug: string;
  readonly year: number;
  readonly predictedScore: number;
  readonly modelVersion: string;
  readonly createdAt: Date;
}
