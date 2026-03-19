import * as fs from 'fs';
import * as path from 'path';
import {
  parseStageResults,
  parseGcResults,
  parseMountainClassification,
  parseSprintClassification,
} from '../stage-race.parser';
import { ResultCategory } from '../../../../domain/shared/result-category.enum';

const FIXTURE_DIR = path.join(__dirname, '../../../../../test/fixtures/pcs');

function readFixture(filename: string): string {
  return fs.readFileSync(path.join(FIXTURE_DIR, filename), 'utf-8');
}

describe('stage-race.parser', () => {
  describe('parseStageResults', () => {
    it('should return results with profile data from fixture HTML', () => {
      const html = readFixture('tdf-2024-stage-1.html');
      const results = parseStageResults(html, 1);

      expect(results.length).toBeGreaterThan(0);

      for (const r of results) {
        expect(r.parcoursType).toBe('p4');
        expect(r.profileScore).toBe(176);
        expect(r.category).toBe(ResultCategory.STAGE);
        expect(r.stageNumber).toBe(1);
      }
    });

    it('should set isItt true when stage name contains (ITT)', () => {
      const html = readFixture('tdf-2024-stage-1.html');
      const results = parseStageResults(
        html,
        7,
        'Stage 7 (ITT) | Nuits-Saint-Georges-Gevrey-Chambertin',
      );

      expect(results.length).toBeGreaterThan(0);
      for (const r of results) {
        expect(r.isItt).toBe(true);
        expect(r.isTtt).toBe(false);
      }
    });

    it('should set isTtt true when stage name contains (TTT)', () => {
      const html = readFixture('tdf-2024-stage-1.html');
      const results = parseStageResults(html, 3, 'Stage 3 (TTT) | Bruges-Bruges');

      expect(results.length).toBeGreaterThan(0);
      for (const r of results) {
        expect(r.isItt).toBe(false);
        expect(r.isTtt).toBe(true);
      }
    });

    it('should set isItt and isTtt to false for regular stages', () => {
      const html = readFixture('tdf-2024-stage-1.html');
      const results = parseStageResults(html, 1, 'Stage 1 | Firenze-Rimini');

      expect(results.length).toBeGreaterThan(0);
      for (const r of results) {
        expect(r.isItt).toBe(false);
        expect(r.isTtt).toBe(false);
      }
    });

    it('should default isItt and isTtt to false when no stageNameText provided', () => {
      const html = readFixture('tdf-2024-stage-1.html');
      const results = parseStageResults(html, 1);

      expect(results.length).toBeGreaterThan(0);
      for (const r of results) {
        expect(r.isItt).toBe(false);
        expect(r.isTtt).toBe(false);
      }
    });
  });

  describe('parseGcResults', () => {
    it('should return results with null profile fields', () => {
      const html = readFixture('tdf-2024-gc.html');
      const results = parseGcResults(html);

      expect(results.length).toBeGreaterThan(0);
      for (const r of results) {
        expect(r.parcoursType).toBeNull();
        expect(r.isItt).toBe(false);
        expect(r.isTtt).toBe(false);
        expect(r.profileScore).toBeNull();
        expect(r.category).toBe(ResultCategory.GC);
      }
    });
  });

  describe('parseMountainClassification', () => {
    it('should return results with null profile fields for empty HTML', () => {
      const html = `
        <html><body>
          <div class="resTab">
            <table class="results">
              <thead><tr><th>Rnk</th><th>Rider</th><th>Team</th></tr></thead>
              <tbody>
                <tr><td>1</td><td><a href="rider/test-rider">Test Rider</a></td><td>Team A</td></tr>
              </tbody>
            </table>
          </div>
        </body></html>
      `;
      const results = parseMountainClassification(html);
      expect(results.length).toBe(1);
      expect(results[0].parcoursType).toBeNull();
      expect(results[0].profileScore).toBeNull();
      expect(results[0].category).toBe(ResultCategory.MOUNTAIN);
    });
  });

  describe('parseSprintClassification', () => {
    it('should return results with null profile fields for empty HTML', () => {
      const html = `
        <html><body>
          <div class="resTab">
            <table class="results">
              <thead><tr><th>Rnk</th><th>Rider</th><th>Team</th></tr></thead>
              <tbody>
                <tr><td>1</td><td><a href="rider/test-rider">Test Rider</a></td><td>Team A</td></tr>
              </tbody>
            </table>
          </div>
        </body></html>
      `;
      const results = parseSprintClassification(html);
      expect(results.length).toBe(1);
      expect(results[0].parcoursType).toBeNull();
      expect(results[0].profileScore).toBeNull();
      expect(results[0].category).toBe(ResultCategory.SPRINT);
    });
  });
});
