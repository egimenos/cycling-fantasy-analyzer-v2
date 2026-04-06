import { Module } from '@nestjs/common';
import { DatabaseModule } from '../infrastructure/database/database.module';
import { MlModule } from '../infrastructure/ml/ml.module';
import { ScrapingModule } from './scraping.module';
import { ListBenchmarkRacesUseCase } from '../application/benchmark/list-benchmark-races.use-case';
import { RunBenchmarkUseCase } from '../application/benchmark/run-benchmark.use-case';
import { RunBenchmarkSuiteUseCase } from '../application/benchmark/run-benchmark-suite.use-case';
import { BenchmarkCommand } from './cli/benchmark.command';

@Module({
  imports: [DatabaseModule, MlModule, ScrapingModule],
  providers: [
    ListBenchmarkRacesUseCase,
    RunBenchmarkUseCase,
    RunBenchmarkSuiteUseCase,
    BenchmarkCommand,
  ],
})
export class BenchmarkModule {}
