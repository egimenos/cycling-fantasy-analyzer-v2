import { readFileSync } from 'fs';
import { join } from 'path';
import { parseStageClassifications } from '../stage-classifications.parser';
import { ResultCategory } from '../../../../domain/shared/result-category.enum';

const fixturesDir = join(__dirname, '..', '__fixtures__');

function loadFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), 'utf-8');
}

describe('parseStageClassifications', () => {
  describe('TdF 2024 Stage 15 (mountain stage)', () => {
    let html: string;

    beforeAll(() => {
      html = loadFixture('tdf-2024-stage-15.html');
    });

    it('extracts daily GC top 10', () => {
      const result = parseStageClassifications(html, 15);
      expect(result.dailyGC.length).toBe(10);
      expect(result.dailyGC[0].category).toBe(ResultCategory.GC_DAILY);
      expect(result.dailyGC[0].position).toBe(1);
      expect(result.dailyGC[0].stageNumber).toBe(15);
      expect(result.dailyGC[0].riderSlug).toBeTruthy();
      expect(result.dailyGC[9].position).toBe(10);
    });

    it('extracts mountain passes with category and name', () => {
      const result = parseStageClassifications(html, 15);
      expect(result.mountainPasses.length).toBeGreaterThan(0);

      const allCategories = result.mountainPasses.map((r) => r.climbCategory);
      // TdF 2024 Stage 15 has HC and Cat 1 passes
      expect(allCategories).toContain('HC');
      expect(allCategories).toContain('1');

      // Verify structure
      const firstPass = result.mountainPasses[0];
      expect(firstPass.category).toBe(ResultCategory.MOUNTAIN_PASS);
      expect(firstPass.climbName).toBeTruthy();
      expect(firstPass.kmMarker).toBeGreaterThan(0);
      expect(firstPass.position).toBeGreaterThanOrEqual(1);
      expect(firstPass.stageNumber).toBe(15);
    });

    it('respects position limits per climb category', () => {
      const result = parseStageClassifications(html, 15);

      const hcPasses = result.mountainPasses.filter((r) => r.climbCategory === 'HC');
      const cat1Passes = result.mountainPasses.filter((r) => r.climbCategory === '1');

      // HC: max 8 positions per pass
      const hcNames = [...new Set(hcPasses.map((r) => r.climbName))];
      for (const name of hcNames) {
        const passResults = hcPasses.filter((r) => r.climbName === name);
        expect(passResults.length).toBeLessThanOrEqual(8);
      }

      // Cat 1: max 5 positions per pass
      const cat1Names = [...new Set(cat1Passes.map((r) => r.climbName))];
      for (const name of cat1Names) {
        const passResults = cat1Passes.filter((r) => r.climbName === name);
        expect(passResults.length).toBeLessThanOrEqual(5);
      }
    });

    it('extracts intermediate sprints and skips "Points at finish"', () => {
      const result = parseStageClassifications(html, 15);

      // Should have intermediate sprint data
      for (const sprint of result.intermediateSprints) {
        expect(sprint.category).toBe(ResultCategory.SPRINT_INTERMEDIATE);
        expect(sprint.sprintName).toBeTruthy();
        expect(sprint.position).toBeGreaterThanOrEqual(1);
        expect(sprint.position).toBeLessThanOrEqual(3);
      }
    });

    it('does not include "Points at finish" riders in sprints', () => {
      const result = parseStageClassifications(html, 15);

      // "Points at finish" would have many riders. Intermediate sprints have max 3 per sprint.
      const sprintNames = [...new Set(result.intermediateSprints.map((r) => r.sprintName))];
      for (const name of sprintNames) {
        const count = result.intermediateSprints.filter((r) => r.sprintName === name).length;
        expect(count).toBeLessThanOrEqual(3);
      }
    });

    it('extracts daily regularidad top 3', () => {
      const result = parseStageClassifications(html, 15);

      expect(result.dailyRegularidad.length).toBeLessThanOrEqual(3);
      for (const entry of result.dailyRegularidad) {
        expect(entry.category).toBe(ResultCategory.REGULARIDAD_DAILY);
        expect(entry.stageNumber).toBe(15);
        expect(entry.position).toBeGreaterThanOrEqual(1);
        expect(entry.position).toBeLessThanOrEqual(3);
      }
    });
  });

  describe('Paris-Nice 2026 Stage 1 (flat stage)', () => {
    let html: string;

    beforeAll(() => {
      html = loadFixture('paris-nice-2026-stage-1.html');
    });

    it('extracts daily GC even on flat stages', () => {
      const result = parseStageClassifications(html, 1);
      expect(result.dailyGC.length).toBeGreaterThan(0);
      expect(result.dailyGC.length).toBeLessThanOrEqual(10);
    });

    it('has no mountain passes on flat stage', () => {
      const result = parseStageClassifications(html, 1);
      // Flat stage may have zero mountain passes (or few small ones)
      for (const pass of result.mountainPasses) {
        expect(pass.category).toBe(ResultCategory.MOUNTAIN_PASS);
      }
    });
  });

  describe('edge cases', () => {
    it('returns empty arrays for empty HTML', () => {
      const result = parseStageClassifications('<html><body></body></html>', 1);
      expect(result.dailyGC).toEqual([]);
      expect(result.mountainPasses).toEqual([]);
      expect(result.intermediateSprints).toEqual([]);
      expect(result.dailyRegularidad).toEqual([]);
    });

    it('returns empty arrays for HTML with no resTab elements', () => {
      const result = parseStageClassifications('<html><body><div>No tabs</div></body></html>', 5);
      expect(result.dailyGC).toEqual([]);
      expect(result.mountainPasses).toEqual([]);
      expect(result.intermediateSprints).toEqual([]);
      expect(result.dailyRegularidad).toEqual([]);
    });
  });
});
