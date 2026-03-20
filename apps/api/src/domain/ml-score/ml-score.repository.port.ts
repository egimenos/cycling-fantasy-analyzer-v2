import { MlScore } from './ml-score.entity';

export const ML_SCORE_REPOSITORY_PORT = Symbol('MlScoreRepositoryPort');

export interface MlScoreRepositoryPort {
  findByRace(raceSlug: string, year: number, modelVersion: string): Promise<MlScore[]>;
  findLatestModelVersion(): Promise<string | null>;
  saveMany(scores: Omit<MlScore, 'id' | 'createdAt'>[]): Promise<void>;
}
