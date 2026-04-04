export const RACE_PROFILE_PARSER_PORT = Symbol('RACE_PROFILE_PARSER_PORT');

export interface ParsedStageInfo {
  stageNumber: number;
  parcoursType: string | null;
  isItt: boolean;
  isTtt: boolean;
  distanceKm: number | null;
  departure: string | null;
  arrival: string | null;
}

export interface ExtractedProfile {
  parcoursType: string | null;
  profileScore: number | null;
}

export interface RaceProfileParserPort {
  parseRaceOverview(html: string): ParsedStageInfo[];
  extractProfile(html: string): ExtractedProfile;
}
