import { RaceUrlParseError, RaceProfileNotFoundError } from '../../../domain/analyze/errors';
import { RaceProfileParserPort } from '../ports/race-profile-parser.port';
import { FetchRaceProfileUseCase } from '../fetch-race-profile.use-case';
import { PcsScraperPort } from '../../scraping/ports/pcs-scraper.port';
import { RaceType } from '../../../domain/shared/race-type.enum';

describe('FetchRaceProfileUseCase', () => {
  let useCase: FetchRaceProfileUseCase;
  let mockPcsClient: jest.Mocked<PcsScraperPort>;
  let mockParser: jest.Mocked<RaceProfileParserPort>;

  beforeEach(() => {
    mockPcsClient = {
      fetchPage: jest.fn(),
    };
    mockParser = {
      parseRaceOverview: jest.fn().mockReturnValue([]),
      extractProfile: jest.fn().mockReturnValue({ parcoursType: null, profileScore: null }),
    };
    useCase = new FetchRaceProfileUseCase(mockPcsClient, mockParser);
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

    it('should throw RaceUrlParseError for invalid URL', () => {
      expect(() => useCase.parseUrl('https://example.com/not-a-race')).toThrow(RaceUrlParseError);
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
      mockParser.parseRaceOverview.mockReturnValue([
        {
          stageNumber: 1,
          parcoursType: 'p1',
          isItt: false,
          isTtt: false,
          distanceKm: 195,
          departure: 'Brussels',
          arrival: 'Charleroi',
        },
        {
          stageNumber: 2,
          parcoursType: 'p5',
          isItt: false,
          isTtt: false,
          distanceKm: 170,
          departure: 'Pau',
          arrival: 'Col du Tourmalet',
        },
        {
          stageNumber: 3,
          parcoursType: 'p1',
          isItt: true,
          isTtt: false,
          distanceKm: 30,
          departure: 'Bordeaux',
          arrival: 'Bordeaux',
        },
      ]);
      mockPcsClient.fetchPage.mockResolvedValue('<html></html>');

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
      mockParser.parseRaceOverview.mockReturnValue([
        {
          stageNumber: 1,
          parcoursType: 'p2',
          isItt: false,
          isTtt: false,
          distanceKm: 150,
          departure: 'Nice',
          arrival: 'Nice',
        },
        {
          stageNumber: 2,
          parcoursType: 'p3',
          isItt: false,
          isTtt: false,
          distanceKm: 180,
          departure: 'Nice',
          arrival: 'Col de la Couillole',
        },
      ]);
      mockPcsClient.fetchPage.mockResolvedValue('<html></html>');

      const result = await useCase.execute('https://www.procyclingstats.com/race/paris-nice/2025');

      expect(result.raceType).toBe(RaceType.MINI_TOUR);
      expect(result.totalStages).toBe(2);
    });
  });

  describe('execute — classic', () => {
    it('should return classic profile when overview has no stages', async () => {
      // parseRaceOverview default returns [] (no stages) → classic path
      mockParser.extractProfile.mockReturnValue({ parcoursType: 'p3', profileScore: 42 });
      mockPcsClient.fetchPage.mockResolvedValue('<html></html>');

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
      // Overview: no stages (default)
      mockPcsClient.fetchPage.mockResolvedValueOnce('<html></html>');
      // Current year result: fails
      mockPcsClient.fetchPage.mockRejectedValueOnce(new Error('Not found'));
      // Previous year result: succeeds
      mockPcsClient.fetchPage.mockResolvedValueOnce('<html></html>');
      mockParser.extractProfile.mockReturnValue({ parcoursType: 'p2', profileScore: 30 });

      const result = await useCase.execute(
        'https://www.procyclingstats.com/race/strade-bianche/2026',
      );

      expect(result.raceType).toBe(RaceType.CLASSIC);
      expect(result.year).toBe(2026);
      expect(result.profileSummary.p2Count).toBe(1);
      expect(mockPcsClient.fetchPage).toHaveBeenCalledWith('race/strade-bianche/2025/result');
    });

    it('should throw RaceProfileNotFoundError if both current and previous year fail', async () => {
      // Overview: no stages (default)
      mockPcsClient.fetchPage.mockResolvedValueOnce('<html></html>');
      // Current year: fails
      mockPcsClient.fetchPage.mockRejectedValueOnce(new Error('Not found'));
      // Previous year: also fails
      mockPcsClient.fetchPage.mockRejectedValueOnce(new Error('Not found'));

      await expect(
        useCase.execute('https://www.procyclingstats.com/race/unknown-race/2026'),
      ).rejects.toThrow(RaceProfileNotFoundError);
    });

    it('should fall back when current year has no profile data', async () => {
      // Overview: no stages (default)
      mockPcsClient.fetchPage.mockResolvedValueOnce('<html></html>');
      // Current year: no profile
      mockPcsClient.fetchPage.mockResolvedValueOnce('<html></html>');
      // extractProfile returns null parcoursType on first call, then valid on second
      mockParser.extractProfile
        .mockReturnValueOnce({ parcoursType: null, profileScore: null })
        .mockReturnValueOnce({ parcoursType: 'p4', profileScore: 50 });
      // Previous year result
      mockPcsClient.fetchPage.mockResolvedValueOnce('<html></html>');

      const result = await useCase.execute(
        'https://www.procyclingstats.com/race/future-classic/2026',
      );

      expect(result.raceType).toBe(RaceType.CLASSIC);
      expect(result.profileSummary.p4Count).toBe(1);
    });
  });
});
