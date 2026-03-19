---
work_package_id: WP03
title: API, Frontend & ADR
lane: planned
dependencies: [WP02]
subtasks:
  - T013
  - T014
  - T015
  - T016
  - T017
phase: Phase 2 - Integration
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
  - FR-004
  - FR-012
---

# Work Package Prompt: WP03 – API, Frontend & ADR

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
spec-kitty implement WP03 --base WP02
```

Depends on WP02 — branches from WP02's completed state.

---

## Objectives & Success Criteria

- Wire `ProfileSummary` through the full request/response pipeline: shared types → DTO → use case → scoring.
- Update the frontend to include `profileSummary` in the analyze request when available.
- Write the ADR documenting the profile-aware scoring formula (required by constitution).
- End-to-end: a request with `profileSummary` produces different scoring than one without.

---

## Context & Constraints

- **Spec**: FR-004 (derive from profileSummary), FR-012 (frontend passes profile to backend).
- **Contract**: `kitty-specs/003-profile-aware-scoring/contracts/analyze-request.md` — backward-compatible optional field.
- **Constitution**: ADR required for scoring model changes. English only.
- **Architecture**: Presentation layer uses NestJS decorators for validation. Application layer orchestrates. Domain layer is pure (already modified in WP01/WP02).
- **Existing code to modify**:
  - `packages/shared-types/src/api.ts` — `AnalyzeRequest` interface.
  - `apps/api/src/presentation/analyze.controller.ts` — `AnalyzeRequestDto` class.
  - `apps/api/src/application/analyze/analyze-price-list.use-case.ts` — `AnalyzeInput`, `execute()`.
  - `apps/web/src/features/rider-list/components/rider-input.tsx` — analyze request construction.

---

## Subtasks & Detailed Guidance

### Subtask T013 – Add profileSummary to AnalyzeRequest in Shared Types

- **Purpose**: Extend the shared request type so both frontend and backend agree on the contract.
- **File**: `packages/shared-types/src/api.ts` (MODIFY)
- **Parallel**: Can proceed alongside T017 (ADR).
- **Steps**:
  1. Add optional field to `AnalyzeRequest`:
     ```typescript
     export interface AnalyzeRequest {
       riders: PriceListEntryDto[];
       raceType: RaceType;
       budget: number;
       seasons?: number;
       profileSummary?: ProfileSummary; // NEW
     }
     ```
  2. `ProfileSummary` is already defined in this file (from Feature 002). No new type needed.
  3. Verify that the `ProfileSummary` interface has: `p1Count`, `p2Count`, `p3Count`, `p4Count`, `p5Count`, `ittCount`, `tttCount`, `unknownCount`.

- **Notes**: This is a non-breaking change. Existing consumers that don't send `profileSummary` continue to work.

### Subtask T014 – Update AnalyzeRequestDto Validation

- **Purpose**: Validate the optional `profileSummary` field in the NestJS controller.
- **File**: `apps/api/src/presentation/analyze.controller.ts` (MODIFY)
- **Steps**:
  1. Create a nested DTO class for `ProfileSummary` validation:

     ```typescript
     import { IsOptional, ValidateNested, IsInt, Min } from 'class-validator';
     import { Type } from 'class-transformer';

     class ProfileSummaryDto {
       @IsInt()
       @Min(0)
       p1Count: number;

       @IsInt()
       @Min(0)
       p2Count: number;

       @IsInt()
       @Min(0)
       p3Count: number;

       @IsInt()
       @Min(0)
       p4Count: number;

       @IsInt()
       @Min(0)
       p5Count: number;

       @IsInt()
       @Min(0)
       ittCount: number;

       @IsInt()
       @Min(0)
       tttCount: number;

       @IsInt()
       @Min(0)
       unknownCount: number;
     }
     ```

  2. Add to `AnalyzeRequestDto`:
     ```typescript
     @IsOptional()
     @ValidateNested()
     @Type(() => ProfileSummaryDto)
     profileSummary?: ProfileSummaryDto;
     ```
  3. The `@Type()` decorator is needed for `class-transformer` to instantiate the nested object for validation.

- **Edge cases**:
  - `profileSummary` absent → no validation, passes through as undefined.
  - `profileSummary` present with negative counts → validation error (400).
  - `profileSummary` present with all zeros → valid (handled as empty distribution in domain).

- **Notes**: Check that `class-transformer` and `class-validator` are already dependencies (they should be — NestJS uses them). If `@Type()` is not imported, add it.

### Subtask T015 – Update AnalyzePriceListUseCase

- **Purpose**: Convert `ProfileSummary` to `ProfileDistribution` and pass to scoring.
- **File**: `apps/api/src/application/analyze/analyze-price-list.use-case.ts` (MODIFY)
- **Steps**:
  1. Update `AnalyzeInput` to include the optional profile summary:
     ```typescript
     export interface AnalyzeInput {
       riders: PriceListEntryDto[];
       raceType: RaceType;
       budget: number;
       seasons: number;
       profileSummary?: ProfileSummary; // NEW
     }
     ```
  2. In the `execute()` method, convert to `ProfileDistribution`:

     ```typescript
     import { ProfileDistribution } from '../../domain/scoring/profile-distribution';

     // Early in execute():
     const profileDistribution = input.profileSummary
       ? ProfileDistribution.fromProfileSummary(input.profileSummary)
       : null;
     ```

  3. Pass `profileDistribution` to scoring calls:
     ```typescript
     const riderScore = this.scoringService.computeRiderScore(
       results,
       input.raceType,
       currentSeason,
       profileDistribution ?? undefined,
     );
     ```
  4. The rest of the use case (pool stats, composite score, response mapping) remains unchanged.

- **Notes**: The use case is the bridge between presentation (DTO with `ProfileSummary`) and domain (functions with `ProfileDistribution`). This is the correct place for the conversion per Hexagonal Architecture.

### Subtask T016 – Frontend: Include profileSummary in Analyze Request

- **Purpose**: Send the target race's profile data along with the analysis request.
- **File**: `apps/web/src/features/rider-list/components/rider-input.tsx` (MODIFY)
- **Parallel**: Can proceed alongside T013 once shared types are updated.
- **Steps**:
  1. The component already has access to `raceProfile` via the `useRaceProfile` hook (from Feature 002).
  2. When constructing the `AnalyzeRequest` payload in the `onAnalyze` callback, add the profile summary:
     ```typescript
     const request: AnalyzeRequest = {
       riders: parsedRiders,
       raceType: raceProfile?.raceType ?? selectedRaceType,
       budget,
       seasons,
       profileSummary: raceProfile?.profileSummary, // NEW — undefined if no race URL
     };
     ```
  3. If `raceProfile` is in a loading or error state, `profileSummary` will be `undefined` → backend defaults to neutral weights. This is correct behavior.

- **Notes**: The `api-client.ts` already sends the full request object to `POST /api/analyze`, so no changes needed there. The `AnalyzeRequest` type update from T013 will make TypeScript accept the new field.

### Subtask T017 – Write ADR for Profile-Aware Scoring Formula

- **Purpose**: Constitution requires an ADR for any scoring model change.
- **File**: `docs/adr/2026-03-19-profile-aware-scoring.md` (NEW)
- **Parallel**: Can proceed alongside T013.
- **Steps**:
  1. Create the ADR following the project convention:

     ```markdown
     # ADR: Profile-Aware Scoring

     **Date**: 2026-03-19
     **Status**: Accepted
     **Deciders**: [Developer name]

     ## Context

     The scoring algorithm treated all stage results equally regardless of terrain.
     With stage profile data now available (Feature 002), we can weight historical
     results based on how well they match the target race's terrain distribution.

     ## Decision

     Add a profile match weight as a 4th multiplicative factor in the scoring formula:

     `points × temporalWeight × crossTypeWeight × raceClassWeight × profileWeight`

     **Profile weight formula**: `max(FLOOR, parcoursShare / maxParcoursShare)`

     - The dominant terrain profile in the target race gets weight 1.0.
     - Other profiles scale down proportionally.
     - Floor of 0.25 prevents discarding any result entirely.

     **ITT handling**: ITT results get an additive bonus:
     `profileWeight + ITT_BONUS_FACTOR × (ittShare / maxParcoursShare)`.

     **Category affinity**:

     - Mountain classification → P4/P5 affinity
     - Sprint classification → P1/P2 affinity
     - GC classification → neutral (1.0)

     **Backward compatibility**: When no profile is provided, all weights default to 1.0.

     ## Alternatives Considered

     1. **Raw proportional** (weight = share): Rejected — all weights < 1.0, shrinks scores.
     2. **Binary boost/floor**: Rejected — too coarse, loses terrain nuance.
     3. **ITT as 6th profile type**: Rejected — creates parallel systems.
     4. **Machine-learned weights**: Deferred — requires a benchmarking system first.

     ## Consequences

     - Scoring is now terrain-aware. Riders are better matched to target race profiles.
     - Configuration values (FLOOR=0.25, ITT_BONUS=0.15) are initial estimates; fine-tuning expected via future benchmarking feature.
     - All scoring tests updated for 100% coverage.
     ```

  2. Check if `docs/adr/` directory exists; create it if not.

---

## Test Strategy

- **Backend unit tests**: The scoring integration tests (WP02) already cover the domain logic. This WP focuses on wiring:
  - Verify `AnalyzeRequestDto` validation accepts/rejects `profileSummary` correctly (add test to controller spec if exists).
  - Verify `AnalyzePriceListUseCase` passes `ProfileDistribution` to scoring (mock scoring service, verify call args).
- **Frontend**: If Vitest tests exist for `rider-input.tsx`, verify the analyze request includes `profileSummary` when race profile is loaded.
- **Run commands**:
  - Backend: `cd apps/api && npx jest analyze`
  - Frontend: `cd apps/web && npx vitest run rider-input`

---

## Risks & Mitigations

- **`class-transformer` `@Type()` not working**: Ensure `enableImplicitConversion` is set in NestJS validation pipe, or use explicit `@Type()` decorator.
- **Frontend race condition**: User clicks "Analyze" before race profile loads → `profileSummary` is undefined → scoring defaults to neutral. This is correct, not a bug.
- **Shared types build order**: `packages/shared-types` must build before `apps/api` and `apps/web`. Turborepo handles this, but verify with `npm run build` from monorepo root.

---

## Review Guidance

- Verify `AnalyzeRequest` in shared-types has `profileSummary?: ProfileSummary` (not a new type, reuses existing one).
- Verify DTO validation uses `@IsOptional()` + `@ValidateNested()` + `@Type()`.
- Verify use case converts `ProfileSummary` → `ProfileDistribution` (domain conversion, not passthrough of raw DTO).
- Verify frontend sends `profileSummary` when available, `undefined` when not.
- Verify ADR exists and documents formula, alternatives, and consequences.
- Run `npm run build` from monorepo root to verify TypeScript compilation across all packages.

---

## Activity Log

- 2026-03-19T17:20:12Z – system – lane=planned – Prompt created.
