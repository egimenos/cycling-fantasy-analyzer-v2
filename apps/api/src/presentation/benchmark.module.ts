import { Module } from '@nestjs/common';
import { DatabaseModule } from '../infrastructure/database/database.module';
import { ScrapingModule } from './scraping.module';
import { STARTLIST_REPOSITORY_PORT } from '../domain/startlist/startlist.repository.port';
import { StartlistRepositoryAdapter } from '../infrastructure/database/startlist.repository.adapter';
import { FetchStartlistUseCase } from '../application/benchmark/fetch-startlist.use-case';
import { RunBenchmarkUseCase } from '../application/benchmark/run-benchmark.use-case';
import { RunBenchmarkSuiteUseCase } from '../application/benchmark/run-benchmark-suite.use-case';
import { BenchmarkCommand } from './cli/benchmark.command';

@Module({
  imports: [DatabaseModule, ScrapingModule],
  providers: [
    {
      provide: STARTLIST_REPOSITORY_PORT,
      useClass: StartlistRepositoryAdapter,
    },
    FetchStartlistUseCase,
    RunBenchmarkUseCase,
    RunBenchmarkSuiteUseCase,
    BenchmarkCommand,
  ],
})
export class BenchmarkModule {}
