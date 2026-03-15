import { Module } from '@nestjs/common';
import { DatabaseModule } from './infrastructure/database/database.module';
import { AnalyzeModule } from './application/analyze/analyze.module';

@Module({
  imports: [DatabaseModule, AnalyzeModule],
})
export class AppModule {}
