import { Injectable, Logger } from '@nestjs/common';
import { BenchmarkResult, BenchmarkSuiteResult } from '../../domain/benchmark/benchmark-result';
import { RunBenchmarkUseCase, RunBenchmarkInput } from './run-benchmark.use-case';

@Injectable()
export class RunBenchmarkSuiteUseCase {
  private readonly logger = new Logger(RunBenchmarkSuiteUseCase.name);

  constructor(private readonly runBenchmark: RunBenchmarkUseCase) {}

  async execute(
    races: ReadonlyArray<RunBenchmarkInput>,
    onProgress?: (completed: number, total: number, result: BenchmarkResult) => void,
  ): Promise<BenchmarkSuiteResult> {
    this.logger.log(`Starting benchmark suite with ${races.length} races`);

    const results: BenchmarkResult[] = [];

    for (let i = 0; i < races.length; i++) {
      const result = await this.runBenchmark.execute(races[i]);
      results.push(result);
      onProgress?.(i + 1, races.length, result);
    }

    // Mean rhos excluding nulls
    const avg = (values: number[]): number => values.reduce((sum, v) => sum + v, 0) / values.length;

    const validRulesRhos = results
      .map((r) => r.rulesSpearmanRho)
      .filter((r): r is number => r !== null);
    const validMlRhos = results.map((r) => r.mlSpearmanRho).filter((r): r is number => r !== null);
    const validHybridRhos = results
      .map((r) => r.hybridSpearmanRho)
      .filter((r): r is number => r !== null);

    const meanRules = validRulesRhos.length > 0 ? avg(validRulesRhos) : null;
    const meanMl = validMlRhos.length > 0 ? avg(validMlRhos) : null;
    const meanHybrid = validHybridRhos.length > 0 ? avg(validHybridRhos) : null;

    this.logger.log(
      `Suite complete: ${results.length} races, meanRulesRho=${meanRules?.toFixed(4) ?? 'null'}, meanMlRho=${meanMl?.toFixed(4) ?? 'null'}, meanHybridRho=${meanHybrid?.toFixed(4) ?? 'null'}`,
    );

    return {
      races: results,
      meanRulesRho: meanRules,
      meanMlRho: meanMl,
      meanHybridRho: meanHybrid,
      raceCount: results.length,
    };
  }
}
