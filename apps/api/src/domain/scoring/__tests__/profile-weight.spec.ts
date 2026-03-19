import type { ProfileSummary } from '@cycling-analyzer/shared-types';
import { ParcoursType } from '../../shared/parcours-type.enum';
import { ProfileDistribution } from '../profile-distribution';
import { computeProfileWeight, computeCategoryProfileWeight } from '../profile-weight';
import { PROFILE_WEIGHT_FLOOR } from '../scoring-weights.config';

/**
 * Helper to create a ProfileDistribution from raw counts.
 */
function makeDist(counts: Partial<ProfileSummary>): ProfileDistribution | null {
  const summary: ProfileSummary = {
    p1Count: counts.p1Count ?? 0,
    p2Count: counts.p2Count ?? 0,
    p3Count: counts.p3Count ?? 0,
    p4Count: counts.p4Count ?? 0,
    p5Count: counts.p5Count ?? 0,
    ittCount: counts.ittCount ?? 0,
    tttCount: counts.tttCount ?? 0,
    unknownCount: counts.unknownCount ?? 0,
  };
  return ProfileDistribution.fromProfileSummary(summary);
}

describe('computeProfileWeight', () => {
  it('should return 1.0 when profileDistribution is null', () => {
    expect(computeProfileWeight(ParcoursType.P5, false, false, null)).toBe(1.0);
  });

  it('should return 1.0 when parcoursType is null', () => {
    const dist = makeDist({ p5Count: 10 });
    expect(computeProfileWeight(null, false, false, dist)).toBe(1.0);
  });

  it('should return ~1.0 for dominant profile match (P5 on mountain-heavy race)', () => {
    // Mountain-heavy: 1 P1, 0 P2, 1 P3, 2 P4, 8 P5
    const dist = makeDist({ p1Count: 1, p3Count: 1, p4Count: 2, p5Count: 8 });
    const weight = computeProfileWeight(ParcoursType.P5, false, false, dist);
    // maxShare = 8/12 (P5), P5 share = 8/12, normalized = 1.0
    expect(weight).toBeCloseTo(1.0);
  });

  it('should return less than 1.0 for minority profile (P2 on mountain-heavy race)', () => {
    // Mountain-heavy: 2 P1, 2 P2, 1 P3, 2 P4, 8 P5
    const dist = makeDist({ p1Count: 2, p2Count: 2, p3Count: 1, p4Count: 2, p5Count: 8 });
    const weight = computeProfileWeight(ParcoursType.P2, false, false, dist);
    // maxShare = 8/15 (P5), P2 share = 2/15, normalized = (2/15)/(8/15) = 0.25
    expect(weight).toBeLessThan(1.0);
    expect(weight).toBeGreaterThanOrEqual(PROFILE_WEIGHT_FLOOR);
  });

  it('should enforce floor when parcours type has 0 stages', () => {
    // Pure mountain race with 0 P1 stages
    const dist = makeDist({ p4Count: 5, p5Count: 10 });
    const weight = computeProfileWeight(ParcoursType.P1, false, false, dist);
    // P1 share = 0, maxShare = 10/15, normalized = 0 → floor = 0.25
    expect(weight).toBe(PROFILE_WEIGHT_FLOOR);
  });

  it('should add ITT bonus when result is ITT and race has ITT stages', () => {
    // Race with ITT stages
    const dist = makeDist({ p1Count: 4, p5Count: 6, ittCount: 2 });
    const weightWithItt = computeProfileWeight(ParcoursType.P5, true, false, dist);
    const weightWithoutItt = computeProfileWeight(ParcoursType.P5, false, false, dist);
    expect(weightWithItt).toBeGreaterThan(weightWithoutItt);
  });

  it('should add TTT bonus when result is TTT and race has TTT stages', () => {
    const dist = makeDist({ p1Count: 4, p5Count: 6, tttCount: 1 });
    const weightWithTtt = computeProfileWeight(ParcoursType.P5, false, true, dist);
    const weightWithoutTtt = computeProfileWeight(ParcoursType.P5, false, false, dist);
    expect(weightWithTtt).toBeGreaterThan(weightWithoutTtt);
  });

  it('should give P5 weight + ITT bonus for mountain ITT', () => {
    const dist = makeDist({ p1Count: 2, p5Count: 8, ittCount: 2 });
    const weightP5Only = computeProfileWeight(ParcoursType.P5, false, false, dist);
    const weightP5Itt = computeProfileWeight(ParcoursType.P5, true, false, dist);
    // ITT bonus adds ITT_BONUS_FACTOR * (ittShare / maxShare) on top
    expect(weightP5Itt).toBeGreaterThan(weightP5Only);
  });

  it('should not add ITT bonus when race has no ITT stages', () => {
    const dist = makeDist({ p1Count: 4, p5Count: 6 }); // ittCount = 0
    const weightWithIttFlag = computeProfileWeight(ParcoursType.P5, true, false, dist);
    const weightWithoutIttFlag = computeProfileWeight(ParcoursType.P5, false, false, dist);
    expect(weightWithIttFlag).toBe(weightWithoutIttFlag);
  });

  it('should return 1.0 when all parcours shares are zero (only unknowns)', () => {
    const dist = makeDist({ unknownCount: 5 });
    const weight = computeProfileWeight(ParcoursType.P3, false, false, dist);
    // All shares in shareMap are 0, maxShare = 0 → return 1.0
    expect(weight).toBe(1.0);
  });

  it('should give 1.0 for P3 on a single-type P3 classic race', () => {
    const dist = makeDist({ p3Count: 1 });
    const weight = computeProfileWeight(ParcoursType.P3, false, false, dist);
    expect(weight).toBeCloseTo(1.0);
  });

  it('should give floor for other types on a single-type P3 classic race', () => {
    const dist = makeDist({ p3Count: 1 });

    expect(computeProfileWeight(ParcoursType.P1, false, false, dist)).toBe(PROFILE_WEIGHT_FLOOR);
    expect(computeProfileWeight(ParcoursType.P2, false, false, dist)).toBe(PROFILE_WEIGHT_FLOOR);
    expect(computeProfileWeight(ParcoursType.P4, false, false, dist)).toBe(PROFILE_WEIGHT_FLOOR);
    expect(computeProfileWeight(ParcoursType.P5, false, false, dist)).toBe(PROFILE_WEIGHT_FLOOR);
  });
});

describe('computeCategoryProfileWeight', () => {
  it('should return 1.0 when profileDistribution is null', () => {
    expect(computeCategoryProfileWeight([ParcoursType.P4, ParcoursType.P5], null)).toBe(1.0);
  });

  it('should return high weight for mountain category on mountain-heavy race', () => {
    // Mountain-heavy: 2 P1, 1 P2, 1 P3, 3 P4, 7 P5
    const dist = makeDist({ p1Count: 2, p2Count: 1, p3Count: 1, p4Count: 3, p5Count: 7 });
    const weight = computeCategoryProfileWeight([ParcoursType.P4, ParcoursType.P5], dist);
    // maxShare = 7/14 = 0.5 (P5), avg affinity = (3/14 + 7/14) / 2 = 5/14
    // normalized = (5/14) / (7/14) = 5/7 ≈ 0.714
    expect(weight).toBeGreaterThan(0.7);
    expect(weight).toBeLessThanOrEqual(1.0);
  });

  it('should return low weight for sprint category on mountain-heavy race', () => {
    // Mountain-heavy: 1 P1, 0 P2, 1 P3, 3 P4, 8 P5
    const dist = makeDist({ p1Count: 1, p3Count: 1, p4Count: 3, p5Count: 8 });
    const weight = computeCategoryProfileWeight([ParcoursType.P1, ParcoursType.P2], dist);
    // maxShare = 8/13, avg affinity = (1/13 + 0) / 2 = 1/26
    // normalized = (1/26) / (8/13) = 13 / (26*8) = 1/16 ≈ 0.0625 → floor = 0.25
    expect(weight).toBe(PROFILE_WEIGHT_FLOOR);
  });

  it('should return 1.0 when all parcours shares are zero', () => {
    const dist = makeDist({ unknownCount: 5 });
    const weight = computeCategoryProfileWeight([ParcoursType.P4, ParcoursType.P5], dist);
    expect(weight).toBe(1.0);
  });

  it('should give high weight to sprint on flat race', () => {
    // Flat race: 8 P1, 3 P2, 1 P3
    const dist = makeDist({ p1Count: 8, p2Count: 3, p3Count: 1 });
    const weight = computeCategoryProfileWeight([ParcoursType.P1, ParcoursType.P2], dist);
    // maxShare = 8/12, avg affinity = (8/12 + 3/12)/2 = 11/24
    // normalized = (11/24)/(8/12) = (11/24)/(16/24) = 11/16 ≈ 0.6875
    expect(weight).toBeGreaterThan(0.6);
  });
});
