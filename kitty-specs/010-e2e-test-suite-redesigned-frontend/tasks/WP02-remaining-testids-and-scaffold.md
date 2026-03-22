---
work_package_id: WP02
title: Remaining Component data-testid + Directory Scaffold
lane: 'for_review'
dependencies: []
base_branch: main
base_commit: 542d5f22aa489584e0e37d5ad483777151bbc7f4
created_at: '2026-03-22T18:26:43.016425+00:00'
subtasks:
  - T008
  - T009
  - T010
  - T011
  - T012
  - T013
phase: Phase 0 - Foundation
assignee: ''
agent: 'claude-opus'
shell_pid: '63634'
review_status: ''
reviewed_by: ''
history:
  - timestamp: '2026-03-22T18:05:31Z'
    lane: planned
    agent: system
    shell_pid: ''
    action: Prompt generated via /spec-kitty.tasks
requirement_refs:
  - FR-002
  - FR-006
  - FR-009
---

# Work Package Prompt: WP02 – Remaining Component data-testid + Directory Scaffold

## ⚠️ IMPORTANT: Review Feedback Status

**Read this first if you are implementing this task!**

- **Has review feedback?**: Check the `review_status` field above. If it says `has_feedback`, scroll to the **Review Feedback** section immediately.
- **You must address all feedback** before your work is complete.

---

## Review Feedback

_[This section is empty initially.]_

---

## Objectives & Success Criteria

- Add `data-testid` attributes to all remaining components: navbar/theme toggle, optimizer panel, optimal team cards, score breakdown, team summary, and race profile summary.
- Delete the old broken `full-workflow.spec.ts` file.
- Create the new directory structure: `pages/`, `specs/`, `helpers/` under `tests/e2e/`.
- All existing vitest unit tests continue to pass.

**Success criteria**:

- `pnpm test` in `apps/web` passes.
- Old broken test file is gone.
- New empty directories exist for WP03 to populate.

## Context & Constraints

- **Spec**: `kitty-specs/010-e2e-test-suite-redesigned-frontend/spec.md`
- **Research**: `kitty-specs/010-e2e-test-suite-redesigned-frontend/research.md` (R2, R5)
- **Naming convention**: `data-testid="<context>-<element>"` in kebab-case
- Can run in parallel with WP01 — different files entirely.

**Implementation command**: `spec-kitty implement WP02`

## Subtasks & Detailed Guidance

### Subtask T008 – Add data-testid to \_\_root.tsx

- **Purpose**: Enable e2e tests to locate the navbar and theme toggle button.
- **File**: `apps/web/src/routes/__root.tsx`
- **Parallel?**: Yes
- **Steps**:
  1. On the `<nav>` or navbar wrapper element: add `data-testid="nav-bar"`
  2. On the theme toggle `<button>`: add `data-testid="nav-theme-toggle"`
- **Notes**: The theme toggle already has an `aria-label` ("Switch to light mode" / "Switch to dark mode"). The testid provides a stable, non-changing selector for locating the button regardless of its current state.

### Subtask T009 – Add data-testid to optimizer-panel.tsx

- **Purpose**: Enable e2e tests to verify optimization results display.
- **File**: `apps/web/src/features/optimizer/components/optimizer-panel.tsx`
- **Parallel?**: Yes
- **Steps**:
  1. On the outermost panel container: add `data-testid="optimization-panel"`
  2. On the projected total score number: add `data-testid="optimization-projected-total"`
  3. On the budget efficiency percentage: add `data-testid="optimization-budget-efficiency"`
  4. On the "Apply to Roster" button: add `data-testid="optimization-apply-btn"`
  5. On the "Primary Lineup" section heading or its parent container: add `data-testid="optimization-lineup"`

### Subtask T010 – Add data-testid to optimal-team-card.tsx + score-breakdown.tsx

- **Purpose**: Enable e2e tests to count rider cards and verify score breakdown display.
- **Files**:
  - `apps/web/src/features/optimizer/components/optimal-team-card.tsx`
  - `apps/web/src/features/optimizer/components/score-breakdown.tsx`
- **Parallel?**: Yes
- **Steps**:
  1. In `optimal-team-card.tsx`: On each rider card's root element, add `data-testid={`optimization-rider-card-${rider.rawName}`}` (or a sanitized version of the name).
     - If the name contains spaces, use it as-is — Playwright handles attribute selectors with spaces.
  2. In `score-breakdown.tsx`: On the breakdown container, add `data-testid="optimization-score-breakdown"`
  3. On the stacked bar element (the visual bar): add `data-testid="optimization-score-bar"`
- **Notes**: For rider cards, the testid with dynamic name allows tests to verify specific riders are in the optimal team. The score-breakdown testid enables verifying the visualization renders.

### Subtask T011 – Add data-testid to team-summary.tsx

- **Purpose**: Enable e2e tests to verify the final roster display, metrics, and action buttons.
- **File**: `apps/web/src/features/team-builder/components/team-summary.tsx`
- **Parallel?**: Yes
- **Steps**:
  1. On the success banner (green container): add `data-testid="roster-complete-banner"`
  2. On the "Reset" button: add `data-testid="roster-reset-btn"`
  3. On the "Copy to Clipboard" button: add `data-testid="roster-copy-btn"`
  4. On the rider list container ("Official 9-Rider Roster"): add `data-testid="roster-rider-list"`
  5. On each individual rider row: add `data-testid={`roster-rider-${rider.rawName}`}`
  6. On the captain badge: add `data-testid="roster-captain-badge"`
  7. On the total projected score value: add `data-testid="roster-total-score"`
  8. On the total expenditure value: add `data-testid="roster-total-cost"`
  9. On the remaining budget value: add `data-testid="roster-remaining"`
  10. On the average cost per rider value: add `data-testid="roster-avg-rider"`
- **Notes**: This component has the most testids (10). Focus on elements that tests will assert against. The rider rows use dynamic names similar to optimal-team-card.

### Subtask T012 – Add data-testid to race-profile-summary.tsx

- **Purpose**: Enable e2e tests to verify race profile auto-detection results.
- **File**: `apps/web/src/features/rider-list/components/race-profile-summary.tsx`
- **Parallel?**: Yes
- **Steps**:
  1. On the race name heading: add `data-testid="race-profile-name"`
  2. On the race type badge (Grand Tour/Mini Tour/Classic): add `data-testid="race-profile-type"`
  3. On the rider count display: add `data-testid="race-profile-rider-count"`
  4. On the matched count display: add `data-testid="race-profile-matched-count"`
- **Notes**: These testids are used by setup.spec.ts (T022) to verify PCS URL auto-detection populates the race profile summary correctly.

### Subtask T013 – Delete old test file + create directory scaffold

- **Purpose**: Remove the broken test file and prepare the directory structure for WP03.
- **Steps**:
  1. Delete `apps/web/tests/e2e/full-workflow.spec.ts` (the old broken test file).
  2. Create empty directories:
     - `apps/web/tests/e2e/pages/`
     - `apps/web/tests/e2e/specs/`
     - `apps/web/tests/e2e/helpers/`
  3. Add a `.gitkeep` file in each empty directory so git tracks them.
  4. Verify existing fixtures directory remains untouched: `apps/web/tests/e2e/fixtures/` should still contain `valid-price-list.txt`, `invalid-price-list.txt`, `partial-match-list.txt`.
- **Notes**: The `fixtures/` directory already exists with data files. Do not move or rename them. The new `test-fixtures.ts` (created in WP03) will be added to `fixtures/` alongside the existing txt files.

## Risks & Mitigations

- **Risk**: team-summary.tsx has many testids — easy to miss one. **Mitigation**: Check this prompt's list against the actual component after implementation.
- **Risk**: Dynamic testids (rider names with special characters). **Mitigation**: Use the raw name as-is; Playwright's `getByTestId` handles special chars.

## Review Guidance

- Verify all 10 testids on team-summary.tsx are present.
- Verify old test file is deleted.
- Verify new directories exist with `.gitkeep`.
- Run `pnpm test` — no regressions.

## Activity Log

- 2026-03-22T18:05:31Z – system – lane=planned – Prompt created.
- 2026-03-22T18:26:43Z – claude-opus – shell_pid=63634 – lane=doing – Assigned agent via workflow command
- 2026-03-22T18:28:59Z – claude-opus – shell_pid=63634 – lane=for_review – All 6 subtasks complete: data-testid on 6 components, old test deleted, dirs created
