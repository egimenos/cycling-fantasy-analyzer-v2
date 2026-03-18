import { TestingModule, Test } from '@nestjs/testing';
import { TriggerScrapeCommand } from '../trigger-scrape.command';
import { TriggerScrapeUseCase } from '../../../application/scraping/trigger-scrape.use-case';
import { RaceType } from '../../../domain/shared/race-type.enum';
import { RaceClass } from '../../../domain/shared/race-class.enum';

describe('TriggerScrapeCommand', () => {
  let command: TriggerScrapeCommand;
  const mockTrigger = { execute: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [TriggerScrapeCommand, { provide: TriggerScrapeUseCase, useValue: mockTrigger }],
    }).compile();

    command = module.get(TriggerScrapeCommand);
  });

  it('should call use case with parsed options and metadata', async () => {
    mockTrigger.execute.mockResolvedValue({
      jobId: 'test-uuid',
      status: 'success',
      recordsUpserted: 150,
    });

    await command.run([], {
      race: 'tour-de-france',
      year: 2024,
      type: RaceType.GRAND_TOUR,
      class: RaceClass.UWT,
    });

    expect(mockTrigger.execute).toHaveBeenCalledWith({
      raceSlug: 'tour-de-france',
      year: 2024,
      raceMetadata: {
        name: 'Tour De France',
        raceType: RaceType.GRAND_TOUR,
        raceClass: RaceClass.UWT,
      },
    });
  });

  it('should use explicit name when provided', async () => {
    mockTrigger.execute.mockResolvedValue({
      jobId: 'test-uuid',
      status: 'success',
      recordsUpserted: 100,
    });

    await command.run([], {
      race: 'milano-sanremo',
      year: 2024,
      type: RaceType.CLASSIC,
      class: RaceClass.UWT,
      name: 'Milano-Sanremo',
    });

    expect(mockTrigger.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        raceMetadata: expect.objectContaining({ name: 'Milano-Sanremo' }),
      }),
    );
  });

  it('should propagate use case errors', async () => {
    mockTrigger.execute.mockRejectedValue(new Error('Network error'));

    await expect(
      command.run([], {
        race: 'tour-de-france',
        year: 2024,
        type: RaceType.CLASSIC,
        class: RaceClass.UWT,
      }),
    ).rejects.toThrow('Network error');
  });

  describe('option parsing', () => {
    it('should parse race slug', () => {
      expect(command.parseRace('milano-sanremo')).toBe('milano-sanremo');
    });

    it('should parse valid year', () => {
      expect(command.parseYear('2024')).toBe(2024);
    });

    it('should reject year below range', () => {
      expect(() => command.parseYear('2019')).toThrow('Year must be between 2020 and 2030');
    });

    it('should reject year above range', () => {
      expect(() => command.parseYear('2031')).toThrow('Year must be between 2020 and 2030');
    });

    it('should reject non-numeric year', () => {
      expect(() => command.parseYear('abc')).toThrow('Year must be between 2020 and 2030');
    });

    it('should parse race type', () => {
      expect(command.parseType('classic')).toBe(RaceType.CLASSIC);
      expect(command.parseType('grand_tour')).toBe(RaceType.GRAND_TOUR);
      expect(command.parseType('mini_tour')).toBe(RaceType.MINI_TOUR);
    });

    it('should reject invalid race type', () => {
      expect(() => command.parseType('invalid')).toThrow('Invalid race type');
    });

    it('should parse race class', () => {
      expect(command.parseClass('UWT')).toBe(RaceClass.UWT);
      expect(command.parseClass('Pro')).toBe(RaceClass.PRO);
      expect(command.parseClass('1')).toBe(RaceClass.ONE);
    });

    it('should reject invalid race class', () => {
      expect(() => command.parseClass('invalid')).toThrow('Invalid race class');
    });
  });
});
