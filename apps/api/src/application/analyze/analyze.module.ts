import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { MatchingModule } from '../../infrastructure/matching/matching.module';
import { MlModule } from '../../infrastructure/ml/ml.module';
import { ScrapingModule } from '../../presentation/scraping.module';
import { ScoringService } from '../../domain/scoring/scoring.service';
import { AnalyzePriceListUseCase } from './analyze-price-list.use-case';
import { FetchRaceProfileUseCase } from './fetch-race-profile.use-case';
import { FetchStartlistUseCase } from '../benchmark/fetch-startlist.use-case';
import { AnalyzeController } from '../../presentation/analyze.controller';
import { RaceProfileController } from '../../presentation/race-profile.controller';
import { RACE_PROFILE_PARSER_PORT } from './ports/race-profile-parser.port';
import { RaceProfileParserAdapter } from '../../infrastructure/scraping/race-profile-parser.adapter';
import { STARTLIST_PARSER_PORT } from '../benchmark/ports/startlist-parser.port';
import { StartlistParserAdapter } from '../../infrastructure/scraping/startlist-parser.adapter';
import { ImportPriceListUseCase } from './import-price-list.use-case';
import { PRICE_LIST_FETCHER_PORT } from './ports/price-list-fetcher.port';
import { PriceListFetcherAdapter } from '../../infrastructure/scraping/price-list-fetcher.adapter';
import { PRICE_LIST_PARSER_PORT } from './ports/price-list-parser.port';
import { PriceListParserAdapter } from '../../infrastructure/scraping/price-list-parser.adapter';

@Module({
  imports: [DatabaseModule, MatchingModule, MlModule, ScrapingModule],
  controllers: [AnalyzeController, RaceProfileController],
  providers: [
    AnalyzePriceListUseCase,
    FetchRaceProfileUseCase,
    FetchStartlistUseCase,
    ImportPriceListUseCase,
    ScoringService,
    {
      provide: PRICE_LIST_FETCHER_PORT,
      useClass: PriceListFetcherAdapter,
    },
    {
      provide: PRICE_LIST_PARSER_PORT,
      useClass: PriceListParserAdapter,
    },
    {
      provide: RACE_PROFILE_PARSER_PORT,
      useClass: RaceProfileParserAdapter,
    },
    {
      provide: STARTLIST_PARSER_PORT,
      useClass: StartlistParserAdapter,
    },
  ],
})
export class AnalyzeModule {}
