import { RaceResult } from './race-result.entity';
import { RaceType } from '../shared/race-type.enum';

export interface RaceSummary {
  readonly raceSlug: string;
  readonly raceName: string;
  readonly year: number;
  readonly raceType: RaceType;
}

export interface RaceResultRepositoryPort {
  findByRider(riderId: string): Promise<RaceResult[]>;
  findByRiderIds(riderIds: string[]): Promise<RaceResult[]>;
  findByRace(raceSlug: string, year: number): Promise<RaceResult[]>;
  findByRiderIdsBeforeDate(riderIds: string[], cutoffDate: Date): Promise<RaceResult[]>;
  findDistinctRacesWithDate(): Promise<RaceSummary[]>;
  saveMany(results: RaceResult[]): Promise<number>;
}

export const RACE_RESULT_REPOSITORY_PORT = Symbol('RaceResultRepositoryPort');
