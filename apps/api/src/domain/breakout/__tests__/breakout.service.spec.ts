import type { SeasonBreakdown, ProfileSummary } from '@cycling-analyzer/shared-types';
import type { CoreCategoryScores, RacePerformance } from '../breakout.types';

// Use string values directly since Jest can't resolve ESM enum from shared-types
const BreakoutFlag = {
  EmergingTalent: 'EMERGING_TALENT',
  HotStreak: 'HOT_STREAK',
  DeepValue: 'DEEP_VALUE',
  Comeback: 'COMEBACK',
  SprintOpportunity: 'SPRINT_OPPORTUNITY',
  BreakawayHunter: 'BREAKAWAY_HUNTER',
  RaceSpecialist: 'RACE_SPECIALIST',
} as const;
import {
  computeAge,
  computeRawSlope,
  computeTrajectory,
  computeForm,
  computeComeback,
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
    // slope = 10, factor 1.5 → 15
    expect(computeTrajectory(seasons, youngBirthDate, NOW)).toBe(15);
  });

  it('applies age factor 1.0 for age 25-27', () => {
    const seasons = [makeSeason(2024, 50), makeSeason(2025, 60)];
    expect(computeTrajectory(seasons, midBirthDate, NOW)).toBe(10);
  });

  it('applies age factor 0.5 for age 28-31', () => {
    const seasons = [makeSeason(2024, 50), makeSeason(2025, 60)];
    // default age 28, factor 0.5 → 5
    expect(computeTrajectory(seasons, null, NOW)).toBe(5);
  });

  it('applies age factor 0.2 for age 32+', () => {
    const seasons = [makeSeason(2024, 50), makeSeason(2025, 60)];
    expect(computeTrajectory(seasons, oldBirthDate, NOW)).toBe(2);
  });

  it('clamps at 25', () => {
    const seasons = [makeSeason(2024, 0), makeSeason(2025, 200)];
    // slope = 200, factor 1.5 → 300 → clamped to 25
    expect(computeTrajectory(seasons, youngBirthDate, NOW)).toBe(25);
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
    // Recent: 200 avg. Career: [200, 80, 80] avg=120. Ratio=200/120=1.667. Score=(0.667)*25=16.67
    const perfs = [
      makePerf('race-a', 2026, 10, 200),
      makePerf('race-b', 2025, 120, 80),
      makePerf('race-c', 2025, 200, 80),
    ];
    const score = computeForm(perfs, NOW);
    expect(score).toBeCloseTo(16.67, 0);
  });

  it('returns 0 when recent equals career avg', () => {
    // All races have same total → ratio = 1 → score = 0
    const perfs = [
      makePerf('race-a', 2026, 10, 100),
      makePerf('race-b', 2025, 120, 100),
      makePerf('race-c', 2024, 400, 100),
    ];
    expect(computeForm(perfs, NOW)).toBe(0);
  });

  it('clamps at 25', () => {
    // Recent: 300, Career: [300, 50] avg=175. Ratio=1.71 → score=17.9. Not clamped yet.
    // Recent: 500, Career: [500, 50] avg=275. Ratio=1.82 → score=20.5. Still not clamped.
    // Recent: 1000, Career: [1000, 50] avg=525. Ratio=1.905 → 22.6. Not quite.
    // Use extreme: recent 500, old 10 → avg=255, ratio=1.96 → 24.0
    // Even more: recent 500, old 1 → avg=250.5, ratio=1.996 → 24.9
    // Force clamp: recent 1000, old 1 → avg=500.5, ratio=1.998 → 24.95
    // Actually need ratio >= 2 for clamp. recent 200, old single 10 → avg=105, ratio=1.9 → 23.8
    // Simpler: just make a case where ratio > 2
    const perfs = [
      makePerf('race-a', 2026, 10, 300),
      makePerf('race-b', 2024, 400, 50),
      makePerf('race-c', 2023, 500, 50),
    ];
    // Recent avg=300, career avg=(300+50+50)/3=133.3, ratio=2.25, score=(1.25)*25=31.25 → clamped 25
    expect(computeForm(perfs, NOW)).toBe(25);
  });
});

// ── Signal 3: Comeback ──────────────────────────────────────────────

describe('computeComeback', () => {
  it('returns 0 for age > 33', () => {
    expect(computeComeback([makeSeason(2020, 300)], 100, oldBirthDate, 10, 10, NOW)).toBe(0);
  });

  it('returns 0 for empty seasons', () => {
    expect(computeComeback([], 100, null, 10, 10, NOW)).toBe(0);
  });

  it('returns 0 for prediction <= 0', () => {
    expect(computeComeback([makeSeason(2020, 300)], 0, null, 10, 10, NOW)).toBe(0);
  });

  it('returns 0 without recovery evidence', () => {
    // peak=500, prediction=100, ratio=5, gap=(4)*5=20 BUT trajectory=0 and form=0
    expect(computeComeback([makeSeason(2020, 500)], 100, null, 0, 0, NOW)).toBe(0);
  });

  it('returns 0 with low trajectory and form', () => {
    expect(computeComeback([makeSeason(2020, 500)], 100, null, 5, 5, NOW)).toBe(0);
  });

  it('computes gap when trajectory provides recovery evidence', () => {
    // peak=500, prediction=100, ratio=5, gap=(5-1)*5=20, trajectory=10 > 5 → recovery yes
    expect(computeComeback([makeSeason(2020, 500)], 100, null, 10, 0, NOW)).toBe(20);
  });

  it('computes gap when form provides recovery evidence', () => {
    // peak=300, prediction=100, ratio=3, gap=(3-1)*5=10, form=8 > 5 → recovery yes
    expect(computeComeback([makeSeason(2020, 300)], 100, null, 0, 8, NOW)).toBe(10);
  });

  it('clamps at 20', () => {
    expect(computeComeback([makeSeason(2020, 1000)], 50, null, 10, 10, NOW)).toBe(20);
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
  it('returns 7.5 for fewer than 2 seasons of data', () => {
    expect(computeVariance([])).toBe(7.5);
    expect(computeVariance([makePerf('r', 2024, 10, 100)])).toBe(7.5);
  });

  it('returns 7.5 when only 1 season has non-zero avg', () => {
    const perfs = [makePerf('r1', 2024, 10, 100), makePerf('r2', 2023, 200, 0)];
    expect(computeVariance(perfs)).toBe(7.5);
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
    // 2024: avg(50,150)=100, 2023: avg(20,80)=50. Mean=75, SD=25, CV=0.333, score=5.0
    const perfs = [
      makePerf('r1', 2024, 10, 50),
      makePerf('r2', 2024, 30, 150),
      makePerf('r3', 2023, 200, 20),
      makePerf('r4', 2023, 250, 80),
    ];
    expect(computeVariance(perfs)).toBeCloseTo(5.0, 1);
  });

  it('normalizes by races per season', () => {
    // Season A: 1 race scoring 200 → avg 200
    // Season B: 4 races scoring 50 each → avg 50
    // Old variance on totals: [200, 200] → CV=0 (same total!)
    // New variance on avgs: [200, 50] → mean=125, SD=75, CV=0.6 → score=9
    const perfs = [
      makePerf('r1', 2024, 10, 200),
      makePerf('r2', 2023, 100, 50),
      makePerf('r3', 2023, 150, 50),
      makePerf('r4', 2023, 200, 50),
      makePerf('r5', 2023, 250, 50),
    ];
    expect(computeVariance(perfs)).toBeCloseTo(9.0, 0);
  });

  it('clamps at 15', () => {
    // Extreme: avg 500 vs avg 10. Mean=255, SD=245, CV≈0.96 → score≈14.4
    const perfs = [makePerf('r1', 2024, 10, 500), makePerf('r2', 2023, 200, 10)];
    expect(computeVariance(perfs)).toBeLessThanOrEqual(15);
  });
});

// ── Composite Index ─────────────────────────────────────────────────

describe('computeBpiIndex', () => {
  it('sums signals and rounds', () => {
    const signals = { trajectory: 10.3, form: 5.7, comeback: 8, routeFit: 3, variance: 7 };
    expect(computeBpiIndex(signals)).toBe(34);
  });

  it('clamps at 100', () => {
    const signals = { trajectory: 25, form: 25, comeback: 20, routeFit: 15, variance: 15 };
    expect(computeBpiIndex(signals)).toBe(100);
  });

  it('clamps at 0', () => {
    const signals = { trajectory: 0, form: 0, comeback: 0, routeFit: 0, variance: 0 };
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
    racePerformances: [],
    prediction: 100,
    priceHillios: 200,
    birthDate: null,
    medianPtsPerHillio: 1.0,
    categoryScores: cat(25, 25, 25, 25),
  };

  const neutralSignals = { trajectory: 0, form: 0, comeback: 0, routeFit: 0, variance: 7.5 };

  describe('EMERGING_TALENT', () => {
    it('triggers for young rider with steep slope', () => {
      const input: ComputeBreakoutInput = {
        ...baseInput,
        birthDate: youngBirthDate,
        seasonBreakdown: [makeSeason(2024, 100), makeSeason(2023, 30)],
      };
      const flags = evaluateFlags(input, neutralSignals);
      expect(flags).toContain(BreakoutFlag.EmergingTalent);
    });

    it('does not trigger for age >= 25', () => {
      const input: ComputeBreakoutInput = {
        ...baseInput,
        birthDate: midBirthDate,
        seasonBreakdown: [makeSeason(2024, 100), makeSeason(2023, 30)],
      };
      expect(evaluateFlags(input, neutralSignals)).not.toContain(BreakoutFlag.EmergingTalent);
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
      expect(evaluateFlags(input, neutralSignals)).not.toContain(BreakoutFlag.EmergingTalent);
    });
  });

  describe('HOT_STREAK', () => {
    it('triggers when form signal > 12.5', () => {
      const signals = { ...neutralSignals, form: 15 };
      expect(evaluateFlags(baseInput, signals)).toContain(BreakoutFlag.HotStreak);
    });

    it('does not trigger when form signal <= 12.5', () => {
      const signals = { ...neutralSignals, form: 10 };
      expect(evaluateFlags(baseInput, signals)).not.toContain(BreakoutFlag.HotStreak);
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
      expect(evaluateFlags(input, neutralSignals)).toContain(BreakoutFlag.DeepValue);
    });

    it('does not trigger when price > 100', () => {
      const input: ComputeBreakoutInput = {
        ...baseInput,
        priceHillios: 150,
        prediction: 300,
        medianPtsPerHillio: 1.0,
      };
      expect(evaluateFlags(input, neutralSignals)).not.toContain(BreakoutFlag.DeepValue);
    });
  });

  describe('COMEBACK', () => {
    it('triggers when comeback signal > 10', () => {
      const signals = { ...neutralSignals, comeback: 15 };
      expect(evaluateFlags(baseInput, signals)).toContain(BreakoutFlag.Comeback);
    });

    it('does not trigger when comeback signal <= 10', () => {
      const signals = { ...neutralSignals, comeback: 8 };
      expect(evaluateFlags(baseInput, signals)).not.toContain(BreakoutFlag.Comeback);
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
    it('triggers when median history > 1.15× prediction', () => {
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
      seasonBreakdown: [makeSeason(2024, 150), makeSeason(2023, 100), makeSeason(2022, 50)],
      racePerformances: [
        makePerf('r1', 2024, 10, 150),
        makePerf('r2', 2023, 200, 100),
        makePerf('r3', 2022, 400, 50),
      ],
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
    expect(result.signals).toHaveProperty('form');
    expect(result.signals).toHaveProperty('comeback');
    expect(result.signals).toHaveProperty('routeFit');
    expect(result.signals).toHaveProperty('variance');
  });

  it('handles empty data', () => {
    const input: ComputeBreakoutInput = {
      seasonBreakdown: [],
      racePerformances: [],
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

  it('handles all-zero data', () => {
    const input: ComputeBreakoutInput = {
      seasonBreakdown: [makeSeason(2024, 0), makeSeason(2023, 0), makeSeason(2022, 0)],
      racePerformances: [
        makePerf('r1', 2024, 10, 0),
        makePerf('r2', 2023, 200, 0),
        makePerf('r3', 2022, 400, 0),
      ],
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
