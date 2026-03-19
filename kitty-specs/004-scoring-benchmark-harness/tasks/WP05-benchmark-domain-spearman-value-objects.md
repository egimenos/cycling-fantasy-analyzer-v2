---
work_package_id: WP05
title: Benchmark Domain — Spearman Correlation & Value Objects
lane: 'doing'
dependencies: []
base_branch: main
base_commit: 37796b52dca5c0a1f78c707a1c71d3379c29e1f0
created_at: '2026-03-19T18:45:41.278847+00:00'
subtasks:
  - T019
  - T020
  - T021
  - T022
  - T023
phase: Phase 0 - Foundation
assignee: ''
agent: 'claude-opus'
shell_pid: '16093'
review_status: ''
reviewed_by: ''
history:
  - timestamp: '2026-03-19T18:18:14Z'
    lane: planned
    agent: system
    shell_pid: ''
    action: Prompt generated via /spec-kitty.tasks
requirement_refs:
  - FR-008
---

# Work Package Prompt: WP05 – Benchmark Domain — Spearman Correlation & Value Objects

## ⚠️ IMPORTANT: Review Feedback Status

**Read this first if you are implementing this task!**

- **Has review feedback?**: Check the `review_status` field above. If it says `has_feedback`, scroll to the **Review Feedback** section immediately.
- **You must address all feedback** before your work is complete.

---

## Review Feedback

_[This section is empty initially.]_

---

## Implementation Command

```bash
spec-kitty implement WP05
```

No dependencies — this is pure domain logic.

---

## Objectives & Success Criteria

- Implement Spearman rank correlation as a pure TypeScript function.
- **100% test coverage** (constitution requirement for scoring logic).
- Create `BenchmarkResult` and `BenchmarkSuiteResult` readonly interfaces.
- Create a `computeRankings` utility function.

**Done when**: Spearman function returns correct ρ for all test vectors (perfect, inverse, zero, ties, edge cases). 100% branch coverage on Spearman and ranking functions. Value object interfaces compile and are importable.

## Context & Constraints

- **Constitution**: Scoring logic requires 100% test coverage. Spearman correlation is scoring-adjacent — treat it identically.
- **Pure functions**: No NestJS decorators, no side effects, no I/O. Just math.
- **Location**: `apps/api/src/domain/scoring/` for Spearman (alongside existing scoring code), `apps/api/src/domain/benchmark/` for value objects.
- **Key references**:
  - Research: `kitty-specs/004-scoring-benchmark-harness/research.md` (R3 — Spearman formula)
  - Data model: `kitty-specs/004-scoring-benchmark-harness/data-model.md` (BenchmarkResult shape)

---

## Subtasks & Detailed Guidance

### Subtask T019 – Implement `spearman-correlation.ts`

**Purpose**: Pure function that computes Spearman's rank correlation coefficient between two sets of scores.

**Steps**:

1. Create `apps/api/src/domain/scoring/spearman-correlation.ts`
2. Implement the Spearman ρ formula:

   ```typescript
   /**
    * Computes Spearman's rank correlation coefficient (ρ) between two score arrays.
    * Both arrays must have the same length and correspond to the same items (by index).
    *
    * @param predicted - Predicted scores (higher = better)
    * @param actual - Actual scores (higher = better)
    * @returns ρ ∈ [-1, +1], or null if correlation is undefined (n < 2 or all tied)
    */
   export function computeSpearmanRho(
     predicted: readonly number[],
     actual: readonly number[],
   ): number | null {
     if (predicted.length !== actual.length) {
       throw new Error('Arrays must have equal length');
     }
     const n = predicted.length;
     if (n < 2) return null;

     const ranksX = computeRankings(predicted);
     const ranksY = computeRankings(actual);

     // Compute Σd²
     let sumD2 = 0;
     for (let i = 0; i < n; i++) {
       const d = ranksX[i] - ranksY[i];
       sumD2 += d * d;
     }

     // Check for ties — if ties exist, use the corrected formula
     const tieCorrectX = computeTieCorrection(ranksX);
     const tieCorrectY = computeTieCorrection(ranksY);

     if (tieCorrectX === 0 && tieCorrectY === 0) {
       // No ties — use simplified formula
       return 1 - (6 * sumD2) / (n * (n * n - 1));
     }

     // Corrected formula for ties
     const sumX2 = (n * (n * n - 1)) / 12 - tieCorrectX;
     const sumY2 = (n * (n * n - 1)) / 12 - tieCorrectY;

     if (sumX2 === 0 || sumY2 === 0) return null; // All values tied

     return (sumX2 + sumY2 - sumD2) / (2 * Math.sqrt(sumX2 * sumY2));
   }
   ```

3. Implement the tie correction helper:
   ```typescript
   function computeTieCorrection(ranks: readonly number[]): number {
     // Count tie groups: for each group of t tied ranks, correction = (t³ - t) / 12
     const counts = new Map<number, number>();
     for (const r of ranks) {
       counts.set(r, (counts.get(r) ?? 0) + 1);
     }
     let correction = 0;
     for (const t of counts.values()) {
       if (t > 1) {
         correction += (t * t * t - t) / 12;
       }
     }
     return correction;
   }
   ```

**Files**: `apps/api/src/domain/scoring/spearman-correlation.ts` (new)

**Notes**:

- Return `null` (not 0) when ρ is undefined (n < 2, all tied). This lets callers distinguish "no correlation data" from "zero correlation."
- The corrected formula handles ties properly. The simple formula (1 - 6Σd²/(n(n²-1))) is a special case when there are no ties.

---

### Subtask T020 – 100% test coverage for Spearman correlation

**Purpose**: Constitution requires 100% coverage on scoring logic. Spearman is scoring-adjacent.

**Steps**:

1. Create `apps/api/src/domain/scoring/__tests__/spearman-correlation.spec.ts`
2. Test cases:

   **Happy path — no ties**:
   - Perfect positive correlation: `[100, 80, 60]` vs `[100, 80, 60]` → ρ = 1.0
   - Perfect negative correlation: `[100, 80, 60]` vs `[60, 80, 100]` → ρ = -1.0
   - Known moderate correlation: use a hand-computed example, verify ρ to 4 decimal places

   **Ties**:
   - Two tied values in predicted: `[100, 100, 60]` vs `[90, 80, 70]` → verify correct ρ
   - All tied in one array: `[50, 50, 50]` vs `[100, 80, 60]` → ρ = null
   - Ties in both arrays: verify corrected formula produces valid ρ

   **Edge cases**:
   - n = 0: returns null
   - n = 1: returns null
   - n = 2: `[10, 20]` vs `[10, 20]` → ρ = 1.0; `[10, 20]` vs `[20, 10]` → ρ = -1.0
   - Mismatched array lengths: throws Error
   - Large n (100 items): verify computation completes and ρ ∈ [-1, 1]
   - All zeros in one array: `[0, 0, 0]` vs `[1, 2, 3]` → ρ = null (all tied)

   **Numerical stability**:
   - Very close values: `[1.0001, 1.0002, 1.0003]` vs `[3, 2, 1]` → ρ = -1.0

3. Verify coverage report shows 100% lines and branches for `spearman-correlation.ts`.

**Files**: `apps/api/src/domain/scoring/__tests__/spearman-correlation.spec.ts` (new)

**Notes**: Use `toBeCloseTo(expected, 4)` for floating-point comparisons. Pre-compute expected values by hand or with a known-good reference (e.g., Python's `scipy.stats.spearmanr`).

---

### Subtask T021 – Create `BenchmarkResult` interface

**Purpose**: Value object representing the output of a single-race benchmark comparison.

**Steps**:

1. Create directory: `apps/api/src/domain/benchmark/`
2. Create `apps/api/src/domain/benchmark/benchmark-result.ts`:

   ```typescript
   import { RaceType } from '../shared/race-type.enum';

   export interface RiderBenchmarkEntry {
     readonly riderId: string;
     readonly riderName: string;
     readonly predictedPts: number;
     readonly actualPts: number;
     readonly predictedRank: number;
     readonly actualRank: number;
   }

   export interface BenchmarkResult {
     readonly raceSlug: string;
     readonly raceName: string;
     readonly year: number;
     readonly raceType: RaceType;
     readonly riderResults: ReadonlyArray<RiderBenchmarkEntry>;
     readonly spearmanRho: number | null;
     readonly riderCount: number;
   }
   ```

**Files**: `apps/api/src/domain/benchmark/benchmark-result.ts` (new)

**Notes**: Plain `readonly` interface — no class, no factory methods, no persistence. Created inline in the use case.

---

### Subtask T022 – Create `BenchmarkSuiteResult` interface

**Purpose**: Aggregation of multiple single-race benchmarks.

**Steps**:

1. In the same file (`benchmark-result.ts`), add:
   ```typescript
   export interface BenchmarkSuiteResult {
     readonly races: ReadonlyArray<BenchmarkResult>;
     readonly meanSpearmanRho: number | null;
     readonly raceCount: number;
   }
   ```

**Files**: `apps/api/src/domain/benchmark/benchmark-result.ts`

**Notes**: `meanSpearmanRho` is the arithmetic mean of per-race ρ values, excluding races where ρ is null.

---

### Subtask T023 – Utility: `computeRankings` helper

**Purpose**: Assign ranks to a scores array, handling ties with the average rank method. Used by both Spearman and benchmark display.

**Steps**:

1. In `spearman-correlation.ts`, export the ranking function:

   ```typescript
   /**
    * Assigns ranks to scores (highest score = rank 1).
    * Ties are resolved with average rank method.
    *
    * Example: [100, 80, 80, 60] → [1, 2.5, 2.5, 4]
    */
   export function computeRankings(scores: readonly number[]): number[] {
     const n = scores.length;
     // Create index-score pairs, sort descending by score
     const indexed = scores.map((score, i) => ({ score, index: i }));
     indexed.sort((a, b) => b.score - a.score);

     const ranks = new Array<number>(n);
     let i = 0;
     while (i < n) {
       let j = i;
       // Find all items with the same score (tie group)
       while (j < n && indexed[j].score === indexed[i].score) {
         j++;
       }
       // Average rank for the tie group: positions i+1 through j
       const avgRank = (i + 1 + j) / 2;
       for (let k = i; k < j; k++) {
         ranks[indexed[k].index] = avgRank;
       }
       i = j;
     }
     return ranks;
   }
   ```

2. Add tests for `computeRankings`:
   - No ties: `[100, 80, 60]` → `[1, 2, 3]`
   - Ties: `[100, 80, 80, 60]` → `[1, 2.5, 2.5, 4]`
   - All tied: `[50, 50, 50]` → `[2, 2, 2]`
   - Single item: `[100]` → `[1]`
   - Empty: `[]` → `[]`
   - Descending order: `[60, 80, 100]` → `[3, 2, 1]`

**Files**: `apps/api/src/domain/scoring/spearman-correlation.ts` (add to same file)

---

## Risks & Mitigations

- **Floating point precision**: Spearman ρ involves division and square roots. Use `toBeCloseTo` in tests and be aware of IEEE 754 edge cases. The formula is numerically stable for n < 10,000.
- **All-tied edge case**: When all items have the same score, Σx² = 0 and division by zero occurs. Handle by returning `null`.
- **Large datasets**: For 200 riders (typical startlist), sorting and ranking is O(n log n) — negligible performance concern.

## Review Guidance

- Verify 100% branch and line coverage on `spearman-correlation.ts`.
- Verify `computeRankings` uses highest-score-first ranking (rank 1 = best).
- Verify tie correction formula is mathematically correct.
- Verify `null` return on undefined correlation (not 0 or NaN).
- Verify interfaces use `readonly` and `ReadonlyArray`.
- No `any` types. No NestJS decorators in domain code.

## Activity Log

- 2026-03-19T18:18:14Z – system – lane=planned – Prompt created.
- 2026-03-19T18:45:42Z – claude-opus – shell_pid=16093 – lane=doing – Assigned agent via workflow command
