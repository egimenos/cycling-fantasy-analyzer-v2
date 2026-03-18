import * as fs from 'fs';
import * as path from 'path';
import { parseClassicResults } from './classic.parser';
import { ResultCategory } from '../../../domain/shared/result-category.enum';

const FIXTURE_DIR = path.join(__dirname, '../../../../test/fixtures/pcs');

function readFixture(filename: string): string {
  return fs.readFileSync(path.join(FIXTURE_DIR, filename), 'utf-8');
}

describe('parseClassicResults', () => {
  describe('Milano-Sanremo 2024', () => {
    let results: ReturnType<typeof parseClassicResults>;

    beforeAll(() => {
      const html = readFixture('msr-2024-result.html');
      results = parseClassicResults(html);
    });

    it('should identify Jasper Philipsen as winner', () => {
      const winner = results.find((r) => r.position === 1);
      expect(winner).toBeDefined();
      expect(winner!.riderName).toContain('Philipsen');
    });

    it('should extract >= 100 riders', () => {
      expect(results.length).toBeGreaterThanOrEqual(100);
    });

    it('should set category to GC for all results', () => {
      for (const r of results) {
        expect(r.category).toBe(ResultCategory.GC);
      }
    });

    it('should have stageNumber = null for all results', () => {
      for (const r of results) {
        expect(r.stageNumber).toBeNull();
      }
    });

    it('should have sequential positions', () => {
      const positions = results
        .filter((r) => r.position !== null)
        .map((r) => r.position as number)
        .sort((a, b) => a - b);

      for (let i = 0; i < positions.length; i++) {
        expect(positions[i]).toBe(i + 1);
      }
    });
  });
});
