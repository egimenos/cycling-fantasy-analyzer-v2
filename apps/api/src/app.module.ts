import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ObservabilityModule } from './infrastructure/observability/observability.module';
import { DatabaseModule } from './infrastructure/database/database.module';
import { AnalyzeModule } from './application/analyze/analyze.module';
import { OptimizeModule } from './application/optimize/optimize.module';
import { ScrapingModule } from './presentation/scraping.module';
import { BenchmarkModule } from './presentation/benchmark.module';
import { HealthController } from './presentation/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: ['.env.local', '.env'],
      isGlobal: true,
    }),
    ObservabilityModule,
    DatabaseModule,
    AnalyzeModule,
    OptimizeModule,
    ScrapingModule,
    BenchmarkModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
