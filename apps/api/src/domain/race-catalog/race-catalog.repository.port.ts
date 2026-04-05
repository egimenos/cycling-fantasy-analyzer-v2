import { RaceType } from '../shared/race-type.enum';
import { RaceClass } from '../shared/race-class.enum';

export interface CatalogRace {
  readonly slug: string;
  readonly name: string;
  readonly raceType: RaceType;
  readonly raceClass: RaceClass;
  readonly year: number;
  readonly startDate: string | null;
}

export interface RaceCatalogFilter {
  minYear?: number;
  raceType?: RaceType;
  upcomingOnly?: boolean;
}

export interface RaceCatalogRepositoryPort {
  findRaces(filter?: RaceCatalogFilter): Promise<CatalogRace[]>;
  upsertMany(races: CatalogRace[]): Promise<number>;
}

export const RACE_CATALOG_REPOSITORY_PORT = Symbol('RaceCatalogRepositoryPort');
