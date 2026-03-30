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

export interface SeasonBreakdown {
  year: number;
  gc: number;
  stage: number;
  mountain: number;
  sprint: number;
  total: number;
  weight: number;
}

export interface MlBreakdown {
  gc: number;
  stage: number;
  mountain: number;
  sprint: number;
}

export type ScoringMethod = 'rules' | 'hybrid';

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
  seasonsUsed: number | null;
  seasonBreakdown: SeasonBreakdown[] | null;
  scoringMethod: ScoringMethod;
  mlPredictedScore: number | null;
  mlBreakdown: MlBreakdown | null;
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
