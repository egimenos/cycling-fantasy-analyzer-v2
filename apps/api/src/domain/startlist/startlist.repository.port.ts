import { StartlistEntry } from './startlist-entry.entity';

export interface StartlistRepositoryPort {
  findByRace(raceSlug: string, year: number): Promise<StartlistEntry[]>;
  existsForRace(raceSlug: string, year: number): Promise<boolean>;
  saveMany(entries: StartlistEntry[]): Promise<number>;
  /**
   * Replace the entire startlist for a race/year with the given entries in a
   * single transaction (delete existing rows, then insert). Used by the analyze
   * flow to persist the fresh GMV price-list field as the authoritative
   * startlist, dropping any rider no longer in the field.
   */
  replaceForRace(raceSlug: string, year: number, entries: StartlistEntry[]): Promise<number>;
}

export const STARTLIST_REPOSITORY_PORT = Symbol('StartlistRepositoryPort');
