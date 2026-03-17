import { RaceResult } from './race-result.entity';

export interface RaceResultRepositoryPort {
  findByRider(riderId: string): Promise<RaceResult[]>;
  findByRiderIds(riderIds: string[]): Promise<RaceResult[]>;
  findByRace(raceSlug: string, year: number): Promise<RaceResult[]>;
  saveMany(results: RaceResult[]): Promise<number>;
}

export const RACE_RESULT_REPOSITORY_PORT = Symbol('RaceResultRepositoryPort');
