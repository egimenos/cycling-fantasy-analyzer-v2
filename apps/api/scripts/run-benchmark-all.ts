/* eslint-disable @typescript-eslint/no-explicit-any */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { RACE_RESULT_REPOSITORY_PORT } from '../src/domain/race-result/race-result.repository.port';
import { RunBenchmarkSuiteUseCase } from '../src/application/benchmark/run-benchmark-suite.use-case';
import { BenchmarkResult } from '../src/domain/benchmark/benchmark-result';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['warn', 'error'],
  });

  const repo = app.get<any>(RACE_RESULT_REPOSITORY_PORT);
  const suite = app.get(RunBenchmarkSuiteUseCase);

  const races = await repo.findDistinctRacesWithDate();
  const inputs = races.map((r: any) => ({
    raceSlug: r.raceSlug,
    year: r.year,
    raceType: r.raceType,
    raceName: r.raceName,
  }));

  const result = await suite.execute(inputs, (done: number, total: number, r: BenchmarkResult) => {
    const rulesRho = r.rulesSpearmanRho?.toFixed(4) ?? 'N/A';
    const mlRho = r.mlSpearmanRho?.toFixed(4) ?? 'n/a';
    const hybridRho = r.hybridSpearmanRho?.toFixed(4) ?? 'N/A';
    process.stdout.write(
      `[${done}/${total}] ${r.raceName} ${r.year} (${r.raceType}) rules=${rulesRho} ml=${mlRho} hybrid=${hybridRho}\n`,
    );
  });

  process.stdout.write(`\nMean ρ Rules:  ${result.meanRulesRho?.toFixed(4) ?? 'N/A'}\n`);
  process.stdout.write(`Mean ρ ML:     ${result.meanMlRho?.toFixed(4) ?? 'N/A'}\n`);
  process.stdout.write(`Mean ρ Hybrid: ${result.meanHybridRho?.toFixed(4) ?? 'N/A'}\n`);
  process.stdout.write(`Races: ${result.raceCount}\n`);
  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
