import { Module } from '@nestjs/common';
import { DatabaseModule } from './infrastructure/database/database.module';
import { AnalyzeModule } from './application/analyze/analyze.module';
import { OptimizeModule } from './application/optimize/optimize.module';

@Module({
  imports: [DatabaseModule, AnalyzeModule, OptimizeModule],
})
export class AppModule {}
