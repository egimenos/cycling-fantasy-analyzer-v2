import { Inject, Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';
import {
  RaceResultRepositoryPort,
  RaceSummary,
  RACE_RESULT_REPOSITORY_PORT,
} from '../../domain/race-result/race-result.repository.port';
import { RunBenchmarkUseCase } from '../../application/benchmark/run-benchmark.use-case';
import { RunBenchmarkSuiteUseCase } from '../../application/benchmark/run-benchmark-suite.use-case';
import { BenchmarkResult } from '../../domain/benchmark/benchmark-result';

interface BenchmarkOptions {
  suite?: boolean;
}

@Command({
  name: 'benchmark',
  description: 'Run scoring benchmark against historical race data',
})
export class BenchmarkCommand extends CommandRunner {
  private readonly logger = new Logger(BenchmarkCommand.name);

  constructor(
    @Inject(RACE_RESULT_REPOSITORY_PORT)
    private readonly raceResultRepo: RaceResultRepositoryPort,
    private readonly runBenchmark: RunBenchmarkUseCase,
    private readonly runBenchmarkSuite: RunBenchmarkSuiteUseCase,
  ) {
    super();
  }

  async run(_passedParams: string[], options: BenchmarkOptions): Promise<void> {
    const races = await this.raceResultRepo.findDistinctRacesWithDate();

    if (races.length === 0) {
      this.logger.error('No races with date data found. Run seed first.');
      return;
    }

    if (options.suite) {
      await this.runSuiteMode(races);
    } else {
      await this.runSingleMode(races);
    }
  }

  private async runSingleMode(races: RaceSummary[]): Promise<void> {
    const { select } = await import('@inquirer/prompts');

    const choices = races.map((r) => ({
      name: `${r.raceName} ${r.year} (${r.raceType})`,
      value: r,
    }));

    const selected = await select<RaceSummary>({
      message: 'Select a race to benchmark:',
      choices,
    });

    this.logger.log(`Running benchmark for ${selected.raceName} ${selected.year}...`);

    const result = await this.runBenchmark.execute({
      raceSlug: selected.raceSlug,
      year: selected.year,
      raceType: selected.raceType,
      raceName: selected.raceName,
    });

    this.displayResult(result);
  }

  private async runSuiteMode(races: RaceSummary[]): Promise<void> {
    const { checkbox } = await import('@inquirer/prompts');

    const choices = races.map((r) => ({
      name: `${r.raceName} ${r.year} (${r.raceType})`,
      value: r,
    }));

    const selected = await checkbox<RaceSummary>({
      message: 'Select races for benchmark suite (space to toggle, enter to confirm):',
      choices,
    });

    if (selected.length === 0) {
      this.logger.warn('No races selected. Aborting.');
      return;
    }

    this.logger.log(`Running benchmark suite for ${selected.length} races...`);

    const suiteInputs = selected.map((r) => ({
      raceSlug: r.raceSlug,
      year: r.year,
      raceType: r.raceType,
      raceName: r.raceName,
    }));

    const suiteResult = await this.runBenchmarkSuite.execute(
      suiteInputs,
      (completed, total, result) => {
        this.logger.log(
          `[${completed}/${total}] ${result.raceName} ${result.year} — ρ = ${result.spearmanRho?.toFixed(4) ?? 'N/A'}`,
        );
      },
    );

    console.log('\n=== Suite Summary ===');
    const suiteTable = suiteResult.races.map((r) => ({
      Race: r.raceName,
      Year: r.year,
      Type: r.raceType,
      Riders: r.riderCount,
      'Spearman ρ': r.spearmanRho?.toFixed(4) ?? 'N/A',
    }));
    console.table(suiteTable);

    console.log(`\nMean Spearman ρ: ${suiteResult.meanSpearmanRho?.toFixed(4) ?? 'N/A'}`);
    console.log(`Races evaluated: ${suiteResult.raceCount}`);
  }

  private displayResult(result: BenchmarkResult): void {
    console.log(`\n=== ${result.raceName} ${result.year} (${result.raceType}) ===`);
    console.log(`Riders: ${result.riderCount}`);
    console.log(`Spearman ρ: ${result.spearmanRho?.toFixed(4) ?? 'N/A'}\n`);

    const top30 = [...result.riderResults].sort((a, b) => a.actualRank - b.actualRank).slice(0, 30);

    const tableData = top30.map((r) => ({
      'Actual Rank': r.actualRank,
      'Predicted Rank': r.predictedRank,
      Rider: r.riderName,
      'Actual Pts': r.actualPts.toFixed(1),
      'Predicted Pts': r.predictedPts.toFixed(1),
    }));

    console.table(tableData);
  }

  @Option({
    flags: '-s, --suite',
    description: 'Run benchmark suite mode (select multiple races)',
  })
  parseSuite(): boolean {
    return true;
  }
}
