---
work_package_id: WP02
title: Scoring Algorithm Integration
lane: planned
dependencies: [WP01]
subtasks:
  - T007
  - T008
  - T009
  - T010
  - T011
  - T012
phase: Phase 1 - Core Implementation
assignee: ''
agent: ''
shell_pid: ''
review_status: ''
reviewed_by: ''
history:
  - timestamp: '2026-03-19T17:20:12Z'
    lane: planned
    agent: system
    shell_pid: ''
    action: Prompt generated via /spec-kitty.tasks
requirement_refs:
  - FR-001
  - FR-003
  - FR-008
  - FR-009
  - FR-010
---

# Work Package Prompt: WP02 – Scoring Algorithm Integration

## IMPORTANT: Review Feedback Status

**Read this first if you are implementing this task!**

- **Has review feedback?**: Check the `review_status` field above. If it says `has_feedback`, scroll to the **Review Feedback** section immediately.
- **You must address all feedback** before your work is complete.
- **Mark as acknowledged**: When you understand the feedback, update `review_status: acknowledged`.

---

## Review Feedback

_[This section is empty initially. Reviewers will populate it if the work is returned from review.]_

---

## Implementation Command

```bash
spec-kitty implement WP02 --base WP01
```

Depends on WP01 — branches from WP01's completed state.

---

## Objectives & Success Criteria

- Wire `computeProfileWeight()` (from WP01) into the existing scoring functions as a 4th multiplicative weight factor.
- Update `computeStageScore()`, `computeCategoryScore()`, `computeRiderScore()`, and the `ScoringService` class.
- Achieve 100% test coverage on all modified scoring functions.
- Verify backward compatibility: scoring without profile distribution produces identical output to the pre-change algorithm.

---

## Context & Constraints

- **Architecture**: All changes in `apps/api/src/domain/scoring/scoring.service.ts`. This file contains pure functions — no framework deps.
- **Constitution**: 100% scoring test coverage. ADR required (handled in WP03).
- **Spec**: FR-001 (accept profile distribution), FR-003 (multiplicative factor), FR-008 (Mountain affinity), FR-009 (Sprint affinity), FR-010 (GC neutral).
- **Research**: R1 (normalized proportional), R3 (category affinity mapping).
- **WP01 delivers**: `ProfileDistribution`, `computeProfileWeight()`, `computeCategoryProfileWeight()`, config constants.
- **Existing code to modify**:
  - `apps/api/src/domain/scoring/scoring.service.ts` — functions: `computeStageScore()`, `computeCategoryScore()`, `computeRiderScore()`, `ScoringService` class.
  - `apps/api/src/domain/scoring/scoring.service.spec.ts` — existing tests to extend.

### Current Function Signatures (to be updated)

```typescript
// Current:
export function computeCategoryScore(
  results: RaceResult[],
  raceType: RaceType,
  category: ResultCategory,
  currentSeason: number,
): number;

export function computeStageScore(
  stageResults: RaceResult[],
  raceType: RaceType,
  currentSeason: number,
): number;

export function computeRiderScore(
  results: RaceResult[],
  raceType: RaceType,
  currentSeason: number,
): RiderScore;
```

---

## Subtasks & Detailed Guidance

### Subtask T007 – Update computeStageScore() with Profile Weight

- **Purpose**: Apply per-result profile weight to stage score computation.
- **File**: `apps/api/src/domain/scoring/scoring.service.ts` (MODIFY)
- **Steps**:
  1. Add optional parameter to the function signature:
     ```typescript
     export function computeStageScore(
       stageResults: RaceResult[],
       raceType: RaceType,
       currentSeason: number,
       profileDistribution?: ProfileDistribution,
     ): number;
     ```
  2. Inside the per-result loop, after computing `points`, `temporalWeight`, `crossTypeWeight`, and `raceClassWeight`, compute the profile weight:

     ```typescript
     import { computeProfileWeight } from './profile-weight';

     // Inside the loop for each result:
     const profileWeight = computeProfileWeight(
       result.parcoursType,
       result.isItt,
       result.isTtt,
       profileDistribution ?? null,
     );
     ```

  3. Multiply it into the contribution:
     ```typescript
     // Before (existing):
     contribution = stagePointsInRace × temporalWeight × crossTypeWeight × raceClassWeight
     // After:
     contribution = stagePointsInRace × temporalWeight × crossTypeWeight × raceClassWeight × profileWeight
     ```
     **IMPORTANT**: The current algorithm groups stages by race and sums points per race before applying weights. The profile weight should be applied per-result (before summing within a race) because each stage has a different parcoursType. This changes the computation order:
     ```typescript
     // Current: sum stage points per race, then apply weights
     // New: apply profile weight per stage, then sum per race, then apply other weights
     // OR: apply all weights per stage, then sum per race
     ```
     Choose the per-stage approach: each stage result gets `points × profileWeight`, then these are summed per race, then `× temporalWeight × crossTypeWeight × raceClassWeight`.

- **Edge cases**:
  - `profileDistribution` is undefined → `computeProfileWeight()` receives null → returns 1.0. No change in behavior.
  - Stage result with null `parcoursType` → weight 1.0 (FR-005).

### Subtask T008 – Update computeCategoryScore() for Mountain/Sprint/GC Affinity

- **Purpose**: Apply profile weight to non-stage category scores using affinity mapping.
- **File**: `apps/api/src/domain/scoring/scoring.service.ts` (MODIFY)
- **Steps**:
  1. Add optional parameter:
     ```typescript
     export function computeCategoryScore(
       results: RaceResult[],
       raceType: RaceType,
       category: ResultCategory,
       currentSeason: number,
       profileDistribution?: ProfileDistribution,
     ): number;
     ```
  2. Compute the category's profile weight (same for all results in this category):

     ```typescript
     import { computeCategoryProfileWeight } from './profile-weight';
     import { getCategoryAffinity } from './scoring-weights.config';

     const affinity = getCategoryAffinity(category);
     const categoryProfileWeight = affinity
       ? computeCategoryProfileWeight(affinity, profileDistribution ?? null)
       : 1.0; // GC or STAGE → neutral
     ```

  3. Apply as multiplicative factor in the weighted sum:
     ```typescript
     weightedSum = Σ(points × temporalWeight × crossTypeWeight × raceClassWeight × categoryProfileWeight)
     ```
     Note: Unlike stage scores, the profile weight here is the same for all results in the category (Mountain always maps to P4/P5 affinity regardless of individual result). This is simpler.

- **Behavior by category**:
  - `MOUNTAIN` → uses `computeCategoryProfileWeight([P4, P5], distribution)`.
  - `SPRINT` → uses `computeCategoryProfileWeight([P1, P2], distribution)`.
  - `GC` → affinity is null → weight is 1.0 (FR-010).
  - `STAGE` → affinity is null → weight is 1.0 (stage scoring is handled by `computeStageScore()` separately).

### Subtask T009 – Update computeRiderScore() Signature

- **Purpose**: Pass ProfileDistribution through to the category and stage scoring functions.
- **File**: `apps/api/src/domain/scoring/scoring.service.ts` (MODIFY)
- **Steps**:
  1. Add optional parameter:
     ```typescript
     export function computeRiderScore(
       results: RaceResult[],
       raceType: RaceType,
       currentSeason: number,
       profileDistribution?: ProfileDistribution,
     ): RiderScore;
     ```
  2. Pass `profileDistribution` to each sub-call:
     ```typescript
     const gcScore = computeCategoryScore(
       gcResults,
       raceType,
       ResultCategory.GC,
       currentSeason,
       profileDistribution,
     );
     const stageScore = computeStageScore(
       stageResults,
       raceType,
       currentSeason,
       profileDistribution,
     );
     const mountainScore = computeCategoryScore(
       mountainResults,
       raceType,
       ResultCategory.MOUNTAIN,
       currentSeason,
       profileDistribution,
     );
     const sprintScore = computeCategoryScore(
       sprintResults,
       raceType,
       ResultCategory.SPRINT,
       currentSeason,
       profileDistribution,
     );
     ```
  3. The rest of the function (summing into `totalProjectedPts`, counting seasons, etc.) remains unchanged.

### Subtask T010 – Update ScoringService Class Methods

- **Purpose**: The `ScoringService` class wraps the pure functions for NestJS dependency injection. Update its methods to pass through `ProfileDistribution`.
- **File**: `apps/api/src/domain/scoring/scoring.service.ts` (MODIFY)
- **Steps**:
  1. Update class method signatures to mirror the updated pure functions:
     ```typescript
     computeRiderScore(
       results: RaceResult[],
       raceType: RaceType,
       currentSeason: number,
       profileDistribution?: ProfileDistribution,
     ): RiderScore {
       return computeRiderScore(results, raceType, currentSeason, profileDistribution);
     }
     ```
  2. Repeat for any other class methods that wrap `computeCategoryScore` or `computeStageScore` if exposed.
  3. Import `ProfileDistribution` at the top of the file.

- **Notes**: The class is a thin wrapper. Changes are minimal — just forwarding the new parameter.

### Subtask T011 – Comprehensive Scoring Tests with Profile Weighting

- **Purpose**: Verify the scoring algorithm produces correct profile-weighted results.
- **File**: `apps/api/src/domain/scoring/scoring.service.spec.ts` (MODIFY — add new describe blocks)
- **Test scenarios**:
  1. **Climber vs Sprinter on Mountain Race**:
     - Create a mountain-heavy `ProfileDistribution` (6 P5, 4 P4, 2 P3, 3 P2, 4 P1, 2 ITT).
     - Create a "climber" rider with 5 stage results all on P5 stages, position 1-3.
     - Create a "sprinter" rider with 5 stage results all on P1 stages, same positions.
     - Score both against the mountain profile.
     - Assert climber's `stageScore > sprinter's stageScore`.

  2. **Climber vs Sprinter on Flat Race**:
     - Create a flat `ProfileDistribution` (8 P1, 4 P2, 3 P3, 2 P4, 2 P5, 2 ITT).
     - Same riders as above.
     - Assert sprinter's `stageScore > climber's stageScore`.

  3. **Mountain Classification Affinity**:
     - Create rider with Mountain classification results (position 1, Grand Tour).
     - Score against mountain-heavy profile → mountainScore boosted.
     - Score against flat profile → mountainScore reduced.

  4. **Sprint Classification Affinity**:
     - Same pattern as Mountain but for Sprint → P1/P2 affinity.

  5. **GC Classification Neutral**:
     - Create rider with GC results.
     - Score against mountain and flat profiles → gcScore identical in both cases.

  6. **ITT Specialist Boost**:
     - Create rider with ITT stage results (isItt=true, P1 parcours).
     - Score against race with 2 ITTs → stage score higher than same rider against race with 0 ITTs.

  7. **Mixed Profile Rider**:
     - Create rider with results across P1, P3, P5 stages.
     - Score against mountain race → P5 results weighted highest, P1 lowest.
     - Verify total is between all-P5 and all-P1 riders.

### Subtask T012 – Backward Compatibility Regression Tests

- **Purpose**: Prove that omitting `profileDistribution` produces identical output to the pre-feature algorithm.
- **File**: `apps/api/src/domain/scoring/scoring.service.spec.ts` (MODIFY — add regression describe block)
- **Steps**:
  1. Create a set of rider results (mix of categories, races, positions).
  2. Compute `computeRiderScore(results, raceType, currentSeason)` — no profile parameter.
  3. Compute `computeRiderScore(results, raceType, currentSeason, undefined)` — explicit undefined.
  4. Compute `computeRiderScore(results, raceType, currentSeason, null)` — explicit null.
  5. Assert all three produce **identical** `RiderScore` objects (deep equality).
  6. Repeat for `computeStageScore()` and `computeCategoryScore()`.
  7. Store "golden" output values and assert they match pre-feature expected values (capture these from the current algorithm before making changes, or compute by hand).

- **Notes**: This is the most critical test. If this fails, the feature introduces regression.

---

## Test Strategy

- **Framework**: Jest.
- **Coverage**: 100% line and branch coverage on `scoring.service.ts`.
- **Run command**: `cd apps/api && npx jest scoring.service --coverage`
- **Fixtures**: Reuse `ProfileDistribution` fixtures from WP01 tests. Create builder helpers for `RaceResult` entities with specific parcoursType/isItt/isTtt values.
- **Golden values**: Before modifying scoring functions, run the existing test suite and capture output values. Use these as regression baselines.

---

## Risks & Mitigations

- **Breaking existing tests**: Run the full test suite after each function signature change. Existing tests pass `undefined` implicitly for the new parameter → behavior unchanged.
- **Computation order change in computeStageScore()**: The profile weight is per-stage, not per-race. Ensure the implementation applies it at the correct level (per stage result, before race-level aggregation).
- **Performance**: Adding one multiplication per result is negligible. No risk.

---

## Review Guidance

- **Critical check**: Run existing scoring tests BEFORE and AFTER changes. All pre-existing tests must pass without modification (backward compat).
- Verify the multiplication order: `points × temporal × crossType × raceClass × profileWeight`.
- Verify Mountain → P4/P5 and Sprint → P1/P2 affinity mapping is correct.
- Verify GC always gets 1.0 regardless of profile.
- Check that `computeStageScore()` applies profile weight per-stage (not per-race).
- 100% coverage report for `scoring.service.ts`.

---

## Activity Log

- 2026-03-19T17:20:12Z – system – lane=planned – Prompt created.
