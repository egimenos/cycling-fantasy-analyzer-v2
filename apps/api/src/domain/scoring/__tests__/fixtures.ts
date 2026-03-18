import { RaceResult } from '../../race-result/race-result.entity';
import { RaceType } from '../../shared/race-type.enum';
import { RaceClass } from '../../shared/race-class.enum';
import { ResultCategory } from '../../shared/result-category.enum';

interface RaceResultOverrides {
  id?: string;
  riderId?: string;
  raceSlug?: string;
  raceName?: string;
  raceType?: RaceType;
  raceClass?: RaceClass;
  year?: number;
  category?: ResultCategory;
  position?: number | null;
  stageNumber?: number | null;
  dnf?: boolean;
  scrapedAt?: Date;
}

/**
 * Factory function for creating test RaceResult instances.
 * Uses RaceResult.reconstitute to avoid randomUUID in tests.
 */
export function createRaceResult(overrides: RaceResultOverrides = {}): RaceResult {
  return RaceResult.reconstitute({
    id: overrides.id ?? 'test-id',
    riderId: overrides.riderId ?? 'rider-1',
    raceSlug: overrides.raceSlug ?? 'tour-de-france',
    raceName: overrides.raceName ?? 'Tour de France',
    raceType: overrides.raceType ?? RaceType.GRAND_TOUR,
    raceClass: overrides.raceClass ?? RaceClass.UWT,
    year: overrides.year ?? 2024,
    category: overrides.category ?? ResultCategory.GC,
    position: overrides.position === undefined ? 1 : overrides.position,
    stageNumber: overrides.stageNumber === undefined ? null : overrides.stageNumber,
    dnf: overrides.dnf ?? false,
    scrapedAt: overrides.scrapedAt ?? new Date('2024-07-21'),
  });
}
