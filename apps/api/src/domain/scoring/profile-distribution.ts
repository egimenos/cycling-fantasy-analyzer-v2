import type { ProfileSummary } from '@cycling-analyzer/shared-types';

/**
 * Immutable value object representing the parcours distribution of a race profile.
 *
 * Each share represents the proportion of stages (0–1) that match a given parcours type.
 * ITT/TTT shares overlap with parcours shares (e.g. a P5 ITT counts in both p5Share and ittShare).
 */
export class ProfileDistribution {
  readonly p1Share: number;
  readonly p2Share: number;
  readonly p3Share: number;
  readonly p4Share: number;
  readonly p5Share: number;
  readonly ittShare: number;
  readonly tttShare: number;
  readonly totalStages: number;

  private constructor(
    p1Share: number,
    p2Share: number,
    p3Share: number,
    p4Share: number,
    p5Share: number,
    ittShare: number,
    tttShare: number,
    totalStages: number,
  ) {
    this.p1Share = p1Share;
    this.p2Share = p2Share;
    this.p3Share = p3Share;
    this.p4Share = p4Share;
    this.p5Share = p5Share;
    this.ittShare = ittShare;
    this.tttShare = tttShare;
    this.totalStages = totalStages;
  }

  /**
   * Creates a ProfileDistribution from a ProfileSummary.
   *
   * totalStages = sum of ALL counts (p1+p2+p3+p4+p5+itt+ttt+unknown).
   * Each share = count / totalStages.
   *
   * Returns null if totalStages is 0 (no stage data available).
   */
  static fromProfileSummary(summary: ProfileSummary): ProfileDistribution | null {
    const totalStages =
      summary.p1Count +
      summary.p2Count +
      summary.p3Count +
      summary.p4Count +
      summary.p5Count +
      summary.ittCount +
      summary.tttCount +
      summary.unknownCount;

    if (totalStages === 0) {
      return null;
    }

    return new ProfileDistribution(
      summary.p1Count / totalStages,
      summary.p2Count / totalStages,
      summary.p3Count / totalStages,
      summary.p4Count / totalStages,
      summary.p5Count / totalStages,
      summary.ittCount / totalStages,
      summary.tttCount / totalStages,
      totalStages,
    );
  }
}
