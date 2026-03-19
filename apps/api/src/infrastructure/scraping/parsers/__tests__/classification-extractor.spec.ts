import * as fs from 'fs';
import * as path from 'path';
import { extractClassificationUrls } from '../classification-extractor';

const FIXTURE_DIR = path.join(__dirname, '../../../../../test/fixtures/pcs');

function readFixture(filename: string): string {
  return fs.readFileSync(path.join(FIXTURE_DIR, filename), 'utf-8');
}

describe('extractClassificationUrls', () => {
  describe('TdF 2024 GC page', () => {
    let classifications: ReturnType<typeof extractClassificationUrls>;

    beforeAll(() => {
      const html = readFixture('tdf-2024-gc.html');
      classifications = extractClassificationUrls(html);
    });

    it('should find 21 individual stage URLs', () => {
      const stages = classifications.filter((c) => c.classificationType === 'STAGE');
      expect(stages).toHaveLength(21);
    });

    it('should have sequential stage numbers from 1 to 21', () => {
      const stageNumbers = classifications
        .filter((c) => c.classificationType === 'STAGE')
        .map((c) => c.stageNumber as number)
        .sort((a, b) => a - b);

      for (let i = 0; i < stageNumbers.length; i++) {
        expect(stageNumbers[i]).toBe(i + 1);
      }
    });

    it('should find points classification URL', () => {
      const sprint = classifications.find((c) => c.classificationType === 'SPRINT');
      expect(sprint).toBeDefined();
      expect(sprint!.stageNumber).toBeNull();
    });

    it('should find mountains classification URL', () => {
      const mountain = classifications.find((c) => c.classificationType === 'MOUNTAIN');
      expect(mountain).toBeDefined();
      expect(mountain!.stageNumber).toBeNull();
    });

    it('should find final GC URL', () => {
      const gc = classifications.find((c) => c.classificationType === 'GC');
      expect(gc).toBeDefined();
      expect(gc!.stageNumber).toBeNull();
    });

    it('should capture label text from option elements', () => {
      const stage7 = classifications.find(
        (c) => c.classificationType === 'STAGE' && c.stageNumber === 7,
      );
      expect(stage7).toBeDefined();
      expect(stage7!.label).toContain('Stage 7');
      expect(stage7!.label).toContain('(ITT)');
    });

    it('should NOT include teams or youth classifications', () => {
      for (const c of classifications) {
        expect(c.urlPath).not.toContain('teams');
        expect(c.urlPath).not.toContain('youth');
      }
    });

    it('should normalize URLs by stripping /result/result suffix', () => {
      for (const c of classifications) {
        expect(c.urlPath).not.toContain('/result/result');
        expect(c.urlPath).not.toMatch(/\/result$/);
      }
    });
  });

  describe('Paris-Nice 2024 GC page', () => {
    let classifications: ReturnType<typeof extractClassificationUrls>;

    beforeAll(() => {
      const html = readFixture('paris-nice-2024-gc.html');
      classifications = extractClassificationUrls(html);
    });

    it('should find stage URLs for a mini tour', () => {
      const stages = classifications.filter((c) => c.classificationType === 'STAGE');
      expect(stages.length).toBeGreaterThanOrEqual(4);
      expect(stages.length).toBeLessThanOrEqual(10);
    });

    it('should find GC classification', () => {
      const gc = classifications.find((c) => c.classificationType === 'GC');
      expect(gc).toBeDefined();
    });
  });

  it('should return empty array for HTML without selectNav', () => {
    const html = '<html><body><p>No nav</p></body></html>';
    const result = extractClassificationUrls(html);
    expect(result).toEqual([]);
  });
});
