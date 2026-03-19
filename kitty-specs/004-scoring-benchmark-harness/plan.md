# Implementation Plan: Scoring Benchmark Harness

**Branch**: `004-scoring-benchmark-harness` | **Date**: 2026-03-19 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `kitty-specs/004-scoring-benchmark-harness/spec.md`

## Summary

Build a CLI benchmarking harness that measures prediction quality of the scoring algorithm by comparing predicted `totalProjectedPts` (computed from pre-race data) against actual `totalProjectedPts` (computed from real race results) using Spearman rank correlation. Requires adding `raceDate` to the schema, a new `startlist_entries` table, startlist scraping from PCS, and an interactive CLI benchmark command.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode)
**Primary Dependencies**: NestJS, nest-commander, Drizzle ORM, got-scraping, `@inquirer/prompts` (new)
**Storage**: PostgreSQL (via Drizzle ORM)
**Testing**: Jest — 100% coverage on scoring/benchmark/correlation logic, 90% elsewhere
**Target Platform**: Linux CLI (Node.js)
**Project Type**: Monorepo (Turborepo) — backend app at `apps/api`
**Performance Goals**: Single-race benchmark < 2 min (excluding scraping I/O)
**Constraints**: CLI-only (no REST endpoints for scraping/benchmarking), English-only codebase
**Scale/Scope**: ~2,500 riders, ~114K results, ~96 races across 3 years

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Gate                                | Status | Notes                                                                                                                              |
| ----------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| DDD/Hexagonal architecture          | PASS   | New domain entities (StartlistEntry, BenchmarkResult), ports for startlist repo, application use cases for benchmark orchestration |
| Domain logic free of framework deps | PASS   | Spearman correlation, actual score computation are pure functions. `computeRiderScore` already pure                                |
| No `any` types                      | PASS   | Will use `unknown` + type guards where needed                                                                                      |
| Scoring logic 100% test coverage    | PASS   | Spearman correlation and benchmark scoring logic will have 100% coverage                                                           |
| English only (code, docs, commits)  | PASS   | All artifacts in English                                                                                                           |
| Conventional commits                | PASS   | Will use `feat(004):` prefix                                                                                                       |
| CLI-only for scraping ops           | PASS   | Startlist scraping + benchmark are CLI commands, no REST endpoints                                                                 |
| No Python in v1                     | PASS   | Pure TypeScript implementation                                                                                                     |

## Project Structure

### Documentation (this feature)

```
kitty-specs/004-scoring-benchmark-harness/
├── plan.md              # This file
├── research.md          # Phase 0: PCS parsing, Spearman, CLI library
├── data-model.md        # Phase 1: startlist_entries table, raceDate field
├── quickstart.md        # Phase 1: developer getting started
├── contracts/           # Phase 1: N/A (CLI-only, no API contracts)
└── tasks.md             # Phase 2 output (NOT created by /spec-kitty.plan)
```

### Source Code (repository root)

```
apps/api/
├── src/
│   ├── domain/
│   │   ├── scoring/
│   │   │   ├── scoring.service.ts          # Existing — no changes needed
│   │   │   └── spearman-correlation.ts     # NEW — pure function
│   │   ├── race-result/
│   │   │   ├── race-result.entity.ts       # MODIFY — add raceDate property
│   │   │   └── race-result.repository.port.ts  # MODIFY — add findByRiderIdsBeforeDate()
│   │   ├── startlist/
│   │   │   ├── startlist-entry.entity.ts   # NEW — domain entity
│   │   │   └── startlist.repository.port.ts    # NEW — port interface
│   │   └── benchmark/
│   │       └── benchmark-result.ts         # NEW — value object for results
│   ├── application/
│   │   └── benchmark/
│   │       ├── run-benchmark.use-case.ts           # NEW — single race benchmark
│   │       ├── run-benchmark-suite.use-case.ts     # NEW — multi-race benchmark
│   │       └── fetch-startlist.use-case.ts         # NEW — scrape or load startlist
│   ├── infrastructure/
│   │   ├── database/
│   │   │   ├── schema/
│   │   │   │   ├── race-results.ts         # MODIFY — add raceDate column
│   │   │   │   └── startlist-entries.ts    # NEW — startlist table schema
│   │   │   ├── race-result.repository.adapter.ts   # MODIFY — implement date filter
│   │   │   └── startlist.repository.adapter.ts     # NEW — Drizzle adapter
│   │   └── scraping/
│   │       └── parsers/
│   │           ├── startlist.parser.ts     # NEW — parse PCS startlist HTML
│   │           └── race-date.parser.ts     # NEW — extract race date from PCS
│   └── presentation/
│       ├── cli/
│       │   └── benchmark.command.ts        # NEW — interactive CLI command
│       └── benchmark.module.ts             # NEW — NestJS module wiring
├── drizzle/
│   └── migrations/                         # NEW migration for raceDate + startlist_entries
└── test/
    └── (mirrors src/ structure with __tests__ colocated)
```

**Structure Decision**: Follows existing monorepo DDD/Hexagonal layout in `apps/api/src/`. New `startlist/` and `benchmark/` domain modules. Benchmark application use cases orchestrate domain scoring functions and infrastructure adapters. CLI command in `presentation/cli/`.

## Key Design Decisions

### 1. Reusing `computeRiderScore` for actual score computation

Both predicted and actual scores use the same `computeRiderScore` function — the only difference is the input data:

- **Predicted**: all rider results where `raceDate < targetRaceDate`
- **Actual**: only results from the target race itself

When computing actual scores with single-race results:

- `temporalWeight` = 1.0 (same year, offset 0)
- `crossTypeWeight` = 1.0 (result type matches target type)
- `classWeight` = same for all riders (same race class)
- `profileWeight` = applied per-stage, same for all riders on same stage

Since Spearman correlation only cares about rank order, weights that are constant across all riders in the same race (classWeight, temporalWeight, crossTypeWeight) don't affect the ranking. This means `computeRiderScore` produces the correct ranking for actual scores without modification.

**Zero changes to scoring core required.**

### 2. `raceDate` field strategy

Add `raceDate` (DATE type, nullable for migration safety) to `race_results` schema. Parse from PCS during scraping. For stage races, each stage result gets the specific stage date; GC/classification results get the final race day.

The new `findByRiderIdsBeforeDate(riderIds, cutoffDate)` repository method pushes date filtering to SQL (efficient) rather than fetching all results and filtering in memory.

### 3. Startlist persistence

New `startlist_entries` table linked to race (slug + year) and rider. Fetched on-demand during benchmark, persisted for reuse and future ML. Startlist scraping creates missing rider records automatically.

### 4. Interactive CLI with `@inquirer/prompts`

Using `@inquirer/prompts` (modern ESM-compatible inquirer) for interactive race selection. Presents available races (those with complete results and `raceDate` populated) as a selectable list. No slug memorization required.

### 5. Spearman rank correlation as pure domain function

Implemented as a standalone pure function in `domain/scoring/spearman-correlation.ts`. Handles ties via average rank method. Returns ρ ∈ [-1, +1]. 100% test coverage required per constitution.
