import * as fs from 'fs';
import * as path from 'path';
import { parseResultsTable } from '../results-table.parser';
import { ResultCategory } from '../../../../domain/shared/result-category.enum';

const FIXTURE_DIR = path.join(__dirname, '../../../../../test/fixtures/pcs');

function readFixture(filename: string): string {
  return fs.readFileSync(path.join(FIXTURE_DIR, filename), 'utf-8');
}

describe('parseResultsTable', () => {
  describe('TdF 2024 GC', () => {
    let results: ReturnType<typeof parseResultsTable>;

    beforeAll(() => {
      const html = readFixture('tdf-2024-gc.html');
      results = parseResultsTable(html, ResultCategory.GC);
    });

    it('should parse riders from results table', () => {
      expect(results.length).toBeGreaterThanOrEqual(140);
    });

    it('should identify Pogačar as GC winner (position 1)', () => {
      const winner = results.find((r) => r.position === 1);
      expect(winner).toBeDefined();
      expect(winner!.riderName).toContain('Poga');
    });

    it('should extract correct rider slug for winner', () => {
      const winner = results.find((r) => r.position === 1);
      expect(winner!.riderSlug).toBe('rider/tadej-pogacar');
    });

    it('should have sequential positions starting from 1', () => {
      const positions = results
        .filter((r) => r.position !== null)
        .map((r) => r.position as number)
        .sort((a, b) => a - b);

      for (let i = 0; i < positions.length; i++) {
        expect(positions[i]).toBe(i + 1);
      }
    });

    it('should have no duplicate positions', () => {
      const positions = results.filter((r) => r.position !== null).map((r) => r.position);
      const unique = new Set(positions);
      expect(unique.size).toBe(positions.length);
    });

    it('should set category to GC for all results', () => {
      for (const r of results) {
        expect(r.category).toBe(ResultCategory.GC);
      }
    });

    it('should set stageNumber to null for GC', () => {
      for (const r of results) {
        expect(r.stageNumber).toBeNull();
      }
    });

    it('should extract team names', () => {
      const winner = results.find((r) => r.position === 1);
      expect(winner!.teamName).toBeTruthy();
      expect(winner!.teamName.length).toBeGreaterThan(0);
    });

    it('should extract valid rider slugs', () => {
      const slugRegex = /^rider\/[a-z0-9-]+$/;
      for (const r of results) {
        expect(r.riderSlug).toMatch(slugRegex);
      }
    });
  });

  describe('TdF 2024 Stage 1', () => {
    let results: ReturnType<typeof parseResultsTable>;

    beforeAll(() => {
      const html = readFixture('tdf-2024-stage-1.html');
      results = parseResultsTable(html, ResultCategory.STAGE, 1);
    });

    it('should parse riders from stage results', () => {
      expect(results.length).toBeGreaterThanOrEqual(150);
    });

    it('should identify Romain Bardet as stage winner', () => {
      const winner = results.find((r) => r.position === 1);
      expect(winner).toBeDefined();
      expect(winner!.riderName).toContain('Bardet');
    });

    it('should attach stageNumber = 1 to all results', () => {
      for (const r of results) {
        expect(r.stageNumber).toBe(1);
      }
    });

    it('should set category to STAGE for all results', () => {
      for (const r of results) {
        expect(r.category).toBe(ResultCategory.STAGE);
      }
    });
  });

  it('should return empty array for HTML without results table', () => {
    const html = '<html><body><p>No table here</p></body></html>';
    const results = parseResultsTable(html, ResultCategory.GC);
    expect(results).toEqual([]);
  });

  it('should return empty array for HTML with hidden results table', () => {
    const html = `
      <html><body>
        <div class="resTab hide">
          <table class="results"><thead><tr><th>Rider</th></tr></thead></table>
        </div>
      </body></html>
    `;
    const results = parseResultsTable(html, ResultCategory.GC);
    expect(results).toEqual([]);
  });

  it('should handle DNF entries with position = null and dnf = true', () => {
    const html = `
      <html><body>
        <div class="resTab">
          <table class="results">
            <thead><tr><th>Rnk</th><th>Rider</th><th>Team</th></tr></thead>
            <tbody>
              <tr><td>1</td><td><a href="rider/test-rider">Test Rider</a></td><td>Team A</td></tr>
              <tr><td>DNF</td><td><a href="rider/dnf-rider">DNF Rider</a></td><td>Team B</td></tr>
            </tbody>
          </table>
        </div>
      </body></html>
    `;
    const results = parseResultsTable(html, ResultCategory.STAGE, 1);
    expect(results).toHaveLength(2);

    const dnfRider = results.find((r) => r.riderName === 'DNF Rider');
    expect(dnfRider!.position).toBeNull();
    expect(dnfRider!.dnf).toBe(true);

    const finisher = results.find((r) => r.riderName === 'Test Rider');
    expect(finisher!.position).toBe(1);
    expect(finisher!.dnf).toBe(false);
  });
});
