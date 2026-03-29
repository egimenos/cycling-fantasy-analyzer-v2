export interface MlScore {
  readonly id: string;
  readonly riderId: string;
  readonly raceSlug: string;
  readonly year: number;
  readonly predictedScore: number;
  readonly modelVersion: string;
  readonly gcPts: number;
  readonly stagePts: number;
  readonly mountainPts: number;
  readonly sprintPts: number;
  readonly createdAt: Date;
}
