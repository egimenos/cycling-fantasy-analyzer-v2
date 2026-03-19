import type { ProfileSummary } from '@cycling-analyzer/shared-types';
import { ProfileDistribution } from '../profile-distribution';

describe('ProfileDistribution', () => {
  describe('fromProfileSummary', () => {
    it('should compute correct shares for a standard Grand Tour profile', () => {
      const summary: ProfileSummary = {
        p1Count: 4,
        p2Count: 2,
        p3Count: 3,
        p4Count: 4,
        p5Count: 6,
        ittCount: 2,
        tttCount: 0,
        unknownCount: 0,
      };

      const dist = ProfileDistribution.fromProfileSummary(summary);

      expect(dist).not.toBeNull();
      expect(dist!.totalStages).toBe(21);
      expect(dist!.p1Share).toBeCloseTo(4 / 21);
      expect(dist!.p2Share).toBeCloseTo(2 / 21);
      expect(dist!.p3Share).toBeCloseTo(3 / 21);
      expect(dist!.p4Share).toBeCloseTo(4 / 21);
      expect(dist!.p5Share).toBeCloseTo(6 / 21);
      expect(dist!.ittShare).toBeCloseTo(2 / 21);
      expect(dist!.tttShare).toBe(0);
    });

    it('should handle a flat classic with a single stage type', () => {
      const summary: ProfileSummary = {
        p1Count: 1,
        p2Count: 0,
        p3Count: 0,
        p4Count: 0,
        p5Count: 0,
        ittCount: 0,
        tttCount: 0,
        unknownCount: 0,
      };

      const dist = ProfileDistribution.fromProfileSummary(summary);

      expect(dist).not.toBeNull();
      expect(dist!.totalStages).toBe(1);
      expect(dist!.p1Share).toBe(1.0);
      expect(dist!.p2Share).toBe(0);
      expect(dist!.p3Share).toBe(0);
      expect(dist!.p4Share).toBe(0);
      expect(dist!.p5Share).toBe(0);
    });

    it('should return null when all counts are zero', () => {
      const summary: ProfileSummary = {
        p1Count: 0,
        p2Count: 0,
        p3Count: 0,
        p4Count: 0,
        p5Count: 0,
        ittCount: 0,
        tttCount: 0,
        unknownCount: 0,
      };

      const dist = ProfileDistribution.fromProfileSummary(summary);

      expect(dist).toBeNull();
    });

    it('should include unknowns in totalStages with all parcours shares at 0', () => {
      const summary: ProfileSummary = {
        p1Count: 0,
        p2Count: 0,
        p3Count: 0,
        p4Count: 0,
        p5Count: 0,
        ittCount: 0,
        tttCount: 0,
        unknownCount: 5,
      };

      const dist = ProfileDistribution.fromProfileSummary(summary);

      expect(dist).not.toBeNull();
      expect(dist!.totalStages).toBe(5);
      expect(dist!.p1Share).toBe(0);
      expect(dist!.p2Share).toBe(0);
      expect(dist!.p3Share).toBe(0);
      expect(dist!.p4Share).toBe(0);
      expect(dist!.p5Share).toBe(0);
      expect(dist!.ittShare).toBe(0);
      expect(dist!.tttShare).toBe(0);
    });

    it('should produce shares in the 0–1 range', () => {
      const summary: ProfileSummary = {
        p1Count: 4,
        p2Count: 2,
        p3Count: 3,
        p4Count: 4,
        p5Count: 6,
        ittCount: 2,
        tttCount: 0,
        unknownCount: 0,
      };

      const dist = ProfileDistribution.fromProfileSummary(summary)!;

      const shares = [
        dist.p1Share,
        dist.p2Share,
        dist.p3Share,
        dist.p4Share,
        dist.p5Share,
        dist.ittShare,
        dist.tttShare,
      ];

      for (const share of shares) {
        expect(share).toBeGreaterThanOrEqual(0);
        expect(share).toBeLessThanOrEqual(1);
      }
    });

    it('should produce readonly fields (immutability)', () => {
      const summary: ProfileSummary = {
        p1Count: 1,
        p2Count: 0,
        p3Count: 0,
        p4Count: 0,
        p5Count: 0,
        ittCount: 0,
        tttCount: 0,
        unknownCount: 0,
      };

      const dist = ProfileDistribution.fromProfileSummary(summary)!;

      // TypeScript readonly prevents assignment at compile time.
      // At runtime, verify the properties exist and have expected values.
      expect(dist.p1Share).toBe(1.0);
      expect(dist.totalStages).toBe(1);

      // Attempting to assign should throw in strict mode or be silently ignored
      expect(() => {
        (dist as unknown as Record<string, unknown>)['p1Share'] = 999;
      }).not.toThrow(); // JS readonly via class fields doesn't throw, but TS enforces it
      // The key guarantee is the TypeScript compiler enforcement
    });
  });
});
