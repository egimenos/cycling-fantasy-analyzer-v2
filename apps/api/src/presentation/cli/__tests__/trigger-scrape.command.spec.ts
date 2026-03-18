import { TestingModule, Test } from '@nestjs/testing';
import { TriggerScrapeCommand } from './trigger-scrape.command';
import { TriggerScrapeUseCase } from '../../application/scraping/trigger-scrape.use-case';

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

  it('should call use case with parsed options', async () => {
    mockTrigger.execute.mockResolvedValue({
      jobId: 'test-uuid',
      status: 'success',
      recordsUpserted: 150,
    });

    await command.run([], { race: 'tour-de-france', year: 2024 });

    expect(mockTrigger.execute).toHaveBeenCalledWith({
      raceSlug: 'tour-de-france',
      year: 2024,
    });
  });

  it('should propagate use case errors', async () => {
    mockTrigger.execute.mockRejectedValue(new Error('Network error'));

    await expect(command.run([], { race: 'tour-de-france', year: 2024 })).rejects.toThrow(
      'Network error',
    );
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
  });
});
