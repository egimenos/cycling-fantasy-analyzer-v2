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

    // Mean rho excluding nulls
    const validRhos = results
      .map((r) => r.spearmanRho)
      .filter((rho): rho is number => rho !== null);
    const meanRho =
      validRhos.length > 0 ? validRhos.reduce((sum, rho) => sum + rho, 0) / validRhos.length : null;

    this.logger.log(
      `Suite complete: ${results.length} races, mean rho=${meanRho?.toFixed(4) ?? 'null'}`,
    );

    return {
      races: results,
      meanSpearmanRho: meanRho,
      raceCount: results.length,
    };
  }
}
