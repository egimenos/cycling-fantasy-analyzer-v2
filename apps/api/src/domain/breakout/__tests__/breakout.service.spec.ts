import type { ProfileSummary } from '@cycling-analyzer/shared-types';
import type { CoreCategoryScores, RacePerformance, YearlyTotal } from '../breakout.types';

// Use string values directly since Jest can't resolve ESM enum from shared-types
const BreakoutFlag = {
  EmergingTalent: 'EMERGING_TALENT',
  HotStreak: 'HOT_STREAK',
  DeepValue: 'DEEP_VALUE',
  SprintOpportunity: 'SPRINT_OPPORTUNITY',
  BreakawayHunter: 'BREAKAWAY_HUNTER',
  RaceSpecialist: 'RACE_SPECIALIST',
} as const;
import {
  computeAge,
  computeRawSlope,
  computeTrajectory,
  computeForm,
  computeRouteFit,
  computeVariance,
  computeBpiIndex,
  computeUpsideP80,
  evaluateFlags,
  computeBreakout,
  computeP75PtsPerHillio,
} from '../breakout.service';
import type { ComputeBreakoutInput } from '../breakout.types';

// ── Helpers ──────────────────────────────────────────────────────────

function makeSeason(year: number, total: number): YearlyTotal {
  return { year, total };
}

function makePerf(raceSlug: string, year: number, daysAgo: number, total: number): RacePerformance {
  const d = new Date(NOW);
  d.setDate(d.getDate() - daysAgo);
  return { raceSlug, year, raceDate: d, total };
}

function cat(gc = 0, stage = 0, mountain = 0, sprint = 0): CoreCategoryScores {
  return { gc, stage, mountain, sprint };
}

const NOW = new Date('2026-04-04');
const youngBirthDate = new Date('2003-06-15'); // ~22 years old
const midBirthDate = new Date('2000-01-01'); // ~26 years old
const oldBirthDate = new Date('1992-01-01'); // ~34 years old

// ── computeAge ──────────────────────────────────────────────────────

describe('computeAge', () => {
  it('returns 28 for null birthDate', () => {
    expect(computeAge(null)).toBe(28);
  });

  it('computes age from birthDate', () => {
    const age = computeAge(youngBirthDate, NOW);
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
  it('returns 0 for 0 or 1 completed season', () => {
    expect(computeTrajectory([], null, NOW)).toBe(0);
    expect(computeTrajectory([makeSeason(2025, 100)], null, NOW)).toBe(0);
  });

  it('excludes current year from regression', () => {
    // 2026 is the incomplete year — only 2024 and 2025 are used
    const seasons = [makeSeason(2024, 50), makeSeason(2025, 100), makeSeason(2026, 10)];
    const withCurrent = computeTrajectory(seasons, null, NOW);
    const withoutCurrent = computeTrajectory(
      [makeSeason(2024, 50), makeSeason(2025, 100)],
      null,
      NOW,
    );
    expect(withCurrent).toBe(withoutCurrent);
  });

  it('returns 0 for negative slope', () => {
    const seasons = [makeSeason(2024, 200), makeSeason(2025, 50)];
    expect(computeTrajectory(seasons, null, NOW)).toBe(0);
  });

  it('applies age factor 1.5 for age < 25', () => {
    const seasons = [makeSeason(2024, 50), makeSeason(2025, 60)];
    // slope = 10, factor 1.5 -> 15
    expect(computeTrajectory(seasons, youngBirthDate, NOW)).toBe(15);
  });

  it('applies age factor 1.0 for age 25-27', () => {
    const seasons = [makeSeason(2024, 50), makeSeason(2025, 60)];
    expect(computeTrajectory(seasons, midBirthDate, NOW)).toBe(10);
  });

  it('applies age factor 0.5 for age 28-31', () => {
    const seasons = [makeSeason(2024, 50), makeSeason(2025, 60)];
    // default age 28, factor 0.5 -> 5
    expect(computeTrajectory(seasons, null, NOW)).toBe(5);
  });

  it('applies age factor 0.2 for age 32+', () => {
    const seasons = [makeSeason(2024, 50), makeSeason(2025, 60)];
    expect(computeTrajectory(seasons, oldBirthDate, NOW)).toBe(2);
  });

  it('clamps at 30', () => {
    const seasons = [makeSeason(2024, 0), makeSeason(2025, 200)];
    // slope = 200, factor 1.5 -> 300 -> clamped to 30
    expect(computeTrajectory(seasons, youngBirthDate, NOW)).toBe(30);
  });
});

// ── Signal 2: Form ──────────────────────────────────────────────────

describe('computeForm', () => {
  it('returns 0 for empty performances', () => {
    expect(computeForm([], NOW)).toBe(0);
  });

  it('returns 0 when no races in last 90 days', () => {
    const perfs = [makePerf('race-a', 2025, 120, 100), makePerf('race-b', 2025, 200, 80)];
    expect(computeForm(perfs, NOW)).toBe(0);
  });

  it('returns 0 when career avg is 0', () => {
    const perfs = [makePerf('race-a', 2026, 10, 0), makePerf('race-b', 2025, 200, 0)];
    expect(computeForm(perfs, NOW)).toBe(0);
  });

  it('computes ratio-based score for hot form', () => {
    // Recent: 200 avg. Career: [200, 80, 80] avg=120. Ratio=200/120=1.667. Score=(0.667)*30=20
    const perfs = [
      makePerf('race-a', 2026, 10, 200),
      makePerf('race-b', 2025, 120, 80),
      makePerf('race-c', 2025, 200, 80),
    ];
    const score = computeForm(perfs, NOW);
    expect(score).toBeCloseTo(20, 0);
  });

  it('returns 0 when recent equals career avg', () => {
    // All races have same total -> ratio = 1 -> score = 0
    const perfs = [
      makePerf('race-a', 2026, 10, 100),
      makePerf('race-b', 2025, 120, 100),
      makePerf('race-c', 2024, 400, 100),
    ];
    expect(computeForm(perfs, NOW)).toBe(0);
  });

  it('clamps at 30', () => {
    const perfs = [
      makePerf('race-a', 2026, 10, 300),
      makePerf('race-b', 2024, 400, 50),
      makePerf('race-c', 2023, 500, 50),
    ];
    // Recent avg=300, career avg=(300+50+50)/3=133.3, ratio=2.25, score=(1.25)*30=37.5 -> clamped 30
    expect(computeForm(perfs, NOW)).toBe(30);
  });
});

// ── Signal 3: Route Fit ─────────────────────────────────────────────

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
    expect(score).toBeGreaterThan(10);
  });

  it('scores low for climber on flat course', () => {
    const climber = cat(0, 0, 95, 5);
    const score = computeRouteFit(climber, flatRace);
    expect(score).toBeLessThan(3);
  });
});

// ── Signal 4: Variance ──────────────────────────────────────────────

describe('computeVariance', () => {
  it('returns 10 for fewer than 2 seasons of data', () => {
    expect(computeVariance([])).toBe(10);
    expect(computeVariance([makePerf('r', 2024, 10, 100)])).toBe(10);
  });

  it('returns 10 when only 1 season has non-zero avg', () => {
    const perfs = [makePerf('r1', 2024, 10, 100), makePerf('r2', 2023, 200, 0)];
    expect(computeVariance(perfs)).toBe(10);
  });

  it('returns 0 for identical per-season averages', () => {
    const perfs = [
      makePerf('r1', 2024, 10, 100),
      makePerf('r2', 2024, 30, 100),
      makePerf('r3', 2023, 200, 100),
      makePerf('r4', 2023, 250, 100),
    ];
    expect(computeVariance(perfs)).toBe(0);
  });

  it('computes CV-based score on per-season averages', () => {
    // 2024: avg(50,150)=100, 2023: avg(20,80)=50. Mean=75, SD=25, CV=0.333, score=6.67
    const perfs = [
      makePerf('r1', 2024, 10, 50),
      makePerf('r2', 2024, 30, 150),
      makePerf('r3', 2023, 200, 20),
      makePerf('r4', 2023, 250, 80),
    ];
    expect(computeVariance(perfs)).toBeCloseTo(6.67, 0);
  });

  it('normalizes by races per season', () => {
    // Season A: 1 race scoring 200 -> avg 200
    // Season B: 4 races scoring 50 each -> avg 50
    // Variance on avgs: [200, 50] -> mean=125, SD=75, CV=0.6 -> score=12
    const perfs = [
      makePerf('r1', 2024, 10, 200),
      makePerf('r2', 2023, 100, 50),
      makePerf('r3', 2023, 150, 50),
      makePerf('r4', 2023, 200, 50),
      makePerf('r5', 2023, 250, 50),
    ];
    expect(computeVariance(perfs)).toBeCloseTo(12.0, 0);
  });

  it('clamps at 20', () => {
    // Extreme: avg 500 vs avg 10. Mean=255, SD=245, CV~0.96 -> score~19.2
    const perfs = [makePerf('r1', 2024, 10, 500), makePerf('r2', 2023, 200, 10)];
    expect(computeVariance(perfs)).toBeLessThanOrEqual(20);
  });
});

// ── Composite Index ─────────────────────────────────────────────────

describe('computeBpiIndex', () => {
  it('sums signals and rounds', () => {
    const signals = { trajectory: 12.3, form: 7.7, routeFit: 4, variance: 10 };
    expect(computeBpiIndex(signals)).toBe(34);
  });

  it('clamps at 100', () => {
    const signals = { trajectory: 30, form: 30, routeFit: 20, variance: 20 };
    expect(computeBpiIndex(signals)).toBe(100);
  });

  it('clamps at 0', () => {
    const signals = { trajectory: 0, form: 0, routeFit: 0, variance: 0 };
    expect(computeBpiIndex(signals)).toBe(0);
  });
});

// ── Upside P80 ──────────────────────────────────────────────────────

describe('computeUpsideP80', () => {
  it('returns prediction x 1.8 for < 3 seasons', () => {
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
    yearlyTotals: [],
    racePerformances: [],
    prediction: 100,
    priceHillios: 200,
    birthDate: null,
    p75PtsPerHillio: 1.0,
    categoryScores: cat(25, 25, 25, 25),
  };

  const neutralSignals = { trajectory: 0, form: 0, routeFit: 0, variance: 10 };

  describe('EMERGING_TALENT', () => {
    it('triggers for young rider with steep slope', () => {
      const input: ComputeBreakoutInput = {
        ...baseInput,
        birthDate: youngBirthDate,
        yearlyTotals: [makeSeason(2024, 100), makeSeason(2023, 30)],
      };
      const flags = evaluateFlags(input, neutralSignals);
      expect(flags).toContain(BreakoutFlag.EmergingTalent);
    });

    it('does not trigger for age >= 25', () => {
      const input: ComputeBreakoutInput = {
        ...baseInput,
        birthDate: midBirthDate,
        yearlyTotals: [makeSeason(2024, 100), makeSeason(2023, 30)],
      };
      expect(evaluateFlags(input, neutralSignals)).not.toContain(BreakoutFlag.EmergingTalent);
    });

    it('does not trigger with > 3 seasons', () => {
      const input: ComputeBreakoutInput = {
        ...baseInput,
        birthDate: youngBirthDate,
        yearlyTotals: [
          makeSeason(2024, 200),
          makeSeason(2023, 150),
          makeSeason(2022, 100),
          makeSeason(2021, 50),
        ],
      };
      expect(evaluateFlags(input, neutralSignals)).not.toContain(BreakoutFlag.EmergingTalent);
    });
  });

  describe('HOT_STREAK', () => {
    it('triggers when form signal > 15', () => {
      const signals = { ...neutralSignals, form: 18 };
      expect(evaluateFlags(baseInput, signals)).toContain(BreakoutFlag.HotStreak);
    });

    it('does not trigger when form signal <= 15', () => {
      const signals = { ...neutralSignals, form: 12 };
      expect(evaluateFlags(baseInput, signals)).not.toContain(BreakoutFlag.HotStreak);
    });
  });

  describe('DEEP_VALUE', () => {
    it('triggers for cheap rider with above-P75 pts/hillio and prediction >= 20', () => {
      const input: ComputeBreakoutInput = {
        ...baseInput,
        priceHillios: 80,
        prediction: 200,
        p75PtsPerHillio: 1.0,
      };
      // ptsPerHillio = 200/80 = 2.5, P75 = 1.0, prediction = 200 >= 20
      expect(evaluateFlags(input, neutralSignals)).toContain(BreakoutFlag.DeepValue);
    });

    it('does not trigger when price > 100', () => {
      const input: ComputeBreakoutInput = {
        ...baseInput,
        priceHillios: 150,
        prediction: 300,
        p75PtsPerHillio: 1.0,
      };
      expect(evaluateFlags(input, neutralSignals)).not.toContain(BreakoutFlag.DeepValue);
    });

    it('does not trigger when prediction < 20', () => {
      const input: ComputeBreakoutInput = {
        ...baseInput,
        priceHillios: 50,
        prediction: 15,
        p75PtsPerHillio: 0.1,
      };
      // ptsPerHillio = 15/50 = 0.3 > 0.1, but prediction < 20
      expect(evaluateFlags(input, neutralSignals)).not.toContain(BreakoutFlag.DeepValue);
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
      expect(evaluateFlags(input, neutralSignals)).toContain(BreakoutFlag.SprintOpportunity);
    });

    it('does not trigger without profileSummary', () => {
      const input: ComputeBreakoutInput = {
        ...baseInput,
        priceHillios: 100,
        categoryScores: cat(5, 40, 5, 50),
      };
      expect(evaluateFlags(input, neutralSignals)).not.toContain(BreakoutFlag.SprintOpportunity);
    });
  });

  describe('BREAKAWAY_HUNTER', () => {
    it('triggers for cheap rider with >10% mountain', () => {
      const input: ComputeBreakoutInput = {
        ...baseInput,
        priceHillios: 80,
        categoryScores: cat(10, 30, 50, 10),
      };
      expect(evaluateFlags(input, neutralSignals)).toContain(BreakoutFlag.BreakawayHunter);
    });

    it('does not trigger when price > 100', () => {
      const input: ComputeBreakoutInput = {
        ...baseInput,
        priceHillios: 120,
        categoryScores: cat(10, 30, 50, 10),
      };
      expect(evaluateFlags(input, neutralSignals)).not.toContain(BreakoutFlag.BreakawayHunter);
    });
  });

  describe('RACE_SPECIALIST', () => {
    it('triggers when median history > 1.15x prediction', () => {
      const input: ComputeBreakoutInput = {
        ...baseInput,
        prediction: 100,
        sameRaceHistory: [
          { year: 2024, gc: 0, stage: 0, mountain: 0, sprint: 0, total: 150 },
          { year: 2023, gc: 0, stage: 0, mountain: 0, sprint: 0, total: 130 },
        ],
      };
      expect(evaluateFlags(input, neutralSignals)).toContain(BreakoutFlag.RaceSpecialist);
    });

    it('does not trigger with < 2 race history entries', () => {
      const input: ComputeBreakoutInput = {
        ...baseInput,
        prediction: 100,
        sameRaceHistory: [{ year: 2024, gc: 0, stage: 0, mountain: 0, sprint: 0, total: 200 }],
      };
      expect(evaluateFlags(input, neutralSignals)).not.toContain(BreakoutFlag.RaceSpecialist);
    });
  });
});

// ── computeBreakout ─────────────────────────────────────────────────

describe('computeBreakout', () => {
  it('returns all fields with correct types', () => {
    const input: ComputeBreakoutInput = {
      yearlyTotals: [makeSeason(2024, 150), makeSeason(2023, 100), makeSeason(2022, 50)],
      racePerformances: [
        makePerf('r1', 2024, 10, 150),
        makePerf('r2', 2023, 200, 100),
        makePerf('r3', 2022, 400, 50),
      ],
      prediction: 120,
      priceHillios: 80,
      birthDate: youngBirthDate,
      p75PtsPerHillio: 1.0,
      categoryScores: cat(30, 30, 20, 20),
    };

    const result = computeBreakout(input);

    expect(result.index).toBeGreaterThanOrEqual(0);
    expect(result.index).toBeLessThanOrEqual(100);
    expect(typeof result.upsideP80).toBe('number');
    expect(Array.isArray(result.flags)).toBe(true);
    expect(result.signals).toHaveProperty('trajectory');
    expect(result.signals).toHaveProperty('form');
    expect(result.signals).toHaveProperty('routeFit');
    expect(result.signals).toHaveProperty('variance');
  });

  it('handles empty data', () => {
    const input: ComputeBreakoutInput = {
      yearlyTotals: [],
      racePerformances: [],
      prediction: 0,
      priceHillios: 50,
      birthDate: null,
      p75PtsPerHillio: 0,
      categoryScores: null,
    };

    const result = computeBreakout(input);
    expect(result.index).toBe(10); // only variance default 10 -> rounds to 10
    expect(result.upsideP80).toBe(0);
    expect(result.flags).toEqual([]);
  });

  it('handles all-zero data', () => {
    const input: ComputeBreakoutInput = {
      yearlyTotals: [makeSeason(2024, 0), makeSeason(2023, 0), makeSeason(2022, 0)],
      racePerformances: [
        makePerf('r1', 2024, 10, 0),
        makePerf('r2', 2023, 200, 0),
        makePerf('r3', 2022, 400, 0),
      ],
      prediction: 0,
      priceHillios: 50,
      birthDate: null,
      p75PtsPerHillio: 0,
      categoryScores: cat(0, 0, 0, 0),
    };

    const result = computeBreakout(input);
    expect(result.index).toBe(10); // only variance default 10
    expect(result.upsideP80).toBe(0);
  });
});

// ── computeP75PtsPerHillio ──────────────────────────────────────────

describe('computeP75PtsPerHillio', () => {
  it('returns 0 for empty array', () => {
    expect(computeP75PtsPerHillio([])).toBe(0);
  });

  it('returns 0 when all values are null', () => {
    expect(computeP75PtsPerHillio([{ pointsPerHillio: null }, { pointsPerHillio: null }])).toBe(0);
  });

  it('computes P75 for sorted values', () => {
    // sorted: [1, 2, 3, 4]. P75 index = floor(4*0.75) = 3 -> value = 4
    const riders = [
      { pointsPerHillio: 1 },
      { pointsPerHillio: 2 },
      { pointsPerHillio: 3 },
      { pointsPerHillio: 4 },
    ];
    expect(computeP75PtsPerHillio(riders)).toBe(4);
  });

  it('computes P75 for odd count', () => {
    // sorted: [1, 3, 5]. P75 index = floor(3*0.75) = 2 -> value = 5
    const riders = [{ pointsPerHillio: 1 }, { pointsPerHillio: 3 }, { pointsPerHillio: 5 }];
    expect(computeP75PtsPerHillio(riders)).toBe(5);
  });

  it('filters out null and zero values', () => {
    // valid: [5, 10]. P75 index = floor(2*0.75) = 1 -> value = 10
    const riders = [
      { pointsPerHillio: null },
      { pointsPerHillio: 0 },
      { pointsPerHillio: 5 },
      { pointsPerHillio: 10 },
    ];
    expect(computeP75PtsPerHillio(riders)).toBe(10);
  });
});
