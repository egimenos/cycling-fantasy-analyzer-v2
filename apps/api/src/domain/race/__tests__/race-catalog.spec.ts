import { RACE_CATALOG, findRaceBySlug, isKnownRace } from './race-catalog';
import { RaceType } from '../shared/race-type.enum';

describe('RaceCatalog', () => {
  it('should have no duplicate slugs', () => {
    const slugs = RACE_CATALOG.map((r) => r.slug);
    const unique = new Set(slugs);
    expect(unique.size).toBe(slugs.length);
  });

  it('should include all three Grand Tours', () => {
    const grandTours = RACE_CATALOG.filter((r) => r.raceType === RaceType.GRAND_TOUR);
    expect(grandTours).toHaveLength(3);

    const slugs = grandTours.map((r) => r.slug);
    expect(slugs).toContain('tour-de-france');
    expect(slugs).toContain('giro-d-italia');
    expect(slugs).toContain('vuelta-a-espana');
  });

  it('should include all five Monuments', () => {
    const monumentSlugs = [
      'milano-sanremo',
      'ronde-van-vlaanderen',
      'paris-roubaix',
      'liege-bastogne-liege',
      'il-lombardia',
    ];

    for (const slug of monumentSlugs) {
      expect(RACE_CATALOG.some((r) => r.slug === slug)).toBe(true);
    }
  });

  it('should have expectedStages for all stage races', () => {
    const stageRaces = RACE_CATALOG.filter(
      (r) => r.raceType === RaceType.GRAND_TOUR || r.raceType === RaceType.MINI_TOUR,
    );

    for (const race of stageRaces) {
      expect(race.expectedStages).toBeDefined();
      expect(race.expectedStages).toBeGreaterThan(0);
    }
  });

  it('should not have expectedStages for classics', () => {
    const classics = RACE_CATALOG.filter((r) => r.raceType === RaceType.CLASSIC);

    for (const race of classics) {
      expect(race.expectedStages).toBeUndefined();
    }
  });

  describe('findRaceBySlug', () => {
    it('should return correct entry for known slug', () => {
      const entry = findRaceBySlug('tour-de-france');
      expect(entry).toBeDefined();
      expect(entry!.name).toBe('Tour de France');
      expect(entry!.raceType).toBe(RaceType.GRAND_TOUR);
      expect(entry!.expectedStages).toBe(21);
    });

    it('should return undefined for unknown slug', () => {
      expect(findRaceBySlug('nonexistent-race')).toBeUndefined();
    });
  });

  describe('isKnownRace', () => {
    it('should return true for known slug', () => {
      expect(isKnownRace('tour-de-france')).toBe(true);
    });

    it('should return false for unknown slug', () => {
      expect(isKnownRace('nonexistent-race')).toBe(false);
    });
  });
});
