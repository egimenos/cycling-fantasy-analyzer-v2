---
work_package_id: WP04
title: Frontend Breakdown Display
lane: planned
dependencies: [WP03]
subtasks:
  - T016
  - T017
  - T018
  - T019
phase: Phase 3 - Frontend
assignee: ''
agent: ''
shell_pid: ''
review_status: ''
reviewed_by: ''
history:
  - timestamp: '2026-03-29T18:00:50Z'
    lane: planned
    agent: system
    shell_pid: ''
    action: Prompt generated via /spec-kitty.tasks
requirement_refs:
  - FR-009
---

# Work Package Prompt: WP04 – Frontend Breakdown Display

## Objectives & Success Criteria

- Stage race riders show ML-based breakdown (GC / Stage / Mountain / Sprint)
- Classic race riders show rules-based breakdown (unchanged)
- Breakdown values are in fantasy points, directly readable
- All 4 sources always displayed (even if value is 0)

## Context & Constraints

- **Frontend stack**: React 19 + Vite, Tailwind CSS, shadcn/ui, TanStack Router
- **Data fetching**: custom `api-client.ts` with native fetch (no TanStack Query)
- **Shared types**: `packages/shared-types/src/api.ts`
- **Constitution**: Feature-Sliced Design, no cross-feature imports
- **Current breakdown**: the frontend currently shows a rules-based breakdown — find where and replace for stage races

**Implementation command**: `spec-kitty implement WP04 --base WP03`

## Subtasks & Detailed Guidance

### Subtask T016 – Update shared types

**Purpose**: Add MlBreakdown type to shared-types package so frontend and API use the same definition.

**Steps**:

1. Update `packages/shared-types/src/api.ts`:

   ```typescript
   export interface MlBreakdown {
     gc: number;
     stage: number;
     mountain: number;
     sprint: number;
   }

   // Update existing rider score type to include optional breakdown
   export interface RiderScore {
     // ... existing fields
     mlBreakdown?: MlBreakdown;
   }
   ```

2. Export from package index if needed

**Files**: `packages/shared-types/src/api.ts` (modify)

### Subtask T017 – Update rider score display component

**Purpose**: Render per-source ML breakdown in rider detail/card.

**Steps**:

1. Find the existing component that displays rider scores/breakdown
2. When `mlBreakdown` is present, render 4 bars/segments:
   - GC: value in pts
   - Stage: value in pts
   - Mountain: value in pts
   - Sprint: value in pts
3. Use existing design system (shadcn/ui, Tailwind) for styling
4. Show all 4 sources always, even if 0 — for consistency
5. The total should still be prominently displayed

**Files**: Component in `apps/web/src/features/` (modify)

### Subtask T018 – Conditional routing ML vs rules-based

**Purpose**: Show ML breakdown for stage races, rules-based for classics.

**Steps**:

1. The race_type should be available in the component context
2. If `race_type === 'grand_tour' || race_type === 'mini_tour'`: show ML breakdown
3. If `race_type === 'classic'`: show existing rules-based breakdown
4. If ML breakdown is null/undefined (ML service unavailable): fall back to rules-based or show "Predictions unavailable"

**Files**: Component in `apps/web/src/features/` (modify)

### Subtask T019 – Verify visual consistency

**Purpose**: Ensure breakdown renders correctly across different race types and screen sizes.

**Steps**:

1. Verify GT rider shows ML breakdown with plausible values
2. Verify classic rider shows rules-based breakdown
3. Verify responsive layout (mobile, tablet, desktop)
4. Verify 0-value sources don't break the layout
5. Verify accessibility (color contrast, screen reader)

**Files**: No new code — verification

## Risks & Mitigations

- **Existing breakdown component**: Must be found and understood before modifying. Search for scoring/breakdown related components.
- **Data availability timing**: ML predictions may not be available when user first views a race. Handle loading/empty states.

## Review Guidance

- Verify the ML breakdown is visually distinguishable from rules-based
- Verify the conditional logic correctly routes by race_type
- Verify the component handles all edge cases (null breakdown, 0 values, missing data)

## Activity Log

- 2026-03-29T18:00:50Z – system – lane=planned – Prompt created.
