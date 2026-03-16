export enum RaceType {
  GRAND_TOUR = 'grand_tour',
  CLASSIC = 'classic',
  MINI_TOUR = 'mini_tour',
}

export enum RaceClass {
  UWT = 'UWT',
  PRO = 'Pro',
  ONE = '1',
}

export enum ResultCategory {
  GC = 'gc',
  STAGE = 'stage',
  MOUNTAIN = 'mountain',
  SPRINT = 'sprint',
  FINAL = 'final',
}

export enum ScrapeStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  SUCCESS = 'success',
  FAILED = 'failed',
}

export enum HealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  FAILING = 'failing',
}

// --- DTOs ---

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

export interface CategoryScores {
  gc: number;
  stage: number;
  mountain: number;
  sprint: number;
  final: number;
}

export interface AnalyzedRider {
  rawName: string;
  rawTeam: string;
  priceHillios: number;
  matchedRider: MatchedRider | null;
  matchConfidence: number;
  compositeScore: number | null;
  pointsPerHillio: number | null;
  totalProjectedPts: number | null;
  categoryScores: CategoryScores | null;
  seasonsUsed: number | null;
  unmatched: boolean;
}

export interface AnalyzeRequest {
  riders: PriceListEntryDto[];
  raceType: RaceType;
  budget: number;
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
