import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './infrastructure/database/database.module';
import { AnalyzeModule } from './application/analyze/analyze.module';
import { OptimizeModule } from './application/optimize/optimize.module';
import { ScrapingModule } from './presentation/scraping.module';
import { BenchmarkModule } from './presentation/benchmark.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: ['.env.local', '.env'],
      isGlobal: true,
    }),
    DatabaseModule,
    AnalyzeModule,
    OptimizeModule,
    ScrapingModule,
    BenchmarkModule,
  ],
})
export class AppModule {}
