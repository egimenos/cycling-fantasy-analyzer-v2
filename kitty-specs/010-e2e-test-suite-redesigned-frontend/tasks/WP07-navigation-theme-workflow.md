---
work_package_id: WP07
title: Navigation + Theme + Full Workflow
lane: planned
dependencies:
  - WP03
  - WP01
subtasks:
  - T034
  - T035
  - T036
  - T037
phase: Phase 3 - Integration
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
  - FR-007
  - FR-008
  - FR-009
---

# Work Package Prompt: WP07 – Navigation + Theme + Full Workflow

## ⚠️ IMPORTANT: Review Feedback Status

**Read this first if you are implementing this task!**

- **Has review feedback?**: Check the `review_status` field above.

---

## Review Feedback

_[This section is empty initially.]_

---

## Objectives & Success Criteria

- Create `apps/web/tests/e2e/specs/navigation.spec.ts` for tab state machine (User Story 5).
- Create `apps/web/tests/e2e/specs/theme.spec.ts` for theme toggle (User Story 6).
- Create `apps/web/tests/e2e/specs/full-workflow.spec.ts` for complete happy path (User Story 7) + error handling (User Story 8).

**Success criteria**:

- All three spec files pass: `pnpm exec playwright test specs/navigation.spec.ts specs/theme.spec.ts specs/full-workflow.spec.ts`
- Navigation tests validate progressive unlock, invalidation, and tab lock state.
- Theme tests validate toggle, localStorage persistence, and reload persistence.
- Full workflow test validates the complete journey from Setup through Reset.

## Context & Constraints

- **Spec**: US5 (3 scenarios), US6 (3 scenarios), US7 (1 scenario), US8 (3 scenarios)
- **Flow states**: See data-model.md for state machine transitions.
- **Theme**: Stored in localStorage key `'theme'`, applied via `.dark` class on `<html>`.
- **Full workflow**: Longest test — may take 60–90s with real backend. Use `test.slow()`.

**Implementation command**: `spec-kitty implement WP07 --base WP03`

## Subtasks & Detailed Guidance

### Subtask T034 – Navigation spec: tab state machine

- **Purpose**: Test that tabs unlock progressively and invalidation re-locks downstream tabs.
- **File**: `apps/web/tests/e2e/specs/navigation.spec.ts`
- **Steps**:
  1. Import `{ test, expect }` from `../fixtures/test-fixtures`.
  2. Create `test.describe('Tab Navigation State Machine', () => { ... })`.
  3. Write test: `'should show only Setup tab unlocked on fresh load'`:
     ```
     - setupPage.goto()
     - expect(await navPage.isTabLocked('setup')).toBe(false)
     - expect(await navPage.isTabLocked('dashboard')).toBe(true)
     - expect(await navPage.isTabLocked('optimization')).toBe(true)
     - expect(await navPage.isTabLocked('roster')).toBe(true)
     - Verify locked tabs show Lock icon (check for SVG or specific element)
     - Verify locked tab buttons are disabled (not clickable)
     ```
  4. Write test: `'should unlock Dashboard after successful analysis'`:
     ```
     - setupPage.goto()
     - setupPage.analyzeValidRiders(validPriceList)
     - Wait for dashboard to appear
     - expect(await navPage.isTabLocked('dashboard')).toBe(false)
     - expect(await navPage.isTabActive('dashboard')).toBe(true)
     - Setup tab should still be unlocked
     - Optimization and Roster should still be locked
     ```
  5. Write test: `'should unlock Optimization after clicking Get Optimal Team'`:
     ```
     - Complete analyze flow
     - dashboardPage.clickOptimize()
     - Wait for optimization tab content
     - expect(await navPage.isTabLocked('optimization')).toBe(false)
     - Roster should still be locked
     ```
  6. Write test: `'should re-lock downstream tabs when lock/exclude changes after optimization'`:
     ```
     - Complete full flow: analyze → optimize
     - Navigate back to Dashboard tab: navPage.goToTab('dashboard')
     - Lock or exclude a rider: dashboardPage.lockRider('Tadej Pogacar')
     - Optimization tab should now be locked again (INVALIDATE_FROM):
       expect(await navPage.isTabLocked('optimization')).toBe(true)
     - Roster tab should also be locked
     ```
     This tests the INVALIDATE flow from the state machine.
- **Notes**: The invalidation behavior is triggered by `INVALIDATE_FROM` action in the flow reducer when lock/exclude state changes. Check that the optimization tab re-locks — this is the key regression test for the state machine.

### Subtask T035 – Theme spec: toggle and persistence

- **Purpose**: Test theme toggle functionality and localStorage persistence.
- **File**: `apps/web/tests/e2e/specs/theme.spec.ts`
- **Steps**:
  1. Import `{ test, expect }` from `../fixtures/test-fixtures`.
  2. Create `test.describe('Theme Toggle', () => { ... })`.
  3. Write test: `'should switch from dark to light mode'`:
     ```
     - setupPage.goto()
     - Verify initial theme (default is dark or system preference)
     - const initialTheme = await navPage.getCurrentTheme()
     - navPage.toggleTheme()
     - const newTheme = await navPage.getCurrentTheme()
     - expect(newTheme).not.toBe(initialTheme)
     - If initial was 'dark', verify <html> no longer has .dark class
     ```
  4. Write test: `'should persist theme in localStorage'`:
     ```
     - setupPage.goto()
     - navPage.toggleTheme()
     - const theme = await page.evaluate(() => localStorage.getItem('theme'))
     - expect(theme).toBeTruthy()
     ```
  5. Write test: `'should persist theme across page reload'`:
     ```
     - setupPage.goto()
     - const initialTheme = await navPage.getCurrentTheme()
     - navPage.toggleTheme() // Switch theme
     - const switchedTheme = await navPage.getCurrentTheme()
     - expect(switchedTheme).not.toBe(initialTheme)
     - page.reload()
     - Wait for page to load
     - const reloadedTheme = await navPage.getCurrentTheme()
     - expect(reloadedTheme).toBe(switchedTheme) // Theme persisted
     ```
  6. Write test: `'should toggle back to original theme'`:
     ```
     - setupPage.goto()
     - const original = await navPage.getCurrentTheme()
     - navPage.toggleTheme() // First toggle
     - navPage.toggleTheme() // Second toggle — back to original
     - const finalTheme = await navPage.getCurrentTheme()
     - expect(finalTheme).toBe(original)
     ```
- **Notes**: Theme tests are fast (no API calls). Each test should start with `page.evaluate(() => localStorage.clear())` or use a fresh context to avoid state leaking. Alternatively, clear theme in `beforeEach`.

### Subtask T036 – Full workflow spec: complete happy path

- **Purpose**: Test the entire application flow from start to finish as a single integration test.
- **File**: `apps/web/tests/e2e/specs/full-workflow.spec.ts`
- **Steps**:
  1. Import `{ test, expect }` from `../fixtures/test-fixtures`.
  2. Create `test.describe('Full End-to-End Workflow', () => { ... })`.
  3. Write test: `'should complete full workflow: setup → dashboard → optimize → roster → reset'`:

     ```
     test.slow(); // This test will take 60-90s

     // 1. SETUP
     await setupPage.goto();
     await setupPage.fillRiders(validPriceList);
     await setupPage.setBudget(2000);
     await setupPage.clickAnalyze();

     // 2. DASHBOARD — verify and interact
     await expect(dashboardPage.riderTable).toBeVisible({ timeout: 30_000 });
     // Lock a rider
     await dashboardPage.lockRider('Tadej Pogacar');
     // Verify lock is reflected
     await expect(page.getByLabel('Unlock Tadej Pogacar')).toBeVisible();

     // 3. OPTIMIZE
     await dashboardPage.clickOptimize();
     await expect(optimizationPage.panel).toBeVisible({ timeout: 30_000 });
     // Verify locked rider is in optimal team
     expect(await optimizationPage.hasRiderCard('Tadej Pogacar')).toBe(true);
     // Verify 9 riders in lineup
     expect(await optimizationPage.getRiderCardCount()).toBe(9);

     // 4. ROSTER
     await optimizationPage.clickApplyToRoster();
     await expect(rosterPage.completeBanner).toBeVisible({ timeout: 5_000 });
     // Verify 9 riders in roster
     expect(await rosterPage.getRiderCount()).toBe(9);
     // Verify metrics visible
     await expect(rosterPage.totalScore).toBeVisible();

     // 5. COPY
     await rosterPage.clickCopy();
     await expect(rosterPage.copyBtn).toContainText(/copied/i);

     // 6. RESET
     await rosterPage.clickReset();
     await expect(page.getByTestId('tab-content-setup')).toBeVisible();
     // Verify all tabs re-locked
     expect(await navPage.isTabLocked('dashboard')).toBe(true);
     expect(await navPage.isTabLocked('optimization')).toBe(true);
     expect(await navPage.isTabLocked('roster')).toBe(true);
     ```

  4. This single test validates SC-003 (full workflow success criteria).

- **Notes**: This is the smoke test. If this passes, the core flow works. Keep it as a single test — don't split into multiple tests because the state builds incrementally.

### Subtask T037 – Full workflow spec: error handling edge cases

- **Purpose**: Test error paths and edge cases (User Story 8).
- **File**: Same file, add to describe block.
- **Steps**:
  1. Write test: `'should keep Analyze disabled with completely invalid input'`:
     ```
     - setupPage.goto()
     - setupPage.fillRiders(invalidPriceList)
     - expect(setupPage.analyzeBtn).toBeDisabled()
     ```
  2. Write test: `'should show correct counts for mixed valid/invalid input'`:
     ```
     - setupPage.goto()
     - setupPage.fillRiders(partialMatchList)
     - Verify valid count and invalid count are displayed
     - Verify analyze button is enabled (some valid riders exist)
     ```
  3. Write test: `'should disable checkbox for budget-exceeding rider'`:
     ```
     - setupPage.goto()
     - setupPage.analyzeValidRiders(validPriceList, 100)  // Very low budget
     - On dashboard, check that expensive riders have disabled checkboxes
     - Verify at least one rider checkbox is disabled
     ```
- **Notes**: Error handling tests are fast (mostly frontend validation). The budget test (test 3) uses a very low budget (100) to ensure some riders exceed it. The `analyzeValidRiders` helper should accept a budget parameter.

## Risks & Mitigations

- **Risk**: Full workflow test (T036) is long and may flake. **Mitigation**: `test.slow()`, explicit waits at each transition, generous timeouts.
- **Risk**: State machine invalidation test (T034) may be timing-sensitive. **Mitigation**: Wait for tab state to update after lock/exclude action before asserting.
- **Risk**: Theme localStorage may persist between tests. **Mitigation**: Clear localStorage in `beforeEach` for theme tests.

## Review Guidance

- Verify US5 (3 scenarios), US6 (3 scenarios), US7 (1 scenario), US8 (3 scenarios) are all covered.
- Verify full workflow test covers the entire journey in sequence.
- Verify navigation invalidation test correctly checks downstream tab re-locking.
- Verify theme tests clear localStorage to avoid state leaking.
- Run: `pnpm exec playwright test specs/navigation.spec.ts specs/theme.spec.ts specs/full-workflow.spec.ts`.

## Activity Log

- 2026-03-22T18:05:31Z – system – lane=planned – Prompt created.
