import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { MatchingModule } from '../../infrastructure/matching/matching.module';
import { ScrapingModule } from '../../presentation/scraping.module';
import { ScoringService } from '../../domain/scoring/scoring.service';
import { AnalyzePriceListUseCase } from './analyze-price-list.use-case';
import { FetchRaceProfileUseCase } from './fetch-race-profile.use-case';
import { AnalyzeController } from '../../presentation/analyze.controller';
import { RaceProfileController } from '../../presentation/race-profile.controller';
import { ML_SCORING_PORT } from '../../domain/scoring/ml-scoring.port';
import { MlScoringAdapter } from '../../infrastructure/ml/ml-scoring.adapter';

@Module({
  imports: [DatabaseModule, MatchingModule, ScrapingModule],
  controllers: [AnalyzeController, RaceProfileController],
  providers: [
    AnalyzePriceListUseCase,
    FetchRaceProfileUseCase,
    ScoringService,
    {
      provide: ML_SCORING_PORT,
      useClass: MlScoringAdapter,
    },
  ],
})
export class AnalyzeModule {}
