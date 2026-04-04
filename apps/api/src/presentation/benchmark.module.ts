import { Module } from '@nestjs/common';
import { DatabaseModule } from '../infrastructure/database/database.module';
import { ScrapingModule } from './scraping.module';
import { STARTLIST_REPOSITORY_PORT } from '../domain/startlist/startlist.repository.port';
import { StartlistRepositoryAdapter } from '../infrastructure/database/startlist.repository.adapter';
import { ML_SCORING_PORT } from '../domain/scoring/ml-scoring.port';
import { MlScoringAdapter } from '../infrastructure/ml/ml-scoring.adapter';
import { STARTLIST_PARSER_PORT } from '../application/benchmark/ports/startlist-parser.port';
import { StartlistParserAdapter } from '../infrastructure/scraping/startlist-parser.adapter';
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
    {
      provide: ML_SCORING_PORT,
      useClass: MlScoringAdapter,
    },
    {
      provide: STARTLIST_PARSER_PORT,
      useClass: StartlistParserAdapter,
    },
    FetchStartlistUseCase,
    RunBenchmarkUseCase,
    RunBenchmarkSuiteUseCase,
    BenchmarkCommand,
  ],
})
export class BenchmarkModule {}
