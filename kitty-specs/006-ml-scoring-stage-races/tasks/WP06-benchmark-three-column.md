---
work_package_id: WP06
title: Benchmark Suite 3-Column Comparison
lane: 'done'
dependencies: [WP04]
subtasks:
  - T031
  - T032
  - T033
  - T034
  - T035
  - T036
phase: Phase 4 - Benchmark
assignee: ''
agent: ''
shell_pid: ''
review_status: 'approved'
reviewed_by: 'egimenos'
history:
  - timestamp: '2026-03-20T16:27:36Z'
    lane: planned
    agent: system
    shell_pid: ''
    action: Prompt generated via /spec-kitty.tasks
requirement_refs:
  - FR-010
---

# Work Package Prompt: WP06 – Benchmark Suite 3-Column Comparison

## ⚠️ IMPORTANT: Review Feedback Status

- **Has review feedback?**: Check `review_status` field above.

---

## Review Feedback

_[Empty initially.]_

---

## Implementation Command

```bash
spec-kitty implement WP06 --base WP04
```

---

## Objectives & Success Criteria

- `make benchmark-suite` displays 3 Spearman rho columns: rules, ML, hybrid
- Aggregate mean rho per method shown at bottom
- Stage races show distinct ML and hybrid values
- Classics show "n/a" for ML column, hybrid = rules
- ML rho values match research findings (~0.52 mini tours, ~0.59 grand tours)

## Context & Constraints

- **Existing benchmark**: `apps/api/src/application/benchmark/run-benchmark.use-case.ts` computes rules-based rho
- **CLI display**: `apps/api/src/presentation/cli/benchmark.command.ts` renders the table
- **Spearman correlation**: `apps/api/src/domain/scoring/spearman-correlation.ts` provides `computeSpearmanRho()`
- **ML predictions**: Call ML service via `MlScoringPort` to get predicted scores for each race

## Subtasks & Detailed Guidance

### Subtask T031 – Extend BenchmarkResult entity

- **Purpose**: Add ML and hybrid rho fields to the benchmark result structure.
- **Steps**:
  1. Edit `apps/api/src/domain/benchmark/benchmark-result.ts`
  2. Rename `spearmanRho` → `rulesSpearmanRho` in `BenchmarkResult` interface
  3. Add new fields:
     ```typescript
     readonly mlSpearmanRho: number | null;      // null for classics
     readonly hybridSpearmanRho: number | null;   // null if ML unavailable
     ```
  4. Update `BenchmarkSuiteResult` to include 3 mean rhos:
     ```typescript
     readonly meanRulesRho: number | null;
     readonly meanMlRho: number | null;
     readonly meanHybridRho: number | null;
     ```
  5. Rename existing `meanSpearmanRho` → `meanRulesRho`
  6. Grep entire codebase for `spearmanRho` and `meanSpearmanRho` — update all references
- **Files**: `apps/api/src/domain/benchmark/benchmark-result.ts` (modify)
- **Parallel?**: Yes — can be done independently of CLI work
- **Notes**: This is a codebase-wide rename. Be thorough: check use-cases, CLI command, tests.

### Subtask T032 – Modify RunBenchmarkUseCase for ML rho

- **Purpose**: Compute ML-based Spearman rho alongside rules-based rho.
- **Steps**:
  1. Edit `apps/api/src/application/benchmark/run-benchmark.use-case.ts`
  2. Inject `MlScoringPort` in constructor
  3. After computing rules-based predictions (existing code), compute ML predictions:
     ```typescript
     // ML predictions (stage races only)
     let mlRho: number | null = null;
     if (input.raceType === RaceType.GRAND_TOUR || input.raceType === RaceType.MINI_TOUR) {
       const mlPredictions = await this.mlScoring.predictRace(input.raceSlug, input.year);
       if (mlPredictions) {
         const mlScoreMap = new Map(mlPredictions.map((p) => [p.riderId, p.predictedScore]));
         const mlScores = riderIds.map((id) => mlScoreMap.get(id) ?? 0);
         mlRho = computeSpearmanRho(mlScores, actualScores);
       }
     }
     ```
  4. Return `mlSpearmanRho: mlRho` in result
- **Files**: `apps/api/src/application/benchmark/run-benchmark.use-case.ts` (modify)

### Subtask T033 – Compute hybrid rho

- **Purpose**: Hybrid rho uses ML for stage races and rules for classics — matching production behavior.
- **Steps**:
  1. In the same `RunBenchmarkUseCase.execute()`:
     ```typescript
     // Hybrid: ML for stage races, rules for classics
     let hybridRho: number | null;
     if (mlRho !== null) {
       hybridRho = mlRho; // Stage race — use ML
     } else {
       hybridRho = rulesRho; // Classic — use rules
     }
     ```
  2. Return `hybridSpearmanRho: hybridRho` in result
- **Files**: `apps/api/src/application/benchmark/run-benchmark.use-case.ts` (modify)
- **Notes**: Hybrid rho for stage races equals ML rho. Hybrid rho for classics equals rules rho. The aggregate hybrid rho is the production-relevant metric.

### Subtask T034 – Modify RunBenchmarkSuiteUseCase for 3 aggregates

- **Purpose**: Compute mean rho for each method across all races.
- **Steps**:
  1. Edit `apps/api/src/application/benchmark/run-benchmark-suite.use-case.ts`
  2. After collecting all results, compute 3 mean rhos:

     ```typescript
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
     ```

  3. Return `meanRulesRho`, `meanMlRho`, `meanHybridRho` in suite result

- **Files**: `apps/api/src/application/benchmark/run-benchmark-suite.use-case.ts` (modify)

### Subtask T035 – Update BenchmarkCommand CLI display

- **Purpose**: Show 3-column rho table in terminal output.
- **Steps**:
  1. Edit `apps/api/src/presentation/cli/benchmark.command.ts`
  2. Update suite table to include 3 rho columns:
     ```
     ┌─────────────────────────┬────────────┬────────┬────────┬────────┐
     │ Race                    │ Type       │ ρ Rules│ ρ ML   │ρ Hybrid│
     ├─────────────────────────┼────────────┼────────┼────────┼────────┤
     │ Tour de Suisse 2025     │ mini_tour  │ 0.3812 │ 0.5185 │ 0.5185 │
     │ Tour de France 2025     │ grand_tour │ 0.4521 │ 0.5872 │ 0.5872 │
     │ Milano-Sanremo 2025     │ classic    │ 0.3521 │ n/a    │ 0.3521 │
     ├─────────────────────────┼────────────┼────────┼────────┼────────┤
     │ MEAN                    │            │ 0.3951 │ 0.5529 │ 0.4859 │
     └─────────────────────────┴────────────┴────────┴────────┴────────┘
     ```
  3. Format: 4 decimal places for rho values. "n/a" for null ML values.
  4. Color coding (if console supports): green if ML improves over rules, red if regression
  5. Update single-race benchmark display similarly (show ML and hybrid rho if available)
- **Files**: `apps/api/src/presentation/cli/benchmark.command.ts` (modify)
- **Parallel?**: Yes — can be done independently of T032-T034 logic

### Subtask T036 – Verify benchmark matches research rhos

- **Purpose**: Validate that the benchmark produces ML rho values consistent with research findings.
- **Steps**:
  1. Run `make benchmark-suite` with ML service running
  2. Check stage race ML rho values:
     - Mini tours: ~0.52 (research: 0.5185)
     - Grand tours: ~0.59 (research: 0.5872)
  3. Values may differ slightly since production model is trained on ALL data (research used 2023-2024 only)
  4. Rules rho should be unchanged: ~0.39
  5. Hybrid aggregate should be higher than rules aggregate
- **Files**: No new files — validation step

## Risks & Mitigations

- **Rename `spearmanRho`**: Codebase-wide rename. Use grep/find-replace carefully. Run `make typecheck` after.
- **ML service required**: Benchmark needs ML service running for ML rho. If service is down, ML column shows "n/a". Benchmark should still work for rules column.

## Review Guidance

- Verify 3-column table renders correctly with proper alignment
- Verify classics show "n/a" for ML, hybrid = rules
- Verify aggregate mean rhos are computed correctly (exclude nulls)
- Verify `spearmanRho` rename is complete (no remaining references)

## Activity Log

- 2026-03-20T16:27:36Z – system – lane=planned – Prompt created.
- 2026-03-20T17:19:32Z – unknown – lane=for_review – All 6 subtasks complete
- 2026-03-20T17:20:06Z – unknown – lane=done – Review passed: 3-column display, codebase-wide rename complete (zero spearmanRho refs), ML rho computation, hybrid fallback, aggregates.
