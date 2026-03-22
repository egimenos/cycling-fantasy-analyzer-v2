---
work_package_id: WP04
title: Setup Tab Specs
lane: 'done'
dependencies: [WP03]
base_branch: 010-e2e-test-suite-redesigned-frontend-WP03
base_commit: b965f8fc31a008508d0ca17ad96f63841b6b87aa
created_at: '2026-03-22T18:35:51.790803+00:00'
subtasks:
  - T021
  - T022
  - T023
  - T024
phase: Phase 2 - Core Specs
assignee: ''
agent: 'claude-opus'
shell_pid: '73700'
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

# Work Package Prompt: WP04 – Setup Tab Specs

## ⚠️ IMPORTANT: Review Feedback Status

**Read this first if you are implementing this task!**

- **Has review feedback?**: Check the `review_status` field above.

---

## Review Feedback

_[This section is empty initially.]_

---

## Objectives & Success Criteria

- Create `apps/web/tests/e2e/specs/setup.spec.ts` with comprehensive tests for the Setup tab (User Story 1).
- Cover all 5 acceptance scenarios from the spec.
- Tests run against the real backend and real external services.

**Success criteria**:

- `pnpm exec playwright test specs/setup.spec.ts` passes.
- Tests cover: valid analysis, race URL auto-detect, game URL import, validation feedback, disabled button states.

## Context & Constraints

- **Spec**: US1 acceptance scenarios (5 scenarios)
- **Research**: R4 — real backend, no mocking; generous timeouts for external services
- **Data fixtures**: `valid-price-list.txt` (20 riders), `invalid-price-list.txt` (random text), `partial-match-list.txt`
- **Backend**: API on port 3001 (auto-started by dev server), external PCS + fantasy platform calls are real

**Implementation command**: `spec-kitty implement WP04 --base WP03`

## Subtasks & Detailed Guidance

### Subtask T021 – Setup spec: valid price list analysis flow

- **Purpose**: Test the primary happy path — paste riders, set budget, click analyze, verify transition to Dashboard.
- **File**: `apps/web/tests/e2e/specs/setup.spec.ts`
- **Steps**:
  1. Import `{ test, expect }` from `../fixtures/test-fixtures`.
  2. Create `test.describe('Setup Tab', () => { ... })`.
  3. Write test: `'should analyze a valid price list and display rider table'`:
     ```
     - setupPage.goto()
     - setupPage.fillRiders(validPriceList)
     - setupPage.setBudget(2000)
     - setupPage.clickAnalyze()
     - Wait for dashboard tab content to be visible (timeout: 30s)
     - expect(dashboardPage.riderTable).toBeVisible()
     - expect(dashboardPage.riderCount).toContainText(/showing/i) or similar
     - Verify navPage.dashboardTab is not disabled (tab unlocked)
     ```
  4. Verify the analyze button shows loading state during analysis:
     ```
     - After clicking analyze, check setupPage.analyzingSpinner is visible
     - Then wait for dashboard to appear
     ```
- **Notes**: This test validates SC-001 (existing test scenario restored). Use `test.slow()` annotation since it involves a real API call.

### Subtask T022 – Setup spec: race URL auto-detect

- **Purpose**: Test that entering a PCS race URL triggers race profile auto-detection.
- **File**: `apps/web/tests/e2e/specs/setup.spec.ts` (add to same describe block)
- **Steps**:
  1. Write test: `'should auto-detect race profile from PCS URL'`:
     ```
     - setupPage.goto()
     - setupPage.setRaceUrl('https://www.procyclingstats.com/race/tour-de-france/2025/startlist')
     - Wait for race profile summary to appear (timeout: 30s)
     - expect(page.getByTestId('race-profile-name')).toContainText(/tour de france/i)
     - expect(page.getByTestId('race-profile-type')).toBeVisible()
     ```
  2. Use `test.slow()` — this involves an external HTTP call to PCS.
- **Notes**: Pick a well-known race URL that is unlikely to change. Tour de France 2025 is a safe bet. If the external service is down, the test will fail gracefully with a timeout. The race profile component includes stage profile badges (Flat, Hills, etc.) — verify at least the race name and type.
- **Edge case**: If the URL is invalid, an error alert should appear. Consider testing this:
  ```
  - setupPage.setRaceUrl('https://www.procyclingstats.com/race/fake-race/2099/startlist')
  - Wait and verify error alert appears
  ```

### Subtask T023 – Setup spec: game URL import

- **Purpose**: Test that importing from a game URL populates the rider textarea.
- **File**: `apps/web/tests/e2e/specs/setup.spec.ts` (add to same describe block)
- **Steps**:
  1. Write test: `'should import price list from game URL'`:
     ```
     - setupPage.goto()
     - setupPage.setGameUrl('<valid grandesminivueltas URL>')
     - setupPage.clickFetch()
     - Wait for textarea to be populated (value is not empty, timeout: 30s)
     - expect(setupPage.ridersTextarea).not.toHaveValue('')
     - expect(setupPage.validCount).toBeVisible()
     ```
  2. Use `test.slow()` — this involves external scraping.
- **Notes**: You need a real, working grandesminivueltas URL. Check the existing fixture or the app documentation for a known valid URL. The import endpoint scrapes HTML, so response time depends on the external server. If no known URL is available, check the project README or existing test fixtures for hints.

### Subtask T024 – Setup spec: validation and edge case tests

- **Purpose**: Test frontend-only validation behavior (no API calls needed).
- **File**: `apps/web/tests/e2e/specs/setup.spec.ts` (add to same describe block)
- **Steps**:
  1. Write test: `'should disable Analyze button when no valid riders'`:
     ```
     - setupPage.goto()
     - expect(setupPage.analyzeBtn).toBeDisabled()
     ```
  2. Write test: `'should show valid/invalid counts for mixed input'`:
     ```
     - setupPage.goto()
     - setupPage.fillRiders('Tadej Pogacar, UAD, 500\nthis is not a rider\nJonas Vingegaard, TVL, 480')
     - expect(setupPage.validCount).toContainText('2')
     - expect(setupPage.invalidCount).toContainText('1')
     ```
  3. Write test: `'should enable Analyze button when valid riders exist'`:
     ```
     - setupPage.goto()
     - setupPage.fillRiders('Tadej Pogacar, UAD, 500')
     - expect(setupPage.analyzeBtn).toBeEnabled()
     ```
  4. Write test: `'should show 0 valid for completely invalid input'`:
     ```
     - setupPage.goto()
     - setupPage.fillRiders(invalidPriceList)
     - expect(setupPage.analyzeBtn).toBeDisabled()
     ```
- **Notes**: These tests are fast (no API calls). They validate the `parseRiderLines()` function indirectly through the UI.

## Risks & Mitigations

- **Risk**: External service URLs may change or be down. **Mitigation**: Use `test.slow()`, generous timeouts, and stable URLs (Tour de France). Mark T022/T023 with `test.skip` if external services are known to be unavailable.
- **Risk**: Race profile detection depends on debounced URL input — there may be a delay. **Mitigation**: After setting the URL, wait explicitly for the profile component to appear.

## Review Guidance

- Verify all 5 US1 acceptance scenarios are covered.
- Verify tests import from `../fixtures/test-fixtures` (not `@playwright/test` directly).
- Verify external-dependent tests have `test.slow()` and 30s timeouts.
- Verify frontend-only tests (T024) are fast and don't make unnecessary API calls.
- Run the full spec: `pnpm exec playwright test specs/setup.spec.ts`.

## Activity Log

- 2026-03-22T18:05:31Z – system – lane=planned – Prompt created.
- 2026-03-22T18:35:52Z – claude-opus – shell_pid=73700 – lane=doing – Assigned agent via workflow command
- 2026-03-22T18:36:45Z – claude-opus – shell_pid=73700 – lane=for_review – 7 tests: analysis flow, PCS auto-detect, game import, 4 validation edge cases
- 2026-03-22T18:37:01Z – claude-opus – shell_pid=73700 – lane=done – Review passed: 7 tests covering all US1 scenarios, proper timeouts, uses fixtures correctly
