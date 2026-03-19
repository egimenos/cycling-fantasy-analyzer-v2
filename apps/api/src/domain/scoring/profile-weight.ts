import { ParcoursType } from '../shared/parcours-type.enum';
import { ProfileDistribution } from './profile-distribution';
import { PROFILE_WEIGHT_FLOOR, ITT_BONUS_FACTOR } from './scoring-weights.config';

/**
 * Builds a map from each ParcoursType to its share in the distribution.
 */
function buildShareMap(distribution: ProfileDistribution): Record<ParcoursType, number> {
  return {
    [ParcoursType.P1]: distribution.p1Share,
    [ParcoursType.P2]: distribution.p2Share,
    [ParcoursType.P3]: distribution.p3Share,
    [ParcoursType.P4]: distribution.p4Share,
    [ParcoursType.P5]: distribution.p5Share,
  };
}

/**
 * Computes a profile-based weight for a single stage/result.
 *
 * The weight reflects how well a rider's stage result matches the overall race profile.
 * A parcours type that dominates the race gets weight ~1.0; a minority type gets a lower weight
 * (but never below PROFILE_WEIGHT_FLOOR).
 *
 * ITT/TTT bonuses reward riders who deliver in time trials on races that include them.
 *
 * @param parcoursType - The parcours type of the stage, or null
 * @param isItt - Whether the result comes from an individual time trial
 * @param isTtt - Whether the result comes from a team time trial
 * @param profileDistribution - The race's profile distribution, or null if unavailable
 * @returns A weight between PROFILE_WEIGHT_FLOOR and ~1.15 (with ITT bonus)
 */
export function computeProfileWeight(
  parcoursType: ParcoursType | null,
  isItt: boolean,
  isTtt: boolean,
  profileDistribution: ProfileDistribution | null,
): number {
  if (profileDistribution === null) {
    return 1.0;
  }

  if (parcoursType === null) {
    return 1.0;
  }

  const shareMap = buildShareMap(profileDistribution);
  const maxShare = Math.max(...Object.values(shareMap));

  if (maxShare === 0) {
    return 1.0;
  }

  const normalizedWeight = shareMap[parcoursType] / maxShare;

  let bonus = 0;

  const ittBonus =
    isItt && profileDistribution.ittShare > 0
      ? ITT_BONUS_FACTOR * (profileDistribution.ittShare / maxShare)
      : 0;

  const tttBonus =
    isTtt && profileDistribution.tttShare > 0
      ? ITT_BONUS_FACTOR * (profileDistribution.tttShare / maxShare)
      : 0;

  bonus = Math.max(ittBonus, tttBonus);

  return Math.max(PROFILE_WEIGHT_FLOOR, normalizedWeight + bonus);
}

/**
 * Computes a profile-based weight for a result category based on affinity types.
 *
 * Used for category-level scoring (e.g. mountain classification on a mountain-heavy race).
 * Averages the shares of the affinity parcours types and normalizes by maxShare.
 *
 * @param affinityTypes - The parcours types that have affinity with this category
 * @param profileDistribution - The race's profile distribution, or null if unavailable
 * @returns A weight between PROFILE_WEIGHT_FLOOR and 1.0
 */
export function computeCategoryProfileWeight(
  affinityTypes: ParcoursType[],
  profileDistribution: ProfileDistribution | null,
): number {
  if (profileDistribution === null) {
    return 1.0;
  }

  const shareMap = buildShareMap(profileDistribution);
  const maxShare = Math.max(...Object.values(shareMap));

  if (maxShare === 0) {
    return 1.0;
  }

  const totalAffinityShare = affinityTypes.reduce((sum, type) => sum + shareMap[type], 0);
  const avgAffinityShare = totalAffinityShare / affinityTypes.length;

  return Math.max(PROFILE_WEIGHT_FLOOR, avgAffinityShare / maxShare);
}
