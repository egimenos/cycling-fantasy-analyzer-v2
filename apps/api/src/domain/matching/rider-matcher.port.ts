export interface RiderMatchResult {
  matchedRiderId: string | null;
  confidence: number;
  unmatched: boolean;
}

export interface RiderTarget {
  id: string;
  normalizedName: string;
  currentTeam: string;
}

export interface RiderMatcherPort {
  matchRider(rawName: string, rawTeam: string): Promise<RiderMatchResult>;
  loadRiders(riders: RiderTarget[]): void;
}

export const RIDER_MATCHER_PORT = Symbol('RiderMatcherPort');
