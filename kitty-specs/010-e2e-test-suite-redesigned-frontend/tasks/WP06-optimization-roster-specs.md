---
work_package_id: WP06
title: Optimization + Roster Specs
lane: 'done'
dependencies: [WP03]
base_branch: 010-e2e-test-suite-redesigned-frontend-WP03
base_commit: b965f8fc31a008508d0ca17ad96f63841b6b87aa
created_at: '2026-03-22T18:38:04.673893+00:00'
subtasks:
  - T030
  - T031
  - T032
  - T033
phase: Phase 2 - Core Specs
assignee: ''
agent: 'claude-opus'
shell_pid: '76724'
review_status: 'approved'
reviewed_by: 'egimenos'
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

# Work Package Prompt: WP06 – Optimization + Roster Specs

## ⚠️ IMPORTANT: Review Feedback Status

**Read this first if you are implementing this task!**

- **Has review feedback?**: Check the `review_status` field above.

---

## Review Feedback

_[This section is empty initially.]_

---

## Objectives & Success Criteria

- Create `apps/web/tests/e2e/specs/optimization.spec.ts` for the Optimization tab (User Story 3).
- Create `apps/web/tests/e2e/specs/roster.spec.ts` for the Roster tab (User Story 4).
- Tests run against the real ML backend optimizer.

**Success criteria**:

- Both spec files pass: `pnpm exec playwright test specs/optimization.spec.ts specs/roster.spec.ts`
- Optimization tests verify: results display, locked rider inclusion, apply to roster.
- Roster tests verify: 9-rider display, metrics, copy to clipboard, reset.

## Context & Constraints

- **Spec**: US3 (4 scenarios), US4 (4 scenarios)
- **Prerequisite**: Both tabs require completing Setup + triggering optimization.
- **Optimizer**: Calls real ML backend — response time 10–20s. Use `test.slow()`.
- **Clipboard**: Playwright needs clipboard permissions. Configure in browser context or use `page.evaluate`.

**Implementation command**: `spec-kitty implement WP06 --base WP03`

## Subtasks & Detailed Guidance

### Subtask T030 – Optimization spec: results display

- **Purpose**: Test that optimization results render correctly with all expected elements.
- **File**: `apps/web/tests/e2e/specs/optimization.spec.ts`
- **Steps**:
  1. Import `{ test, expect }` from `../fixtures/test-fixtures`.
  2. Create `test.describe('Optimization Tab', () => { ... })`.
  3. Add `test.beforeEach` that navigates, analyzes, and triggers optimization:
     ```typescript
     test.beforeEach(async ({ setupPage, dashboardPage, validPriceList }) => {
       await setupPage.goto();
       await setupPage.analyzeValidRiders(validPriceList);
       await dashboardPage.clickOptimize();
       // Wait for optimization tab content
       await page
         .getByTestId('tab-content-optimization')
         .waitFor({ state: 'visible', timeout: 30_000 });
     });
     ```
     Note: `beforeEach` needs access to `page` — destructure it from fixtures.
  4. Write test: `'should display optimization results with projected total and efficiency'`:
     ```
     - expect(optimizationPage.panel).toBeVisible()
     - expect(optimizationPage.projectedTotal).toBeVisible()
     - The projected total text should be a number > 0
     - expect(optimizationPage.budgetEfficiency).toBeVisible()
     - The efficiency text should contain a percentage
     ```
  5. Write test: `'should display rider cards in the lineup'`:
     ```
     - expect(optimizationPage.lineup).toBeVisible()
     - const cardCount = await optimizationPage.getRiderCardCount()
     - expect(cardCount).toBe(9)
     ```
  6. Write test: `'should display score breakdown by category'`:
     ```
     - expect(optimizationPage.scoreBreakdown).toBeVisible()
     - Verify category labels are visible: GC, STAGE, MOUNTAIN, SPRINT
     - page.getByText('GC').should be visible within the breakdown
     ```
- **Notes**: All tests in this describe use `test.slow()` at the describe level since they depend on the real optimizer. The `beforeEach` does the heavy lifting (analyze + optimize) so individual tests are fast assertions.

### Subtask T031 – Optimization spec: locked riders + apply to roster

- **Purpose**: Test that locked riders appear in the optimal team and that "Apply to Roster" works.
- **File**: Same file, add tests.
- **Steps**:
  1. Write test: `'should include locked riders in optimal team'`:
     ```
     - This test needs a custom beforeEach (different from default):
       - Analyze riders
       - Lock a specific rider (e.g., "Tadej Pogacar")
       - Then click optimize
     - After optimization, verify the locked rider is in the lineup:
       - optimizationPage.hasRiderCard('Tadej Pogacar') should be true
     ```
     Note: This test overrides the standard `beforeEach` — either use a separate describe block or do the setup inline.
  2. Write test: `'should transition to Roster tab when Apply to Roster is clicked'`:
     ```
     - (uses standard beforeEach — optimization already done)
     - optimizationPage.clickApplyToRoster()
     - Wait for roster tab content to be visible
     - expect(page.getByTestId('tab-content-roster')).toBeVisible()
     - expect(rosterPage.completeBanner).toBeVisible()
     ```

### Subtask T032 – Roster spec: roster display and metrics

- **Purpose**: Test that the final roster displays 9 riders with correct metrics.
- **File**: `apps/web/tests/e2e/specs/roster.spec.ts`
- **Steps**:
  1. Import `{ test, expect }` from `../fixtures/test-fixtures`.
  2. Create `test.describe('Roster Tab', () => { ... })`.
  3. Add `test.beforeEach` that completes the full flow to reach Roster:
     ```typescript
     test.beforeEach(
       async ({ page, setupPage, dashboardPage, optimizationPage, validPriceList }) => {
         await setupPage.goto();
         await setupPage.analyzeValidRiders(validPriceList);
         await dashboardPage.clickOptimize();
         await page
           .getByTestId('tab-content-optimization')
           .waitFor({ state: 'visible', timeout: 30_000 });
         await optimizationPage.clickApplyToRoster();
         await page.getByTestId('tab-content-roster').waitFor({ state: 'visible', timeout: 5_000 });
       },
     );
     ```
  4. Write test: `'should display 9 riders in the official roster'`:
     ```
     - const riderCount = await rosterPage.getRiderCount()
     - expect(riderCount).toBe(9)
     ```
  5. Write test: `'should show captain badge on first rider'`:
     ```
     - expect(rosterPage.captainBadge).toBeVisible()
     - Captain badge text should contain "CAPTAIN"
     ```
  6. Write test: `'should display all metrics in sidebar'`:
     ```
     - expect(rosterPage.totalScore).toBeVisible()
     - Total score text should be a number > 0
     - expect(rosterPage.totalCost).toBeVisible()
     - expect(rosterPage.remaining).toBeVisible()
     - expect(rosterPage.avgRider).toBeVisible()
     ```
  7. Write test: `'should display success banner'`:
     ```
     - expect(rosterPage.completeBanner).toBeVisible()
     - Banner should contain text "Team Complete"
     ```

### Subtask T033 – Roster spec: copy to clipboard + reset

- **Purpose**: Test the copy and reset actions on the Roster tab.
- **File**: Same file, add tests.
- **Steps**:
  1. Write test: `'should copy roster to clipboard'`:
     ```
     - Grant clipboard permissions in browser context:
       test.use({ permissions: ['clipboard-read', 'clipboard-write'] })
       Or configure in playwright.config.ts
     - rosterPage.clickCopy()
     - Verify button text changes to "Copied!"
     - const copyText = await rosterPage.getCopyButtonText()
     - expect(copyText).toContain('Copied')
     - Wait 2s, verify it reverts to "Copy to Clipboard"
     ```
     Alternative: Read clipboard content via `page.evaluate(() => navigator.clipboard.readText())` and verify it contains rider names.
  2. Write test: `'should reset to Setup tab when Reset is clicked'`:
     ```
     - rosterPage.clickReset()
     - Wait for setup tab content to be visible
     - expect(page.getByTestId('tab-content-setup')).toBeVisible()
     - Verify other tabs are locked again:
       - navPage.isTabLocked('dashboard') should be true
       - navPage.isTabLocked('optimization') should be true
       - navPage.isTabLocked('roster') should be true
     - Verify setup form is empty:
       - expect(setupPage.ridersTextarea).toHaveValue('')
     ```
- **Notes**: The clipboard test may need special configuration. Chromium requires `clipboard-read` and `clipboard-write` permissions. Add them via `test.use()` or in the test's browser context. If clipboard is not available in headless mode, use `page.evaluate` as fallback.

## Risks & Mitigations

- **Risk**: Optimizer response time may exceed 30s. **Mitigation**: Use `test.slow()` (doubles timeout to 120s).
- **Risk**: Clipboard permissions in headless Chromium. **Mitigation**: Configure permissions explicitly; fall back to checking button text change if clipboard API is unavailable.
- **Risk**: The full flow (analyze → optimize → apply) in `beforeEach` is expensive (~30s). **Mitigation**: Keep individual test assertions lightweight. Consider sharing state across tests with `test.describe.serial` if needed (but prefer independent tests).

## Review Guidance

- Verify all US3 (4 scenarios) and US4 (4 scenarios) are covered.
- Verify `test.slow()` is used for optimizer-dependent tests.
- Verify clipboard permissions are configured.
- Verify Reset test checks that ALL downstream tabs are re-locked.
- Run: `pnpm exec playwright test specs/optimization.spec.ts specs/roster.spec.ts`.

## Activity Log

- 2026-03-22T18:05:31Z – system – lane=planned – Prompt created.
- 2026-03-22T18:38:05Z – claude-opus – shell_pid=76724 – lane=doing – Assigned agent via workflow command
- 2026-03-22T18:57:29Z – claude-opus – shell_pid=76724 – lane=done – 10 tests: optimization display, locked riders, apply, roster metrics, copy, reset
