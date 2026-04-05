import { RaceType } from '../../shared/race-type.enum';
import { RaceClass } from '../../shared/race-class.enum';
import { ResultCategory } from '../../shared/result-category.enum';
import { ParcoursType } from '../../shared/parcours-type.enum';
import { getTemporalWeight, TEMPORAL_WEIGHTS } from '../temporal-decay';
import { ProfileDistribution } from '../profile-distribution';
import {
  computeCategoryScore,
  computeStageScore,
  computeRiderScore,
  computeSeasonBreakdown,
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
  it('should return weighted sum for multi-season GC results', () => {
    const results = [
      createRaceResult({ year: 2024, position: 1, category: ResultCategory.GC }),
      createRaceResult({ year: 2023, position: 3, category: ResultCategory.GC }),
    ];
    // Grand Tour GC: pos1=150, pos3=100
    // 150 * 1.0 + 100 * 0.6 = 210
    expect(computeCategoryScore(results, ResultCategory.GC, RaceType.GRAND_TOUR, 2024)).toBe(210);
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
    // 150*1.0 + 200*0.3 = 210
    expect(computeCategoryScore(results, ResultCategory.GC, RaceType.GRAND_TOUR, 2024)).toBe(210);
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
    // 50 * 0.7 = 35
    expect(computeCategoryScore(results, ResultCategory.MOUNTAIN, RaceType.MINI_TOUR, 2024)).toBe(
      35,
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
    // Grand Tour GC pos1=150, DNF=0 → 150 + 0 = 150
    expect(computeCategoryScore(results, ResultCategory.GC, RaceType.GRAND_TOUR, 2024)).toBe(150);
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

  it('should apply race class weight for Pro races', () => {
    const results = [
      createRaceResult({
        raceType: RaceType.MINI_TOUR,
        raceClass: RaceClass.PRO,
        category: ResultCategory.GC,
        position: 1,
        year: 2024,
      }),
    ];
    // Mini Tour GC 1st = 100, classWeight = 0.5 → 50
    expect(computeCategoryScore(results, ResultCategory.GC, RaceType.MINI_TOUR, 2024)).toBe(50);
  });

  it('should apply race class weight for .1 races', () => {
    const results = [
      createRaceResult({
        raceType: RaceType.CLASSIC,
        raceClass: RaceClass.ONE,
        category: ResultCategory.GC,
        position: 1,
        year: 2024,
      }),
    ];
    // Classic GC 1st = 200, classWeight = 0.3 → 60
    expect(computeCategoryScore(results, ResultCategory.GC, RaceType.CLASSIC, 2024)).toBe(60);
  });

  it('should differentiate UWT vs Pro results for same race type', () => {
    const results = [
      createRaceResult({
        raceType: RaceType.MINI_TOUR,
        raceClass: RaceClass.UWT,
        raceSlug: 'tirreno-adriatico',
        category: ResultCategory.GC,
        position: 1,
        year: 2024,
      }),
      createRaceResult({
        raceType: RaceType.MINI_TOUR,
        raceClass: RaceClass.PRO,
        raceSlug: 'tour-of-turkey',
        category: ResultCategory.GC,
        position: 1,
        year: 2024,
      }),
    ];
    // Tirreno GC 1st = 100 × 1.0 = 100; Turkey GC 1st = 100 × 0.5 = 50
    expect(computeCategoryScore(results, ResultCategory.GC, RaceType.MINI_TOUR, 2024)).toBe(150);
  });
});

describe('computeStageScore', () => {
  it('should sum stage points within a race then weight by temporal and cross-type', () => {
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

  it('should sum weighted scores across multiple seasons', () => {
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
    // Total: 40 + 24 = 64
    expect(computeStageScore(results, RaceType.GRAND_TOUR, 2024)).toBe(64);
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
    // GT stage: 40 pts × 1.0 (temporal) × 1.0 (cross) = 40
    // Mini tour stage: 40 pts × 1.0 (temporal) × 0.7 (cross) = 28
    // Total: 40 + 28 = 68
    expect(computeStageScore(results, RaceType.GRAND_TOUR, 2024)).toBe(68);
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

  it('should apply race class weight to stage scores', () => {
    const results = [
      createRaceResult({
        raceType: RaceType.MINI_TOUR,
        raceClass: RaceClass.PRO,
        raceSlug: 'tour-of-turkey',
        year: 2024,
        category: ResultCategory.STAGE,
        position: 1,
        stageNumber: 1,
      }),
      createRaceResult({
        raceType: RaceType.MINI_TOUR,
        raceClass: RaceClass.PRO,
        raceSlug: 'tour-of-turkey',
        year: 2024,
        category: ResultCategory.STAGE,
        position: 1,
        stageNumber: 2,
      }),
    ];
    // 2 stage wins = 80 pts, classWeight = 0.5 → 40
    expect(computeStageScore(results, RaceType.MINI_TOUR, 2024)).toBe(40);
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

  it('should not bleed stage/mountain/sprint from stage races into Classic scoring', () => {
    const results = [
      // Classic win
      createRaceResult({
        raceType: RaceType.CLASSIC,
        raceSlug: 'e3-harelbeke',
        category: ResultCategory.GC,
        position: 1,
        year: 2024,
      }),
      // Stage race results that should NOT contribute to classic scoring
      createRaceResult({
        raceType: RaceType.GRAND_TOUR,
        category: ResultCategory.STAGE,
        position: 1,
        stageNumber: 1,
        year: 2024,
      }),
      createRaceResult({
        raceType: RaceType.GRAND_TOUR,
        category: ResultCategory.MOUNTAIN,
        position: 1,
        year: 2024,
      }),
      createRaceResult({
        raceType: RaceType.GRAND_TOUR,
        category: ResultCategory.SPRINT,
        position: 1,
        year: 2024,
      }),
    ];
    const score = computeRiderScore('rider-1', results, RaceType.CLASSIC, 2024);
    // Only GC: classic 200 + GT GC cross-type (none here, only stage/mtn/spr)
    expect(score.categoryScores.gc).toBe(200);
    expect(score.categoryScores.stage).toBe(0);
    expect(score.categoryScores.mountain).toBe(0);
    expect(score.categoryScores.sprint).toBe(0);
    expect(score.totalProjectedPts).toBe(200);
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
    // GT GC 5th=60 × 1.0, Classic GC 1st=200 × 0.3
    // GC = 60 + 60 = 120
    expect(score.categoryScores.gc).toBe(120);
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
    // maxSeasons=1: only 2024 → GC=150×1.0 = 150
    const score1 = computeRiderScore('rider-1', results, RaceType.GRAND_TOUR, 2024, 1);
    expect(score1.categoryScores.gc).toBe(150);
    expect(score1.seasonsUsed).toBe(1);
    expect(score1.qualifyingResultsCount).toBe(1);

    // maxSeasons=2: 150×1.0 + 150×0.6 = 240
    const score2 = computeRiderScore('rider-1', results, RaceType.GRAND_TOUR, 2024, 2);
    expect(score2.categoryScores.gc).toBe(240);
    expect(score2.seasonsUsed).toBe(2);
    expect(score2.qualifyingResultsCount).toBe(2);

    // maxSeasons=3: 150×1.0 + 150×0.6 + 150×0.3 = 285
    const score3 = computeRiderScore('rider-1', results, RaceType.GRAND_TOUR, 2024, 3);
    expect(score3.categoryScores.gc).toBe(285);
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
});

describe('computeSeasonBreakdown', () => {
  it('should zero out stage/mountain/sprint for classics in season breakdown', () => {
    const results = [
      createRaceResult({
        raceType: RaceType.CLASSIC,
        raceSlug: 'e3-harelbeke',
        category: ResultCategory.GC,
        position: 1,
        year: 2024,
      }),
      createRaceResult({
        raceType: RaceType.GRAND_TOUR,
        category: ResultCategory.STAGE,
        position: 1,
        stageNumber: 1,
        year: 2024,
      }),
      createRaceResult({
        raceType: RaceType.GRAND_TOUR,
        category: ResultCategory.MOUNTAIN,
        position: 1,
        year: 2024,
      }),
    ];
    const breakdown = computeSeasonBreakdown(results, RaceType.CLASSIC, 2024, 1);
    expect(breakdown).toHaveLength(1);
    expect(breakdown[0].gc).toBe(200);
    expect(breakdown[0].stage).toBe(0);
    expect(breakdown[0].mountain).toBe(0);
    expect(breakdown[0].sprint).toBe(0);
    expect(breakdown[0].total).toBe(200);
  });
});

// ─── Profile-Aware Scoring Tests (WP02) ─────────────────────────────────────

/** Mountain-heavy profile: 4 P1, 2 P2, 3 P3, 4 P4, 6 P5, 2 ITT, 0 TTT, 0 unknown */
const mountainProfile = ProfileDistribution.fromProfileSummary({
  p1Count: 4,
  p2Count: 2,
  p3Count: 3,
  p4Count: 4,
  p5Count: 6,
  ittCount: 2,
  tttCount: 0,
  unknownCount: 0,
})!;

/** Flat profile: 8 P1, 4 P2, 3 P3, 2 P4, 2 P5, 2 ITT, 0 TTT, 0 unknown */
const flatProfile = ProfileDistribution.fromProfileSummary({
  p1Count: 8,
  p2Count: 4,
  p3Count: 3,
  p4Count: 2,
  p5Count: 2,
  ittCount: 2,
  tttCount: 0,
  unknownCount: 0,
})!;

describe('Profile-Aware computeStageScore', () => {
  it('should weight P5 stages higher than P1 stages on a mountain-heavy race', () => {
    const climberResults = [
      createRaceResult({
        category: ResultCategory.STAGE,
        position: 1,
        stageNumber: 1,
        year: 2024,
        parcoursType: ParcoursType.P5,
      }),
      createRaceResult({
        category: ResultCategory.STAGE,
        position: 1,
        stageNumber: 2,
        year: 2024,
        parcoursType: ParcoursType.P5,
      }),
    ];

    const sprinterResults = [
      createRaceResult({
        category: ResultCategory.STAGE,
        position: 1,
        stageNumber: 1,
        year: 2024,
        parcoursType: ParcoursType.P1,
      }),
      createRaceResult({
        category: ResultCategory.STAGE,
        position: 1,
        stageNumber: 2,
        year: 2024,
        parcoursType: ParcoursType.P1,
      }),
    ];

    const climberScore = computeStageScore(
      climberResults,
      RaceType.GRAND_TOUR,
      2024,
      3,
      mountainProfile,
    );
    const sprinterScore = computeStageScore(
      sprinterResults,
      RaceType.GRAND_TOUR,
      2024,
      3,
      mountainProfile,
    );
    expect(climberScore).toBeGreaterThan(sprinterScore);
  });

  it('should weight P1 stages higher than P5 stages on a flat race', () => {
    const climberResults = [
      createRaceResult({
        category: ResultCategory.STAGE,
        position: 1,
        stageNumber: 1,
        year: 2024,
        parcoursType: ParcoursType.P5,
      }),
    ];

    const sprinterResults = [
      createRaceResult({
        category: ResultCategory.STAGE,
        position: 1,
        stageNumber: 1,
        year: 2024,
        parcoursType: ParcoursType.P1,
      }),
    ];

    const climberScore = computeStageScore(
      climberResults,
      RaceType.GRAND_TOUR,
      2024,
      3,
      flatProfile,
    );
    const sprinterScore = computeStageScore(
      sprinterResults,
      RaceType.GRAND_TOUR,
      2024,
      3,
      flatProfile,
    );
    expect(sprinterScore).toBeGreaterThan(climberScore);
  });

  it('should apply profile weight per-stage within a race group', () => {
    const mixedResults = [
      createRaceResult({
        category: ResultCategory.STAGE,
        position: 1,
        stageNumber: 1,
        year: 2024,
        parcoursType: ParcoursType.P5, // high weight on mountain profile
      }),
      createRaceResult({
        category: ResultCategory.STAGE,
        position: 1,
        stageNumber: 2,
        year: 2024,
        parcoursType: ParcoursType.P1, // lower weight on mountain profile
      }),
    ];

    const withProfile = computeStageScore(
      mixedResults,
      RaceType.GRAND_TOUR,
      2024,
      3,
      mountainProfile,
    );
    const withoutProfile = computeStageScore(mixedResults, RaceType.GRAND_TOUR, 2024, 3);

    // With mountain profile: P5 stage gets ~1.0 weight, P1 gets ~0.667
    // Without profile: both get 1.0
    // So with profile should be less than without (since P1 is penalized)
    expect(withProfile).toBeLessThan(withoutProfile);
  });

  it('should give neutral weight to results with null parcoursType', () => {
    const results = [
      createRaceResult({
        category: ResultCategory.STAGE,
        position: 1,
        stageNumber: 1,
        year: 2024,
        parcoursType: null,
      }),
    ];

    const withProfile = computeStageScore(results, RaceType.GRAND_TOUR, 2024, 3, mountainProfile);
    const withoutProfile = computeStageScore(results, RaceType.GRAND_TOUR, 2024, 3);
    expect(withProfile).toBe(withoutProfile);
  });

  it('should give ITT bonus when target race has ITT stages', () => {
    const ittResult = [
      createRaceResult({
        category: ResultCategory.STAGE,
        position: 1,
        stageNumber: 1,
        year: 2024,
        parcoursType: ParcoursType.P1,
        isItt: true,
      }),
    ];

    const nonIttResult = [
      createRaceResult({
        category: ResultCategory.STAGE,
        position: 1,
        stageNumber: 1,
        year: 2024,
        parcoursType: ParcoursType.P1,
        isItt: false,
      }),
    ];

    const ittScore = computeStageScore(
      ittResult,
      RaceType.GRAND_TOUR,
      2024,
      3,
      mountainProfile, // has 2 ITT stages
    );
    const nonIttScore = computeStageScore(
      nonIttResult,
      RaceType.GRAND_TOUR,
      2024,
      3,
      mountainProfile,
    );
    expect(ittScore).toBeGreaterThan(nonIttScore);
  });
});

describe('Profile-Aware computeCategoryScore', () => {
  it('should boost Mountain classification on a mountain-heavy race', () => {
    const results = [
      createRaceResult({
        category: ResultCategory.MOUNTAIN,
        position: 1,
        year: 2024,
      }),
    ];

    const mountainRace = computeCategoryScore(
      results,
      ResultCategory.MOUNTAIN,
      RaceType.GRAND_TOUR,
      2024,
      3,
      mountainProfile,
    );
    const flatRace = computeCategoryScore(
      results,
      ResultCategory.MOUNTAIN,
      RaceType.GRAND_TOUR,
      2024,
      3,
      flatProfile,
    );
    expect(mountainRace).toBeGreaterThan(flatRace);
  });

  it('should boost Sprint classification on a flat race', () => {
    const results = [
      createRaceResult({
        category: ResultCategory.SPRINT,
        position: 1,
        year: 2024,
      }),
    ];

    const flatRace = computeCategoryScore(
      results,
      ResultCategory.SPRINT,
      RaceType.GRAND_TOUR,
      2024,
      3,
      flatProfile,
    );
    const mountainRace = computeCategoryScore(
      results,
      ResultCategory.SPRINT,
      RaceType.GRAND_TOUR,
      2024,
      3,
      mountainProfile,
    );
    expect(flatRace).toBeGreaterThan(mountainRace);
  });

  it('should keep GC score neutral regardless of profile', () => {
    const results = [
      createRaceResult({
        category: ResultCategory.GC,
        position: 1,
        year: 2024,
      }),
    ];

    const mountainRace = computeCategoryScore(
      results,
      ResultCategory.GC,
      RaceType.GRAND_TOUR,
      2024,
      3,
      mountainProfile,
    );
    const flatRace = computeCategoryScore(
      results,
      ResultCategory.GC,
      RaceType.GRAND_TOUR,
      2024,
      3,
      flatProfile,
    );
    const noProfile = computeCategoryScore(results, ResultCategory.GC, RaceType.GRAND_TOUR, 2024);
    expect(mountainRace).toBe(flatRace);
    expect(mountainRace).toBe(noProfile);
  });
});

describe('Profile-Aware computeRiderScore', () => {
  it('should rank climber higher than sprinter for mountain-heavy race', () => {
    const climberResults = [
      createRaceResult({
        category: ResultCategory.STAGE,
        position: 1,
        stageNumber: 1,
        year: 2024,
        parcoursType: ParcoursType.P5,
      }),
      createRaceResult({
        category: ResultCategory.STAGE,
        position: 2,
        stageNumber: 2,
        year: 2024,
        parcoursType: ParcoursType.P5,
      }),
      createRaceResult({
        category: ResultCategory.MOUNTAIN,
        position: 1,
        year: 2024,
      }),
    ];

    const sprinterResults = [
      createRaceResult({
        riderId: 'rider-2',
        category: ResultCategory.STAGE,
        position: 1,
        stageNumber: 1,
        year: 2024,
        parcoursType: ParcoursType.P1,
      }),
      createRaceResult({
        riderId: 'rider-2',
        category: ResultCategory.STAGE,
        position: 2,
        stageNumber: 2,
        year: 2024,
        parcoursType: ParcoursType.P1,
      }),
      createRaceResult({
        riderId: 'rider-2',
        category: ResultCategory.SPRINT,
        position: 1,
        year: 2024,
      }),
    ];

    const climber = computeRiderScore(
      'rider-1',
      climberResults,
      RaceType.GRAND_TOUR,
      2024,
      3,
      mountainProfile,
    );
    const sprinter = computeRiderScore(
      'rider-2',
      sprinterResults,
      RaceType.GRAND_TOUR,
      2024,
      3,
      mountainProfile,
    );
    expect(climber.totalProjectedPts).toBeGreaterThan(sprinter.totalProjectedPts);
  });

  it('should rank sprinter higher than climber for flat race', () => {
    const climberResults = [
      createRaceResult({
        category: ResultCategory.STAGE,
        position: 1,
        stageNumber: 1,
        year: 2024,
        parcoursType: ParcoursType.P5,
      }),
    ];

    const sprinterResults = [
      createRaceResult({
        riderId: 'rider-2',
        category: ResultCategory.STAGE,
        position: 1,
        stageNumber: 1,
        year: 2024,
        parcoursType: ParcoursType.P1,
      }),
    ];

    const climber = computeRiderScore(
      'rider-1',
      climberResults,
      RaceType.GRAND_TOUR,
      2024,
      3,
      flatProfile,
    );
    const sprinter = computeRiderScore(
      'rider-2',
      sprinterResults,
      RaceType.GRAND_TOUR,
      2024,
      3,
      flatProfile,
    );
    expect(sprinter.totalProjectedPts).toBeGreaterThan(climber.totalProjectedPts);
  });
});

describe('Profile-Aware Backward Compatibility', () => {
  const regressionResults = [
    createRaceResult({
      year: 2024,
      position: 1,
      category: ResultCategory.GC,
    }),
    createRaceResult({
      year: 2024,
      position: 1,
      category: ResultCategory.STAGE,
      stageNumber: 1,
      parcoursType: ParcoursType.P5,
    }),
    createRaceResult({
      year: 2024,
      position: 1,
      category: ResultCategory.MOUNTAIN,
    }),
    createRaceResult({
      year: 2023,
      position: 3,
      category: ResultCategory.STAGE,
      stageNumber: 1,
      raceSlug: 'race-b',
      parcoursType: ParcoursType.P1,
    }),
  ];

  it('computeRiderScore without profile equals with undefined profile', () => {
    const withoutProfile = computeRiderScore(
      'rider-1',
      regressionResults,
      RaceType.GRAND_TOUR,
      2024,
    );
    const withUndefined = computeRiderScore(
      'rider-1',
      regressionResults,
      RaceType.GRAND_TOUR,
      2024,
      3,
      undefined,
    );
    expect(withoutProfile).toEqual(withUndefined);
  });

  it('computeStageScore without profile equals with undefined profile', () => {
    const withoutProfile = computeStageScore(regressionResults, RaceType.GRAND_TOUR, 2024);
    const withUndefined = computeStageScore(
      regressionResults,
      RaceType.GRAND_TOUR,
      2024,
      3,
      undefined,
    );
    expect(withoutProfile).toBe(withUndefined);
  });

  it('computeCategoryScore without profile equals with undefined profile', () => {
    const withoutProfile = computeCategoryScore(
      regressionResults,
      ResultCategory.GC,
      RaceType.GRAND_TOUR,
      2024,
    );
    const withUndefined = computeCategoryScore(
      regressionResults,
      ResultCategory.GC,
      RaceType.GRAND_TOUR,
      2024,
      3,
      undefined,
    );
    expect(withoutProfile).toBe(withUndefined);
  });

  it('golden values match pre-feature expected output', () => {
    const score = computeRiderScore('rider-1', regressionResults, RaceType.GRAND_TOUR, 2024);
    // GC: pos1 GT = 150 (temporal 1.0)
    expect(score.categoryScores.gc).toBe(150);
    // Stage: 2024 stage pos1=40 (temporal 1.0) + 2023 stage pos3=22 (temporal 0.6) = 40 + 13.2 = 53.2
    expect(score.categoryScores.stage).toBeCloseTo(53.2);
    // Mountain: pos1 GT = 50
    expect(score.categoryScores.mountain).toBe(50);
    expect(score.categoryScores.sprint).toBe(0);
  });
});

describe('ScoringService with profile', () => {
  const service = new ScoringService();

  it('should pass through profileDistribution to computeRiderScore', () => {
    const results = [
      createRaceResult({
        category: ResultCategory.STAGE,
        position: 1,
        stageNumber: 1,
        year: 2024,
        parcoursType: ParcoursType.P5,
      }),
    ];

    const withProfile = service.computeRiderScore(
      'rider-1',
      results,
      RaceType.GRAND_TOUR,
      2024,
      3,
      mountainProfile,
    );
    const withoutProfile = service.computeRiderScore('rider-1', results, RaceType.GRAND_TOUR, 2024);

    // P5 result on mountain profile gets weight ~1.0, so scores should be equal
    // (P5 is dominant in the mountain profile)
    expect(withProfile.categoryScores.stage).toBeCloseTo(withoutProfile.categoryScores.stage);
  });
});
