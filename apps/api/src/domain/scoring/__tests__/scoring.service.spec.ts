import { RaceType } from '../../shared/race-type.enum';
import { ResultCategory } from '../../shared/result-category.enum';
import { getTemporalWeight, TEMPORAL_WEIGHTS } from '../temporal-decay';
import {
  computeCategoryScore,
  computeStageScore,
  computeRiderScore,
  computePoolStats,
  computeCompositeScore,
  RiderScore,
  ScoringService,
} from '../scoring.service';
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

    it('should respect maxSeasons=1 (current season only)', () => {
      expect(getTemporalWeight(2024, 2024, 1)).toBe(1.0);
      expect(getTemporalWeight(2023, 2024, 1)).toBe(0);
      expect(getTemporalWeight(2022, 2024, 1)).toBe(0);
    });

    it('should respect maxSeasons=2 (current + previous)', () => {
      expect(getTemporalWeight(2024, 2024, 2)).toBe(1.0);
      expect(getTemporalWeight(2023, 2024, 2)).toBe(0.6);
      expect(getTemporalWeight(2022, 2024, 2)).toBe(0);
    });

    it('should default to maxSeasons=3', () => {
      expect(getTemporalWeight(2022, 2024)).toBe(0.3);
      expect(getTemporalWeight(2022, 2024, 3)).toBe(0.3);
    });
  });
});

describe('computeCategoryScore', () => {
  it('should return weighted average for multi-season GC results', () => {
    const results = [
      createRaceResult({ year: 2024, position: 1, category: ResultCategory.GC }),
      createRaceResult({ year: 2023, position: 3, category: ResultCategory.GC }),
    ];
    // Grand Tour GC: pos1=150, pos3=100
    // (150 * 1.0 + 100 * 0.6) / (1.0 + 0.6) = (150 + 60) / 1.6 = 131.25
    expect(computeCategoryScore(results, ResultCategory.GC, RaceType.GRAND_TOUR, 2024)).toBeCloseTo(
      131.25,
    );
  });

  it('should use race-type specific GC points for classics', () => {
    const results = [
      createRaceResult({
        raceType: RaceType.CLASSIC,
        category: ResultCategory.GC,
        position: 1,
        year: 2024,
      }),
    ];
    // Classic GC pos1 = 200
    expect(computeCategoryScore(results, ResultCategory.GC, RaceType.CLASSIC, 2024)).toBe(200);
  });

  it('should use race-type specific GC points for mini tours', () => {
    const results = [
      createRaceResult({
        raceType: RaceType.MINI_TOUR,
        raceSlug: 'tirreno-adriatico',
        category: ResultCategory.GC,
        position: 1,
        year: 2024,
      }),
    ];
    // Mini Tour GC pos1 = 100
    expect(computeCategoryScore(results, ResultCategory.GC, RaceType.MINI_TOUR, 2024)).toBe(100);
  });

  it('should return 0 when no qualifying results exist', () => {
    expect(computeCategoryScore([], ResultCategory.GC, RaceType.GRAND_TOUR, 2024)).toBe(0);
  });

  it('should include cross-type results with reduced weight', () => {
    const results = [
      createRaceResult({
        raceType: RaceType.GRAND_TOUR,
        category: ResultCategory.GC,
        position: 1,
        year: 2024,
      }),
      createRaceResult({
        raceType: RaceType.CLASSIC,
        raceSlug: 'milano-sanremo',
        category: ResultCategory.GC,
        position: 1,
        year: 2024,
      }),
    ];
    // GT GC 1st=150 (crossWeight=1.0), Classic GC 1st=200 (crossWeight=0.3)
    // (150*1.0 + 200*0.3) / (1.0 + 0.3) = 210/1.3 ≈ 161.54
    expect(computeCategoryScore(results, ResultCategory.GC, RaceType.GRAND_TOUR, 2024)).toBeCloseTo(
      161.54,
      1,
    );
  });

  it('should include GT mountain results when targeting mini tour', () => {
    const results = [
      createRaceResult({
        raceType: RaceType.GRAND_TOUR,
        category: ResultCategory.MOUNTAIN,
        position: 1,
        year: 2024,
      }),
    ];
    // GT mountain 1st=50, crossWeight to mini tour=0.7
    // Single result: 50*0.7/0.7 = 50
    expect(computeCategoryScore(results, ResultCategory.MOUNTAIN, RaceType.MINI_TOUR, 2024)).toBe(
      50,
    );
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
    expect(computeCategoryScore(results, ResultCategory.GC, RaceType.GRAND_TOUR, 2024)).toBe(0);
  });

  it('should handle single-season GC result', () => {
    const results = [createRaceResult({ year: 2024, position: 5, category: ResultCategory.GC })];
    // Grand Tour GC position 5 = 60
    expect(computeCategoryScore(results, ResultCategory.GC, RaceType.GRAND_TOUR, 2024)).toBe(60);
  });

  it('should handle positions beyond scoring threshold as 0 points', () => {
    const results = [
      createRaceResult({ year: 2024, position: 50 }), // Beyond top-20 → 0 points
    ];
    expect(computeCategoryScore(results, ResultCategory.GC, RaceType.GRAND_TOUR, 2024)).toBe(0);
  });

  it('should return 0 when all results are too old', () => {
    const results = [
      createRaceResult({ year: 2020, position: 1 }),
      createRaceResult({ year: 2019, position: 2 }),
    ];
    expect(computeCategoryScore(results, ResultCategory.GC, RaceType.GRAND_TOUR, 2024)).toBe(0);
  });

  it('should handle mix of scoring and DNF results', () => {
    const results = [
      createRaceResult({ year: 2024, position: 1, category: ResultCategory.GC }),
      createRaceResult({ year: 2024, position: null, dnf: true, category: ResultCategory.GC }),
    ];
    // Grand Tour GC pos1=150: (150 * 1.0 + 0 * 1.0) / (1.0 + 1.0) = 75
    expect(computeCategoryScore(results, ResultCategory.GC, RaceType.GRAND_TOUR, 2024)).toBe(75);
  });

  it('should use mini tour mountain classification points', () => {
    const results = [
      createRaceResult({
        raceType: RaceType.MINI_TOUR,
        raceSlug: 'tirreno-adriatico',
        category: ResultCategory.MOUNTAIN,
        position: 1,
        year: 2024,
      }),
    ];
    // Mini Tour mountain pos1 = 40
    expect(computeCategoryScore(results, ResultCategory.MOUNTAIN, RaceType.MINI_TOUR, 2024)).toBe(
      40,
    );
  });

  it('should use grand tour sprint classification points', () => {
    const results = [
      createRaceResult({
        category: ResultCategory.SPRINT,
        position: 2,
        year: 2024,
      }),
    ];
    // Grand Tour sprint pos2 = 35
    expect(computeCategoryScore(results, ResultCategory.SPRINT, RaceType.GRAND_TOUR, 2024)).toBe(
      35,
    );
  });
});

describe('computeStageScore', () => {
  it('should sum stage points within a race then weighted-average across races', () => {
    const results = [
      // 2024 race: 3 stages — positions 1, 5, 20
      createRaceResult({
        raceSlug: 'paris-nice',
        year: 2024,
        category: ResultCategory.STAGE,
        position: 1,
        stageNumber: 1,
      }),
      createRaceResult({
        raceSlug: 'paris-nice',
        year: 2024,
        category: ResultCategory.STAGE,
        position: 5,
        stageNumber: 2,
      }),
      createRaceResult({
        raceSlug: 'paris-nice',
        year: 2024,
        category: ResultCategory.STAGE,
        position: 20,
        stageNumber: 3,
      }),
    ];
    // Stage pts: pos1=40, pos5=17, pos20=1 → race total = 58
    // Single race, weight 1.0 → 58/1.0 = 58
    expect(computeStageScore(results, RaceType.GRAND_TOUR, 2024)).toBe(58);
  });

  it('should weighted-average across multiple seasons', () => {
    const results = [
      // 2024: win a stage (40 pts)
      createRaceResult({
        raceSlug: 'race-a',
        year: 2024,
        category: ResultCategory.STAGE,
        position: 1,
        stageNumber: 1,
      }),
      // 2023: win a stage (40 pts)
      createRaceResult({
        raceSlug: 'race-b',
        year: 2023,
        category: ResultCategory.STAGE,
        position: 1,
        stageNumber: 1,
      }),
    ];
    // 2024: 40 pts × 1.0 = 40; 2023: 40 pts × 0.6 = 24
    // Total: (40 + 24) / (1.0 + 0.6) = 64 / 1.6 = 40
    expect(computeStageScore(results, RaceType.GRAND_TOUR, 2024)).toBe(40);
  });

  it('should return 0 when no stage results exist', () => {
    expect(computeStageScore([], RaceType.GRAND_TOUR, 2024)).toBe(0);
  });

  it('should include cross-type stage results with reduced weight', () => {
    const results = [
      // GT stage win
      createRaceResult({
        raceType: RaceType.GRAND_TOUR,
        raceSlug: 'tour-de-france',
        category: ResultCategory.STAGE,
        position: 1,
        year: 2024,
        stageNumber: 1,
      }),
      // Mini tour stage win (cross-type)
      createRaceResult({
        raceType: RaceType.MINI_TOUR,
        raceSlug: 'tirreno-adriatico',
        category: ResultCategory.STAGE,
        position: 1,
        year: 2024,
        stageNumber: 1,
      }),
    ];
    // GT stage: 40 pts, effectiveWeight = 1.0 × 1.0 = 1.0
    // Mini tour stage: 40 pts, effectiveWeight = 1.0 × 0.7 = 0.7
    // (40*1.0 + 40*0.7) / (1.0 + 0.7) = 68/1.7 = 40
    expect(computeStageScore(results, RaceType.GRAND_TOUR, 2024)).toBe(40);
  });

  it('should handle sprinter winning multiple stages in one race', () => {
    const results = [
      createRaceResult({
        raceSlug: 'tirreno',
        year: 2024,
        category: ResultCategory.STAGE,
        position: 1,
        stageNumber: 1,
      }),
      createRaceResult({
        raceSlug: 'tirreno',
        year: 2024,
        category: ResultCategory.STAGE,
        position: 1,
        stageNumber: 3,
      }),
      createRaceResult({
        raceSlug: 'tirreno',
        year: 2024,
        category: ResultCategory.STAGE,
        position: 1,
        stageNumber: 5,
      }),
      // Non-scoring stages
      createRaceResult({
        raceSlug: 'tirreno',
        year: 2024,
        category: ResultCategory.STAGE,
        position: 80,
        stageNumber: 2,
      }),
      createRaceResult({
        raceSlug: 'tirreno',
        year: 2024,
        category: ResultCategory.STAGE,
        position: 90,
        stageNumber: 4,
      }),
    ];
    // 3 × 40 + 0 + 0 = 120 total stage points for that race
    expect(computeStageScore(results, RaceType.GRAND_TOUR, 2024)).toBe(120);
  });

  it('should exclude stages from old seasons', () => {
    const results = [
      createRaceResult({
        raceSlug: 'old-race',
        year: 2021,
        category: ResultCategory.STAGE,
        position: 1,
        stageNumber: 1,
      }),
    ];
    expect(computeStageScore(results, RaceType.GRAND_TOUR, 2024)).toBe(0);
  });
});

describe('computeRiderScore', () => {
  it('should sum all category scores for Grand Tour', () => {
    const results = [
      createRaceResult({ year: 2024, position: 1, category: ResultCategory.GC }),
      createRaceResult({
        year: 2024,
        position: 1,
        category: ResultCategory.STAGE,
        stageNumber: 1,
      }),
      createRaceResult({ year: 2024, position: 1, category: ResultCategory.MOUNTAIN }),
      createRaceResult({ year: 2024, position: 1, category: ResultCategory.SPRINT }),
    ];
    const score = computeRiderScore('rider-1', results, RaceType.GRAND_TOUR, 2024);
    // Grand Tour: GC=150, Stage=40 (1 stage win), Mountain=50, Sprint=50
    expect(score.totalProjectedPts).toBe(150 + 40 + 50 + 50);
    expect(score.categoryScores.gc).toBe(150);
    expect(score.categoryScores.stage).toBe(40);
    expect(score.categoryScores.mountain).toBe(50);
    expect(score.categoryScores.sprint).toBe(50);
  });

  it('should produce only gc score for Classic (stage/mountain/sprint are 0)', () => {
    const results = [
      createRaceResult({
        raceType: RaceType.CLASSIC,
        category: ResultCategory.GC,
        position: 1,
        year: 2024,
      }),
    ];
    const score = computeRiderScore('rider-1', results, RaceType.CLASSIC, 2024);
    expect(score.totalProjectedPts).toBe(200);
    expect(score.categoryScores.gc).toBe(200);
    expect(score.categoryScores.stage).toBe(0);
    expect(score.categoryScores.mountain).toBe(0);
    expect(score.categoryScores.sprint).toBe(0);
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
  });

  it('should count correct number of seasons used', () => {
    const results = [
      createRaceResult({ year: 2024, category: ResultCategory.GC }),
      createRaceResult({ year: 2023, category: ResultCategory.GC }),
      createRaceResult({ year: 2023, category: ResultCategory.STAGE, stageNumber: 1 }),
    ];
    const score = computeRiderScore('rider-1', results, RaceType.GRAND_TOUR, 2024);
    expect(score.seasonsUsed).toBe(2);
  });

  it('should count correct number of qualifying results', () => {
    const results = [
      createRaceResult({ year: 2024, category: ResultCategory.GC }),
      createRaceResult({ year: 2024, category: ResultCategory.STAGE, stageNumber: 1 }),
      createRaceResult({ year: 2021, category: ResultCategory.GC }), // too old, excluded
    ];
    const score = computeRiderScore('rider-1', results, RaceType.GRAND_TOUR, 2024);
    expect(score.qualifyingResultsCount).toBe(2);
  });

  it('should include cross-type results in scoring', () => {
    const results = [
      createRaceResult({
        raceType: RaceType.GRAND_TOUR,
        category: ResultCategory.GC,
        position: 5,
        year: 2024,
      }),
      createRaceResult({
        raceType: RaceType.CLASSIC,
        raceSlug: 'milano-sanremo',
        category: ResultCategory.GC,
        position: 1,
        year: 2024,
      }),
    ];
    const score = computeRiderScore('rider-1', results, RaceType.GRAND_TOUR, 2024);
    // GT GC 5th=60 (crossWeight=1.0), Classic GC 1st=200 (crossWeight=0.3)
    // GC = (60*1.0 + 200*0.3) / (1.0 + 0.3) = 120/1.3 ≈ 92.31
    expect(score.categoryScores.gc).toBeCloseTo(92.31, 1);
    expect(score.qualifyingResultsCount).toBe(2); // both count now
  });

  it('should set riderId, targetRaceType, and currentYear correctly', () => {
    const score = computeRiderScore('rider-42', [], RaceType.MINI_TOUR, 2025);
    expect(score.riderId).toBe('rider-42');
    expect(score.targetRaceType).toBe(RaceType.MINI_TOUR);
    expect(score.currentYear).toBe(2025);
  });

  it('should respect maxSeasons parameter', () => {
    const results = [
      createRaceResult({ year: 2024, position: 1, category: ResultCategory.GC }),
      createRaceResult({ year: 2023, position: 1, category: ResultCategory.GC }),
      createRaceResult({ year: 2022, position: 1, category: ResultCategory.GC }),
    ];
    // maxSeasons=1: only 2024 → GC=150, seasonsUsed=1
    const score1 = computeRiderScore('rider-1', results, RaceType.GRAND_TOUR, 2024, 1);
    expect(score1.categoryScores.gc).toBe(150);
    expect(score1.seasonsUsed).toBe(1);
    expect(score1.qualifyingResultsCount).toBe(1);

    // maxSeasons=2: 2024+2023 → (150*1.0 + 150*0.6)/(1.0+0.6) = 150, seasonsUsed=2
    const score2 = computeRiderScore('rider-1', results, RaceType.GRAND_TOUR, 2024, 2);
    expect(score2.seasonsUsed).toBe(2);
    expect(score2.qualifyingResultsCount).toBe(2);

    // maxSeasons=3: all three → seasonsUsed=3
    const score3 = computeRiderScore('rider-1', results, RaceType.GRAND_TOUR, 2024, 3);
    expect(score3.seasonsUsed).toBe(3);
    expect(score3.qualifyingResultsCount).toBe(3);
  });

  it('should use cumulative stage scoring in total', () => {
    const results = [
      // GC 1st in a grand tour
      createRaceResult({ year: 2024, position: 1, category: ResultCategory.GC }),
      // Won 3 stages in the same race
      createRaceResult({
        year: 2024,
        position: 1,
        category: ResultCategory.STAGE,
        stageNumber: 1,
      }),
      createRaceResult({
        year: 2024,
        position: 1,
        category: ResultCategory.STAGE,
        stageNumber: 5,
      }),
      createRaceResult({
        year: 2024,
        position: 1,
        category: ResultCategory.STAGE,
        stageNumber: 10,
      }),
      // Non-scoring stages
      createRaceResult({
        year: 2024,
        position: 100,
        category: ResultCategory.STAGE,
        stageNumber: 2,
      }),
    ];
    const score = computeRiderScore('rider-1', results, RaceType.GRAND_TOUR, 2024);
    // GC=150, Stage=40+40+40+0=120, Mountain=0, Sprint=0
    expect(score.categoryScores.gc).toBe(150);
    expect(score.categoryScores.stage).toBe(120);
    expect(score.totalProjectedPts).toBe(270);
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
      categoryScores: { gc: totalProjectedPts, stage: 0, mountain: 0, sprint: 0 },
      totalProjectedPts,
      seasonsUsed: 1,
      qualifyingResultsCount: 1,
    };
  }

  it('should rank high-value rider above expensive low-value rider', () => {
    const poolStats = computePoolStats([
      { totalProjectedPts: 100, priceHillios: 100 },
      { totalProjectedPts: 120, priceHillios: 600 },
      { totalProjectedPts: 50, priceHillios: 200 },
    ]);
    const scoreA = computeCompositeScore(makeRiderScore(100), 100, poolStats);
    const scoreB = computeCompositeScore(makeRiderScore(120), 600, poolStats);
    expect(scoreA.compositeScore).toBeGreaterThan(scoreB.compositeScore);
  });

  it('should still rank elite riders high despite high price', () => {
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
    expect(score.pointsPerHillio).toBeCloseTo(0.5);
  });

  it('should normalize value score to 0-100 range', () => {
    const poolStats = computePoolStats([
      { totalProjectedPts: 100, priceHillios: 100 }, // 1.0 pts/H (max)
      { totalProjectedPts: 50, priceHillios: 200 }, // 0.25 pts/H (min)
    ]);
    const maxValueScore = computeCompositeScore(makeRiderScore(100), 100, poolStats);
    expect(maxValueScore.normalizedValueScore).toBeCloseTo(100);

    const minValueScore = computeCompositeScore(makeRiderScore(50), 200, poolStats);
    expect(minValueScore.normalizedValueScore).toBeCloseTo(0);
  });

  it('should return 0 composite when pool has single rider (no range)', () => {
    const poolStats = computePoolStats([{ totalProjectedPts: 100, priceHillios: 200 }]);
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
    const results = [
      createRaceResult({
        raceType: RaceType.CLASSIC,
        category: ResultCategory.GC,
        position: 1,
        year: 2024,
      }),
    ];
    const score = service.computeRiderScore('rider-1', results, RaceType.CLASSIC, 2024);
    // Classic GC pos1 = 200
    expect(score.totalProjectedPts).toBe(200);
  });

  it('should delegate computeCompositeScore to pure function', () => {
    const riderScore: RiderScore = {
      riderId: 'rider-1',
      targetRaceType: RaceType.GRAND_TOUR,
      currentYear: 2024,
      categoryScores: { gc: 100, stage: 0, mountain: 0, sprint: 0 },
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
