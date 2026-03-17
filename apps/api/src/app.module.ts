import { Module } from '@nestjs/common';
import { DatabaseModule } from './infrastructure/database/database.module';
import { AnalyzeModule } from './application/analyze/analyze.module';
import { OptimizeModule } from './application/optimize/optimize.module';
import { ScrapingModule } from './presentation/scraping.module';

@Module({
  imports: [DatabaseModule, AnalyzeModule, OptimizeModule, ScrapingModule],
})
export class AppModule {}
