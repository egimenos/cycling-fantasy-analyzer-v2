import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { MatchingModule } from '../../infrastructure/matching/matching.module';
import { ScoringService } from '../../domain/scoring/scoring.service';
import { AnalyzePriceListUseCase } from './analyze-price-list.use-case';
import { AnalyzeController } from '../../presentation/analyze.controller';

@Module({
  imports: [DatabaseModule, MatchingModule],
  controllers: [AnalyzeController],
  providers: [AnalyzePriceListUseCase, ScoringService],
})
export class AnalyzeModule {}
