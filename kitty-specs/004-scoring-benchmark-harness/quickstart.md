# Quickstart: Scoring Benchmark Harness

**Feature**: 004-scoring-benchmark-harness
**Date**: 2026-03-19

## Prerequisites

- Node.js 18+
- PostgreSQL running (via `docker-compose up -d`)
- Database seeded with race results (`npm run seed`)

## New Dependency

```bash
cd apps/api
npm install @inquirer/prompts
```

## Database Migration

After adding `raceDate` to the schema and creating `startlist_entries` table:

```bash
cd apps/api
npx drizzle-kit generate   # Generate migration from schema changes
npx drizzle-kit migrate     # Apply migration
```

## Re-seed Database

Re-run the seed command to populate `raceDate` for all existing results:

```bash
npm run seed -- --year 2024 --year 2025 --year 2026
```

This fetches race dates from PCS and backfills the `race_date` column for all results.

## Run Single Race Benchmark

```bash
npx ts-node -r tsconfig-paths/register src/cli.ts benchmark
```

Interactive prompts will guide you through:

1. Select a race from available races (those with complete results + dates)
2. View predicted vs actual scores per rider
3. See the Spearman rank correlation (ρ)

## Run Multi-Race Benchmark Suite

```bash
npx ts-node -r tsconfig-paths/register src/cli.ts benchmark --suite
```

Prompts:

1. Select multiple races to benchmark
2. View per-race correlations
3. See the aggregate mean ρ

## Interpreting Results

| ρ Range   | Interpretation                           |
| --------- | ---------------------------------------- |
| 0.8 – 1.0 | Excellent prediction quality             |
| 0.6 – 0.8 | Good — algorithm captures major patterns |
| 0.4 – 0.6 | Moderate — room for weight tuning        |
| 0.2 – 0.4 | Weak — significant prediction gaps       |
| < 0.2     | Poor — algorithm needs rethinking        |

## Tuning Workflow

1. Run benchmark suite → note baseline ρ
2. Adjust a weight in `scoring-weights.config.ts` (e.g., temporal decay, cross-type matrix)
3. Re-run benchmark suite → compare ρ
4. If ρ improved, keep the change. If not, revert.

## Development

### Running Tests

```bash
cd apps/api
npm run test -- --testPathPattern=benchmark
npm run test -- --testPathPattern=spearman
npm run test -- --testPathPattern=startlist
```

### Key Files

| File                                                        | Purpose                             |
| ----------------------------------------------------------- | ----------------------------------- |
| `src/domain/scoring/spearman-correlation.ts`                | Pure Spearman ρ function            |
| `src/domain/startlist/startlist-entry.entity.ts`            | Startlist domain entity             |
| `src/application/benchmark/run-benchmark.use-case.ts`       | Single race benchmark orchestration |
| `src/application/benchmark/run-benchmark-suite.use-case.ts` | Multi-race benchmark                |
| `src/application/benchmark/fetch-startlist.use-case.ts`     | Startlist fetch/scrape              |
| `src/presentation/cli/benchmark.command.ts`                 | Interactive CLI command             |
| `src/infrastructure/scraping/parsers/startlist.parser.ts`   | PCS startlist HTML parser           |
| `src/infrastructure/scraping/parsers/race-date.parser.ts`   | PCS race date extractor             |
