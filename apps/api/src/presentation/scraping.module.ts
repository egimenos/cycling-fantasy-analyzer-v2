import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from '../infrastructure/database/database.module';
import { PcsClientAdapter } from '../infrastructure/scraping/pcs-client.adapter';
import { ScraperHealthService } from '../infrastructure/scraping/health/scraper-health.service';
import { PCS_SCRAPER_PORT } from '../application/scraping/ports/pcs-scraper.port';
import { TriggerScrapeUseCase } from '../application/scraping/trigger-scrape.use-case';
import { GetScrapeJobsUseCase } from '../application/scraping/get-scrape-jobs.use-case';
import { TriggerScrapeCommand } from './cli/trigger-scrape.command';
import { SeedDatabaseCommand } from './cli/seed-database.command';

@Module({
  imports: [DatabaseModule, ScheduleModule.forRoot()],
  providers: [
    {
      provide: PCS_SCRAPER_PORT,
      useClass: PcsClientAdapter,
    },
    {
      provide: ScraperHealthService,
      useFactory: (pcsClient: PcsClientAdapter) => new ScraperHealthService(pcsClient),
      inject: [PCS_SCRAPER_PORT],
    },
    TriggerScrapeUseCase,
    GetScrapeJobsUseCase,
    TriggerScrapeCommand,
    SeedDatabaseCommand,
  ],
  exports: [PCS_SCRAPER_PORT],
})
export class ScrapingModule {}
