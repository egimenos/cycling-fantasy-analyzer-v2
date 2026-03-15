import { Test, TestingModule } from '@nestjs/testing';
import { ScrapingController } from './scraping.controller';
import { TriggerScrapeUseCase } from '../application/scraping/trigger-scrape.use-case';
import { GetScrapeJobsUseCase } from '../application/scraping/get-scrape-jobs.use-case';
import { GetScraperHealthUseCase } from '../application/scraping/get-scraper-health.use-case';
import { ScrapeJob } from '../domain/scrape-job/scrape-job.entity';
import { HealthStatus } from '../domain/shared/health-status.enum';

describe('ScrapingController', () => {
  let controller: ScrapingController;
  const mockTrigger = { execute: jest.fn() };
  const mockGetJobs = { execute: jest.fn() };
  const mockGetHealth = { execute: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ScrapingController],
      providers: [
        { provide: TriggerScrapeUseCase, useValue: mockTrigger },
        { provide: GetScrapeJobsUseCase, useValue: mockGetJobs },
        { provide: GetScraperHealthUseCase, useValue: mockGetHealth },
      ],
    }).compile();

    controller = module.get<ScrapingController>(ScrapingController);
  });

  describe('POST /api/scraping/trigger', () => {
    it('should trigger a scrape and return jobId', async () => {
      mockTrigger.execute.mockResolvedValue({
        jobId: 'test-uuid',
        status: 'success',
        recordsUpserted: 150,
      });

      const result = await controller.triggerScrape({
        raceSlug: 'tour-de-france',
        year: 2024,
      });

      expect(result).toEqual({ jobId: 'test-uuid', status: 'success' });
      expect(mockTrigger.execute).toHaveBeenCalledWith({
        raceSlug: 'tour-de-france',
        year: 2024,
      });
    });
  });

  describe('GET /api/scraping/jobs', () => {
    it('should return recent jobs', async () => {
      const job = ScrapeJob.create('tour-de-france', 2024);
      mockGetJobs.execute.mockResolvedValue([job]);

      const result = await controller.getJobs({ limit: 10 });

      expect(result.jobs).toHaveLength(1);
      expect(result.jobs[0].raceSlug).toBe('tour-de-france');
      expect(mockGetJobs.execute).toHaveBeenCalledWith(10, undefined);
    });

    it('should pass status filter', async () => {
      mockGetJobs.execute.mockResolvedValue([]);

      await controller.getJobs({ limit: 5, status: 'success' as never });

      expect(mockGetJobs.execute).toHaveBeenCalledWith(5, 'success');
    });

    it('should default limit to 20', async () => {
      mockGetJobs.execute.mockResolvedValue([]);

      await controller.getJobs({});

      expect(mockGetJobs.execute).toHaveBeenCalledWith(20, undefined);
    });
  });

  describe('GET /api/scraping/health', () => {
    it('should return health report', () => {
      const report = {
        overallStatus: HealthStatus.HEALTHY,
        lastCheckAt: null,
        parsers: {
          stageRace: {
            status: HealthStatus.HEALTHY,
            lastCheckAt: null,
            lastError: null,
            sampleSize: 0,
          },
          classic: {
            status: HealthStatus.HEALTHY,
            lastCheckAt: null,
            lastError: null,
            sampleSize: 0,
          },
        },
      };
      mockGetHealth.execute.mockReturnValue(report);

      const result = controller.getHealth();

      expect(result.overallStatus).toBe(HealthStatus.HEALTHY);
      expect(result.parsers.stageRace.status).toBe(HealthStatus.HEALTHY);
    });
  });
});
