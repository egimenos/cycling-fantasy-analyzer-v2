import { RaceType } from '../shared/race-type.enum';
import { ResultCategory } from '../shared/result-category.enum';
import { getTemporalWeight, TEMPORAL_WEIGHTS } from './temporal-decay';
import {
  computeCategoryScore,
  computeRiderScore,
  computePoolStats,
  computeCompositeScore,
  RiderScore,
  ScoringService,
} from './scoring.service';
import { createRaceResult } from './fixtures';

describe('Temporal Decay', () => {
  describe('TEMPORAL_WEIGHTS', () => {
    it('should define weights for 0, 1, and 2 seasons ago', () => {
      expect(TEMPORAL_WEIGHTS[0]).toBe(1.0);
      expect(TEMPORAL_WEIGHTS[1]).toBe(0.6);
      expect(TEMPORAL_WEIGHTS[2]).toBe(0.3);
    });
  });

  describe('getTemporalWeight', () => {
    it('should return 1.0 for current season', () => {
      expect(getTemporalWeight(2024, 2024)).toBe(1.0);
    });

    it('should return 0.6 for previous season', () => {
      expect(getTemporalWeight(2023, 2024)).toBe(0.6);
    });

    it('should return 0.3 for two seasons ago', () => {
      expect(getTemporalWeight(2022, 2024)).toBe(0.3);
    });

    it('should return 0 for three seasons ago', () => {
      expect(getTemporalWeight(2021, 2024)).toBe(0);
    });

    it('should return 0 for four or more seasons ago', () => {
      expect(getTemporalWeight(2020, 2024)).toBe(0);
      expect(getTemporalWeight(2010, 2024)).toBe(0);
    });

    it('should return 0 for future results', () => {
      expect(getTemporalWeight(2025, 2024)).toBe(0);
    });
  });
});

describe('computeCategoryScore', () => {
  it('should return weighted average for multi-season results', () => {
    const results = [
      createRaceResult({ year: 2024, position: 1, category: ResultCategory.GC }),
      createRaceResult({ year: 2023, position: 3, category: ResultCategory.GC }),
    ];
    // Expected: (200 * 1.0 + 120 * 0.6) / (1.0 + 0.6) = (200 + 72) / 1.6 = 272 / 1.6 = 170
    expect(computeCategoryScore(results, ResultCategory.GC, RaceType.GRAND_TOUR, 2024)).toBeCloseTo(
      170,
    );
  });

  it('should return 0 when no qualifying results exist', () => {
    expect(computeCategoryScore([], ResultCategory.GC, RaceType.GRAND_TOUR, 2024)).toBe(0);
  });

  it('should filter out results from wrong race type', () => {
    const results = [
      createRaceResult({ raceType: RaceType.CLASSIC, category: ResultCategory.FINAL, position: 1 }),
    ];
    expect(computeCategoryScore(results, ResultCategory.GC, RaceType.GRAND_TOUR, 2024)).toBe(0);
  });

  it('should filter out results from wrong category', () => {
    const results = [createRaceResult({ category: ResultCategory.STAGE, position: 1 })];
    expect(computeCategoryScore(results, ResultCategory.GC, RaceType.GRAND_TOUR, 2024)).toBe(0);
  });

  it('should exclude results older than 2 seasons', () => {
    const results = [
      createRaceResult({ year: 2021, position: 1 }), // 3 seasons ago → excluded
    ];
    expect(computeCategoryScore(results, ResultCategory.GC, RaceType.GRAND_TOUR, 2024)).toBe(0);
  });

  it('should handle DNF results (position null) as 0 points but counting in denominator', () => {
    const results = [createRaceResult({ year: 2024, position: null, dnf: true })];
    // 0 points * 1.0 / 1.0 = 0
    expect(computeCategoryScore(results, ResultCategory.GC, RaceType.GRAND_TOUR, 2024)).toBe(0);
  });

  it('should handle single-season results with weight 1.0', () => {
    const results = [createRaceResult({ year: 2024, position: 5, category: ResultCategory.GC })];
    // GC position 5 = 90 points; weight 1.0 → 90 * 1.0 / 1.0 = 90
    expect(computeCategoryScore(results, ResultCategory.GC, RaceType.GRAND_TOUR, 2024)).toBe(90);
  });

  it('should handle positions beyond scoring threshold as 0 points', () => {
    const results = [
      createRaceResult({ year: 2024, position: 50 }), // Beyond top-20 → 0 points
    ];
    // 0 points * 1.0 / 1.0 = 0
    expect(computeCategoryScore(results, ResultCategory.GC, RaceType.GRAND_TOUR, 2024)).toBe(0);
  });

  it('should return 0 when all results are too old (temporal weight 0)', () => {
    const results = [
      createRaceResult({ year: 2020, position: 1 }),
      createRaceResult({ year: 2019, position: 2 }),
    ];
    expect(computeCategoryScore(results, ResultCategory.GC, RaceType.GRAND_TOUR, 2024)).toBe(0);
  });

  it('should compute weighted average across three seasons', () => {
    const results = [
      createRaceResult({ year: 2024, position: 1, category: ResultCategory.STAGE }),
      createRaceResult({ year: 2023, position: 2, category: ResultCategory.STAGE }),
      createRaceResult({ year: 2022, position: 3, category: ResultCategory.STAGE }),
    ];
    // Stage: pos1=15, pos2=12, pos3=10
    // (15 * 1.0 + 12 * 0.6 + 10 * 0.3) / (1.0 + 0.6 + 0.3)
    // = (15 + 7.2 + 3) / 1.9
    // = 25.2 / 1.9
    // ≈ 13.263
    expect(
      computeCategoryScore(results, ResultCategory.STAGE, RaceType.GRAND_TOUR, 2024),
    ).toBeCloseTo(25.2 / 1.9);
  });

  it('should handle mix of scoring and non-scoring results', () => {
    const results = [
      createRaceResult({ year: 2024, position: 1, category: ResultCategory.GC }),
      createRaceResult({ year: 2024, position: null, dnf: true, category: ResultCategory.GC }),
    ];
    // (200 * 1.0 + 0 * 1.0) / (1.0 + 1.0) = 200 / 2 = 100
    expect(computeCategoryScore(results, ResultCategory.GC, RaceType.GRAND_TOUR, 2024)).toBe(100);
  });
});

describe('computeRiderScore', () => {
  it('should sum all category scores for Grand Tour', () => {
    const results = [
      createRaceResult({ year: 2024, position: 1, category: ResultCategory.GC }),
      createRaceResult({ year: 2024, position: 1, category: ResultCategory.STAGE }),
      createRaceResult({ year: 2024, position: 1, category: ResultCategory.MOUNTAIN }),
      createRaceResult({ year: 2024, position: 1, category: ResultCategory.SPRINT }),
    ];
    const score = computeRiderScore('rider-1', results, RaceType.GRAND_TOUR, 2024);
    // GC=200, Stage=15, Mountain=12, Sprint=6
    expect(score.totalProjectedPts).toBe(200 + 15 + 12 + 6);
    expect(score.categoryScores.gc).toBe(200);
    expect(score.categoryScores.stage).toBe(15);
    expect(score.categoryScores.mountain).toBe(12);
    expect(score.categoryScores.sprint).toBe(6);
    expect(score.categoryScores.final).toBe(0);
  });

  it('should use only final score for Classic', () => {
    const results = [
      createRaceResult({
        raceType: RaceType.CLASSIC,
        category: ResultCategory.FINAL,
        position: 1,
        year: 2024,
      }),
    ];
    const score = computeRiderScore('rider-1', results, RaceType.CLASSIC, 2024);
    expect(score.totalProjectedPts).toBe(200);
    expect(score.categoryScores.final).toBe(200);
    expect(score.categoryScores.gc).toBe(0);
  });

  it('should return all zeros for rider with no data', () => {
    const score = computeRiderScore('rider-1', [], RaceType.GRAND_TOUR, 2024);
    expect(score.totalProjectedPts).toBe(0);
    expect(score.seasonsUsed).toBe(0);
    expect(score.qualifyingResultsCount).toBe(0);
    expect(score.categoryScores.gc).toBe(0);
    expect(score.categoryScores.stage).toBe(0);
    expect(score.categoryScores.mountain).toBe(0);
    expect(score.categoryScores.sprint).toBe(0);
    expect(score.categoryScores.final).toBe(0);
  });

  it('should count correct number of seasons used', () => {
    const results = [
      createRaceResult({ year: 2024, category: ResultCategory.GC }),
      createRaceResult({ year: 2023, category: ResultCategory.GC }),
      createRaceResult({ year: 2023, category: ResultCategory.STAGE }),
    ];
    const score = computeRiderScore('rider-1', results, RaceType.GRAND_TOUR, 2024);
    expect(score.seasonsUsed).toBe(2); // 2024 and 2023
  });

  it('should count correct number of qualifying results', () => {
    const results = [
      createRaceResult({ year: 2024, category: ResultCategory.GC }),
      createRaceResult({ year: 2024, category: ResultCategory.STAGE }),
      createRaceResult({ year: 2021, category: ResultCategory.GC }), // too old, excluded
    ];
    const score = computeRiderScore('rider-1', results, RaceType.GRAND_TOUR, 2024);
    expect(score.qualifyingResultsCount).toBe(2);
  });

  it('should handle rider with mixed race type results', () => {
    const results = [
      createRaceResult({
        raceType: RaceType.GRAND_TOUR,
        category: ResultCategory.GC,
        position: 5,
        year: 2024,
      }),
      createRaceResult({
        raceType: RaceType.CLASSIC,
        category: ResultCategory.FINAL,
        position: 1,
        year: 2024,
      }),
    ];
    const score = computeRiderScore('rider-1', results, RaceType.GRAND_TOUR, 2024);
    // Classic result should NOT contribute to Grand Tour score
    expect(score.categoryScores.final).toBe(0);
    expect(score.categoryScores.gc).toBe(90); // GC position 5
    expect(score.qualifyingResultsCount).toBe(1);
  });

  it('should set riderId, targetRaceType, and currentYear correctly', () => {
    const score = computeRiderScore('rider-42', [], RaceType.MINI_TOUR, 2025);
    expect(score.riderId).toBe('rider-42');
    expect(score.targetRaceType).toBe(RaceType.MINI_TOUR);
    expect(score.currentYear).toBe(2025);
  });

  it('should exclude seasons older than 2 years from seasonsUsed count', () => {
    const results = [
      createRaceResult({ year: 2024, category: ResultCategory.GC }),
      createRaceResult({ year: 2020, category: ResultCategory.GC }), // too old
    ];
    const score = computeRiderScore('rider-1', results, RaceType.GRAND_TOUR, 2024);
    expect(score.seasonsUsed).toBe(1);
  });
});

describe('computePoolStats', () => {
  it('should compute min/max pointsPerHillio and projectedPts across pool', () => {
    const entries = [
      { totalProjectedPts: 200, priceHillios: 500 }, // 0.4 pts/H
      { totalProjectedPts: 100, priceHillios: 100 }, // 1.0 pts/H
      { totalProjectedPts: 50, priceHillios: 200 }, // 0.25 pts/H
    ];
    const stats = computePoolStats(entries);
    expect(stats.minPointsPerHillio).toBeCloseTo(0.25);
    expect(stats.maxPointsPerHillio).toBeCloseTo(1.0);
    expect(stats.minProjectedPts).toBe(50);
    expect(stats.maxProjectedPts).toBe(200);
  });

  it('should return zeros for empty pool', () => {
    const stats = computePoolStats([]);
    expect(stats.minPointsPerHillio).toBe(0);
    expect(stats.maxPointsPerHillio).toBe(0);
    expect(stats.minProjectedPts).toBe(0);
    expect(stats.maxProjectedPts).toBe(0);
  });

  it('should exclude riders with 0 projected points', () => {
    const entries = [
      { totalProjectedPts: 0, priceHillios: 100 },
      { totalProjectedPts: 50, priceHillios: 100 }, // 0.5 pts/H
    ];
    const stats = computePoolStats(entries);
    expect(stats.minPointsPerHillio).toBeCloseTo(0.5);
    expect(stats.maxPointsPerHillio).toBeCloseTo(0.5);
  });

  it('should exclude riders with 0 price', () => {
    const entries = [
      { totalProjectedPts: 100, priceHillios: 0 },
      { totalProjectedPts: 50, priceHillios: 200 }, // 0.25 pts/H
    ];
    const stats = computePoolStats(entries);
    expect(stats.minPointsPerHillio).toBeCloseTo(0.25);
    expect(stats.maxPointsPerHillio).toBeCloseTo(0.25);
  });

  it('should handle single-rider pool', () => {
    const entries = [{ totalProjectedPts: 100, priceHillios: 200 }]; // 0.5 pts/H
    const stats = computePoolStats(entries);
    expect(stats.minPointsPerHillio).toBeCloseTo(0.5);
    expect(stats.maxPointsPerHillio).toBeCloseTo(0.5);
    expect(stats.minProjectedPts).toBe(100);
    expect(stats.maxProjectedPts).toBe(100);
  });
});

describe('computeCompositeScore', () => {
  function makeRiderScore(totalProjectedPts: number): RiderScore {
    return {
      riderId: 'rider-1',
      targetRaceType: RaceType.GRAND_TOUR,
      currentYear: 2024,
      categoryScores: { gc: totalProjectedPts, stage: 0, mountain: 0, sprint: 0, final: 0 },
      totalProjectedPts,
      seasonsUsed: 1,
      qualifyingResultsCount: 1,
    };
  }

  it('should rank high-value rider above expensive low-value rider', () => {
    // 3-rider pool needed so normalization provides meaningful range
    // Rider A: 100 pts, 100H → 1.0 pts/H (excellent value)
    // Rider B: 120 pts, 600H → 0.2 pts/H (poor value)
    // Rider C: 50 pts, 200H → 0.25 pts/H (background rider)
    const poolStats = computePoolStats([
      { totalProjectedPts: 100, priceHillios: 100 },
      { totalProjectedPts: 120, priceHillios: 600 },
      { totalProjectedPts: 50, priceHillios: 200 },
    ]);
    // pph: min=0.2, max=1.0, range=0.8; pts: min=50, max=120, range=70
    // A: normPts=(100-50)/70*100≈71.43, normValue=(1.0-0.2)/0.8*100=100
    //    composite = 0.6*71.43 + 0.4*100 ≈ 82.86
    // B: normPts=(120-50)/70*100=100, normValue=(0.2-0.2)/0.8*100=0
    //    composite = 0.6*100 + 0.4*0 = 60
    const scoreA = computeCompositeScore(makeRiderScore(100), 100, poolStats);
    const scoreB = computeCompositeScore(makeRiderScore(120), 600, poolStats);
    expect(scoreA.compositeScore).toBeGreaterThan(scoreB.compositeScore);
  });

  it('should still rank elite riders high despite high price', () => {
    // Pogačar: 250 pts, 700H → 0.357 pts/H
    // Cheap rider: 30 pts, 50H → 0.6 pts/H
    // Pogačar should rank higher because raw performance weight (0.6) dominates
    const poolStats = computePoolStats([
      { totalProjectedPts: 250, priceHillios: 700 },
      { totalProjectedPts: 30, priceHillios: 50 },
    ]);
    const pogacar = computeCompositeScore(makeRiderScore(250), 700, poolStats);
    const cheap = computeCompositeScore(makeRiderScore(30), 50, poolStats);
    expect(pogacar.compositeScore).toBeGreaterThan(cheap.compositeScore);
  });

  it('should handle rider with 0 projected points', () => {
    const poolStats = computePoolStats([{ totalProjectedPts: 100, priceHillios: 200 }]);
    const score = computeCompositeScore(makeRiderScore(0), 200, poolStats);
    expect(score.pointsPerHillio).toBe(0);
    expect(score.compositeScore).toBeLessThanOrEqual(0);
  });

  it('should handle rider with 0 price (edge case)', () => {
    const poolStats = computePoolStats([{ totalProjectedPts: 100, priceHillios: 200 }]);
    const score = computeCompositeScore(makeRiderScore(100), 0, poolStats);
    expect(score.pointsPerHillio).toBe(0);
    expect(score.priceHillios).toBe(0);
  });

  it('should produce correct pointsPerHillio', () => {
    const poolStats = computePoolStats([{ totalProjectedPts: 100, priceHillios: 200 }]);
    const score = computeCompositeScore(makeRiderScore(100), 200, poolStats);
    // 100 / 200 = 0.5
    expect(score.pointsPerHillio).toBeCloseTo(0.5);
  });

  it('should normalize value score to 0-100 range', () => {
    const poolStats = computePoolStats([
      { totalProjectedPts: 100, priceHillios: 100 }, // 1.0 pts/H (max)
      { totalProjectedPts: 50, priceHillios: 200 }, // 0.25 pts/H (min)
    ]);
    // Rider with max value: normalized = (1.0 - 0.25) / (1.0 - 0.25) * 100 = 100
    const maxValueScore = computeCompositeScore(makeRiderScore(100), 100, poolStats);
    expect(maxValueScore.normalizedValueScore).toBeCloseTo(100);

    // Rider with min value: normalized = (0.25 - 0.25) / (1.0 - 0.25) * 100 = 0
    const minValueScore = computeCompositeScore(makeRiderScore(50), 200, poolStats);
    expect(minValueScore.normalizedValueScore).toBeCloseTo(0);
  });

  it('should return 0 composite when pool has single rider (no range)', () => {
    const poolStats = computePoolStats([{ totalProjectedPts: 100, priceHillios: 200 }]);
    // Single rider → range is 0 → normalized scores are 0
    const score = computeCompositeScore(makeRiderScore(100), 200, poolStats);
    expect(score.normalizedValueScore).toBe(0);
    expect(score.compositeScore).toBe(0);
  });

  it('should preserve riderScore reference in output', () => {
    const riderScore = makeRiderScore(100);
    const poolStats = computePoolStats([{ totalProjectedPts: 100, priceHillios: 200 }]);
    const composite = computeCompositeScore(riderScore, 200, poolStats);
    expect(composite.riderScore).toBe(riderScore);
    expect(composite.priceHillios).toBe(200);
  });
});

describe('ScoringService', () => {
  const service = new ScoringService();

  it('should delegate computeRiderScore to pure function', () => {
    const results = [createRaceResult({ year: 2024, position: 1, category: ResultCategory.GC })];
    const score = service.computeRiderScore('rider-1', results, RaceType.GRAND_TOUR, 2024);
    expect(score.totalProjectedPts).toBe(200);
  });

  it('should delegate computeCompositeScore to pure function', () => {
    const riderScore: RiderScore = {
      riderId: 'rider-1',
      targetRaceType: RaceType.GRAND_TOUR,
      currentYear: 2024,
      categoryScores: { gc: 100, stage: 0, mountain: 0, sprint: 0, final: 0 },
      totalProjectedPts: 100,
      seasonsUsed: 1,
      qualifyingResultsCount: 1,
    };
    const poolStats = service.computePoolStats([
      { totalProjectedPts: 100, priceHillios: 200 },
      { totalProjectedPts: 50, priceHillios: 100 },
    ]);
    const composite = service.computeCompositeScore(riderScore, 200, poolStats);
    expect(composite.pointsPerHillio).toBeCloseTo(0.5);
  });

  it('should delegate computePoolStats to pure function', () => {
    const stats = service.computePoolStats([{ totalProjectedPts: 100, priceHillios: 200 }]);
    expect(stats.minPointsPerHillio).toBeCloseTo(0.5);
    expect(stats.maxPointsPerHillio).toBeCloseTo(0.5);
  });
});
