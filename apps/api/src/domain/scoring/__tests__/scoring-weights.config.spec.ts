import { ResultCategory } from '../../shared/result-category.enum';
import {
  SCORING_WEIGHTS,
  COMPOSITE_SCORE_WEIGHTS,
  getPointsForPosition,
} from '../scoring-weights.config';

describe('ScoringWeightsConfig', () => {
  describe('SCORING_WEIGHTS', () => {
    it('should have all four categories defined', () => {
      expect(SCORING_WEIGHTS.gc).toBeDefined();
      expect(SCORING_WEIGHTS.stage).toBeDefined();
      expect(SCORING_WEIGHTS.mountain).toBeDefined();
      expect(SCORING_WEIGHTS.sprint).toBeDefined();
    });

    it('should have position 1 defined for every category', () => {
      expect(SCORING_WEIGHTS.gc[1]).toBeDefined();
      expect(SCORING_WEIGHTS.stage[1]).toBeDefined();
      expect(SCORING_WEIGHTS.mountain[1]).toBeDefined();
      expect(SCORING_WEIGHTS.sprint[1]).toBeDefined();
    });

    it('should have all positive integer values', () => {
      for (const category of Object.values(SCORING_WEIGHTS)) {
        for (const [, points] of Object.entries(category)) {
          expect(Number(points)).toBeGreaterThan(0);
          expect(Number.isInteger(Number(points))).toBe(true);
        }
      }
    });

    it('should have descending points for ascending positions in GC', () => {
      const positions = Object.keys(SCORING_WEIGHTS.gc)
        .map(Number)
        .sort((a, b) => a - b);
      for (let i = 0; i < positions.length - 1; i++) {
        expect(SCORING_WEIGHTS.gc[positions[i]]).toBeGreaterThanOrEqual(
          SCORING_WEIGHTS.gc[positions[i + 1]],
        );
      }
    });

    it('should have GC 1st place at 200 points', () => {
      expect(SCORING_WEIGHTS.gc[1]).toBe(200);
    });

    it('should have stage 1st place at 15 points', () => {
      expect(SCORING_WEIGHTS.stage[1]).toBe(15);
    });

    it('should have exactly 4 categories', () => {
      expect(Object.keys(SCORING_WEIGHTS)).toHaveLength(4);
    });
  });

  describe('COMPOSITE_SCORE_WEIGHTS', () => {
    it('should have rawPerformance and priceEfficiency summing to 1.0', () => {
      expect(
        COMPOSITE_SCORE_WEIGHTS.rawPerformance + COMPOSITE_SCORE_WEIGHTS.priceEfficiency,
      ).toBeCloseTo(1.0);
    });

    it('should weight raw performance at 0.6', () => {
      expect(COMPOSITE_SCORE_WEIGHTS.rawPerformance).toBe(0.6);
    });

    it('should weight price efficiency at 0.4', () => {
      expect(COMPOSITE_SCORE_WEIGHTS.priceEfficiency).toBe(0.4);
    });
  });

  describe('getPointsForPosition', () => {
    it('should return correct points for GC position 1', () => {
      expect(getPointsForPosition(ResultCategory.GC, 1)).toBe(200);
    });

    it('should return correct points for GC position 10', () => {
      expect(getPointsForPosition(ResultCategory.GC, 10)).toBe(45);
    });

    it('should return correct points for stage position 5', () => {
      expect(getPointsForPosition(ResultCategory.STAGE, 5)).toBe(6);
    });

    it('should return correct points for mountain position 1', () => {
      expect(getPointsForPosition(ResultCategory.MOUNTAIN, 1)).toBe(12);
    });

    it('should return correct points for sprint position 2', () => {
      expect(getPointsForPosition(ResultCategory.SPRINT, 2)).toBe(4);
    });

    it('should return 0 for position beyond scoring threshold', () => {
      expect(getPointsForPosition(ResultCategory.GC, 21)).toBe(0);
      expect(getPointsForPosition(ResultCategory.STAGE, 11)).toBe(0);
      expect(getPointsForPosition(ResultCategory.SPRINT, 5)).toBe(0);
    });

    it('should return 0 for null position (DNF)', () => {
      expect(getPointsForPosition(ResultCategory.GC, null)).toBe(0);
    });

    it('should return 0 for position 0', () => {
      expect(getPointsForPosition(ResultCategory.GC, 0)).toBe(0);
    });

    it('should return 0 for negative position', () => {
      expect(getPointsForPosition(ResultCategory.GC, -1)).toBe(0);
    });
  });
});
