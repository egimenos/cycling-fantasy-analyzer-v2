import { buildSeasonBreakdowns } from '../race-history.service';
import { RaceResult } from '../../race-result/race-result.entity';
import { RaceType } from '../../shared/race-type.enum';
import { RaceClass } from '../../shared/race-class.enum';
import { ResultCategory } from '../../shared/result-category.enum';

function result(
  overrides: Partial<{
    riderId: string;
    raceSlug: string;
    year: number;
    category: ResultCategory;
    position: number | null;
    stageNumber: number | null;
    raceType: RaceType;
  }>,
): RaceResult {
  return RaceResult.create({
    riderId: overrides.riderId ?? 'r1',
    raceSlug: overrides.raceSlug ?? 'tour-de-france',
    raceName: 'Tour de France',
    raceType: overrides.raceType ?? RaceType.GRAND_TOUR,
    raceClass: RaceClass.UWT,
    year: overrides.year ?? 2025,
    category: overrides.category ?? ResultCategory.STAGE,
    position: overrides.position ?? 1,
    stageNumber: overrides.stageNumber ?? null,
    dnf: false,
    scrapedAt: new Date(),
    parcoursType: null,
    isItt: false,
    isTtt: false,
    profileScore: null,
    raceDate: null,
    climbCategory: null,
    climbName: null,
    sprintName: null,
    kmMarker: null,
  });
}

describe('buildSeasonBreakdowns', () => {
  it('aggregates results across races into per-year totals', () => {
    const results = [
      result({ year: 2025, raceSlug: 'tour-de-france', category: ResultCategory.GC, position: 1 }),
      result({ year: 2025, raceSlug: 'giro-d-italia', category: ResultCategory.GC, position: 3 }),
      result({ year: 2024, raceSlug: 'tour-de-france', category: ResultCategory.GC, position: 2 }),
    ];

    const breakdowns = buildSeasonBreakdowns(results);

    expect(breakdowns).toHaveLength(2);
    // Most recent year first
    expect(breakdowns[0].year).toBe(2025);
    expect(breakdowns[1].year).toBe(2024);
    // 2025: GC pos 1 (150pts) + GC pos 3 (100pts) = 250 (Grand Tour scoring)
    expect(breakdowns[0].gc).toBe(250);
    expect(breakdowns[0].total).toBe(250);
    // 2024: GC pos 2 (125pts)
    expect(breakdowns[1].gc).toBe(125);
  });

  it('separates points by category', () => {
    const results = [
      result({ year: 2025, category: ResultCategory.GC, position: 1 }),
      result({ year: 2025, category: ResultCategory.STAGE, position: 1, stageNumber: 1 }),
      result({ year: 2025, category: ResultCategory.MOUNTAIN, position: 1 }),
      result({ year: 2025, category: ResultCategory.SPRINT, position: 1 }),
    ];

    const breakdowns = buildSeasonBreakdowns(results);

    expect(breakdowns).toHaveLength(1);
    expect(breakdowns[0].gc).toBeGreaterThan(0);
    expect(breakdowns[0].stage).toBeGreaterThan(0);
    expect(breakdowns[0].mountain).toBeGreaterThan(0);
    expect(breakdowns[0].sprint).toBeGreaterThan(0);
    expect(breakdowns[0].total).toBe(
      breakdowns[0].gc + breakdowns[0].stage + breakdowns[0].mountain + breakdowns[0].sprint,
    );
  });

  it('returns empty array for no results', () => {
    expect(buildSeasonBreakdowns([])).toEqual([]);
  });
});
