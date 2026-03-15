import type { RaceType, ResultCategory } from './enums';

export interface PriceListEntryDto {
  name: string;
  team: string;
  price: number;
}

export interface AnalyzeRequest {
  riders: PriceListEntryDto[];
  raceType: RaceType;
  budget: number;
}

export interface MatchedRider {
  id: string;
  pcsSlug: string;
  fullName: string;
  currentTeam: string;
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
  categoryScores:
    | {
        [K in ResultCategory]: number;
      }
    | null;
  seasonsUsed: number | null;
}

export interface AnalyzeResponse {
  riders: AnalyzedRider[];
  totalSubmitted: number;
  totalMatched: number;
  unmatchedCount: number;
}

export interface OptimizeRequest {
  riders: AnalyzedRider[];
  budget: number;
  mustInclude: string[];
  mustExclude: string[];
}

export interface TeamSelection {
  riders: AnalyzedRider[];
  totalCostHillios: number;
  totalProjectedPts: number;
  budgetRemaining: number;
}

export interface OptimizeResponse {
  optimalTeam: TeamSelection;
  alternativeTeams: TeamSelection[];
}
