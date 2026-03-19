import * as fs from 'fs';
import * as path from 'path';
import { parseRaceDate } from '../race-date.parser';

const FIXTURE_DIR = path.join(__dirname, 'fixtures');
const LEGACY_FIXTURE_DIR = path.join(__dirname, '../../../../../test/fixtures/pcs');

function readFixture(filename: string): string {
  return fs.readFileSync(path.join(FIXTURE_DIR, filename), 'utf-8');
}

function readLegacyFixture(filename: string): string {
  return fs.readFileSync(path.join(LEGACY_FIXTURE_DIR, filename), 'utf-8');
}

describe('parseRaceDate', () => {
  describe('classic race (Milano-Sanremo 2024)', () => {
    it('should extract the date from a classic result page fixture', () => {
      const html = readFixture('classic-result.html');
      const date = parseRaceDate(html);

      expect(date).not.toBeNull();
      expect(date!.getUTCFullYear()).toBe(2024);
      expect(date!.getUTCMonth()).toBe(2); // March = 2
      expect(date!.getUTCDate()).toBe(16);
    });

    it('should return UTC midnight', () => {
      const html = readFixture('classic-result.html');
      const date = parseRaceDate(html);

      expect(date).not.toBeNull();
      expect(date!.getUTCHours()).toBe(0);
      expect(date!.getUTCMinutes()).toBe(0);
      expect(date!.getUTCSeconds()).toBe(0);
    });
  });

  describe('classic race (Milano-Sanremo 2024 — legacy fixture)', () => {
    it('should extract date from real PCS HTML', () => {
      const html = readLegacyFixture('msr-2024-result.html');
      const date = parseRaceDate(html);

      expect(date).not.toBeNull();
      expect(date!.getUTCFullYear()).toBe(2024);
      expect(date!.getUTCMonth()).toBe(2); // March
      expect(date!.getUTCDate()).toBe(16);
    });
  });

  describe('stage race (Tour de France 2024, Stage 1)', () => {
    it('should extract the stage date from a stage result page fixture', () => {
      const html = readFixture('stage-result.html');
      const date = parseRaceDate(html);

      expect(date).not.toBeNull();
      expect(date!.getUTCFullYear()).toBe(2024);
      expect(date!.getUTCMonth()).toBe(5); // June = 5
      expect(date!.getUTCDate()).toBe(29);
    });
  });

  describe('stage race (TdF 2024, Stage 1 — legacy fixture)', () => {
    it('should extract date from real PCS stage HTML', () => {
      const html = readLegacyFixture('tdf-2024-stage-1.html');
      const date = parseRaceDate(html);

      expect(date).not.toBeNull();
      expect(date!.getUTCFullYear()).toBe(2024);
      expect(date!.getUTCMonth()).toBe(5); // June
      expect(date!.getUTCDate()).toBe(29);
    });
  });

  describe('edge cases', () => {
    it('should return null for empty string', () => {
      expect(parseRaceDate('')).toBeNull();
    });

    it('should return null for whitespace-only string', () => {
      expect(parseRaceDate('   ')).toBeNull();
    });

    it('should return null for HTML with no date information', () => {
      const html = '<html><body><p>No date here</p></body></html>';
      expect(parseRaceDate(html)).toBeNull();
    });

    it('should return null for HTML with infolist but no Date field', () => {
      const html = `
        <html><body>
          <ul class="list keyvalueList">
            <li><div class="title">Distance:</div><div class="value">288 km</div></li>
            <li><div class="title">Classification:</div><div class="value">1.UWT</div></li>
          </ul>
        </body></html>
      `;
      expect(parseRaceDate(html)).toBeNull();
    });

    it('should return null for invalid date text in the value', () => {
      const html = `
        <html><body>
          <ul class="list">
            <li><div class="title">Date:</div><div class="value">TBD</div></li>
          </ul>
        </body></html>
      `;
      expect(parseRaceDate(html)).toBeNull();
    });

    it('should handle date with single-digit day', () => {
      const html = `
        <html><body>
          <ul class="list">
            <li><div class="title">Date:</div><div class="value">1 July 2025</div></li>
          </ul>
        </body></html>
      `;
      const date = parseRaceDate(html);
      expect(date).not.toBeNull();
      expect(date!.getUTCFullYear()).toBe(2025);
      expect(date!.getUTCMonth()).toBe(6); // July = 6
      expect(date!.getUTCDate()).toBe(1);
    });

    it('should handle date with double-digit day', () => {
      const html = `
        <html><body>
          <ul class="list">
            <li><div class="title">Date:</div><div class="value">28 October 2023</div></li>
          </ul>
        </body></html>
      `;
      const date = parseRaceDate(html);
      expect(date).not.toBeNull();
      expect(date!.getUTCFullYear()).toBe(2023);
      expect(date!.getUTCMonth()).toBe(9); // October = 9
      expect(date!.getUTCDate()).toBe(28);
    });
  });
});
