import * as fs from 'fs';
import * as path from 'path';
import { parseStartlist, ParsedStartlistEntry } from '../startlist.parser';

const FIXTURE_DIR = path.join(__dirname, 'fixtures');

function readFixture(filename: string): string {
  return fs.readFileSync(path.join(FIXTURE_DIR, filename), 'utf-8');
}

describe('parseStartlist', () => {
  describe('Tour de France 2024 startlist fixture', () => {
    let entries: ParsedStartlistEntry[];

    beforeAll(() => {
      const html = readFixture('startlist.html');
      entries = parseStartlist(html);
    });

    it('should extract all riders from all teams', () => {
      // 3 teams x 8 riders = 24
      expect(entries).toHaveLength(24);
    });

    it('should extract rider names correctly', () => {
      const pogacar = entries.find((e) => e.riderSlug === 'tadej-pogacar');
      expect(pogacar).toBeDefined();
      expect(pogacar!.riderName).toContain('POGA');
    });

    it('should extract rider slugs without "rider/" prefix', () => {
      for (const entry of entries) {
        expect(entry.riderSlug).not.toContain('rider/');
        expect(entry.riderSlug).not.toContain('/');
        expect(entry.riderSlug).toMatch(/^[a-z0-9-]+$/);
      }
    });

    it('should extract team names without classification suffix', () => {
      const uaeRiders = entries.filter((e) => e.teamName === 'UAE Team Emirates');
      expect(uaeRiders).toHaveLength(8);

      const vismaRiders = entries.filter((e) => e.teamName === 'Team Visma | Lease a Bike');
      expect(vismaRiders).toHaveLength(8);

      const sqstRiders = entries.filter((e) => e.teamName === 'Soudal Quick-Step');
      expect(sqstRiders).toHaveLength(8);
    });

    it('should have non-empty team names for all entries', () => {
      for (const entry of entries) {
        expect(entry.teamName).toBeTruthy();
        expect(entry.teamName.length).toBeGreaterThan(0);
      }
    });

    it('should extract bib numbers as positive integers', () => {
      for (const entry of entries) {
        expect(entry.bibNumber).not.toBeNull();
        expect(entry.bibNumber).toBeGreaterThan(0);
        expect(Number.isInteger(entry.bibNumber)).toBe(true);
      }
    });

    it('should assign bib 1 to Pogacar (team leader)', () => {
      const pogacar = entries.find((e) => e.riderSlug === 'tadej-pogacar');
      expect(pogacar!.bibNumber).toBe(1);
    });

    it('should assign bib 11 to Vingegaard (second team leader)', () => {
      const vingegaard = entries.find((e) => e.riderSlug === 'jonas-vingegaard');
      expect(vingegaard!.bibNumber).toBe(11);
    });

    it('should assign bib 21 to Evenepoel (third team leader)', () => {
      const evenepoel = entries.find((e) => e.riderSlug === 'remco-evenepoel');
      expect(evenepoel!.bibNumber).toBe(21);
    });

    it('should group riders by team in order', () => {
      // First 8 are UAE, next 8 are Visma, last 8 are Soudal
      expect(entries[0].teamName).toBe('UAE Team Emirates');
      expect(entries[7].teamName).toBe('UAE Team Emirates');
      expect(entries[8].teamName).toBe('Team Visma | Lease a Bike');
      expect(entries[15].teamName).toBe('Team Visma | Lease a Bike');
      expect(entries[16].teamName).toBe('Soudal Quick-Step');
      expect(entries[23].teamName).toBe('Soudal Quick-Step');
    });

    it('should have unique bib numbers across all entries', () => {
      const bibs = entries.filter((e) => e.bibNumber !== null).map((e) => e.bibNumber);
      const uniqueBibs = new Set(bibs);
      expect(uniqueBibs.size).toBe(bibs.length);
    });

    it('should have unique rider slugs', () => {
      const slugs = entries.map((e) => e.riderSlug);
      const uniqueSlugs = new Set(slugs);
      expect(uniqueSlugs.size).toBe(slugs.length);
    });
  });

  describe('edge cases', () => {
    it('should return empty array for empty string', () => {
      expect(parseStartlist('')).toEqual([]);
    });

    it('should return empty array for whitespace-only string', () => {
      expect(parseStartlist('   ')).toEqual([]);
    });

    it('should return empty array for HTML with no startlist container', () => {
      const html = '<html><body><p>No startlist here</p></body></html>';
      expect(parseStartlist(html)).toEqual([]);
    });

    it('should return empty array for HTML with empty startlist container', () => {
      const html = '<html><body><ul class="startlist_v4"></ul></body></html>';
      expect(parseStartlist(html)).toEqual([]);
    });

    it('should handle riders without bib numbers', () => {
      const html = `
        <html><body>
        <ul class="startlist_v4">
          <li>
            <div class="ridersCont">
              <div><a class="team" href="team/test-team-2024">Test Team (WT)</a></div>
              <ul>
                <li class=" ">
                  <span class="flag es"></span>
                  <a href="rider/test-rider">TEST Rider</a>
                </li>
              </ul>
            </div>
          </li>
        </ul>
        </body></html>
      `;
      const entries = parseStartlist(html);
      expect(entries).toHaveLength(1);
      expect(entries[0].riderName).toBe('TEST Rider');
      expect(entries[0].riderSlug).toBe('test-rider');
      expect(entries[0].teamName).toBe('Test Team');
      expect(entries[0].bibNumber).toBeNull();
    });

    it('should skip team blocks without a team name link', () => {
      const html = `
        <html><body>
        <ul class="startlist_v4">
          <li>
            <div class="ridersCont">
              <div></div>
              <ul>
                <li class=" ">
                  <span class="bib">1</span>
                  <a href="rider/orphan-rider">ORPHAN Rider</a>
                </li>
              </ul>
            </div>
          </li>
        </ul>
        </body></html>
      `;
      const entries = parseStartlist(html);
      expect(entries).toEqual([]);
    });

    it('should skip entries without rider links', () => {
      const html = `
        <html><body>
        <ul class="startlist_v4">
          <li>
            <div class="ridersCont">
              <div><a class="team" href="team/t-2024">Team T (WT)</a></div>
              <ul>
                <li class=" ">
                  <span class="bib">1</span>
                  <span class="flag es"></span>
                  <span>Not a link</span>
                </li>
                <li class=" ">
                  <span class="bib">2</span>
                  <a href="rider/valid-rider">VALID Rider</a>
                </li>
              </ul>
            </div>
          </li>
        </ul>
        </body></html>
      `;
      const entries = parseStartlist(html);
      expect(entries).toHaveLength(1);
      expect(entries[0].riderSlug).toBe('valid-rider');
    });
  });
});
