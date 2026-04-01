import type { SeasonBreakdown, ProfileSummary } from '@cycling-analyzer/shared-types';
import type { CoreCategoryScores } from '../breakout.types';

// Use string values directly since Jest can't resolve ESM enum from shared-types
const BreakoutFlag = {
  EmergingTalent: 'EMERGING_TALENT',
  HotStreak: 'HOT_STREAK',
  DeepValue: 'DEEP_VALUE',
  CeilingPlay: 'CEILING_PLAY',
  SprintOpportunity: 'SPRINT_OPPORTUNITY',
  BreakawayHunter: 'BREAKAWAY_HUNTER',
} as const;
import {
  computeAge,
  computeRawSlope,
  computeTrajectory,
  computeRecencyBurst,
  computeCeilingGap,
  computeRouteFit,
  computeVariance,
  computeBpiIndex,
  computeUpsideP80,
  evaluateFlags,
  computeBreakout,
  computeMedianPtsPerHillio,
} from '../breakout.service';
import type { ComputeBreakoutInput } from '../breakout.types';

// ── Helpers ──────────────────────────────────────────────────────────

function makeSeason(year: number, total: number): SeasonBreakdown {
  return { year, gc: 0, stage: 0, mountain: 0, sprint: 0, total, weight: 1 };
}

function cat(gc = 0, stage = 0, mountain = 0, sprint = 0): CoreCategoryScores {
  return { gc, stage, mountain, sprint };
}

const youngBirthDate = new Date('2003-06-15'); // ~22 years old
const midBirthDate = new Date('2000-01-01'); // ~26 years old
const oldBirthDate = new Date('1992-01-01'); // ~34 years old

// ── computeAge ──────────────────────────────────────────────────────

describe('computeAge', () => {
  it('returns 28 for null birthDate', () => {
    expect(computeAge(null)).toBe(28);
  });

  it('computes age from birthDate', () => {
    const age = computeAge(youngBirthDate);
    expect(age).toBeGreaterThan(20);
    expect(age).toBeLessThan(25);
  });
});

// ── computeRawSlope ─────────────────────────────────────────────────

describe('computeRawSlope', () => {
  it('returns 0 for fewer than 2 seasons', () => {
    expect(computeRawSlope([])).toBe(0);
    expect(computeRawSlope([makeSeason(2024, 100)])).toBe(0);
  });

  it('computes positive slope for ascending seasons', () => {
    const seasons = [makeSeason(2022, 50), makeSeason(2023, 100), makeSeason(2024, 150)];
    expect(computeRawSlope(seasons)).toBe(50);
  });

  it('computes negative slope for descending seasons', () => {
    const seasons = [makeSeason(2022, 200), makeSeason(2023, 100)];
    expect(computeRawSlope(seasons)).toBe(-100);
  });

  it('returns 0 for flat seasons', () => {
    const seasons = [makeSeason(2022, 100), makeSeason(2023, 100)];
    expect(computeRawSlope(seasons)).toBe(0);
  });
});

// ── Signal 1: Trajectory ────────────────────────────────────────────

describe('computeTrajectory', () => {
  it('returns 0 for 0 or 1 season', () => {
    expect(computeTrajectory([], null)).toBe(0);
    expect(computeTrajectory([makeSeason(2024, 100)], null)).toBe(0);
  });

  it('returns 0 for negative slope', () => {
    const seasons = [makeSeason(2023, 200), makeSeason(2024, 50)];
    expect(computeTrajectory(seasons, null)).toBe(0);
  });

  it('applies age factor 1.5 for age < 25', () => {
    const seasons = [makeSeason(2023, 50), makeSeason(2024, 60)];
    // slope = 10, factor 1.5 → 15
    expect(computeTrajectory(seasons, youngBirthDate)).toBe(15);
  });

  it('applies age factor 1.0 for age 25-27', () => {
    const seasons = [makeSeason(2023, 50), makeSeason(2024, 60)];
    expect(computeTrajectory(seasons, midBirthDate)).toBe(10);
  });

  it('applies age factor 0.5 for age 28-31', () => {
    const seasons = [makeSeason(2023, 50), makeSeason(2024, 60)];
    // default age 28, factor 0.5 → 5
    expect(computeTrajectory(seasons, null)).toBe(5);
  });

  it('applies age factor 0.2 for age 32+', () => {
    const seasons = [makeSeason(2023, 50), makeSeason(2024, 60)];
    expect(computeTrajectory(seasons, oldBirthDate)).toBe(2);
  });

  it('clamps at 25', () => {
    const seasons = [makeSeason(2023, 0), makeSeason(2024, 200)];
    // slope = 200, factor 1.5 → 300 → clamped to 25
    expect(computeTrajectory(seasons, youngBirthDate)).toBe(25);
  });
});

// ── Signal 2: Recency Burst ─────────────────────────────────────────

describe('computeRecencyBurst', () => {
  it('returns 0 for empty seasons', () => {
    expect(computeRecencyBurst([])).toBe(0);
  });

  it('returns 0 when current season total <= 20', () => {
    expect(computeRecencyBurst([makeSeason(2024, 15), makeSeason(2023, 10)])).toBe(0);
  });

  it('returns 0 with only 1 season', () => {
    expect(computeRecencyBurst([makeSeason(2024, 100)])).toBe(0);
  });

  it('returns 25 when avg of others is 0', () => {
    const seasons = [makeSeason(2024, 50), makeSeason(2023, 0)];
    expect(computeRecencyBurst(seasons)).toBe(25);
  });

  it('computes ratio-based score for 2× burst', () => {
    // current=100, others avg=50, ratio=2, score=(2-1)*25=25
    const seasons = [makeSeason(2024, 100), makeSeason(2023, 50)];
    expect(computeRecencyBurst(seasons)).toBe(25);
  });

  it('computes partial score for 1.5× burst', () => {
    // current=75, others avg=50, ratio=1.5, score=(1.5-1)*25=12.5
    const seasons = [makeSeason(2024, 75), makeSeason(2023, 50)];
    expect(computeRecencyBurst(seasons)).toBe(12.5);
  });
});

// ── Signal 3: Ceiling Gap ───────────────────────────────────────────

describe('computeCeilingGap', () => {
  it('returns 0 for age > 33', () => {
    expect(computeCeilingGap([makeSeason(2020, 300)], 100, oldBirthDate)).toBe(0);
  });

  it('returns 0 for empty seasons', () => {
    expect(computeCeilingGap([], 100, null)).toBe(0);
  });

  it('returns 0 for prediction <= 0', () => {
    expect(computeCeilingGap([makeSeason(2020, 300)], 0, null)).toBe(0);
  });

  it('computes gap ratio', () => {
    // peak=500, prediction=100, ratio=5, score=(5-1)*5=20
    expect(computeCeilingGap([makeSeason(2020, 500)], 100, null)).toBe(20);
  });

  it('clamps at 20', () => {
    // peak=1000, prediction=50, ratio=20, score=(20-1)*5=95 → clamped to 20
    expect(computeCeilingGap([makeSeason(2020, 1000)], 50, null)).toBe(20);
  });
});

// ── Signal 4: Route Fit ─────────────────────────────────────────────

describe('computeRouteFit', () => {
  const flatRace: ProfileSummary = {
    p1Count: 15,
    p2Count: 2,
    p3Count: 1,
    p4Count: 1,
    p5Count: 0,
    ittCount: 1,
    tttCount: 0,
    unknownCount: 0,
  };

  it('returns 0 without profileSummary', () => {
    expect(computeRouteFit(cat(10, 10, 10, 10))).toBe(0);
  });

  it('returns 0 without categoryScores', () => {
    expect(computeRouteFit(null, flatRace)).toBe(0);
  });

  it('returns 0 when rider total is 0', () => {
    expect(computeRouteFit(cat(0, 0, 0, 0), flatRace)).toBe(0);
  });

  it('returns 0 when total stages is 0', () => {
    const emptyRace: ProfileSummary = {
      p1Count: 0,
      p2Count: 0,
      p3Count: 0,
      p4Count: 0,
      p5Count: 0,
      ittCount: 0,
      tttCount: 0,
      unknownCount: 0,
    };
    expect(computeRouteFit(cat(50, 50, 0, 0), emptyRace)).toBe(0);
  });

  it('scores high for sprinter on flat course', () => {
    const sprinter = cat(0, 5, 0, 95);
    const score = computeRouteFit(sprinter, flatRace);
    expect(score).toBeGreaterThan(8);
  });

  it('scores low for climber on flat course', () => {
    const climber = cat(0, 0, 95, 5);
    const score = computeRouteFit(climber, flatRace);
    expect(score).toBeLessThan(3);
  });
});

// ── Signal 5: Variance ──────────────────────────────────────────────

describe('computeVariance', () => {
  it('returns 7.5 for fewer than 2 non-zero seasons', () => {
    expect(computeVariance([])).toBe(7.5);
    expect(computeVariance([makeSeason(2024, 100)])).toBe(7.5);
  });

  it('returns 7.5 when only 1 non-zero season among zeros', () => {
    expect(computeVariance([makeSeason(2024, 100), makeSeason(2023, 0)])).toBe(7.5);
  });

  it('returns 0 for identical non-zero seasons', () => {
    const seasons = [makeSeason(2023, 100), makeSeason(2024, 100)];
    expect(computeVariance(seasons)).toBe(0);
  });

  it('computes CV-based score', () => {
    // values: 50, 150. mean=100, var=2500, sd=50, cv=0.5, score=7.5
    const seasons = [makeSeason(2023, 50), makeSeason(2024, 150)];
    expect(computeVariance(seasons)).toBeCloseTo(7.5, 1);
  });

  it('clamps at 15', () => {
    // very high variance: 10 and 500. mean=255, var=60025, sd≈245, cv≈0.96 → 14.4
    const seasons = [makeSeason(2023, 10), makeSeason(2024, 500)];
    expect(computeVariance(seasons)).toBeLessThanOrEqual(15);
  });
});

// ── Composite Index ─────────────────────────────────────────────────

describe('computeBpiIndex', () => {
  it('sums signals and rounds', () => {
    const signals = { trajectory: 10.3, recency: 5.7, ceiling: 8, routeFit: 3, variance: 7 };
    expect(computeBpiIndex(signals)).toBe(34);
  });

  it('clamps at 100', () => {
    const signals = { trajectory: 25, recency: 25, ceiling: 20, routeFit: 15, variance: 15 };
    expect(computeBpiIndex(signals)).toBe(100);
  });

  it('clamps at 0', () => {
    const signals = { trajectory: 0, recency: 0, ceiling: 0, routeFit: 0, variance: 0 };
    expect(computeBpiIndex(signals)).toBe(0);
  });
});

// ── Upside P80 ──────────────────────────────────────────────────────

describe('computeUpsideP80', () => {
  it('returns prediction × 1.8 for < 3 seasons', () => {
    const seasons = [makeSeason(2024, 100), makeSeason(2023, 80)];
    expect(computeUpsideP80(seasons, 50)).toBe(90); // 50 * 1.8 = 90
  });

  it('returns 0 when prediction is 0 and < 3 seasons', () => {
    expect(computeUpsideP80([makeSeason(2024, 100)], 0)).toBe(0);
  });

  it('returns 0 for empty seasons with 0 prediction', () => {
    expect(computeUpsideP80([], 0)).toBe(0);
  });

  it('computes bootstrap P80 for >= 3 seasons', () => {
    const seasons = [makeSeason(2024, 200), makeSeason(2023, 150), makeSeason(2022, 100)];
    const p80 = computeUpsideP80(seasons, 100);
    expect(p80).toBeGreaterThan(100); // optimistic > mean
    expect(typeof p80).toBe('number');
    expect(Number.isInteger(p80)).toBe(true);
  });

  it('returns deterministic results (seeded PRNG)', () => {
    const seasons = [makeSeason(2024, 200), makeSeason(2023, 150), makeSeason(2022, 100)];
    const a = computeUpsideP80(seasons, 100);
    const b = computeUpsideP80(seasons, 100);
    expect(a).toBe(b);
  });

  it('returns 0 when all seasons are 0', () => {
    const seasons = [makeSeason(2024, 0), makeSeason(2023, 0), makeSeason(2022, 0)];
    expect(computeUpsideP80(seasons, 0)).toBe(0);
  });
});

// ── Flag Evaluation ─────────────────────────────────────────────────

describe('evaluateFlags', () => {
  const baseInput: ComputeBreakoutInput = {
    seasonBreakdown: [],
    prediction: 100,
    priceHillios: 200,
    birthDate: null,
    medianPtsPerHillio: 1.0,
    categoryScores: cat(25, 25, 25, 25),
  };

  describe('EMERGING_TALENT', () => {
    it('triggers for young rider with steep slope', () => {
      const input: ComputeBreakoutInput = {
        ...baseInput,
        birthDate: youngBirthDate,
        seasonBreakdown: [makeSeason(2024, 100), makeSeason(2023, 30)],
      };
      const flags = evaluateFlags(input);
      expect(flags).toContain(BreakoutFlag.EmergingTalent);
    });

    it('does not trigger for age >= 25', () => {
      const input: ComputeBreakoutInput = {
        ...baseInput,
        birthDate: midBirthDate,
        seasonBreakdown: [makeSeason(2024, 100), makeSeason(2023, 30)],
      };
      expect(evaluateFlags(input)).not.toContain(BreakoutFlag.EmergingTalent);
    });

    it('does not trigger with > 3 seasons', () => {
      const input: ComputeBreakoutInput = {
        ...baseInput,
        birthDate: youngBirthDate,
        seasonBreakdown: [
          makeSeason(2024, 200),
          makeSeason(2023, 150),
          makeSeason(2022, 100),
          makeSeason(2021, 50),
        ],
      };
      expect(evaluateFlags(input)).not.toContain(BreakoutFlag.EmergingTalent);
    });
  });

  describe('HOT_STREAK', () => {
    it('triggers when current > 2× avg of others', () => {
      const input: ComputeBreakoutInput = {
        ...baseInput,
        seasonBreakdown: [makeSeason(2024, 200), makeSeason(2023, 50), makeSeason(2022, 50)],
      };
      expect(evaluateFlags(input)).toContain(BreakoutFlag.HotStreak);
    });

    it('does not trigger when current < 2× avg', () => {
      const input: ComputeBreakoutInput = {
        ...baseInput,
        seasonBreakdown: [makeSeason(2024, 80), makeSeason(2023, 50)],
      };
      expect(evaluateFlags(input)).not.toContain(BreakoutFlag.HotStreak);
    });
  });

  describe('DEEP_VALUE', () => {
    it('triggers for cheap rider with above-median pts/hillio', () => {
      const input: ComputeBreakoutInput = {
        ...baseInput,
        priceHillios: 80,
        prediction: 200,
        medianPtsPerHillio: 1.0,
      };
      // ptsPerHillio = 200/80 = 2.5, median = 1.0
      expect(evaluateFlags(input)).toContain(BreakoutFlag.DeepValue);
    });

    it('does not trigger when price > 100', () => {
      const input: ComputeBreakoutInput = {
        ...baseInput,
        priceHillios: 150,
        prediction: 300,
        medianPtsPerHillio: 1.0,
      };
      expect(evaluateFlags(input)).not.toContain(BreakoutFlag.DeepValue);
    });
  });

  describe('CEILING_PLAY', () => {
    it('triggers when peak > 5× prediction and age < 30', () => {
      const input: ComputeBreakoutInput = {
        ...baseInput,
        prediction: 50,
        seasonBreakdown: [makeSeason(2020, 600), makeSeason(2024, 30)],
      };
      expect(evaluateFlags(input)).toContain(BreakoutFlag.CeilingPlay);
    });

    it('does not trigger when prediction is 0', () => {
      const input: ComputeBreakoutInput = {
        ...baseInput,
        prediction: 0,
        seasonBreakdown: [makeSeason(2020, 600)],
      };
      expect(evaluateFlags(input)).not.toContain(BreakoutFlag.CeilingPlay);
    });

    it('does not trigger for age >= 30', () => {
      const input: ComputeBreakoutInput = {
        ...baseInput,
        birthDate: new Date('1995-01-01'), // ~31
        prediction: 50,
        seasonBreakdown: [makeSeason(2020, 600)],
      };
      expect(evaluateFlags(input)).not.toContain(BreakoutFlag.CeilingPlay);
    });
  });

  describe('SPRINT_OPPORTUNITY', () => {
    const flatProfile: ProfileSummary = {
      p1Count: 15,
      p2Count: 2,
      p3Count: 1,
      p4Count: 1,
      p5Count: 0,
      ittCount: 1,
      tttCount: 0,
      unknownCount: 0,
    };

    it('triggers for sprinter on flat course', () => {
      const input: ComputeBreakoutInput = {
        ...baseInput,
        priceHillios: 100,
        profileSummary: flatProfile,
        categoryScores: cat(5, 40, 5, 50),
      };
      expect(evaluateFlags(input)).toContain(BreakoutFlag.SprintOpportunity);
    });

    it('does not trigger without profileSummary', () => {
      const input: ComputeBreakoutInput = {
        ...baseInput,
        priceHillios: 100,
        categoryScores: cat(5, 40, 5, 50),
      };
      expect(evaluateFlags(input)).not.toContain(BreakoutFlag.SprintOpportunity);
    });
  });

  describe('BREAKAWAY_HUNTER', () => {
    it('triggers for cheap rider with >10% mountain', () => {
      const input: ComputeBreakoutInput = {
        ...baseInput,
        priceHillios: 80,
        categoryScores: cat(10, 30, 50, 10),
      };
      expect(evaluateFlags(input)).toContain(BreakoutFlag.BreakawayHunter);
    });

    it('does not trigger when price > 100', () => {
      const input: ComputeBreakoutInput = {
        ...baseInput,
        priceHillios: 120,
        categoryScores: cat(10, 30, 50, 10),
      };
      expect(evaluateFlags(input)).not.toContain(BreakoutFlag.BreakawayHunter);
    });
  });
});

// ── computeBreakout ─────────────────────────────────────────────────

describe('computeBreakout', () => {
  it('returns all fields with correct types', () => {
    const input: ComputeBreakoutInput = {
      seasonBreakdown: [makeSeason(2024, 150), makeSeason(2023, 100), makeSeason(2022, 50)],
      prediction: 120,
      priceHillios: 80,
      birthDate: youngBirthDate,
      medianPtsPerHillio: 1.0,
      categoryScores: cat(30, 30, 20, 20),
    };

    const result = computeBreakout(input);

    expect(result.index).toBeGreaterThanOrEqual(0);
    expect(result.index).toBeLessThanOrEqual(100);
    expect(typeof result.upsideP80).toBe('number');
    expect(Array.isArray(result.flags)).toBe(true);
    expect(result.signals).toHaveProperty('trajectory');
    expect(result.signals).toHaveProperty('recency');
    expect(result.signals).toHaveProperty('ceiling');
    expect(result.signals).toHaveProperty('routeFit');
    expect(result.signals).toHaveProperty('variance');
  });

  it('handles empty seasonBreakdown', () => {
    const input: ComputeBreakoutInput = {
      seasonBreakdown: [],
      prediction: 0,
      priceHillios: 50,
      birthDate: null,
      medianPtsPerHillio: 0,
      categoryScores: null,
    };

    const result = computeBreakout(input);
    expect(result.index).toBe(8); // only variance 7.5 → rounds to 8
    expect(result.upsideP80).toBe(0);
    expect(result.flags).toEqual([]);
  });

  it('handles all-zero seasons', () => {
    const input: ComputeBreakoutInput = {
      seasonBreakdown: [makeSeason(2024, 0), makeSeason(2023, 0), makeSeason(2022, 0)],
      prediction: 0,
      priceHillios: 50,
      birthDate: null,
      medianPtsPerHillio: 0,
      categoryScores: cat(0, 0, 0, 0),
    };

    const result = computeBreakout(input);
    expect(result.index).toBe(8); // only variance default 7.5
    expect(result.upsideP80).toBe(0);
  });
});

// ── computeMedianPtsPerHillio ───────────────────────────────────────

describe('computeMedianPtsPerHillio', () => {
  it('returns 0 for empty array', () => {
    expect(computeMedianPtsPerHillio([])).toBe(0);
  });

  it('returns 0 when all values are null', () => {
    expect(computeMedianPtsPerHillio([{ pointsPerHillio: null }, { pointsPerHillio: null }])).toBe(
      0,
    );
  });

  it('computes median for odd count', () => {
    const riders = [{ pointsPerHillio: 1 }, { pointsPerHillio: 3 }, { pointsPerHillio: 5 }];
    expect(computeMedianPtsPerHillio(riders)).toBe(3);
  });

  it('computes median for even count', () => {
    const riders = [
      { pointsPerHillio: 1 },
      { pointsPerHillio: 2 },
      { pointsPerHillio: 3 },
      { pointsPerHillio: 4 },
    ];
    expect(computeMedianPtsPerHillio(riders)).toBe(2.5);
  });

  it('filters out null and zero values', () => {
    const riders = [
      { pointsPerHillio: null },
      { pointsPerHillio: 0 },
      { pointsPerHillio: 5 },
      { pointsPerHillio: 10 },
    ];
    expect(computeMedianPtsPerHillio(riders)).toBe(7.5);
  });
});
