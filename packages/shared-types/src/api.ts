import type { RaceType, ResultCategory } from './enums';

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

export interface AnalyzedRider {
  rawName: string;
  rawTeam: string;
  priceHillios: number;
  matchedRider: MatchedRider | null;
  matchConfidence: number;
  unmatched: boolean;
  compositeScore: number | null;
  pointsPerHillio: number | null;
  totalProjectedPts: number | null;
  categoryScores: CategoryScores | null;
  seasonsUsed: number | null;
  seasonBreakdown: SeasonBreakdown[] | null;
}

export interface AnalyzeRequest {
  riders: PriceListEntryDto[];
  raceType: RaceType;
  budget: number;
  seasons?: number;
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
