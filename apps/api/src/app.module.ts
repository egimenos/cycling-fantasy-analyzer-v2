import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
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
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 60 }],
      skipIf: () => process.env.THROTTLE_DISABLE === 'true',
    }),
    ObservabilityModule,
    DatabaseModule,
    AnalyzeModule,
    OptimizeModule,
    ScrapingModule,
    BenchmarkModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
