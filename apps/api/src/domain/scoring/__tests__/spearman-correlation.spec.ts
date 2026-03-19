import { computeSpearmanRho, computeRankings } from '../spearman-correlation';

describe('computeSpearmanRho', () => {
  describe('happy path — no ties', () => {
    it('should return 1.0 for perfect positive correlation', () => {
      const result = computeSpearmanRho([100, 80, 60], [100, 80, 60]);
      expect(result).toBeCloseTo(1.0, 4);
    });

    it('should return -1.0 for perfect negative correlation', () => {
      const result = computeSpearmanRho([100, 80, 60], [60, 80, 100]);
      expect(result).toBeCloseTo(-1.0, 4);
    });

    it('should return correct ρ for a known moderate correlation', () => {
      // Hand-computed: predicted [90,80,70,60,50], actual [85,95,65,70,55]
      // Predicted ranks: [1,2,3,4,5], Actual ranks: [2,1,4,3,5]
      // d: [-1,1,-1,1,0], d²: [1,1,1,1,0], Σd² = 4
      // ρ = 1 - (6*4)/(5*(25-1)) = 1 - 24/120 = 1 - 0.2 = 0.8
      const result = computeSpearmanRho([90, 80, 70, 60, 50], [85, 95, 65, 70, 55]);
      expect(result).toBeCloseTo(0.8, 4);
    });
  });

  describe('ties', () => {
    it('should return correct ρ with ties in predicted', () => {
      // predicted: [100, 100, 60], actual: [90, 80, 70]
      // Predicted ranks: [1.5, 1.5, 3], Actual ranks: [1, 2, 3]
      // d: [0.5, -0.5, 0], d² = [0.25, 0.25, 0], Σd² = 0.5
      // tieCorrectX: one group of 2 → (8-2)/12 = 0.5
      // tieCorrectY: 0
      // sumX2 = (3*(9-1))/12 - 0.5 = 24/12 - 0.5 = 2 - 0.5 = 1.5
      // sumY2 = (3*(9-1))/12 - 0 = 2
      // ρ = (1.5 + 2 - 0.5) / (2 * sqrt(1.5 * 2)) = 3 / (2 * sqrt(3)) ≈ 0.8660
      const result = computeSpearmanRho([100, 100, 60], [90, 80, 70]);
      expect(result).toBeCloseTo(0.866, 3);
    });

    it('should return null when all values tied on one side', () => {
      const result = computeSpearmanRho([50, 50, 50], [100, 80, 60]);
      expect(result).toBeNull();
    });

    it('should return null when all values tied on the other side', () => {
      const result = computeSpearmanRho([100, 80, 60], [50, 50, 50]);
      expect(result).toBeNull();
    });

    it('should return correct ρ with ties in both arrays', () => {
      // predicted: [100, 100, 60, 60], actual: [90, 90, 70, 70]
      // Predicted ranks: [1.5, 1.5, 3.5, 3.5], Actual ranks: [1.5, 1.5, 3.5, 3.5]
      // d: [0, 0, 0, 0], Σd² = 0
      // tieCorrectX: one group of 2, another group of 2 → 0.5 + 0.5 = 1.0
      // tieCorrectY: same → 1.0
      // sumX2 = (4*(16-1))/12 - 1.0 = 60/12 - 1 = 5 - 1 = 4
      // sumY2 = 4
      // ρ = (4 + 4 - 0) / (2 * sqrt(4 * 4)) = 8 / 8 = 1.0
      const result = computeSpearmanRho([100, 100, 60, 60], [90, 90, 70, 70]);
      expect(result).toBeCloseTo(1.0, 4);
    });

    it('should return null when all zeros in one array', () => {
      const result = computeSpearmanRho([0, 0, 0], [1, 2, 3]);
      expect(result).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should return null for n = 0', () => {
      const result = computeSpearmanRho([], []);
      expect(result).toBeNull();
    });

    it('should return null for n = 1', () => {
      const result = computeSpearmanRho([42], [99]);
      expect(result).toBeNull();
    });

    it('should return 1.0 for n = 2 with same order', () => {
      const result = computeSpearmanRho([10, 20], [10, 20]);
      expect(result).toBeCloseTo(1.0, 4);
    });

    it('should return -1.0 for n = 2 with reversed order', () => {
      const result = computeSpearmanRho([10, 20], [20, 10]);
      expect(result).toBeCloseTo(-1.0, 4);
    });

    it('should throw on mismatched array lengths', () => {
      expect(() => computeSpearmanRho([1, 2], [1, 2, 3])).toThrow('Arrays must have equal length');
    });

    it('should handle large n (100 items) and return ρ ∈ [-1, 1]', () => {
      const predicted = Array.from({ length: 100 }, (_, i) => i);
      const actual = Array.from({ length: 100 }, (_, i) => 99 - i);
      const result = computeSpearmanRho(predicted, actual);
      expect(result).not.toBeNull();
      expect(result!).toBeGreaterThanOrEqual(-1);
      expect(result!).toBeLessThanOrEqual(1);
      expect(result).toBeCloseTo(-1.0, 4);
    });
  });

  describe('numerical stability', () => {
    it('should handle very close values correctly', () => {
      const result = computeSpearmanRho([1.0001, 1.0002, 1.0003], [3, 2, 1]);
      expect(result).toBeCloseTo(-1.0, 4);
    });
  });
});

describe('computeRankings', () => {
  it('should rank without ties', () => {
    expect(computeRankings([100, 80, 60])).toEqual([1, 2, 3]);
  });

  it('should use average rank for ties', () => {
    expect(computeRankings([100, 80, 80, 60])).toEqual([1, 2.5, 2.5, 4]);
  });

  it('should assign average rank when all tied', () => {
    expect(computeRankings([50, 50, 50])).toEqual([2, 2, 2]);
  });

  it('should handle a single item', () => {
    expect(computeRankings([100])).toEqual([1]);
  });

  it('should return empty array for empty input', () => {
    expect(computeRankings([])).toEqual([]);
  });

  it('should rank in descending order (highest = rank 1)', () => {
    expect(computeRankings([60, 80, 100])).toEqual([3, 2, 1]);
  });
});
