import { ResultCategory } from '../../../domain/shared/result-category.enum';
import { ParsedResult } from '../parsers/parsed-result.type';
import {
  validateClassificationResults,
  validateStageRaceCompleteness,
  validateRaceDiscovery,
} from './parse-validator';
import { RACE_CATALOG } from '../../../domain/race/race-catalog';

function makeParsedResult(overrides: Partial<ParsedResult> = {}): ParsedResult {
  return {
    riderName: 'Test Rider',
    riderSlug: 'rider/test-rider',
    teamName: 'Test Team',
    position: 1,
    category: ResultCategory.GC,
    stageNumber: null,
    dnf: false,
    ...overrides,
  };
}

function makeSequentialResults(
  count: number,
  category: ResultCategory = ResultCategory.GC,
): ParsedResult[] {
  return Array.from({ length: count }, (_, i) =>
    makeParsedResult({
      riderName: `Rider ${i + 1}`,
      riderSlug: `rider/rider-${i + 1}`,
      position: i + 1,
      category,
    }),
  );
}

describe('validateClassificationResults', () => {
  const baseContext = {
    raceSlug: 'tour-de-france',
    classificationType: 'GC',
    expectedMinRiders: 50,
    expectedMaxRiders: 200,
  };

  it('should pass for valid sequential results', () => {
    const results = makeSequentialResults(150);
    const validation = validateClassificationResults(results, baseContext);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it('should fail for empty results', () => {
    const validation = validateClassificationResults([], baseContext);
    expect(validation.valid).toBe(false);
    expect(validation.errors[0]).toContain('No results parsed');
  });

  it('should fail for duplicate positions', () => {
    const results = [
      makeParsedResult({ position: 1 }),
      makeParsedResult({ position: 1, riderName: 'Rider 2', riderSlug: 'rider/rider-2' }),
      makeParsedResult({ position: 2, riderName: 'Rider 3', riderSlug: 'rider/rider-3' }),
    ];
    const validation = validateClassificationResults(results, baseContext);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('Duplicate'))).toBe(true);
  });

  it('should fail for position gaps', () => {
    const results = [
      makeParsedResult({ position: 1 }),
      makeParsedResult({ position: 3, riderName: 'Rider 2', riderSlug: 'rider/rider-2' }),
    ];
    const validation = validateClassificationResults(results, baseContext);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('Position gap'))).toBe(true);
  });

  it('should fail for DNF with numeric position', () => {
    const results = [
      makeParsedResult({ position: 1 }),
      makeParsedResult({
        position: 2,
        dnf: true,
        riderName: 'DNF Rider',
        riderSlug: 'rider/dnf-rider',
      }),
    ];
    const validation = validateClassificationResults(results, baseContext);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('DNF'))).toBe(true);
  });

  it('should warn for rider count out of range', () => {
    const results = makeSequentialResults(10);
    const validation = validateClassificationResults(results, baseContext);
    expect(validation.valid).toBe(true);
    expect(validation.warnings.some((w) => w.includes('rider count'))).toBe(true);
  });

  it('should fail for empty rider names', () => {
    const results = [makeParsedResult({ riderName: '' })];
    const validation = validateClassificationResults(results, baseContext);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('Empty rider name'))).toBe(true);
  });

  it('should warn for invalid rider slug format', () => {
    const results = [makeParsedResult({ riderSlug: 'invalid-slug-no-prefix' })];
    const validation = validateClassificationResults(results, {
      ...baseContext,
      expectedMinRiders: 1,
    });
    expect(validation.warnings.some((w) => w.includes('slug format'))).toBe(true);
  });

  it('should fail for mixed categories', () => {
    const results = [
      makeParsedResult({ position: 1, category: ResultCategory.GC }),
      makeParsedResult({
        position: 2,
        category: ResultCategory.STAGE,
        riderName: 'Rider 2',
        riderSlug: 'rider/rider-2',
      }),
    ];
    const validation = validateClassificationResults(results, baseContext);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('Mixed categories'))).toBe(true);
  });
});

describe('validateStageRaceCompleteness', () => {
  it('should pass when GC + stages + points + KOM all present', () => {
    const classifications = [
      { type: 'GC' },
      { type: 'SPRINT' },
      { type: 'MOUNTAIN' },
      ...Array.from({ length: 21 }, (_, i) => ({
        type: 'STAGE',
        stageNumber: i + 1,
      })),
    ];
    const validation = validateStageRaceCompleteness(classifications, 'tour-de-france', 21);
    expect(validation.valid).toBe(true);
    expect(validation.warnings).toHaveLength(0);
  });

  it('should fail when GC is missing', () => {
    const classifications = [{ type: 'SPRINT' }, { type: 'STAGE', stageNumber: 1 }];
    const validation = validateStageRaceCompleteness(classifications, 'tour-de-france');
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('Missing GC'))).toBe(true);
  });

  it('should warn when expected stage count does not match', () => {
    const classifications = [
      { type: 'GC' },
      { type: 'SPRINT' },
      { type: 'MOUNTAIN' },
      { type: 'STAGE', stageNumber: 1 },
      { type: 'STAGE', stageNumber: 2 },
    ];
    const validation = validateStageRaceCompleteness(classifications, 'tour-de-france', 21);
    expect(validation.valid).toBe(true);
    expect(validation.warnings.some((w) => w.includes('Expected 21 stages'))).toBe(true);
  });

  it('should fail when no stages are found', () => {
    const classifications = [{ type: 'GC' }];
    const validation = validateStageRaceCompleteness(classifications, 'tour-de-france');
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('No individual stages'))).toBe(true);
  });

  it('should warn on missing sprint classification', () => {
    const classifications = [
      { type: 'GC' },
      { type: 'MOUNTAIN' },
      { type: 'STAGE', stageNumber: 1 },
    ];
    const validation = validateStageRaceCompleteness(classifications, 'tour-de-france');
    expect(validation.warnings.some((w) => w.includes('Missing sprint'))).toBe(true);
  });
});

describe('validateRaceDiscovery', () => {
  function makeDiscoveredRaces(count: number) {
    return Array.from({ length: count }, (_, i) => ({
      urlPath: `race/race-${i}/2024`,
      slug: i < 3 ? ['tour-de-france', 'giro-d-italia', 'vuelta-a-espana'][i] : `race-${i}`,
      name: `Race ${i}`,
      raceType: 'STAGE_RACE' as const,
      classText: '2.UWT',
    }));
  }

  it('should pass when >= 25 races and Grand Tours present', () => {
    const discovered = makeDiscoveredRaces(30);
    const validation = validateRaceDiscovery(discovered, [...RACE_CATALOG]);
    expect(validation.valid).toBe(true);
  });

  it('should fail when < 25 races', () => {
    const discovered = makeDiscoveredRaces(10);
    const validation = validateRaceDiscovery(discovered, [...RACE_CATALOG]);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('expected >= 25'))).toBe(true);
  });

  it('should warn when a Grand Tour is missing', () => {
    const discovered = makeDiscoveredRaces(30).filter((r) => r.slug !== 'tour-de-france');
    const validation = validateRaceDiscovery(discovered, [...RACE_CATALOG]);
    expect(validation.warnings.some((w) => w.includes('Tour de France'))).toBe(true);
  });

  it('should fail when duplicate slugs exist', () => {
    const discovered = makeDiscoveredRaces(25);
    discovered.push({ ...discovered[5] });
    const validation = validateRaceDiscovery(discovered, [...RACE_CATALOG]);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('Duplicate slugs'))).toBe(true);
  });
});
