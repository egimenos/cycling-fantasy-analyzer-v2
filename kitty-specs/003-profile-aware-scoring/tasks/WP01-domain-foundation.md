---
work_package_id: WP01
title: Domain Foundation — ProfileDistribution & Weight Config
lane: 'done'
dependencies: []
subtasks:
  - T001
  - T002
  - T003
  - T004
  - T005
  - T006
phase: Phase 0 - Foundation
assignee: ''
agent: ''
shell_pid: ''
review_status: 'approved'
reviewed_by: 'egimenos'
history:
  - timestamp: '2026-03-19T17:20:12Z'
    lane: planned
    agent: system
    shell_pid: ''
    action: Prompt generated via /spec-kitty.tasks
requirement_refs:
  - FR-002
  - FR-005
  - FR-006
  - FR-007
  - FR-011
---

# Work Package Prompt: WP01 – Domain Foundation — ProfileDistribution & Weight Config

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
spec-kitty implement WP01
```

No dependencies — this is the starting work package.

---

## Objectives & Success Criteria

- Create the `ProfileDistribution` value object with a factory method that normalizes `ProfileSummary` counts into 0.0–1.0 shares.
- Add profile weight configuration constants (`PROFILE_WEIGHT_FLOOR`, `ITT_BONUS_FACTOR`, `CATEGORY_AFFINITY_MAP`) to the existing scoring weights config.
- Implement `computeProfileWeight()` — the core pure function that returns a multiplicative weight for a given result based on the target race's profile distribution.
- 100% unit test coverage on all new code (constitution mandate for scoring logic).
- Zero framework dependencies — all code is pure domain.

---

## Context & Constraints

- **Architecture**: DDD Hexagonal. All new files live in `apps/api/src/domain/scoring/`. No NestJS decorators or imports.
- **Constitution**: `.kittify/memory/constitution.md` — Scoring logic requires 100% test coverage. No `any` types. TypeScript strict mode.
- **Spec**: `kitty-specs/003-profile-aware-scoring/spec.md` — FR-002, FR-005, FR-006, FR-007, FR-011.
- **Research**: `kitty-specs/003-profile-aware-scoring/research.md` — R1 (formula), R2 (ITT handling), R5 (config values).
- **Data model**: `kitty-specs/003-profile-aware-scoring/data-model.md` — ProfileDistribution fields and invariants.
- **Existing code reference**:
  - `apps/api/src/domain/scoring/scoring-weights.config.ts` — existing config pattern to follow.
  - `apps/api/src/domain/scoring/temporal-decay.ts` — example of a simple pure domain function.
  - `apps/api/src/domain/shared/parcours-type.enum.ts` — `ParcoursType` enum (P1–P5).
  - `apps/api/src/domain/shared/result-category.enum.ts` — `ResultCategory` enum (GC, STAGE, MOUNTAIN, SPRINT).
  - `packages/shared-types/src/api.ts` — `ProfileSummary` interface (p1Count–p5Count, ittCount, tttCount, unknownCount).

---

## Subtasks & Detailed Guidance

### Subtask T001 – Create ProfileDistribution Value Object

- **Purpose**: Normalize raw `ProfileSummary` counts into 0.0–1.0 shares for the weight formula.
- **File**: `apps/api/src/domain/scoring/profile-distribution.ts` (NEW)
- **Steps**:
  1. Define `ProfileDistribution` as an immutable class (all fields `readonly`):

     ```typescript
     export class ProfileDistribution {
       readonly p1Share: number;
       readonly p2Share: number;
       readonly p3Share: number;
       readonly p4Share: number;
       readonly p5Share: number;
       readonly ittShare: number;
       readonly tttShare: number;
       readonly totalStages: number;

       private constructor(props: { ... }) { ... }

       static fromProfileSummary(summary: ProfileSummary): ProfileDistribution | null { ... }
     }
     ```

  2. `fromProfileSummary()` logic:
     - Compute `totalStages = p1Count + p2Count + p3Count + p4Count + p5Count + ittCount + tttCount + unknownCount`.
     - If `totalStages === 0`, return `null` (no meaningful distribution).
     - Compute each share: `pXShare = pXCount / totalStages`.
     - ITT/TTT shares overlap with parcours shares (a P5 ITT is counted in both `p5Share` and `ittShare`).
     - Return new `ProfileDistribution` instance.
  3. Export the class.

- **Edge cases**:
  - All counts zero → return null.
  - Only unknowns (e.g., `unknownCount: 5`, rest 0) → `totalStages = 5`, all parcours shares = 0. This is a valid but empty distribution; the weight function will use the floor.
  - Single-stage classic (e.g., `p3Count: 1`, rest 0) → `totalStages = 1`, `p3Share = 1.0`.

### Subtask T002 – Add Profile Weight Config Constants

- **Purpose**: Define tunable profile weight parameters alongside existing scoring weights.
- **File**: `apps/api/src/domain/scoring/scoring-weights.config.ts` (MODIFY)
- **Steps**:
  1. Add constants at the end of the file (after existing exports):

     ```typescript
     /** Minimum profile weight — no result weighted below this value */
     export const PROFILE_WEIGHT_FLOOR = 0.25;

     /** Additional weight factor for ITT-relevant results */
     export const ITT_BONUS_FACTOR = 0.15;

     /** Maps non-stage categories to their profile affinity parcours types */
     export const CATEGORY_AFFINITY_MAP: Record<string, ParcoursType[] | null> = {
       [ResultCategory.MOUNTAIN]: [ParcoursType.P4, ParcoursType.P5],
       [ResultCategory.SPRINT]: [ParcoursType.P1, ParcoursType.P2],
       [ResultCategory.GC]: null, // neutral (1.0)
       [ResultCategory.STAGE]: null, // uses actual parcoursType from result
     };
     ```

  2. Import `ParcoursType` and `ResultCategory` enums. These are domain enums already in `apps/api/src/domain/shared/`, so this is a valid domain-to-domain import.
  3. Add accessor function:
     ```typescript
     export function getCategoryAffinity(category: ResultCategory): ParcoursType[] | null {
       return CATEGORY_AFFINITY_MAP[category] ?? null;
     }
     ```

- **Notes**: Follow the naming and export pattern of existing constants (`CROSS_TYPE_WEIGHTS`, `RACE_CLASS_WEIGHTS`).

### Subtask T003 – Create computeProfileWeight() Pure Function

- **Purpose**: Core formula that converts a result's profile attributes into a multiplicative weight.
- **File**: `apps/api/src/domain/scoring/profile-weight.ts` (NEW)
- **Steps**:
  1. Create the function:

     ```typescript
     import { ParcoursType } from '../shared/parcours-type.enum';
     import { ProfileDistribution } from './profile-distribution';
     import { PROFILE_WEIGHT_FLOOR, ITT_BONUS_FACTOR } from './scoring-weights.config';

     export function computeProfileWeight(
       parcoursType: ParcoursType | null,
       isItt: boolean,
       isTtt: boolean,
       profileDistribution: ProfileDistribution | null,
     ): number {
       // No profile distribution → neutral weight
       if (!profileDistribution) return 1.0;
       // No parcours type on this result → neutral weight
       if (!parcoursType) return 1.0;

       // Step 1: Get parcours shares
       const shareMap: Record<ParcoursType, number> = {
         [ParcoursType.P1]: profileDistribution.p1Share,
         [ParcoursType.P2]: profileDistribution.p2Share,
         [ParcoursType.P3]: profileDistribution.p3Share,
         [ParcoursType.P4]: profileDistribution.p4Share,
         [ParcoursType.P5]: profileDistribution.p5Share,
       };

       const shares = Object.values(shareMap);
       const maxShare = Math.max(...shares);

       // All shares are 0 → neutral weight (no meaningful distribution)
       if (maxShare === 0) return 1.0;

       // Step 2: Normalized proportional weight
       const parcoursShare = shareMap[parcoursType];
       const normalizedWeight = parcoursShare / maxShare;

       // Step 3: ITT/TTT bonus
       let ittBonus = 0;
       if (isItt && profileDistribution.ittShare > 0) {
         const ittRelevance = profileDistribution.ittShare / maxShare;
         ittBonus = ITT_BONUS_FACTOR * ittRelevance;
       }
       if (isTtt && profileDistribution.tttShare > 0) {
         const tttRelevance = profileDistribution.tttShare / maxShare;
         ittBonus = Math.max(ittBonus, ITT_BONUS_FACTOR * tttRelevance);
       }

       // Step 4: Apply floor
       return Math.max(PROFILE_WEIGHT_FLOOR, normalizedWeight + ittBonus);
     }
     ```

  2. Also export a helper for category affinity weight (used by WP02):

     ```typescript
     export function computeCategoryProfileWeight(
       affinityTypes: ParcoursType[],
       profileDistribution: ProfileDistribution | null,
     ): number {
       if (!profileDistribution) return 1.0;

       const shareMap: Record<ParcoursType, number> = { ... }; // same as above
       const maxShare = Math.max(...Object.values(shareMap));
       if (maxShare === 0) return 1.0;

       const avgAffinityShare = affinityTypes.reduce(
         (sum, pt) => sum + shareMap[pt], 0
       ) / affinityTypes.length;

       return Math.max(PROFILE_WEIGHT_FLOOR, avgAffinityShare / maxShare);
     }
     ```

- **Edge cases**:
  - `parcoursType` is null → return 1.0 (FR-005).
  - `profileDistribution` is null → return 1.0 (FR-001 backward compat).
  - All parcours shares are 0 (only unknowns) → return 1.0.
  - ITT result on a race with no ITT stages → no bonus, just parcours weight.
  - Mountain ITT with P5 → gets P5 parcours weight + ITT bonus.

### Subtask T004 – Unit Tests for ProfileDistribution

- **Purpose**: 100% coverage of the value object and factory.
- **File**: `apps/api/src/domain/scoring/profile-distribution.spec.ts` (NEW)
- **Parallel**: Yes — can be written alongside T005 and T006.
- **Test cases**:
  1. Standard Grand Tour profile (e.g., TdF 2025: 4 P1, 2 P2, 3 P3, 4 P4, 6 P5, 2 ITT, 0 TTT, 0 unknown → totalStages=21, p5Share≈0.286).
  2. Flat Classic (1 P1, rest 0 → totalStages=1, p1Share=1.0).
  3. All zeros → returns null.
  4. Only unknowns (unknownCount=5, rest 0) → totalStages=5, all parcours shares=0.
  5. Mixed ITT overlap (2 P1, 1 P5 ITT → ittShare includes the ITT stage, p5Share includes the same stage).
  6. Verify immutability (fields are readonly).
  7. Verify all shares are in 0.0–1.0 range.

### Subtask T005 – Unit Tests for computeProfileWeight()

- **Purpose**: 100% coverage of the weight formula, ITT handling, floor enforcement.
- **File**: `apps/api/src/domain/scoring/profile-weight.spec.ts` (NEW)
- **Parallel**: Yes.
- **Test cases**:
  1. **Null distribution** → returns 1.0.
  2. **Null parcoursType** → returns 1.0.
  3. **Dominant profile match** (P5 result, P5 is max share) → weight ≈ 1.0.
  4. **Minority profile** (P2 result, P5 is max share in mountain-heavy race) → weight < 1.0, above floor.
  5. **Floor enforcement** (P1 result, P1 share ≈ 0 in pure mountain race) → weight = PROFILE_WEIGHT_FLOOR (0.25).
  6. **ITT bonus** (P1 ITT result, race has 2 ITTs) → weight = P1 parcours weight + ITT bonus.
  7. **TTT bonus** (TTT result on race with TTT stages) → similar to ITT.
  8. **Mountain ITT** (P5 + ITT, mountain-heavy race with ITTs) → P5 weight + ITT bonus, capped reasonably.
  9. **No ITT stages in race** (ITT result but ittShare=0) → no bonus, just parcours weight.
  10. **All shares zero** (only unknowns) → returns 1.0.
  11. **Category affinity function**: Mountain affinity (P4+P5) on mountain-heavy race → high weight. Sprint affinity (P1+P2) on same race → low weight.
  12. **Classic race** (single profile type, p3Share=1.0) → P3 result gets 1.0, others get floor.

### Subtask T006 – Unit Tests for New Config Accessors

- **Purpose**: Verify config constants and `getCategoryAffinity()` accessor.
- **File**: `apps/api/src/domain/scoring/scoring-weights.config.spec.ts` (MODIFY — add tests to existing file if present, or create if not)
- **Parallel**: Yes.
- **Test cases**:
  1. `PROFILE_WEIGHT_FLOOR` is 0.25.
  2. `ITT_BONUS_FACTOR` is 0.15.
  3. `getCategoryAffinity(MOUNTAIN)` returns `[P4, P5]`.
  4. `getCategoryAffinity(SPRINT)` returns `[P1, P2]`.
  5. `getCategoryAffinity(GC)` returns null.
  6. `getCategoryAffinity(STAGE)` returns null.

---

## Test Strategy

- **Framework**: Jest (backend unit tests).
- **Coverage requirement**: 100% line and branch coverage for all new files.
- **Run command**: `cd apps/api && npx jest --coverage --collectCoverageFrom='src/domain/scoring/profile-*.ts' --collectCoverageFrom='src/domain/scoring/scoring-weights.config.ts'`
- **Fixtures**: Create test helpers with reusable `ProfileSummary` objects (mountain-heavy GT, flat classic, balanced mini-tour).

---

## Risks & Mitigations

- **Division by zero**: `maxShare = 0` when all parcours counts are zero. Mitigated by returning 1.0 early.
- **Float precision**: Shares are simple divisions; no accumulation risk. Use `toBeCloseTo()` in tests.
- **Import boundaries**: New files must only import from `domain/` and `shared-types`. No NestJS, no infrastructure.

---

## Review Guidance

- Verify `ProfileDistribution.fromProfileSummary()` handles all edge cases (zeros, single-type, unknown-only).
- Verify `computeProfileWeight()` returns exactly 1.0 when distribution or parcoursType is null.
- Verify floor is enforced — no weight below 0.25.
- Verify ITT bonus is additive, not multiplicative (prevents runaway).
- Check that no framework imports exist in new domain files.
- Check 100% test coverage report.

---

## Activity Log

- 2026-03-19T17:20:12Z – system – lane=planned – Prompt created.
- 2026-03-19T17:46:23Z – unknown – lane=done – Implementation complete
