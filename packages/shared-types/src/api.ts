import type { ParcoursType, RaceType, ResultCategory } from './enums';

export interface PriceListEntryDto {
  name: string;
  team: string;
  price: number;
}

export interface MatchedRider {
  id: string;
  pcsSlug: string;
  fullName: string;
  currentTeam: string;
}

export type CategoryScores = {
  [K in ResultCategory]: number;
};

export interface RaceHistory {
  year: number;
  gc: number;
  stage: number;
  mountain: number;
  sprint: number;
  total: number;
}

export interface SeasonBreakdown {
  year: number;
  gc: number;
  stage: number;
  mountain: number;
  sprint: number;
  total: number;
}

export enum BreakoutFlag {
  EmergingTalent = 'EMERGING_TALENT',
  HotStreak = 'HOT_STREAK',
  DeepValue = 'DEEP_VALUE',
  SprintOpportunity = 'SPRINT_OPPORTUNITY',
  BreakawayHunter = 'BREAKAWAY_HUNTER',
  RaceSpecialist = 'RACE_SPECIALIST',
}

export interface BreakoutSignals {
  readonly trajectory: number;
  readonly form: number;
  readonly routeFit: number;
  readonly variance: number;
}

export interface BreakoutResult {
  readonly index: number;
  readonly upsideP80: number;
  readonly flags: readonly BreakoutFlag[];
  readonly signals: BreakoutSignals;
}

export interface AnalyzedRider {
  rawName: string;
  rawTeam: string;
  priceHillios: number;
  matchedRider: MatchedRider | null;
  matchConfidence: number;
  unmatched: boolean;
  pointsPerHillio: number | null;
  totalProjectedPts: number | null;
  categoryScores: CategoryScores | null;
  breakout: BreakoutResult | null;
  sameRaceHistory: RaceHistory[] | null;
  seasonBreakdowns: SeasonBreakdown[] | null;
}

export interface AnalyzeRequest {
  riders: PriceListEntryDto[];
  raceType: RaceType;
  budget: number;
  profileSummary?: ProfileSummary;
  raceSlug?: string;
  year?: number;
}

export interface AnalyzeResponse {
  riders: AnalyzedRider[];
  totalSubmitted: number;
  totalMatched: number;
  unmatchedCount: number;
}

export interface TeamSelection {
  riders: AnalyzedRider[];
  totalCostHillios: number;
  totalProjectedPts: number;
  budgetRemaining: number;
  scoreBreakdown: CategoryScores;
}

export interface OptimizeRequest {
  riders: AnalyzedRider[];
  budget: number;
  mustInclude: string[];
  mustExclude: string[];
}

export interface OptimizeResponse {
  optimalTeam: TeamSelection;
  alternativeTeams: TeamSelection[];
}

export interface StageInfo {
  stageNumber: number;
  parcoursType: ParcoursType | null;
  isItt: boolean;
  isTtt: boolean;
  distanceKm: number | null;
  departure: string | null;
  arrival: string | null;
}

export interface ProfileSummary {
  p1Count: number;
  p2Count: number;
  p3Count: number;
  p4Count: number;
  p5Count: number;
  ittCount: number;
  tttCount: number;
  unknownCount: number;
}

export interface RaceProfileResponse {
  raceSlug: string;
  raceName: string;
  raceType: RaceType;
  year: number;
  totalStages: number;
  stages: StageInfo[];
  profileSummary: ProfileSummary;
}

export interface RaceListItem {
  raceSlug: string;
  raceName: string;
  raceType: RaceType;
  year: number;
}

export interface RaceListResponse {
  races: RaceListItem[];
}

export interface GmvMatchResponse {
  matched: boolean;
  postTitle: string | null;
  postUrl: string | null;
  confidence: number | null;
  riders: PriceListEntryDto[] | null;
}
