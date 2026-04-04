import { Module } from '@nestjs/common';
import { DatabaseModule } from '../infrastructure/database/database.module';
import { MlModule } from '../infrastructure/ml/ml.module';
import { ScrapingModule } from './scraping.module';
import { STARTLIST_PARSER_PORT } from '../application/benchmark/ports/startlist-parser.port';
import { StartlistParserAdapter } from '../infrastructure/scraping/startlist-parser.adapter';
import { ListBenchmarkRacesUseCase } from '../application/benchmark/list-benchmark-races.use-case';
import { FetchStartlistUseCase } from '../application/benchmark/fetch-startlist.use-case';
import { RunBenchmarkUseCase } from '../application/benchmark/run-benchmark.use-case';
import { RunBenchmarkSuiteUseCase } from '../application/benchmark/run-benchmark-suite.use-case';
import { BenchmarkCommand } from './cli/benchmark.command';

@Module({
  imports: [DatabaseModule, MlModule, ScrapingModule],
  providers: [
    {
      provide: STARTLIST_PARSER_PORT,
      useClass: StartlistParserAdapter,
    },
    ListBenchmarkRacesUseCase,
    FetchStartlistUseCase,
    RunBenchmarkUseCase,
    RunBenchmarkSuiteUseCase,
    BenchmarkCommand,
  ],
})
export class BenchmarkModule {}
