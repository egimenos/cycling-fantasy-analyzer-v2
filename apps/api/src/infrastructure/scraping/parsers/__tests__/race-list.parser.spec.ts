import * as fs from 'fs';
import * as path from 'path';
import { parseRaceList } from './race-list.parser';

const FIXTURE_DIR = path.join(__dirname, '../../../../test/fixtures/pcs');

function readFixture(filename: string): string {
  return fs.readFileSync(path.join(FIXTURE_DIR, filename), 'utf-8');
}

describe('parseRaceList', () => {
  describe('WorldTour Calendar 2025', () => {
    let races: ReturnType<typeof parseRaceList>;

    beforeAll(() => {
      const html = readFixture('races-calendar-2025-uwt.html');
      races = parseRaceList(html);
    });

    it('should extract >= 25 races from WorldTour calendar', () => {
      expect(races.length).toBeGreaterThanOrEqual(25);
    });

    it('should identify Tour de France as STAGE_RACE', () => {
      const tdf = races.find((r) => r.slug === 'tour-de-france');
      expect(tdf).toBeDefined();
      expect(tdf!.raceType).toBe('STAGE_RACE');
    });

    it('should identify all three Grand Tours', () => {
      const slugs = races.map((r) => r.slug);
      expect(slugs).toContain('tour-de-france');
      expect(slugs).toContain('giro-d-italia');
      expect(slugs).toContain('vuelta-a-espana');
    });

    it('should identify one-day races correctly', () => {
      const oneDays = races.filter((r) => r.raceType === 'ONE_DAY');
      expect(oneDays.length).toBeGreaterThan(0);

      for (const race of oneDays) {
        expect(race.classText).toMatch(/^1\./);
      }
    });

    it('should extract valid slugs', () => {
      const slugRegex = /^[a-z0-9-]+$/;
      for (const race of races) {
        expect(race.slug).toMatch(slugRegex);
      }
    });

    it('should not include duplicate slugs', () => {
      const slugs = races.map((r) => r.slug);
      const unique = new Set(slugs);
      expect(unique.size).toBe(slugs.length);
    });

    it('should extract race names', () => {
      for (const race of races) {
        expect(race.name.length).toBeGreaterThan(0);
      }
    });

    it('should have valid URL paths', () => {
      const urlRegex = /^race\/[a-z0-9-]+\/\d{4}/;
      for (const race of races) {
        expect(race.urlPath).toMatch(urlRegex);
      }
    });
  });

  it('should return empty array for HTML without calendar table', () => {
    const html = '<html><body><p>No table</p></body></html>';
    const result = parseRaceList(html);
    expect(result).toEqual([]);
  });
});
