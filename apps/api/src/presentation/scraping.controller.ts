import { Controller, Post, Get, Body, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { TriggerScrapeUseCase } from '../application/scraping/trigger-scrape.use-case';
import { GetScrapeJobsUseCase } from '../application/scraping/get-scrape-jobs.use-case';
import { GetScraperHealthUseCase } from '../application/scraping/get-scraper-health.use-case';
import { TriggerScrapeDto } from './dto/trigger-scrape.dto';
import { ScrapeJobsQueryDto } from './dto/scrape-jobs-query.dto';

@Controller('api/scraping')
export class ScrapingController {
  constructor(
    private readonly triggerScrapeUseCase: TriggerScrapeUseCase,
    private readonly getScrapeJobsUseCase: GetScrapeJobsUseCase,
    private readonly getScraperHealthUseCase: GetScraperHealthUseCase,
  ) {}

  @Post('trigger')
  @HttpCode(HttpStatus.ACCEPTED)
  async triggerScrape(@Body() dto: TriggerScrapeDto) {
    const result = await this.triggerScrapeUseCase.execute({
      raceSlug: dto.raceSlug,
      year: dto.year,
    });
    return { jobId: result.jobId, status: result.status };
  }

  @Get('jobs')
  async getJobs(@Query() query: ScrapeJobsQueryDto) {
    const jobs = await this.getScrapeJobsUseCase.execute(query.limit ?? 20, query.status);
    return {
      jobs: jobs.map((j) => j.toProps()),
    };
  }

  @Get('health')
  getHealth() {
    return this.getScraperHealthUseCase.execute();
  }
}
