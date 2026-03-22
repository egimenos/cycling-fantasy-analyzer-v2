---
work_package_id: WP01
title: Playwright Config + Core Flow data-testid
lane: 'done'
dependencies: []
base_branch: main
base_commit: 583c13d0d2ad0365495f8044de356b6125d4fa85
created_at: '2026-03-22T18:19:33.206606+00:00'
subtasks:
  - T001
  - T002
  - T003
  - T004
  - T005
  - T006
  - T007
phase: Phase 0 - Foundation
assignee: ''
agent: 'claude-opus'
shell_pid: '67862'
review_status: 'approved'
reviewed_by: 'egimenos'
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

# Work Package Prompt: WP01 – Playwright Config + Core Flow data-testid

## ⚠️ IMPORTANT: Review Feedback Status

**Read this first if you are implementing this task!**

- **Has review feedback?**: Check the `review_status` field above. If it says `has_feedback`, scroll to the **Review Feedback** section immediately.
- **You must address all feedback** before your work is complete.
- **Mark as acknowledged**: When you understand the feedback, update `review_status: acknowledged`.

---

## Review Feedback

_[This section is empty initially. Reviewers will populate it if the work is returned from review.]_

---

## Objectives & Success Criteria

- Update Playwright config to point at the new `specs/` directory.
- Add `data-testid` attributes to all P1 components: flow tabs, rider input, rider table, rider list page, team builder panel, and the main index route.
- Zero functional or styling changes — only testid additions.
- All existing vitest unit tests continue to pass.

**Success criteria**:

- `pnpm test` in `apps/web` passes with no regressions.
- Each modified component has the specified testids visible in browser DevTools.
- Playwright config correctly points to `./tests/e2e/specs`.

## Context & Constraints

- **Spec**: `kitty-specs/010-e2e-test-suite-redesigned-frontend/spec.md`
- **Plan**: `kitty-specs/010-e2e-test-suite-redesigned-frontend/plan.md`
- **Research**: `kitty-specs/010-e2e-test-suite-redesigned-frontend/research.md` (R2: selector strategy, R5: component mapping)
- **Constitution**: `.kittify/memory/constitution.md` — English only, TypeScript strict mode
- **Naming convention**: `data-testid="<context>-<element>"` in kebab-case
- **Selector priority**: `data-testid` > `aria-label` > `getByRole` > `getByText` > never CSS

## Subtasks & Detailed Guidance

### Subtask T001 – Update Playwright config testDir

- **Purpose**: Point Playwright at the new `specs/` subdirectory so specs live separately from pages/fixtures.
- **File**: `apps/web/playwright.config.ts`
- **Steps**:
  1. Change `testDir: './tests/e2e'` to `testDir: './tests/e2e/specs'`
  2. Verify no other paths in the config need updating (webServer, screenshot paths should be fine as-is).
- **Validation**: Config file compiles without error.

### Subtask T002 – Add data-testid to flow-tabs.tsx

- **Purpose**: Enable e2e tests to locate and click individual tab navigation buttons and verify lock state.
- **File**: `apps/web/src/features/flow/components/flow-tabs.tsx`
- **Parallel?**: Yes
- **Steps**:
  1. On each tab `<button>` element, add `data-testid={`flow-tab-${step}`}` where `step` is the step key (setup, dashboard, optimization, roster).
  2. The component already maps over steps — add the attribute inside the map callback.
- **TestIDs to add**:
  - `flow-tab-setup`
  - `flow-tab-dashboard`
  - `flow-tab-optimization`
  - `flow-tab-roster`
- **Notes**: The buttons already have `disabled` when locked and an active underline when selected. Tests can check `button[data-testid="flow-tab-dashboard"]` and verify `disabled` attribute or `aria-disabled`.

### Subtask T003 – Add data-testid to rider-input.tsx

- **Purpose**: Enable e2e tests to fill inputs, click buttons, and verify validation feedback on the Setup tab.
- **File**: `apps/web/src/features/rider-list/components/rider-input.tsx`
- **Parallel?**: Yes
- **Steps**:
  1. On the Race URL `<Input>` (inside the Globe icon group): add `data-testid="setup-race-url-input"`
  2. On the Game URL `<Input>` (inside the Link icon group): add `data-testid="setup-game-url-input"`
  3. On the Fetch `<Button>`: add `data-testid="setup-fetch-btn"`
  4. On the Rider List `<Textarea>`: add `data-testid="setup-riders-textarea"`
  5. On the Budget `<Input>` (number type): add `data-testid="setup-budget-input"`
  6. On the Analyze `<button>` (the CTA): add `data-testid="setup-analyze-btn"`
  7. On the valid count `<span>` (shows "X valid"): add `data-testid="setup-valid-count"`
  8. On the invalid count `<span>` (shows "X invalid"): add `data-testid="setup-invalid-count"`
- **Notes**: The Analyze button is a raw `<button>`, not the `<Button>` component. Add `data-testid` directly to the `<button>` element. The valid/invalid spans are conditionally rendered — only add testid to the actual `<span>` elements, not wrapper divs.

### Subtask T004 – Add data-testid to rider-table.tsx

- **Purpose**: Enable e2e tests to interact with rider table filters and locate the table itself.
- **File**: `apps/web/src/features/rider-list/components/rider-table.tsx`
- **Parallel?**: Yes
- **Steps**:
  1. On the filter buttons wrapper div: add `data-testid="dashboard-filter-bar"`
  2. On each filter button: add `data-testid={`dashboard-filter-${filter.toLowerCase()}`}` for All, Selected, Locked, Excluded, Unmatched:
     - `dashboard-filter-all`
     - `dashboard-filter-selected`
     - `dashboard-filter-locked`
     - `dashboard-filter-excluded`
     - `dashboard-filter-unmatched`
  3. On the `<DataTable>` wrapper or the outermost table container: add `data-testid="dashboard-rider-table"`
  4. On the "Showing X of Y" text element: add `data-testid="dashboard-rider-count"`
- **Notes**: The existing `aria-label` on checkboxes (`Select ${name}`), lock buttons (`Lock ${name}` / `Unlock ${name}`), and exclude buttons (`Exclude ${name}` / `Include ${name}`) are already sufficient for per-rider actions — no new testids needed on those.

### Subtask T005 – Add data-testid to rider-list-page.tsx

- **Purpose**: Enable e2e tests to detect loading, error, and empty states.
- **File**: `apps/web/src/features/rider-list/components/rider-list-page.tsx`
- **Parallel?**: Yes
- **Steps**:
  1. On the `<LoadingSpinner>` wrapper (shown when `analyzeState.status === 'loading'`): wrap in a `<div data-testid="setup-analyzing-spinner">` or add the attribute to the LoadingSpinner component.
  2. On the `<ErrorAlert>` wrapper (shown when `analyzeState.status === 'error'`): add `data-testid="setup-analysis-error"`
  3. On the `<EmptyState>` component (shown when `analyzeState.status === 'idle'`): add `data-testid="setup-empty-state"`
- **Notes**: If these shared UI components don't pass through `data-testid`, wrap them in a `<div>` with the testid. Prefer adding testid to the component itself if it accepts arbitrary props via `...rest` spread.

### Subtask T006 – Add data-testid to team-builder-panel.tsx

- **Purpose**: Enable e2e tests to verify team builder sidebar state (roster count, budget, projected score, buttons).
- **File**: `apps/web/src/features/team-builder/components/team-builder-panel.tsx`
- **Parallel?**: Yes
- **Steps**:
  1. On the outermost panel container: add `data-testid="dashboard-team-builder"`
  2. On the roster count display ("X / 9 riders"): add `data-testid="dashboard-roster-count"`
  3. On the remaining budget display: add `data-testid="dashboard-budget-remaining"`
  4. On the projected score number: add `data-testid="dashboard-projected-score"`
  5. On the "Get Optimal Team" button: add `data-testid="dashboard-optimize-btn"`
  6. On the "Review Team" button: add `data-testid="dashboard-review-btn"`
  7. On the "Clear All" button: add `data-testid="dashboard-clear-all-btn"`
- **Notes**: The "Review Team" button is conditionally rendered (only when team is complete). The testid should be on the button element itself.

### Subtask T007 – Add data-testid to index.tsx

- **Purpose**: Enable e2e tests to verify which tab content is currently visible.
- **File**: `apps/web/src/routes/index.tsx`
- **Parallel?**: Yes
- **Steps**:
  1. On the Setup tab content wrapper: add `data-testid="tab-content-setup"`
  2. On the Dashboard tab content wrapper: add `data-testid="tab-content-dashboard"`
  3. On the Optimization tab content wrapper: add `data-testid="tab-content-optimization"`
  4. On the Roster tab content wrapper: add `data-testid="tab-content-roster"`
- **Notes**: These wrappers should be the outermost `<div>` for each tab's content section. They help tests verify which tab is currently displayed.

## Risks & Mitigations

- **Risk**: Adding attributes to shared UI components (`Input`, `Textarea`, `Button`) might not work if they don't spread props. **Mitigation**: Check if each component uses `{...props}` or `{...rest}` in its definition. If not, add `data-testid` to the wrapping element instead.
- **Risk**: Testid names must exactly match what WP03 page objects will use. **Mitigation**: Follow the naming convention strictly. When in doubt, use the names listed in this prompt.

## Review Guidance

- Verify each testid is on the correct element (not a parent/child).
- Verify no functional changes — only `data-testid` prop additions.
- Run `pnpm test` to confirm no unit test regressions.
- Spot-check in browser DevTools that testids are rendered.

## Activity Log

- 2026-03-22T18:05:31Z – system – lane=planned – Prompt created.
- 2026-03-22T18:19:34Z – claude-opus – shell_pid=50430 – lane=doing – Assigned agent via workflow command
- 2026-03-22T18:25:11Z – claude-opus – shell_pid=50430 – lane=for_review – All 7 subtasks complete: config updated, data-testid on 7 components, shared UI extended with rest props
- 2026-03-22T18:29:47Z – claude-opus – shell_pid=67862 – lane=doing – Started review via workflow command
- 2026-03-22T18:30:39Z – claude-opus – shell_pid=67862 – lane=done – Review passed: all 7 subtasks verified, testids correctly placed, shared UI properly extended with rest props, zero functional changes
