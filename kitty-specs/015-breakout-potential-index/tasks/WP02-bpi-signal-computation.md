---
work_package_id: WP02
title: BPI Domain Service — Signal Computation
lane: planned
dependencies: [WP01]
subtasks:
  - T004
  - T005
  - T006
  - T007
  - T008
  - T009
  - T010
phase: Phase 0 - Foundation
assignee: ''
agent: ''
shell_pid: ''
review_status: ''
reviewed_by: ''
history:
  - timestamp: '2026-04-01T17:57:39Z'
    lane: planned
    agent: system
    shell_pid: ''
    action: Prompt generated via /spec-kitty.tasks
requirement_refs:
  - FR-001
  - FR-007
---

# Work Package Prompt: WP02 – BPI Domain Service — Signal Computation

## Objectives & Success Criteria

- Create the `domain/breakout/` module with pure signal computation functions
- Implement all 5 BPI signals: trajectory, recency, ceiling, route fit, variance
- Implement the composite index calculation (sum + clamp)
- **Success**: Each signal returns correct scores for known inputs. All functions are pure (no side effects, no I/O, no DI).

## Context & Constraints

- **Spec**: `kitty-specs/015-breakout-potential-index/spec.md` (Signal Definitions section)
- **Plan**: `kitty-specs/015-breakout-potential-index/plan.md` (AD-1: BPI as Isolated Domain Module)
- **Constitution**: Domain logic must not depend on NestJS. Pure functions only. TypeScript strict mode.
- **Architecture**: This module lives at `apps/api/src/domain/breakout/` alongside existing domain modules (scoring, matching, optimizer).
- **Key constraint**: FR-007 — BPI computation MUST be a pure function with no side effects, no database calls, no external service dependencies.

## Implementation Command

```bash
spec-kitty implement WP02 --base WP01
```

## Subtasks & Detailed Guidance

### Subtask T004 – Create breakout module types

**Purpose**: Define the input shape for BPI computation, internal to the domain module.

**Steps**:

1. Create `apps/api/src/domain/breakout/breakout.types.ts`
2. Define the `ComputeBreakoutInput` interface:

   ```typescript
   import type {
     SeasonBreakdown,
     CategoryScores,
     ProfileSummary,
     BreakoutResult,
   } from '@cycling-analyzer/shared-types';

   export interface ComputeBreakoutInput {
     readonly seasonBreakdown: readonly SeasonBreakdown[];
     readonly prediction: number; // mlPredictedScore ?? totalProjectedPts ?? 0
     readonly priceHillios: number;
     readonly birthDate: Date | null; // null → default age 28
     readonly profileSummary?: ProfileSummary;
     readonly medianPtsPerHillio: number;
     readonly categoryScores: CategoryScores | null;
   }
   ```

3. Export the interface. Also re-export `BreakoutResult` for convenience.

**Files**:

- `apps/api/src/domain/breakout/breakout.types.ts` (new)

**Notes**:

- Check the exact import path for `SeasonBreakdown`, `CategoryScores`, `ProfileSummary` from shared-types. They may be in `api.ts` or separate files.
- Use `readonly` arrays to enforce immutability.

### Subtask T005 – Implement trajectory signal (0-25)

**Purpose**: Measure career trajectory — are season totals going up? Young riders get a bonus multiplier.

**Steps**:

1. In `apps/api/src/domain/breakout/breakout.service.ts`, implement:
   ```typescript
   export function computeTrajectory(
     seasons: readonly SeasonBreakdown[],
     birthDate: Date | null,
   ): number;
   ```
2. **Linear regression**: Compute the slope of `(year, total)` pairs using ordinary least squares:
   ```
   slope = (n * Σ(x*y) - Σx * Σy) / (n * Σ(x²) - (Σx)²)
   ```
   Where x = year, y = season total. If n < 2, return 0.
3. **Age factor**: Calculate age from birthDate (default 28 if null):
   - age < 25: factor = 1.5
   - 25-27: factor = 1.0
   - 28-31: factor = 0.5
   - 32+: factor = 0.2
4. **Score**: `Math.min(25, Math.max(0, slope * ageFactor))`
5. Normalize: The raw `slope * ageFactor` needs scaling to fit 0-25. A slope of ~15-20 pts/year with factor 1.5 should score near the max. Use: `Math.min(25, Math.max(0, (slope * ageFactor) / 1.0))` — i.e., 1 point of score per 1 unit of slope×factor, capped at 25.

**Files**:

- `apps/api/src/domain/breakout/breakout.service.ts` (new)

**Parallel?**: Yes — independent from T006-T009.

**Notes**:

- Seasons may not be in chronological order — sort by year before regression.
- With exactly 1 season, slope is undefined → return 0 (intentional: can't measure trajectory from a single point).

### Subtask T006 – Implement recency burst signal (0-25)

**Purpose**: Detect riders having a breakout current season compared to their history.

**Steps**:

1. Implement:
   ```typescript
   export function computeRecencyBurst(seasons: readonly SeasonBreakdown[]): number;
   ```
2. **Logic**:
   - Find the most recent season (highest year). This is the "current" season.
   - If current season total <= 20: return 0 (too early in season to signal).
   - Compute average of all other seasons' totals.
   - If no other seasons (only 1 season total): return 0.
   - If average of others is 0: return 25 (any positive current season is max burst).
   - Ratio = currentTotal / avgOthers.
   - Score = `Math.min(25, Math.max(0, (ratio - 1) * 25))` — a ratio of 2.0 (2× historical) scores 25.

**Files**:

- `apps/api/src/domain/breakout/breakout.service.ts` (modify — add function)

**Parallel?**: Yes — independent signal.

**Notes**:

- The spec says "current season total > 2× average" triggers HOT_STREAK flag. The signal is the continuous version of that binary condition.
- Edge case: rider with only 1 season and total > 20 → no "others" to compare against → return 0.

### Subtask T007 – Implement ceiling gap signal (0-20)

**Purpose**: Identify riders whose historical peak far exceeds their current prediction — they've proven they can perform at a much higher level.

**Steps**:

1. Implement:
   ```typescript
   export function computeCeilingGap(
     seasons: readonly SeasonBreakdown[],
     prediction: number,
     birthDate: Date | null,
   ): number;
   ```
2. **Logic**:
   - Calculate age (default 28 if null). If age > 33: return 0 (veteran filter).
   - Find peak season total: `Math.max(...seasons.map(s => s.total))`. If no seasons: return 0.
   - If prediction <= 0: return 0 (avoid division by zero and false positives for unscored riders).
   - Ratio = peakTotal / prediction.
   - Score = `Math.min(20, Math.max(0, (ratio - 1) * 5))` — a ratio of 5× scores 20.

**Files**:

- `apps/api/src/domain/breakout/breakout.service.ts` (modify)

**Parallel?**: Yes — independent signal.

**Notes**:

- The age gate at 33 prevents flagging veterans on a permanent decline as "ceiling plays".
- The spec says CEILING_PLAY flag requires peak > 5× prediction AND age < 30. The signal is more generous (up to age 33) but the flag has its own stricter condition.

### Subtask T008 – Implement route fit signal (0-15)

**Purpose**: Measure how well the rider's category profile matches the race's terrain profile.

**Steps**:

1. Implement:
   ```typescript
   export function computeRouteFit(
     categoryScores: CategoryScores | null,
     profileSummary?: ProfileSummary,
   ): number;
   ```
2. **Logic**:
   - If `profileSummary` is undefined/null OR `categoryScores` is null: return 0.
   - Compute rider's category profile as proportions: for each category (gc, stage, mountain, sprint), divide by the total. If total is 0, return 0.
   - Compute dot product of rider profile vector and race profile vector.
   - The `ProfileSummary` should have proportions for stage types (flat, mountain, hilly, TT). Map these to the rider categories:
     - flat → sprint affinity
     - mountain → mountain affinity (and gc for grand tours)
     - hilly → stage affinity
     - TT → gc affinity
   - Score = `Math.min(15, Math.max(0, dotProduct * 15))` — perfect alignment (dot product ~1.0) scores 15.

**Files**:

- `apps/api/src/domain/breakout/breakout.service.ts` (modify)

**Parallel?**: Yes — independent signal.

**Notes**:

- Check the exact shape of `ProfileSummary` in shared-types. It likely has fields like `flatPercentage`, `mountainPercentage`, etc.
- The mapping from race profile to rider affinity is an approximation — the key insight is that a sprinter benefits from flat stages and a climber benefits from mountain stages.

### Subtask T009 – Implement variance signal (0-15)

**Purpose**: High season-to-season variance indicates unpredictability — upside potential for a breakout.

**Steps**:

1. Implement:
   ```typescript
   export function computeVariance(seasons: readonly SeasonBreakdown[]): number;
   ```
2. **Logic**:
   - Filter to non-zero season totals. If fewer than 2: return 7.5 (midpoint default — data scarcity means moderate uncertainty).
   - Compute coefficient of variation: `stdDev / mean`.
   - Score = `Math.min(15, Math.max(0, cv * 15))` — a CV of 1.0 (std equals mean) scores 15.

**Files**:

- `apps/api/src/domain/breakout/breakout.service.ts` (modify)

**Parallel?**: Yes — independent signal.

**Notes**:

- Standard deviation: use population stddev (divide by n, not n-1) since we have the full history, not a sample.
- CV can exceed 1.0 for highly variable riders — the `Math.min(15, ...)` clamp handles this.

### Subtask T010 – Compose BPI index from signals

**Purpose**: Sum the 5 signal scores into a single 0-100 composite index.

**Steps**:

1. Implement:
   ```typescript
   export function computeBpiIndex(signals: BreakoutSignals): number;
   ```
2. **Logic**:
   ```typescript
   const raw =
     signals.trajectory + signals.recency + signals.ceiling + signals.routeFit + signals.variance;
   return Math.min(100, Math.max(0, Math.round(raw)));
   ```
3. Create an `index.ts` barrel export for the module:
   ```typescript
   // apps/api/src/domain/breakout/index.ts
   export { computeBreakout } from './breakout.service';
   export type { ComputeBreakoutInput } from './breakout.types';
   ```
   Note: `computeBreakout` will be implemented in WP03. For now, export the signal functions.

**Files**:

- `apps/api/src/domain/breakout/breakout.service.ts` (modify)
- `apps/api/src/domain/breakout/index.ts` (new)

**Parallel?**: No — depends on T005-T009 (needs signal types established).

**Notes**:

- The theoretical max is 25+25+20+15+15 = 100. In practice, scoring near 100 requires extreme values across all dimensions — this is intentional.
- Round to integer for cleaner display.

## Risks & Mitigations

- **Linear regression edge cases**: Tested with 0, 1, 2, and many seasons. 0-1 seasons return 0 for trajectory.
- **Division by zero**: Every signal guards against zero denominators explicitly.
- **Import paths**: Verify `@cycling-analyzer/shared-types` exports `SeasonBreakdown`, `CategoryScores`, `ProfileSummary` — may need to check `packages/shared-types/src/index.ts` barrel.

## Review Guidance

- Verify each signal returns values within its declared range (trajectory 0-25, recency 0-25, ceiling 0-20, routeFit 0-15, variance 0-15).
- Verify all functions are pure — no `this`, no imports of NestJS modules, no I/O.
- Verify age calculation uses `Date` arithmetic correctly (beware timezone issues — use UTC).
- Verify the module has no dependency on any other domain module (isolated).

## Activity Log

- 2026-04-01T17:57:39Z – system – lane=planned – Prompt created.
