import { ParsedResult } from '../parsers/parsed-result.type';
import { DiscoveredRace } from '../parsers/race-list.parser';

export interface ValidationResult {
  readonly valid: boolean;
  readonly warnings: string[];
  readonly errors: string[];
}

export interface ClassificationValidationContext {
  readonly raceSlug: string;
  readonly classificationType: string;
  readonly stageNumber?: number;
  readonly expectedMinRiders?: number;
  readonly expectedMaxRiders?: number;
}

const RIDER_SLUG_REGEX = /^rider\/[a-z0-9-]+$/;

export function validateClassificationResults(
  results: ParsedResult[],
  context: ClassificationValidationContext,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const label = `${context.raceSlug} ${context.classificationType}${context.stageNumber != null ? ` stage ${context.stageNumber}` : ''}`;

  // Check 1: Non-empty results
  if (results.length === 0) {
    errors.push(`No results parsed for ${label}`);
    return { valid: false, warnings, errors };
  }

  // Check 2: Position sequence — sequential with no gaps (warn, don't fail — PCS has ties)
  const positions = results
    .filter((r) => r.position !== null)
    .map((r) => r.position as number)
    .sort((a, b) => a - b);

  for (let i = 0; i < positions.length; i++) {
    if (positions[i] !== i + 1) {
      warnings.push(`Position gap in ${label}: expected ${i + 1}, got ${positions[i]}`);
      break;
    }
  }

  // Check 3: No duplicate positions (warn — PCS reports ties in sprint finishes)
  const positionSet = new Set(positions);
  if (positionSet.size !== positions.length) {
    warnings.push(`Duplicate positions found in ${label}`);
  }

  // Check 4: Rider count in expected range
  const min = context.expectedMinRiders ?? 20;
  const max = context.expectedMaxRiders ?? 300;
  if (results.length < min || results.length > max) {
    warnings.push(`Unexpected rider count: ${results.length} (expected ${min}-${max}) in ${label}`);
  }

  // Check 5: DNF consistency
  for (const r of results) {
    if (r.dnf && r.position !== null) {
      errors.push(`DNF rider "${r.riderName}" has position ${r.position} in ${label}`);
    }
  }

  // Check 6: Rider name non-empty
  for (const r of results) {
    if (!r.riderName || r.riderName.trim() === '') {
      errors.push(`Empty rider name found in ${label}`);
      break;
    }
  }

  // Check 7: Rider slug format
  const invalidSlugs = results.filter((r) => r.riderSlug && !RIDER_SLUG_REGEX.test(r.riderSlug));
  if (invalidSlugs.length > 0) {
    warnings.push(`${invalidSlugs.length} rider(s) with non-standard slug format in ${label}`);
  }

  // Check 8: Team name present
  const missingTeams = results.filter((r) => !r.teamName || r.teamName.trim() === '');
  if (missingTeams.length > 0) {
    warnings.push(`${missingTeams.length} rider(s) with empty team name in ${label}`);
  }

  // Check 9: Category consistency
  const inconsistent = results.filter((r) => r.category !== results[0].category);
  if (inconsistent.length > 0) {
    errors.push(`Mixed categories found in ${label}`);
  }

  return { valid: errors.length === 0, warnings, errors };
}

export interface StageRaceCompletenessInput {
  readonly type: string;
  readonly stageNumber?: number;
}

export function validateStageRaceCompleteness(
  classifications: StageRaceCompletenessInput[],
  raceSlug: string,
  expectedStages?: number,
): ValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  const types = new Set(classifications.map((c) => c.type));

  if (!types.has('GC')) {
    errors.push(`Missing GC classification for ${raceSlug}`);
  }
  if (!types.has('SPRINT')) {
    warnings.push(`Missing sprint/points classification for ${raceSlug}`);
  }
  if (!types.has('MOUNTAIN')) {
    warnings.push(`Missing mountain/KOM classification for ${raceSlug}`);
  }

  const stages = classifications
    .filter((c) => c.type === 'STAGE' && c.stageNumber != null)
    .map((c) => c.stageNumber as number);

  if (stages.length === 0) {
    errors.push(`No individual stages found for ${raceSlug}`);
  } else if (expectedStages && stages.length !== expectedStages) {
    warnings.push(`Expected ${expectedStages} stages, found ${stages.length} for ${raceSlug}`);
  }

  const sorted = [...stages].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i] !== i + 1) {
      warnings.push(`Stage sequence gap: expected stage ${i + 1}, found ${sorted[i]}`);
      break;
    }
  }

  return { valid: errors.length === 0, warnings, errors };
}

const GRAND_TOUR_SLUGS = ['tour-de-france', 'giro-d-italia', 'vuelta-a-espana'];

export function validateRaceDiscovery(discovered: DiscoveredRace[]): ValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (discovered.length < 25) {
    errors.push(`Only ${discovered.length} races discovered (expected >= 25)`);
  }

  const discoveredSlugs = new Set(discovered.map((r) => r.slug));
  for (const slug of GRAND_TOUR_SLUGS) {
    if (!discoveredSlugs.has(slug)) {
      warnings.push(`Grand Tour "${slug}" not found in discovered races`);
    }
  }

  if (discoveredSlugs.size !== discovered.length) {
    errors.push('Duplicate slugs found in discovered races');
  }

  const urlRegex = /^race\/[a-z0-9-]+\/\d{4}/;
  const invalidUrls = discovered.filter((r) => !urlRegex.test(r.urlPath));
  if (invalidUrls.length > 0) {
    warnings.push(`${invalidUrls.length} race(s) with non-standard URL format`);
  }

  return { valid: errors.length === 0, warnings, errors };
}
