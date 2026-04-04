import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { MatchingModule } from '../../infrastructure/matching/matching.module';
import { ScrapingModule } from '../../presentation/scraping.module';
import { ScoringService } from '../../domain/scoring/scoring.service';
import { AnalyzePriceListUseCase } from './analyze-price-list.use-case';
import { FetchRaceProfileUseCase } from './fetch-race-profile.use-case';
import { FetchStartlistUseCase } from '../benchmark/fetch-startlist.use-case';
import { AnalyzeController } from '../../presentation/analyze.controller';
import { RaceProfileController } from '../../presentation/race-profile.controller';
import { ML_SCORING_PORT } from '../../domain/scoring/ml-scoring.port';
import { MlScoringAdapter } from '../../infrastructure/ml/ml-scoring.adapter';
import { STARTLIST_REPOSITORY_PORT } from '../../domain/startlist/startlist.repository.port';
import { StartlistRepositoryAdapter } from '../../infrastructure/database/startlist.repository.adapter';
import { RACE_PROFILE_PARSER_PORT } from './ports/race-profile-parser.port';
import { RaceProfileParserAdapter } from '../../infrastructure/scraping/race-profile-parser.adapter';
import { STARTLIST_PARSER_PORT } from '../benchmark/ports/startlist-parser.port';
import { StartlistParserAdapter } from '../../infrastructure/scraping/startlist-parser.adapter';

@Module({
  imports: [DatabaseModule, MatchingModule, ScrapingModule],
  controllers: [AnalyzeController, RaceProfileController],
  providers: [
    AnalyzePriceListUseCase,
    FetchRaceProfileUseCase,
    FetchStartlistUseCase,
    ScoringService,
    {
      provide: ML_SCORING_PORT,
      useClass: MlScoringAdapter,
    },
    {
      provide: STARTLIST_REPOSITORY_PORT,
      useClass: StartlistRepositoryAdapter,
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
