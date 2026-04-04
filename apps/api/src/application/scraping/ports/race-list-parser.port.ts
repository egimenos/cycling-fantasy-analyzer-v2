export const RACE_LIST_PARSER_PORT = Symbol('RACE_LIST_PARSER_PORT');

export type DiscoveredRaceType = 'STAGE_RACE' | 'ONE_DAY';

export interface DiscoveredRace {
  readonly urlPath: string;
  readonly slug: string;
  readonly name: string;
  readonly raceType: DiscoveredRaceType;
  readonly classText: string;
  readonly startDate: string | null;
}

export interface RaceListParserPort {
  parseRaceList(html: string): DiscoveredRace[];
}
