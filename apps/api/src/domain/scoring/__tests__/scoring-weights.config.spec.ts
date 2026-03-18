import { ResultCategory } from '../../shared/result-category.enum';
import { RaceType } from '../../shared/race-type.enum';
import { RaceClass } from '../../shared/race-class.enum';
import {
  COMPOSITE_SCORE_WEIGHTS,
  CROSS_TYPE_WEIGHTS,
  RACE_CLASS_WEIGHTS,
  getCrossTypeWeight,
  getRaceClassWeight,
  getPointsForPosition,
} from '../scoring-weights.config';

describe('ScoringWeightsConfig', () => {
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
    describe('stage classification (same for all race types)', () => {
      it('should return 40 for stage position 1', () => {
        expect(getPointsForPosition(ResultCategory.STAGE, 1, RaceType.GRAND_TOUR)).toBe(40);
        expect(getPointsForPosition(ResultCategory.STAGE, 1, RaceType.MINI_TOUR)).toBe(40);
      });

      it('should return 17 for stage position 5', () => {
        expect(getPointsForPosition(ResultCategory.STAGE, 5, RaceType.GRAND_TOUR)).toBe(17);
      });

      it('should return 1 for stage position 20', () => {
        expect(getPointsForPosition(ResultCategory.STAGE, 20, RaceType.GRAND_TOUR)).toBe(1);
      });

      it('should return 0 for stage position 21', () => {
        expect(getPointsForPosition(ResultCategory.STAGE, 21, RaceType.GRAND_TOUR)).toBe(0);
      });
    });

    describe('GC — race-type specific', () => {
      it('should return 200 for classic GC 1st', () => {
        expect(getPointsForPosition(ResultCategory.GC, 1, RaceType.CLASSIC)).toBe(200);
      });

      it('should return 100 for mini tour GC 1st', () => {
        expect(getPointsForPosition(ResultCategory.GC, 1, RaceType.MINI_TOUR)).toBe(100);
      });

      it('should return 150 for grand tour GC 1st', () => {
        expect(getPointsForPosition(ResultCategory.GC, 1, RaceType.GRAND_TOUR)).toBe(150);
      });

      it('should return 30 for classic GC 10th', () => {
        expect(getPointsForPosition(ResultCategory.GC, 10, RaceType.CLASSIC)).toBe(30);
      });

      it('should return 0 for classic GC 11th (only top 10)', () => {
        expect(getPointsForPosition(ResultCategory.GC, 11, RaceType.CLASSIC)).toBe(0);
      });

      it('should return 10 for mini tour GC 15th', () => {
        expect(getPointsForPosition(ResultCategory.GC, 15, RaceType.MINI_TOUR)).toBe(10);
      });

      it('should return 0 for mini tour GC 16th (only top 15)', () => {
        expect(getPointsForPosition(ResultCategory.GC, 16, RaceType.MINI_TOUR)).toBe(0);
      });

      it('should return 10 for grand tour GC 20th', () => {
        expect(getPointsForPosition(ResultCategory.GC, 20, RaceType.GRAND_TOUR)).toBe(10);
      });

      it('should return 0 for grand tour GC 21st (only top 20)', () => {
        expect(getPointsForPosition(ResultCategory.GC, 21, RaceType.GRAND_TOUR)).toBe(0);
      });
    });

    describe('mountain/sprint final classification — race-type specific', () => {
      it('should return 40 for mini tour mountain 1st', () => {
        expect(getPointsForPosition(ResultCategory.MOUNTAIN, 1, RaceType.MINI_TOUR)).toBe(40);
      });

      it('should return 50 for grand tour mountain 1st', () => {
        expect(getPointsForPosition(ResultCategory.MOUNTAIN, 1, RaceType.GRAND_TOUR)).toBe(50);
      });

      it('should return 0 for classic mountain (no classification)', () => {
        expect(getPointsForPosition(ResultCategory.MOUNTAIN, 1, RaceType.CLASSIC)).toBe(0);
      });

      it('should return 15 for mini tour sprint 3rd', () => {
        expect(getPointsForPosition(ResultCategory.SPRINT, 3, RaceType.MINI_TOUR)).toBe(15);
      });

      it('should return 10 for grand tour sprint 5th', () => {
        expect(getPointsForPosition(ResultCategory.SPRINT, 5, RaceType.GRAND_TOUR)).toBe(10);
      });
    });

    describe('CROSS_TYPE_WEIGHTS', () => {
      it('should return 1.0 for same race type', () => {
        expect(getCrossTypeWeight(RaceType.GRAND_TOUR, RaceType.GRAND_TOUR)).toBe(1.0);
        expect(getCrossTypeWeight(RaceType.MINI_TOUR, RaceType.MINI_TOUR)).toBe(1.0);
        expect(getCrossTypeWeight(RaceType.CLASSIC, RaceType.CLASSIC)).toBe(1.0);
      });

      it('should return 0.7 between Grand Tour and Mini Tour', () => {
        expect(getCrossTypeWeight(RaceType.GRAND_TOUR, RaceType.MINI_TOUR)).toBe(0.7);
        expect(getCrossTypeWeight(RaceType.MINI_TOUR, RaceType.GRAND_TOUR)).toBe(0.7);
      });

      it('should return 0.3 between Classic and stage races', () => {
        expect(getCrossTypeWeight(RaceType.GRAND_TOUR, RaceType.CLASSIC)).toBe(0.3);
        expect(getCrossTypeWeight(RaceType.CLASSIC, RaceType.GRAND_TOUR)).toBe(0.3);
        expect(getCrossTypeWeight(RaceType.MINI_TOUR, RaceType.CLASSIC)).toBe(0.3);
        expect(getCrossTypeWeight(RaceType.CLASSIC, RaceType.MINI_TOUR)).toBe(0.3);
      });

      it('should be symmetric', () => {
        const types = [RaceType.GRAND_TOUR, RaceType.MINI_TOUR, RaceType.CLASSIC];
        for (const a of types) {
          for (const b of types) {
            expect(CROSS_TYPE_WEIGHTS[a][b]).toBe(CROSS_TYPE_WEIGHTS[b][a]);
          }
        }
      });
    });

    describe('RACE_CLASS_WEIGHTS', () => {
      it('should return 1.0 for UWT', () => {
        expect(getRaceClassWeight(RaceClass.UWT)).toBe(1.0);
      });

      it('should return 0.5 for Pro', () => {
        expect(getRaceClassWeight(RaceClass.PRO)).toBe(0.5);
      });

      it('should return 0.3 for .1', () => {
        expect(getRaceClassWeight(RaceClass.ONE)).toBe(0.3);
      });

      it('should cover all RaceClass values', () => {
        for (const cls of Object.values(RaceClass)) {
          expect(RACE_CLASS_WEIGHTS[cls]).toBeDefined();
          expect(RACE_CLASS_WEIGHTS[cls]).toBeGreaterThan(0);
        }
      });
    });

    describe('edge cases', () => {
      it('should return 0 for null position (DNF)', () => {
        expect(getPointsForPosition(ResultCategory.GC, null, RaceType.GRAND_TOUR)).toBe(0);
      });

      it('should return 0 for position 0', () => {
        expect(getPointsForPosition(ResultCategory.GC, 0, RaceType.GRAND_TOUR)).toBe(0);
      });

      it('should return 0 for negative position', () => {
        expect(getPointsForPosition(ResultCategory.GC, -1, RaceType.GRAND_TOUR)).toBe(0);
      });
    });
  });
});
