import { NotFoundException } from '@nestjs/common';
import { FetchRaceProfileUseCase } from '../fetch-race-profile.use-case';
import { PcsScraperPort } from '../../scraping/ports/pcs-scraper.port';
import { RaceType } from '../../../domain/shared/race-type.enum';

function buildOverviewHtml(
  stages: { profile?: string; name: string; distance?: string }[],
): string {
  const rows = stages
    .map(
      (s) =>
        `<tr>
          <td>01/07</td>
          <td>Sat</td>
          <td><span class="icon profile ${s.profile ?? ''}"></span></td>
          <td><a href="#">${s.name}</a></td>
          <td>${s.distance ?? '180'}</td>
        </tr>`,
    )
    .join('\n');

  return `
    <html><body>
      <h4>Stages</h4>
      <table class="basic">
        <tbody>${rows}</tbody>
      </table>
    </body></html>
  `;
}

function buildResultHtml(profileClass: string): string {
  return `
    <html><body>
      <span class="icon profile ${profileClass}"></span>
      <ul class="infolist">
        <li><div class="title">ProfileScore</div><div class="value">42</div></li>
      </ul>
    </body></html>
  `;
}

describe('FetchRaceProfileUseCase', () => {
  let useCase: FetchRaceProfileUseCase;
  let mockPcsClient: jest.Mocked<PcsScraperPort>;

  beforeEach(() => {
    mockPcsClient = {
      fetchPage: jest.fn(),
    };
    useCase = new FetchRaceProfileUseCase(mockPcsClient);
  });

  describe('parseUrl', () => {
    it('should parse a standard PCS race URL', () => {
      const result = useCase.parseUrl('https://www.procyclingstats.com/race/tour-de-france/2025');
      expect(result).toEqual({ raceSlug: 'tour-de-france', year: 2025 });
    });

    it('should parse a URL with trailing slash', () => {
      const result = useCase.parseUrl('https://www.procyclingstats.com/race/tour-de-france/2025/');
      expect(result).toEqual({ raceSlug: 'tour-de-france', year: 2025 });
    });

    it('should parse a URL without protocol', () => {
      const result = useCase.parseUrl('procyclingstats.com/race/tour-de-france/2025');
      expect(result).toEqual({ raceSlug: 'tour-de-france', year: 2025 });
    });

    it('should throw NotFoundException for invalid URL', () => {
      expect(() => useCase.parseUrl('https://example.com/not-a-race')).toThrow(NotFoundException);
    });
  });

  describe('slugToName', () => {
    it('should convert kebab-case to title case', () => {
      expect(useCase.slugToName('tour-de-france')).toBe('Tour De France');
    });

    it('should handle single word', () => {
      expect(useCase.slugToName('classic')).toBe('Classic');
    });
  });

  describe('detectStageRaceType', () => {
    it('should detect Tour de France as Grand Tour', () => {
      expect(useCase.detectStageRaceType('tour-de-france')).toBe(RaceType.GRAND_TOUR);
    });

    it('should detect Giro as Grand Tour', () => {
      expect(useCase.detectStageRaceType('giro-d-italia')).toBe(RaceType.GRAND_TOUR);
    });

    it('should detect Vuelta as Grand Tour', () => {
      expect(useCase.detectStageRaceType('vuelta-a-espana')).toBe(RaceType.GRAND_TOUR);
    });

    it('should detect non-GT stage race as Mini Tour', () => {
      expect(useCase.detectStageRaceType('paris-nice')).toBe(RaceType.MINI_TOUR);
    });
  });

  describe('execute — stage race', () => {
    it('should return profile with stages and summary for a stage race', async () => {
      const overviewHtml = buildOverviewHtml([
        { profile: 'p1', name: 'Stage 1 | Brussels - Charleroi', distance: '195' },
        { profile: 'p5', name: 'Stage 2 | Pau - Col du Tourmalet', distance: '170' },
        { profile: 'p1', name: 'Stage 3 (ITT) | Bordeaux - Bordeaux', distance: '30' },
      ]);
      mockPcsClient.fetchPage.mockResolvedValue(overviewHtml);

      const result = await useCase.execute(
        'https://www.procyclingstats.com/race/tour-de-france/2025',
      );

      expect(result.raceSlug).toBe('tour-de-france');
      expect(result.raceName).toBe('Tour De France');
      expect(result.raceType).toBe(RaceType.GRAND_TOUR);
      expect(result.year).toBe(2025);
      expect(result.totalStages).toBe(3);
      expect(result.stages).toHaveLength(3);
      expect(result.profileSummary.p1Count).toBe(1);
      expect(result.profileSummary.p5Count).toBe(1);
      expect(result.profileSummary.ittCount).toBe(1);
      expect(result.profileSummary.tttCount).toBe(0);
      expect(result.profileSummary.unknownCount).toBe(0);
    });

    it('should detect mini-tour for non-GT stage races', async () => {
      const overviewHtml = buildOverviewHtml([
        { profile: 'p2', name: 'Stage 1 | Nice - Nice', distance: '150' },
        { profile: 'p3', name: 'Stage 2 | Nice - Col de la Couillole', distance: '180' },
      ]);
      mockPcsClient.fetchPage.mockResolvedValue(overviewHtml);

      const result = await useCase.execute('https://www.procyclingstats.com/race/paris-nice/2025');

      expect(result.raceType).toBe(RaceType.MINI_TOUR);
      expect(result.totalStages).toBe(2);
    });
  });

  describe('execute — classic', () => {
    it('should return classic profile when overview has no stages', async () => {
      // First call: overview with no stages
      mockPcsClient.fetchPage.mockResolvedValueOnce('<html><body></body></html>');
      // Second call: result page with profile
      mockPcsClient.fetchPage.mockResolvedValueOnce(buildResultHtml('p3'));

      const result = await useCase.execute(
        'https://www.procyclingstats.com/race/milano-sanremo/2025',
      );

      expect(result.raceSlug).toBe('milano-sanremo');
      expect(result.raceType).toBe(RaceType.CLASSIC);
      expect(result.totalStages).toBe(0);
      expect(result.stages).toEqual([]);
      expect(result.profileSummary.p3Count).toBe(1);
      expect(mockPcsClient.fetchPage).toHaveBeenCalledWith('race/milano-sanremo/2025/result');
    });

    it('should fall back to previous year if current year result page fails', async () => {
      // Overview: no stages
      mockPcsClient.fetchPage.mockResolvedValueOnce('<html><body></body></html>');
      // Current year result: fails
      mockPcsClient.fetchPage.mockRejectedValueOnce(new Error('Not found'));
      // Previous year result: succeeds
      mockPcsClient.fetchPage.mockResolvedValueOnce(buildResultHtml('p2'));

      const result = await useCase.execute(
        'https://www.procyclingstats.com/race/strade-bianche/2026',
      );

      expect(result.raceType).toBe(RaceType.CLASSIC);
      expect(result.year).toBe(2026);
      expect(result.profileSummary.p2Count).toBe(1);
      expect(mockPcsClient.fetchPage).toHaveBeenCalledWith('race/strade-bianche/2025/result');
    });

    it('should throw NotFoundException if both current and previous year fail', async () => {
      // Overview: no stages
      mockPcsClient.fetchPage.mockResolvedValueOnce('<html><body></body></html>');
      // Current year: fails
      mockPcsClient.fetchPage.mockRejectedValueOnce(new Error('Not found'));
      // Previous year: also fails
      mockPcsClient.fetchPage.mockRejectedValueOnce(new Error('Not found'));

      await expect(
        useCase.execute('https://www.procyclingstats.com/race/unknown-race/2026'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should fall back when current year has no profile data', async () => {
      // Overview: no stages
      mockPcsClient.fetchPage.mockResolvedValueOnce('<html><body></body></html>');
      // Current year result: no profile span
      mockPcsClient.fetchPage.mockResolvedValueOnce('<html><body>No data</body></html>');
      // Previous year result: has profile
      mockPcsClient.fetchPage.mockResolvedValueOnce(buildResultHtml('p4'));

      const result = await useCase.execute(
        'https://www.procyclingstats.com/race/future-classic/2026',
      );

      expect(result.raceType).toBe(RaceType.CLASSIC);
      expect(result.profileSummary.p4Count).toBe(1);
    });
  });
});
