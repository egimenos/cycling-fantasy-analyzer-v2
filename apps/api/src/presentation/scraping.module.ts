import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from '../infrastructure/database/database.module';
import { PcsClientAdapter } from '../infrastructure/scraping/pcs-client.adapter';
import { ScraperHealthService } from '../infrastructure/scraping/health/scraper-health.service';
import { PCS_SCRAPER_PORT } from '../application/scraping/ports/pcs-scraper.port';
import { RACE_RESULT_PARSER_PORT } from '../application/scraping/ports/race-result-parser.port';
import { RaceResultParserAdapter } from '../infrastructure/scraping/race-result-parser.adapter';
import { RACE_LIST_PARSER_PORT } from '../application/scraping/ports/race-list-parser.port';
import { RaceListParserAdapter } from '../infrastructure/scraping/race-list-parser.adapter';
import { STARTLIST_PARSER_PORT } from '../application/benchmark/ports/startlist-parser.port';
import { StartlistParserAdapter } from '../infrastructure/scraping/startlist-parser.adapter';
import { CheckRaceScrapedUseCase } from '../application/scraping/check-race-scraped.use-case';
import { DiscoverRacesUseCase } from '../application/scraping/discover-races.use-case';
import { TriggerScrapeUseCase } from '../application/scraping/trigger-scrape.use-case';
import { GetScrapeJobsUseCase } from '../application/scraping/get-scrape-jobs.use-case';
import { FetchStartlistUseCase } from '../application/benchmark/fetch-startlist.use-case';
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
      provide: RACE_RESULT_PARSER_PORT,
      useClass: RaceResultParserAdapter,
    },
    {
      provide: ScraperHealthService,
      useFactory: (pcsClient: PcsClientAdapter) => new ScraperHealthService(pcsClient),
      inject: [PCS_SCRAPER_PORT],
    },
    {
      provide: RACE_LIST_PARSER_PORT,
      useClass: RaceListParserAdapter,
    },
    {
      provide: STARTLIST_PARSER_PORT,
      useClass: StartlistParserAdapter,
    },
    CheckRaceScrapedUseCase,
    DiscoverRacesUseCase,
    TriggerScrapeUseCase,
    GetScrapeJobsUseCase,
    FetchStartlistUseCase,
    TriggerScrapeCommand,
    SeedDatabaseCommand,
  ],
  exports: [PCS_SCRAPER_PORT, FetchStartlistUseCase, STARTLIST_PARSER_PORT],
})
export class ScrapingModule {}
