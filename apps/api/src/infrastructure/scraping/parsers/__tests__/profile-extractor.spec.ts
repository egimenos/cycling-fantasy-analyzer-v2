import * as fs from 'fs';
import * as path from 'path';
import * as cheerio from 'cheerio';
import {
  extractProfile,
  extractParcoursType,
  extractProfileScore,
  detectTimeTrialType,
} from '../profile-extractor';

const FIXTURE_DIR = path.join(__dirname, '../../../../../test/fixtures/pcs');

function readFixture(filename: string): string {
  return fs.readFileSync(path.join(FIXTURE_DIR, filename), 'utf-8');
}

describe('profile-extractor', () => {
  describe('extractParcoursType', () => {
    it('should return p4 for HTML with span.icon.profile.p4', () => {
      const html = `
        <ul class="infolist">
          <li>
            <div class="title">Parcours type:</div>
            <div class="value"><span class="icon profile p4 mg_rp4 "></span></div>
          </li>
        </ul>
      `;
      const $ = cheerio.load(html);
      expect(extractParcoursType($)).toBe('p4');
    });

    it('should return p1 for HTML with span.icon.profile.p1', () => {
      const html = '<span class="icon profile p1 mg_rp4 "></span>';
      const $ = cheerio.load(html);
      expect(extractParcoursType($)).toBe('p1');
    });

    it('should return p5 for HTML with span.icon.profile.p5', () => {
      const html = '<span class="icon profile p5 mg_rp4 "></span>';
      const $ = cheerio.load(html);
      expect(extractParcoursType($)).toBe('p5');
    });

    it('should return null for HTML without profile span', () => {
      const html = '<div><span class="icon"></span></div>';
      const $ = cheerio.load(html);
      expect(extractParcoursType($)).toBeNull();
    });

    it('should return null for empty HTML', () => {
      const html = '<html><body></body></html>';
      const $ = cheerio.load(html);
      expect(extractParcoursType($)).toBeNull();
    });

    it('should return null for profile span without p1-p5 class', () => {
      const html = '<span class="icon profile mg_rp4"></span>';
      const $ = cheerio.load(html);
      expect(extractParcoursType($)).toBeNull();
    });

    it('should not match p6 or higher', () => {
      const html = '<span class="icon profile p6 mg_rp4"></span>';
      const $ = cheerio.load(html);
      expect(extractParcoursType($)).toBeNull();
    });
  });

  describe('extractProfileScore', () => {
    it('should return 176 for HTML with ProfileScore sidebar item', () => {
      const html = `
        <ul class="infolist">
          <li>
            <div class="title">ProfileScore:</div>
            <div class="value">176</div>
          </li>
        </ul>
      `;
      const $ = cheerio.load(html);
      expect(extractProfileScore($)).toBe(176);
    });

    it('should handle title with extra whitespace', () => {
      const html = `
        <ul class="infolist">
          <li>
            <div class="title ">ProfileScore: </div>
            <div class=" value" >42</div>
          </li>
        </ul>
      `;
      const $ = cheerio.load(html);
      expect(extractProfileScore($)).toBe(42);
    });

    it('should return null for HTML without ProfileScore', () => {
      const html = `
        <ul class="infolist">
          <li>
            <div class="title">Parcours type:</div>
            <div class="value"><span class="icon profile p4"></span></div>
          </li>
        </ul>
      `;
      const $ = cheerio.load(html);
      expect(extractProfileScore($)).toBeNull();
    });

    it('should return null for empty HTML', () => {
      const html = '<html><body></body></html>';
      const $ = cheerio.load(html);
      expect(extractProfileScore($)).toBeNull();
    });

    it('should return null when ProfileScore value is not a number', () => {
      const html = `
        <ul class="infolist">
          <li>
            <div class="title">ProfileScore:</div>
            <div class="value">N/A</div>
          </li>
        </ul>
      `;
      const $ = cheerio.load(html);
      expect(extractProfileScore($)).toBeNull();
    });
  });

  describe('detectTimeTrialType', () => {
    it('should detect ITT from stage name text', () => {
      const result = detectTimeTrialType('Stage 7 (ITT) | Nuits-Saint-Georges-Gevrey-Chambertin');
      expect(result).toEqual({ isItt: true, isTtt: false });
    });

    it('should detect TTT from stage name text', () => {
      const result = detectTimeTrialType('Stage 3 (TTT) | Bruges-Bruges');
      expect(result).toEqual({ isItt: false, isTtt: true });
    });

    it('should return false for both when normal stage', () => {
      const result = detectTimeTrialType('Stage 1 | Firenze-Rimini');
      expect(result).toEqual({ isItt: false, isTtt: false });
    });

    it('should be case insensitive for ITT', () => {
      const result = detectTimeTrialType('Stage 7 (itt) | City-City');
      expect(result).toEqual({ isItt: true, isTtt: false });
    });

    it('should be case insensitive for TTT', () => {
      const result = detectTimeTrialType('Stage 3 (ttt) | City-City');
      expect(result).toEqual({ isItt: false, isTtt: true });
    });

    it('should return false for empty string', () => {
      const result = detectTimeTrialType('');
      expect(result).toEqual({ isItt: false, isTtt: false });
    });
  });

  describe('extractProfile (integration)', () => {
    it('should extract profile from TdF 2024 stage 1 fixture', () => {
      const html = readFixture('tdf-2024-stage-1.html');
      const profile = extractProfile(html);
      expect(profile.parcoursType).toBe('p4');
      expect(profile.profileScore).toBe(176);
    });

    it('should extract profile from MSR 2024 fixture', () => {
      const html = readFixture('msr-2024-result.html');
      const profile = extractProfile(html);
      expect(profile.parcoursType).toBe('p2');
      expect(profile.profileScore).toBe(59);
    });

    it('should return nulls for HTML without profile data', () => {
      const html = '<html><body><p>No profile here</p></body></html>';
      const profile = extractProfile(html);
      expect(profile.parcoursType).toBeNull();
      expect(profile.profileScore).toBeNull();
    });
  });
});
