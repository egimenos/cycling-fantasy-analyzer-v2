export interface ScoredRider {
  readonly id: string;
  readonly name: string;
  readonly priceHillios: number;
  readonly totalProjectedPts: number;
  readonly categoryScores: {
    readonly gc: number;
    readonly stage: number;
    readonly mountain: number;
    readonly sprint: number;
    readonly final: number;
  };
}

export interface ScoreBreakdown {
  readonly gc: number;
  readonly stage: number;
  readonly mountain: number;
  readonly sprint: number;
  readonly final: number;
}

export interface TeamSelection {
  readonly riders: ScoredRider[];
  readonly totalCostHillios: number;
  readonly totalProjectedPts: number;
  readonly budgetRemaining: number;
  readonly scoreBreakdown: ScoreBreakdown;
}
