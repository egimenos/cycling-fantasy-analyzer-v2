---
work_package_id: WP03
title: BPI Domain Service — P80, Flags & Integration
lane: planned
dependencies: [WP02]
subtasks:
  - T011
  - T012
  - T013
  - T014
  - T015
  - T016
phase: Phase 1 - Backend
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
  - FR-002
  - FR-003
  - FR-005
  - FR-006
  - FR-007
---

# Work Package Prompt: WP03 – BPI Domain Service — P80, Flags & Integration

## Objectives & Success Criteria

- Implement upside P80 computation (bootstrap ≥3 seasons, heuristic <3)
- Implement breakout flag evaluation (6 flags with explicit boolean conditions)
- Compose the top-level `computeBreakout()` function
- Write unit tests achieving 100% line coverage for the entire `domain/breakout/` module
- Wire `computeBreakout()` into the analyze use case
- **Success**: POST `/api/analyze` returns `breakout` field for matched riders. `jest --coverage --testPathPattern=breakout` shows 100% coverage.

## Context & Constraints

- **Spec**: `kitty-specs/015-breakout-potential-index/spec.md` (Flag Conditions + Acceptance Scenarios)
- **Plan**: `kitty-specs/015-breakout-potential-index/plan.md` (AD-2: Upside P80 Hybrid Strategy)
- **Constitution**: Scoring logic requires 100% test coverage. Domain logic must be framework-free.
- **Key constraint**: FR-005 — MUST NOT modify existing scoring logic, sort order, or any existing AnalyzedRider fields.

## Implementation Command

```bash
spec-kitty implement WP03 --base WP02
```

## Subtasks & Detailed Guidance

### Subtask T011 – Implement upside P80 computation

**Purpose**: Compute an optimistic (80th percentile) points estimate for the rider's potential performance.

**Steps**:

1. In `apps/api/src/domain/breakout/breakout.service.ts`, implement:
   ```typescript
   export function computeUpsideP80(
     seasons: readonly SeasonBreakdown[],
     prediction: number,
   ): number;
   ```
2. **Bootstrap path (≥3 seasons)**:
   - Extract season totals array.
   - Apply temporal weights: most recent season weight 1.0, second 0.75, third and older 0.5.
   - Run 1000 bootstrap iterations:
     - For each iteration, sample `n` values from the weighted pool (with replacement).
     - Compute the weighted mean of the sample.
   - Sort the 1000 means, take the value at index 800 (80th percentile).
   - Use a seeded PRNG for reproducibility — implement a simple linear congruential generator or use a deterministic seed derived from the rider's data (e.g., sum of season totals).
3. **Heuristic path (<3 seasons)**:
   - Return `Math.round(prediction * 1.8)`.
   - If prediction is 0, return 0.
4. Return `Math.round(result)` (integer points).

**Files**:

- `apps/api/src/domain/breakout/breakout.service.ts` (modify)

**Parallel?**: Yes — independent from T012.

**Notes**:

- The seeded PRNG is critical for test determinism. A simple LCG: `seed = (seed * 1664525 + 1013904223) & 0xFFFFFFFF; return seed / 0xFFFFFFFF;`
- Weighted sampling: create a pool where recent seasons appear more often. E.g., weight 1.0 → 4 copies, 0.75 → 3 copies, 0.5 → 2 copies.
- If all season totals are 0: return 0 regardless of path.

### Subtask T012 – Implement flag evaluation

**Purpose**: Assign interpretable breakout flags based on explicit boolean conditions from the spec.

**Steps**:

1. Implement:
   ```typescript
   export function evaluateFlags(input: ComputeBreakoutInput): BreakoutFlag[];
   ```
2. **Flag conditions** (evaluate each independently, accumulate):

   ```typescript
   const flags: BreakoutFlag[] = [];
   const age = computeAge(input.birthDate); // helper, default 28
   const seasons = input.seasonBreakdown;
   const currentSeason =
     seasons.length > 0 ? seasons.reduce((a, b) => (a.year > b.year ? a : b)) : null;
   const otherSeasons = currentSeason ? seasons.filter((s) => s.year !== currentSeason.year) : [];
   const avgOthers =
     otherSeasons.length > 0
       ? otherSeasons.reduce((sum, s) => sum + s.total, 0) / otherSeasons.length
       : 0;
   const peakTotal = seasons.length > 0 ? Math.max(...seasons.map((s) => s.total)) : 0;
   const totalPts = input.categoryScores
     ? input.categoryScores.gc +
       input.categoryScores.stage +
       input.categoryScores.mountain +
       input.categoryScores.sprint
     : 0;

   // EMERGING_TALENT: age < 25 AND seasonsUsed <= 3 AND trajectory slope > 30
   if (age < 25 && seasons.length <= 3) {
     const slope = computeRawSlope(seasons); // extract slope calc
     if (slope > 30) flags.push(BreakoutFlag.EmergingTalent);
   }

   // HOT_STREAK: current season > 2× avg of others
   if (currentSeason && otherSeasons.length > 0 && currentSeason.total > 2 * avgOthers) {
     flags.push(BreakoutFlag.HotStreak);
   }

   // DEEP_VALUE: price <= 100 AND ptsPerHillio > median
   const ptsPerHillio = input.priceHillios > 0 ? input.prediction / input.priceHillios : 0;
   if (input.priceHillios <= 100 && ptsPerHillio > input.medianPtsPerHillio) {
     flags.push(BreakoutFlag.DeepValue);
   }

   // CEILING_PLAY: peak > 5× prediction AND age < 30
   if (peakTotal > 5 * input.prediction && age < 30 && input.prediction > 0) {
     flags.push(BreakoutFlag.CeilingPlay);
   }

   // SPRINT_OPPORTUNITY: price <= 125 AND sprint+stage % > 15% AND flat % > 35%
   if (input.priceHillios <= 125 && input.profileSummary && totalPts > 0) {
     const sprintStageRatio =
       (input.categoryScores!.sprint + input.categoryScores!.stage) / totalPts;
     const flatPct = input.profileSummary.flatPercentage ?? 0; // check actual field name
     if (sprintStageRatio > 0.15 && flatPct > 0.35) {
       flags.push(BreakoutFlag.SprintOpportunity);
     }
   }

   // BREAKAWAY_HUNTER: price <= 100 AND mountain % > 10%
   if (input.priceHillios <= 100 && totalPts > 0 && input.categoryScores) {
     const mtnRatio = input.categoryScores.mountain / totalPts;
     if (mtnRatio > 0.1) flags.push(BreakoutFlag.BreakawayHunter);
   }

   return flags;
   ```

**Files**:

- `apps/api/src/domain/breakout/breakout.service.ts` (modify)

**Parallel?**: Yes — independent from T011.

**Notes**:

- Extract a `computeAge(birthDate: Date | null): number` helper (used by both signals and flags).
- Extract `computeRawSlope(seasons)` if not already factored out from T005 — the flag needs the raw slope value, not the age-adjusted signal score.
- Check the exact field names in `ProfileSummary` — may be `flatPercentage`, `flat`, `flatStages`, etc. Read `packages/shared-types/src/api.ts` to verify.
- The CEILING_PLAY guard `input.prediction > 0` prevents false positives when prediction is 0 (5× 0 = 0, any peak would trigger).

### Subtask T013 – Compose computeBreakout()

**Purpose**: Orchestrate all signals, P80, and flags into a single `BreakoutResult`.

**Steps**:

1. Implement:

   ```typescript
   export function computeBreakout(input: ComputeBreakoutInput): BreakoutResult {
     const signals: BreakoutSignals = {
       trajectory: computeTrajectory(input.seasonBreakdown, input.birthDate),
       recency: computeRecencyBurst(input.seasonBreakdown),
       ceiling: computeCeilingGap(input.seasonBreakdown, input.prediction, input.birthDate),
       routeFit: computeRouteFit(input.categoryScores, input.profileSummary),
       variance: computeVariance(input.seasonBreakdown),
     };

     return {
       index: computeBpiIndex(signals),
       upsideP80: computeUpsideP80(input.seasonBreakdown, input.prediction),
       flags: evaluateFlags(input),
       signals,
     };
   }
   ```

2. Update `apps/api/src/domain/breakout/index.ts` to export `computeBreakout` and `ComputeBreakoutInput`.

**Files**:

- `apps/api/src/domain/breakout/breakout.service.ts` (modify)
- `apps/api/src/domain/breakout/index.ts` (modify)

**Parallel?**: No — depends on T011 + T012.

### Subtask T014 – Unit tests (100% coverage)

**Purpose**: Achieve 100% line coverage for all functions in `domain/breakout/` as required by the constitution for scoring logic.

**Steps**:

1. Create `apps/api/src/domain/breakout/__tests__/breakout.service.spec.ts`
2. **Test each signal function independently**:
   - Trajectory: 0 seasons (→0), 1 season (→0), ascending seasons + young rider, descending seasons, age brackets
   - Recency: current season ≤20 (→0), 2× burst, 1 season only, 0 avg others
   - Ceiling: age >33 (→0), high peak vs low prediction, no seasons, prediction 0
   - Route fit: no profileSummary (→0), no categoryScores (→0), perfect alignment, zero total
   - Variance: <2 non-zero seasons (→7.5), high CV, low CV, all zeros
3. **Test P80**:
   - ≥3 seasons: verify P80 > mean (optimistic). Use deterministic seed and assert specific value.
   - <3 seasons: verify P80 = prediction × 1.8
   - 0 prediction with <3 seasons: P80 = 0
4. **Test flags**: One test per flag verifying trigger and non-trigger conditions:
   - EMERGING_TALENT: age 23, 2 seasons, slope > 30 → triggers. Age 26 → does not.
   - HOT_STREAK: current 2.5× avg → triggers. current 1.5× → does not.
   - DEEP_VALUE: price 80, ptsPerHillio above median → triggers. Price 150 → does not.
   - CEILING_PLAY: peak 600, prediction 100, age 25 → triggers. Age 31 → does not.
   - SPRINT_OPPORTUNITY: price 100, sprint+stage 20%, flat 40% → triggers. No profileSummary → does not.
   - BREAKAWAY_HUNTER: price 80, mountain 15% → triggers. Price 120 → does not.
5. **Test computeBreakout() composition**: Verify it returns all fields with correct types.
6. **Edge cases**: null birthDate (defaults to age 28), empty seasonBreakdown, all-zero seasons.

**Files**:

- `apps/api/src/domain/breakout/__tests__/breakout.service.spec.ts` (new)

**Parallel?**: No — depends on T013 (all functions must exist).

**Notes**:

- Use Jest's `describe` blocks organized by function name.
- For bootstrap tests, the seeded PRNG should produce deterministic results — assert exact P80 values.
- Run: `cd apps/api && npx jest --coverage --testPathPattern=breakout`

### Subtask T015 – Integrate into analyze use case

**Purpose**: Call `computeBreakout()` for each matched rider in the analyze flow, after ML enrichment and before sorting.

**Steps**:

1. Open `apps/api/src/application/analyze/analyze-price-list.use-case.ts`
2. Import `computeBreakout` and `ComputeBreakoutInput` from `../../domain/breakout`
3. After the ML enrichment loop (the section that assigns `mlPredictedScore` and `mlBreakdown`), add a new step:

   ```typescript
   // Step 5.5: Compute Breakout Potential Index
   const medianPph = computeMedianPtsPerHillio(analyzedRiders);

   for (const rider of analyzedRiders) {
     if (rider.unmatched || !rider.matchedRider) {
       rider.breakout = null;
       continue;
     }

     rider.breakout = computeBreakout({
       seasonBreakdown: rider.seasonBreakdown ?? [],
       prediction: rider.mlPredictedScore ?? rider.totalProjectedPts ?? 0,
       priceHillios: rider.priceHillios,
       birthDate: matchedRiderBirthDates.get(rider.matchedRider.id) ?? null,
       profileSummary: request.profileSummary,
       medianPtsPerHillio: medianPph,
       categoryScores: rider.categoryScores,
     });
   }
   ```

4. The `birthDate` needs to come from the matched rider entity. The use case already loads riders — find where `Rider` entities are loaded and extract `birthDate` into a `Map<string, Date | null>` for lookup.

**Files**:

- `apps/api/src/application/analyze/analyze-price-list.use-case.ts` (modify)

**Parallel?**: No — depends on T013.

**Notes**:

- The `analyzedRiders` array may be built incrementally. Find the right insertion point — after all scoring and ML enrichment is complete, before the final sort.
- Do NOT change the sort order or any existing fields (FR-005).
- The `AnalyzedRider` type in the use case may need casting or the interface needs to include `breakout` (should be done in WP01's T001).

### Subtask T016 – Compute medianPtsPerHillio

**Purpose**: Provide the median points-per-hillio across all riders in the list, needed for the DEEP_VALUE flag.

**Steps**:

1. Implement a helper function (can be in the use case file or in the breakout module):

   ```typescript
   function computeMedianPtsPerHillio(riders: AnalyzedRider[]): number {
     const values = riders
       .filter((r) => r.pointsPerHillio != null && r.pointsPerHillio > 0)
       .map((r) => r.pointsPerHillio!)
       .sort((a, b) => a - b);

     if (values.length === 0) return 0;
     const mid = Math.floor(values.length / 2);
     return values.length % 2 === 0 ? (values[mid - 1] + values[mid]) / 2 : values[mid];
   }
   ```

2. Call this before the BPI computation loop in T015.

**Files**:

- `apps/api/src/application/analyze/analyze-price-list.use-case.ts` (modify) or `apps/api/src/domain/breakout/breakout.service.ts` (if you prefer to keep it in the domain)

**Parallel?**: No — part of the integration step.

**Notes**:

- Place the helper in the domain module if you want it testable independently. Place it in the use case if it's a simple utility.
- Filter out null/zero values to avoid skewing the median.

## Risks & Mitigations

- **Bootstrap non-determinism in tests**: Use a seeded PRNG. Tests assert exact values for known seeds.
- **Use case modification**: The integration is purely additive — a new step after existing steps. No existing code changes. Run the full test suite to verify no regressions.
- **Performance**: 1000 bootstrap iterations × 200 riders = 200K iterations. Each is a simple array operation. Well within the 50ms budget.

## Review Guidance

- Verify 100% line coverage for `domain/breakout/` — run `jest --coverage`.
- Verify each flag condition matches the spec exactly (thresholds, age gates, price limits).
- Verify the use case does not modify existing fields or sort order.
- Verify unmatched riders get `breakout: null`.
- Verify the P80 heuristic path returns `prediction × 1.8` for <3 seasons.
- Spot check: manually compute BPI for a known rider scenario and verify the function output matches.

## Activity Log

- 2026-04-01T17:57:39Z – system – lane=planned – Prompt created.
