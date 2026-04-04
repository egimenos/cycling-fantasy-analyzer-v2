import { RaceResult } from '../race-result/race-result.entity';
import { ResultCategory } from '../shared/result-category.enum';
import { getPointsForPosition } from './scoring-weights.config';
import type { RaceHistory } from '@cycling-analyzer/shared-types';
import type { RacePerformance } from '../breakout/breakout.types';

/**
 * Counts unique sprint intermediate locations per stage from race results.
 * Used to split sprint points proportionally when a stage has multiple sprints.
 */
export function countSprintsPerStage(yearResults: readonly RaceResult[]): Map<number, number> {
  const counts = new Map<number, Set<string>>();
  for (const r of yearResults) {
    if (r.category !== ResultCategory.SPRINT_INTERMEDIATE || r.stageNumber === null) continue;
    const sprintKey = r.sprintName ?? `km${r.kmMarker ?? 0}`;
    const existing = counts.get(r.stageNumber);
    if (existing) existing.add(sprintKey);
    else counts.set(r.stageNumber, new Set([sprintKey]));
  }
  const result = new Map<number, number>();
  for (const [stage, names] of counts) result.set(stage, names.size);
  return result;
}

/**
 * Builds a rider's historical scoring breakdown for a specific race.
 * Groups results by year and computes fantasy points per scoring category.
 */
export function buildSameRaceHistory(
  results: readonly RaceResult[],
  raceSlug: string,
): RaceHistory[] {
  const byYear = new Map<number, RaceResult[]>();
  for (const r of results) {
    if (r.raceSlug !== raceSlug) continue;
    const existing = byYear.get(r.year);
    if (existing) existing.push(r);
    else byYear.set(r.year, [r]);
  }

  const history: RaceHistory[] = [];
  for (const [year, yearResults] of byYear) {
    let gc = 0;
    let stage = 0;
    let mountain = 0;
    let sprint = 0;

    const sprintsPerStage = countSprintsPerStage(yearResults);

    for (const r of yearResults) {
      const pts = getPointsForPosition(r.category as ResultCategory, r.position, r.raceType, {
        climbCategory: r.climbCategory,
        sprintCount: r.stageNumber !== null ? (sprintsPerStage.get(r.stageNumber) ?? 1) : 1,
      });
      switch (r.category) {
        case ResultCategory.GC:
        case ResultCategory.GC_DAILY:
        case ResultCategory.REGULARIDAD_DAILY:
          gc += pts;
          break;
        case ResultCategory.STAGE:
          stage += pts;
          break;
        case ResultCategory.MOUNTAIN:
        case ResultCategory.MOUNTAIN_PASS:
          mountain += pts;
          break;
        case ResultCategory.SPRINT:
        case ResultCategory.SPRINT_INTERMEDIATE:
          sprint += pts;
          break;
      }
    }

    history.push({ year, gc, stage, mountain, sprint, total: gc + stage + mountain + sprint });
  }

  return history.sort((a, b) => b.year - a.year);
}

/**
 * Aggregates race results into per-race performance summaries with dates.
 * Groups by (raceSlug, year) and sums fantasy points across all categories.
 * Only includes races with a known raceDate (needed for time-window signals).
 */
export function buildRacePerformances(results: readonly RaceResult[]): RacePerformance[] {
  const byRace = new Map<string, RaceResult[]>();
  for (const r of results) {
    if (!r.raceDate) continue;
    const key = `${r.raceSlug}:${r.year}`;
    const existing = byRace.get(key);
    if (existing) existing.push(r);
    else byRace.set(key, [r]);
  }

  const performances: RacePerformance[] = [];
  for (const [, raceResults] of byRace) {
    const first = raceResults[0];
    const sprintsPerStage = countSprintsPerStage(raceResults);
    let total = 0;

    for (const r of raceResults) {
      total += getPointsForPosition(r.category as ResultCategory, r.position, r.raceType, {
        climbCategory: r.climbCategory,
        sprintCount: r.stageNumber !== null ? (sprintsPerStage.get(r.stageNumber) ?? 1) : 1,
      });
    }

    performances.push({
      raceSlug: first.raceSlug,
      year: first.year,
      raceDate: first.raceDate!,
      total,
    });
  }

  return performances.sort((a, b) => b.raceDate.getTime() - a.raceDate.getTime());
}
