import { StartlistEntry } from './startlist-entry.entity';

export interface StartlistRepositoryPort {
  findByRace(raceSlug: string, year: number): Promise<StartlistEntry[]>;
  existsForRace(raceSlug: string, year: number): Promise<boolean>;
  saveMany(entries: StartlistEntry[]): Promise<number>;
}

export const STARTLIST_REPOSITORY_PORT = Symbol('StartlistRepositoryPort');
