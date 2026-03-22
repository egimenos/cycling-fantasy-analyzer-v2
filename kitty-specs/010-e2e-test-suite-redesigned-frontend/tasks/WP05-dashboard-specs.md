---
work_package_id: WP05
title: Dashboard Tab Specs
lane: planned
dependencies: [WP03]
subtasks:
  - T025
  - T026
  - T027
  - T028
  - T029
phase: Phase 2 - Core Specs
assignee: ''
agent: ''
shell_pid: ''
review_status: ''
reviewed_by: ''
history:
  - timestamp: '2026-03-22T18:05:31Z'
    lane: planned
    agent: system
    shell_pid: ''
    action: Prompt generated via /spec-kitty.tasks
requirement_refs:
  - FR-003
  - FR-004
  - FR-009
  - FR-010
---

# Work Package Prompt: WP05 – Dashboard Tab Specs

## ⚠️ IMPORTANT: Review Feedback Status

**Read this first if you are implementing this task!**

- **Has review feedback?**: Check the `review_status` field above.

---

## Review Feedback

_[This section is empty initially.]_

---

## Objectives & Success Criteria

- Create `apps/web/tests/e2e/specs/dashboard.spec.ts` with comprehensive tests for the Dashboard tab (User Story 2).
- Cover all 7 acceptance scenarios from the spec.
- Tests use `setupPage.analyzeValidRiders()` as prerequisite to reach Dashboard.

**Success criteria**:

- `pnpm exec playwright test specs/dashboard.spec.ts` passes.
- Tests cover: rider table display, selection, lock/exclude, filters, team completion, budget tracking.

## Context & Constraints

- **Spec**: US2 acceptance scenarios (7 scenarios)
- **Prerequisite**: Each test needs analyzed riders. Use `setupPage.analyzeValidRiders(validPriceList)` in `beforeEach`.
- **Data**: `valid-price-list.txt` has 20 riders — enough for full team (9) selection.
- **Budget**: Default 2000 should allow selecting 9 riders from the fixture data.
- **Rider names**: The fixture uses real cyclist names (Pogacar, Vingegaard, Evenepoel, etc.) — use these exact names for `aria-label` selectors.

**Implementation command**: `spec-kitty implement WP05 --base WP03`

## Subtasks & Detailed Guidance

### Subtask T025 – Dashboard spec: rider table display

- **Purpose**: Verify the rider table renders with all expected columns after analysis.
- **File**: `apps/web/tests/e2e/specs/dashboard.spec.ts`
- **Steps**:
  1. Import `{ test, expect }` from `../fixtures/test-fixtures`.
  2. Create `test.describe('Dashboard Tab', () => { ... })`.
  3. Add `test.beforeEach` that navigates and analyzes:
     ```typescript
     test.beforeEach(async ({ setupPage, validPriceList }) => {
       await setupPage.goto();
       await setupPage.analyzeValidRiders(validPriceList);
     });
     ```
  4. Write test: `'should display rider table with all columns'`:
     ```
     - expect(dashboardPage.riderTable).toBeVisible()
     - Verify column headers exist: check for text "Rider Name", "Team", "Price", "Score", "Value", "Match"
     - page.getByRole('columnheader') should have count >= 7 (including checkbox + actions)
     ```
  5. Write test: `'should show correct rider count'`:
     ```
     - dashboardPage.riderCount should contain text matching "Showing X" where X > 0
     - Verify table rows count matches expected (use getTableRowCount())
     ```
- **Notes**: Column headers use `getByRole('columnheader')` or `getByText()` — no testids needed on headers since they're static text.

### Subtask T026 – Dashboard spec: rider selection and team builder

- **Purpose**: Test checkbox selection updates the team builder sidebar in real time.
- **File**: Same file, add tests to the describe block.
- **Steps**:
  1. Write test: `'should add rider to team builder when selected via checkbox'`:
     ```
     - Pick a known rider name from the fixture (e.g., "Tadej Pogacar")
     - dashboardPage.selectRider('Tadej Pogacar')
     - expect(dashboardPage.rosterCount).toContainText('1')
     - Verify budget remaining decreased
     - Verify projected score is > 0
     ```
  2. Write test: `'should remove rider from team builder when deselected'`:
     ```
     - Select a rider, verify count is 1
     - Deselect same rider (click checkbox again)
     - expect(dashboardPage.rosterCount).toContainText('0')
     ```
  3. Write test: `'should update budget tracking on selection'`:
     ```
     - Note initial budget remaining text
     - Select a rider
     - Budget remaining should decrease
     - Select another rider
     - Budget remaining should decrease further
     ```
- **Notes**: Rider names in the fixture must exactly match the `aria-label` format. Check `valid-price-list.txt` for exact name strings. The `aria-label` format is `Select ${name}` where `name` comes from the rawName field.

### Subtask T027 – Dashboard spec: lock/exclude rider interactions

- **Purpose**: Test lock and exclude functionality with correct UI feedback.
- **File**: Same file, add tests.
- **Steps**:
  1. Write test: `'should lock a rider and show lock icon'`:
     ```
     - dashboardPage.lockRider('Tadej Pogacar')
     - Verify the rider shows as locked (look for Unlock aria-label now available)
     - page.getByLabel('Unlock Tadej Pogacar') should be visible
     - Rider should be auto-selected in team builder
     ```
  2. Write test: `'should prevent deselecting a locked rider'`:
     ```
     - Lock a rider
     - The checkbox for that rider should be checked and disabled (or clicking it should have no effect)
     - Roster count should still include the locked rider
     ```
  3. Write test: `'should exclude a rider and grey it out'`:
     ```
     - dashboardPage.excludeRider('Jonas Vingegaard')
     - page.getByLabel('Include Jonas Vingegaard') should be visible (button label changed)
     - The rider's checkbox should be disabled
     - The rider should not be in team builder
     ```
  4. Write test: `'should include a previously excluded rider'`:
     ```
     - Exclude a rider, then include them again
     - page.getByLabel('Exclude Jonas Vingegaard') should be visible again
     - Checkbox should be enabled
     ```

### Subtask T028 – Dashboard spec: filter buttons

- **Purpose**: Test that filter buttons correctly filter the rider table.
- **File**: Same file, add tests.
- **Steps**:
  1. Write test: `'should filter to show only selected riders'`:
     ```
     - Select 2 riders
     - dashboardPage.clickFilter('selected')
     - Table should show exactly 2 rows
     - dashboardPage.clickFilter('all') to reset
     ```
  2. Write test: `'should filter to show only locked riders'`:
     ```
     - Lock 1 rider
     - dashboardPage.clickFilter('locked')
     - Table should show exactly 1 row
     ```
  3. Write test: `'should filter to show only excluded riders'`:
     ```
     - Exclude 1 rider
     - dashboardPage.clickFilter('excluded')
     - Table should show exactly 1 row
     ```
  4. Write test: `'should show correct count in filter badges'`:
     ```
     - Select 2, lock 1, exclude 1
     - Verify filter button text includes count (e.g., "Selected 2", "Locked 1")
     ```
- **Notes**: Filter buttons show counts next to the label. The count format is visible as badge text on the button.

### Subtask T029 – Dashboard spec: team completion flow

- **Purpose**: Test that selecting 9 riders shows the "Review Team" button and correct budget state.
- **File**: Same file, add tests.
- **Steps**:
  1. Write test: `'should show Review Team button when 9 riders selected'`:
     ```
     - Select 9 riders (cheapest ones to stay within budget)
     - First, get available rider names from the table
     - Select them one by one via dashboardPage.selectRider(name)
     - expect(dashboardPage.rosterCount).toContainText('9')
     - expect(dashboardPage.reviewTeamBtn).toBeVisible()
     ```
  2. Write test: `'should disable checkbox for rider exceeding budget'`:
     ```
     - Select several riders to reduce remaining budget
     - Find a rider whose price exceeds remaining budget
     - That rider's checkbox should be disabled
     - Price should show in error styling (verify via visual check or attribute)
     ```
- **Notes**: For T029 test 1, you need to select 9 riders that fit within budget=2000. The valid-price-list.txt fixture has riders at various prices. You may need to check the fixture to identify affordable riders. An alternative approach: lock a few cheap riders, then select more until you reach 9.
- **Edge case**: The test should verify that selecting a 10th rider is not possible (checkbox disabled after 9 selected).

## Risks & Mitigations

- **Risk**: Rider names in fixture might not match exactly what the backend returns (rawName vs matchedRider.fullName). **Mitigation**: The `aria-label` uses `rawName` from the frontend state, which comes from the parsed input. Check fixture format.
- **Risk**: Budget math depends on fixture rider prices. **Mitigation**: Use a generous budget (2000) that allows selecting 9 riders.

## Review Guidance

- Verify all 7 US2 acceptance scenarios are covered.
- Verify `beforeEach` uses the composite `analyzeValidRiders` helper.
- Verify per-rider actions use `aria-label` (not testids — the existing labels are sufficient).
- Verify filter tests reset state between tests (each test starts fresh due to `beforeEach`).
- Run: `pnpm exec playwright test specs/dashboard.spec.ts`.

## Activity Log

- 2026-03-22T18:05:31Z – system – lane=planned – Prompt created.
