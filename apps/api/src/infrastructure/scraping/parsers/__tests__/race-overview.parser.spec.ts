import * as fs from 'fs';
import * as path from 'path';
import { parseRaceOverview, ParsedStageInfo } from '../race-overview.parser';

const FIXTURE_DIR = path.join(__dirname, '../../../../../test/fixtures/pcs');

function readFixture(filename: string): string {
  return fs.readFileSync(path.join(FIXTURE_DIR, filename), 'utf-8');
}

describe('parseRaceOverview', () => {
  describe('TdF 2024 overview fixture', () => {
    let stages: ParsedStageInfo[];

    beforeAll(() => {
      const html = readFixture('tdf-2024-overview.html');
      stages = parseRaceOverview(html);
    });

    it('should parse the correct number of stages (rest day excluded)', () => {
      // 7 stage rows + 1 rest day + 1 no-profile stage = 8 stages, rest day excluded
      expect(stages).toHaveLength(8);
    });

    it('should extract correct parcoursType for each stage', () => {
      expect(stages[0].parcoursType).toBe('p1');
      expect(stages[1].parcoursType).toBe('p4');
      expect(stages[2].parcoursType).toBe('p2');
      // Rest day is skipped — index 3 is Stage 4
      expect(stages[3].parcoursType).toBe('p5');
      expect(stages[4].parcoursType).toBe('p1');
      expect(stages[5].parcoursType).toBe('p4');
      expect(stages[6].parcoursType).toBe('p3');
    });

    it('should flag ITT stage correctly', () => {
      const ittStage = stages.find((s) => s.stageNumber === 5);
      expect(ittStage).toBeDefined();
      expect(ittStage!.isItt).toBe(true);
      expect(ittStage!.isTtt).toBe(false);
    });

    it('should flag TTT stage correctly', () => {
      const tttStage = stages.find((s) => s.stageNumber === 7);
      expect(tttStage).toBeDefined();
      expect(tttStage!.isTtt).toBe(true);
      expect(tttStage!.isItt).toBe(false);
    });

    it('should not flag regular stages as ITT or TTT', () => {
      const regularStages = stages.filter((s) => !s.isItt && !s.isTtt);
      expect(regularStages.length).toBe(6);
    });

    it('should exclude rest days from results', () => {
      // No rest day entries should exist — all stages have departure/arrival or valid stage numbers
      expect(
        stages.every((s) => s.departure !== null || s.arrival !== null || s.stageNumber > 0),
      ).toBe(true);
      // Verify no stage has "restday"-like characteristics
      expect(stages.find((s) => s.distanceKm === null && s.departure === null)).toBeUndefined();
    });

    it('should parse distance as a number', () => {
      expect(stages[0].distanceKm).toBe(206);
      expect(stages[1].distanceKm).toBe(199.2);
      expect(stages[2].distanceKm).toBe(230.8);
      expect(stages[3].distanceKm).toBe(139.6);
      expect(stages[4].distanceKm).toBe(27.2);
    });

    it('should extract departure and arrival cities', () => {
      expect(stages[0].departure).toBe('Florence');
      expect(stages[0].arrival).toBe('Rimini');
      expect(stages[1].departure).toBe('Cesenatico');
      expect(stages[1].arrival).toBe('Bologna');
    });

    it('should extract departure and arrival for ITT stage', () => {
      const ittStage = stages.find((s) => s.stageNumber === 5);
      expect(ittStage!.departure).toBe('Nuits-Saint-Georges');
      expect(ittStage!.arrival).toBe('Gevrey-Chambertin');
    });

    it('should extract correct stage numbers', () => {
      expect(stages[0].stageNumber).toBe(1);
      expect(stages[1].stageNumber).toBe(2);
      expect(stages[2].stageNumber).toBe(3);
      expect(stages[3].stageNumber).toBe(4);
      expect(stages[4].stageNumber).toBe(5);
      expect(stages[5].stageNumber).toBe(6);
      expect(stages[6].stageNumber).toBe(7);
      expect(stages[7].stageNumber).toBe(8);
    });

    it('should return parcoursType null for stage with no profile icon', () => {
      const stage8 = stages.find((s) => s.stageNumber === 8);
      expect(stage8).toBeDefined();
      expect(stage8!.parcoursType).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should return empty array for empty HTML', () => {
      const result = parseRaceOverview('');
      expect(result).toEqual([]);
    });

    it('should return empty array for HTML without stage table', () => {
      const html = '<html><body><h1>No stages here</h1></body></html>';
      const result = parseRaceOverview(html);
      expect(result).toEqual([]);
    });

    it('should return empty array for HTML with empty table', () => {
      const html =
        '<html><body><h4>Stages</h4><table class="basic"><tbody></tbody></table></body></html>';
      const result = parseRaceOverview(html);
      expect(result).toEqual([]);
    });

    it('should handle prologue as stage 0', () => {
      const html = `<html><body>
        <h4>Stages</h4>
        <table class="basic"><tbody>
          <tr><td>01/07</td><td>Sat</td><td><span class="icon profile p1 mg_rp4"></span></td><td><a href="/race/test/prologue">Prologue | Utrecht - Utrecht</a></td><td>13.8</td></tr>
        </tbody></table>
      </body></html>`;
      const result = parseRaceOverview(html);
      expect(result).toHaveLength(1);
      expect(result[0].stageNumber).toBe(0);
      expect(result[0].departure).toBe('Utrecht');
      expect(result[0].arrival).toBe('Utrecht');
    });

    it('should fall back to first table.basic if no Stages heading', () => {
      const html = `<html><body>
        <table class="basic"><tbody>
          <tr><td>01/07</td><td>Sat</td><td><span class="icon profile p3 mg_rp4"></span></td><td><a href="/race/test/stage-1">Stage 1 | A - B</a></td><td>150</td></tr>
        </tbody></table>
      </body></html>`;
      const result = parseRaceOverview(html);
      expect(result).toHaveLength(1);
      expect(result[0].parcoursType).toBe('p3');
    });
  });
});
