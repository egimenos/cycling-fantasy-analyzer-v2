# Work Packages: E2E Test Suite for Redesigned Frontend

**Inputs**: Design documents from `kitty-specs/010-e2e-test-suite-redesigned-frontend/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Organization**: Fine-grained subtasks (`Txxx`) roll up into work packages (`WPxx`). Each work package is independently deliverable and testable.

**Prompt Files**: Each work package references a prompt file in `tasks/`.

---

## Work Package WP01: Playwright Config + Core Flow data-testid (Priority: P0)

**Goal**: Update Playwright configuration for new directory structure and add `data-testid` attributes to all Setup + Dashboard flow components (P1 priority components).
**Independent Test**: Existing unit tests still pass; components render unchanged; `data-testid` attributes visible in browser DevTools.
**Prompt**: `tasks/WP01-config-and-core-testids.md`
**Estimated Prompt Size**: ~400 lines

**Requirements Refs**: FR-002, FR-006, FR-009

### Included Subtasks

- [ ] T001 Update `apps/web/playwright.config.ts` testDir to `./tests/e2e/specs`
- [ ] T002 [P] Add data-testid to `apps/web/src/features/flow/components/flow-tabs.tsx` (4 tab buttons)
- [ ] T003 [P] Add data-testid to `apps/web/src/features/rider-list/components/rider-input.tsx` (7 inputs/buttons + validation counters)
- [ ] T004 [P] Add data-testid to `apps/web/src/features/rider-list/components/rider-table.tsx` (5 filter buttons + table container)
- [ ] T005 [P] Add data-testid to `apps/web/src/features/rider-list/components/rider-list-page.tsx` (3 state indicators)
- [ ] T006 [P] Add data-testid to `apps/web/src/features/team-builder/components/team-builder-panel.tsx` (7 displays/buttons)
- [ ] T007 [P] Add data-testid to `apps/web/src/routes/index.tsx` (4 tab content containers)

### Implementation Notes

- Each data-testid addition is a simple prop addition — zero logic changes.
- Naming convention: `data-testid="<context>-<element>"` in kebab-case.
- Verify no existing unit tests break after adding attributes (run `pnpm test` in apps/web).

### Parallel Opportunities

- T002–T007 are all independent file changes and can proceed in parallel.
- T001 (config) has no dependencies on testid additions.

### Dependencies

- None (starting package).

### Risks & Mitigations

- Risk: Testid names chosen here must match page objects in WP03. Mitigation: Follow naming convention from research.md R2 strictly.

---

## Work Package WP02: Remaining Component data-testid + Directory Scaffold (Priority: P0)

**Goal**: Add `data-testid` to Optimization, Roster, and global components (P2/P3 priority). Delete old broken test file. Create new directory structure.
**Independent Test**: Components render unchanged; old broken test file removed; new empty directories exist.
**Prompt**: `tasks/WP02-remaining-testids-and-scaffold.md`
**Estimated Prompt Size**: ~350 lines

**Requirements Refs**: FR-002, FR-006, FR-009

### Included Subtasks

- [ ] T008 [P] Add data-testid to `apps/web/src/routes/__root.tsx` (navbar, theme toggle)
- [ ] T009 [P] Add data-testid to `apps/web/src/features/optimizer/components/optimizer-panel.tsx` (5 displays/buttons)
- [ ] T010 [P] Add data-testid to `apps/web/src/features/optimizer/components/optimal-team-card.tsx` and `score-breakdown.tsx`
- [ ] T011 [P] Add data-testid to `apps/web/src/features/team-builder/components/team-summary.tsx` (10 displays/buttons)
- [ ] T012 [P] Add data-testid to `apps/web/src/features/rider-list/components/race-profile-summary.tsx` (4 displays)
- [ ] T013 Delete `apps/web/tests/e2e/full-workflow.spec.ts` and create directories: `pages/`, `specs/`, `helpers/`

### Implementation Notes

- Same pattern as WP01: simple prop additions, no logic changes.
- T013 removes the old broken test file and creates the directory scaffold for WP03.
- Move existing fixture txt files to remain in `fixtures/` (they stay where they are).

### Parallel Opportunities

- T008–T012 are all independent file changes. T013 can run alongside.

### Dependencies

- None (can run in parallel with WP01 — different files).

### Risks & Mitigations

- Risk: Deleting old test file before new ones exist leaves zero e2e coverage temporarily. Mitigation: This is expected during the transition; WP04–WP07 restore coverage.

---

## Work Package WP03: Page Object Model + Custom Fixtures + Helpers (Priority: P0)

**Goal**: Create the complete test infrastructure: 5 page objects, Playwright custom fixtures with `test.extend<>`, and shared helper utilities.
**Independent Test**: TypeScript compiles; fixtures can be imported; page objects instantiate without errors.
**Prompt**: `tasks/WP03-page-objects-and-fixtures.md`
**Estimated Prompt Size**: ~500 lines

**Requirements Refs**: FR-001, FR-005, FR-006

### Included Subtasks

- [ ] T014 Create `apps/web/tests/e2e/pages/nav.page.ts` (NavPage: tab navigation + theme toggle locators, actions, assertions)
- [ ] T015 Create `apps/web/tests/e2e/pages/setup.page.ts` (SetupPage: inputs, buttons, validation feedback)
- [ ] T016 Create `apps/web/tests/e2e/pages/dashboard.page.ts` (DashboardPage: rider table, filters, lock/exclude, team builder)
- [ ] T017 Create `apps/web/tests/e2e/pages/optimization.page.ts` (OptimizationPage: results display, apply to roster)
- [ ] T018 Create `apps/web/tests/e2e/pages/roster.page.ts` (RosterPage: roster list, metrics, copy, reset)
- [ ] T019 Create `apps/web/tests/e2e/helpers/wait-helpers.ts` (shared timeout constants, API wait utilities)
- [ ] T020 Create `apps/web/tests/e2e/fixtures/test-fixtures.ts` (test.extend composing all page objects + data fixture loading)

### Implementation Notes

- Page objects follow data-model.md entity definitions exactly.
- Each page object uses `data-testid` locators as primary selectors, `aria-label` for rider-specific actions.
- `test.extend<E2EFixtures>` provides type-safe injection to all spec files.
- Fixtures load txt files from `fixtures/` directory using `readFileSync`.

### Parallel Opportunities

- T014–T018 (page objects) can be developed in parallel — each is a separate file.
- T019 (helpers) is independent.
- T020 (fixtures) depends on T014–T018 being at least drafted.

### Dependencies

- Depends on WP01 + WP02 (needs data-testid attributes on components to write correct locators).

### Risks & Mitigations

- Risk: Page object locators might not match actual testids if naming is inconsistent. Mitigation: Cross-reference research.md R5 mapping table during implementation.
- Risk: DashboardPage is the most complex page object (~20 locators). Mitigation: Group locators by section (table, filters, teamBuilder).

---

## Work Package WP04: Setup Tab Specs (Priority: P1) 🎯 MVP

**Goal**: Write comprehensive e2e tests for the Setup tab covering all US1 acceptance scenarios.
**Independent Test**: `pnpm exec playwright test specs/setup.spec.ts` passes against running dev server.
**Prompt**: `tasks/WP04-setup-specs.md`
**Estimated Prompt Size**: ~400 lines

**Requirements Refs**: FR-003, FR-004, FR-009, FR-010

### Included Subtasks

- [ ] T021 Create `apps/web/tests/e2e/specs/setup.spec.ts` — valid price list analysis flow (paste riders, set budget, click analyze, verify dashboard unlocks with rider table)
- [ ] T022 Add setup spec: race URL auto-detect tests (enter PCS URL, verify race profile summary with race type, stages, rider counts)
- [ ] T023 Add setup spec: game URL import tests (enter game URL, click Fetch, verify textarea populated with rider data)
- [ ] T024 Add setup spec: validation and edge case tests (disabled analyze button with no riders, valid/invalid line counts, mixed valid+invalid input)

### Implementation Notes

- All tests import from `../fixtures/test-fixtures.ts` and use custom fixtures.
- T022 and T023 depend on real external services — use generous timeouts (30s).
- T024 tests are purely frontend validation — no API calls needed.
- Each test starts from `page.goto('/')` fresh.

### Parallel Opportunities

- T021–T024 can be developed incrementally in the same file, but T022/T023 (external services) are independent from T021/T024.

### Dependencies

- Depends on WP03 (needs page objects and fixtures).

### Risks & Mitigations

- Risk: External service tests (T022, T023) may be flaky. Mitigation: Use `test.slow()` annotation and 30s timeouts for these tests.
- Risk: PCS URL in fixtures might become stale. Mitigation: Use a well-known recent grand tour URL.

---

## Work Package WP05: Dashboard Tab Specs (Priority: P1) 🎯 MVP

**Goal**: Write comprehensive e2e tests for the Dashboard tab covering all US2 acceptance scenarios.
**Independent Test**: `pnpm exec playwright test specs/dashboard.spec.ts` passes against running dev server.
**Prompt**: `tasks/WP05-dashboard-specs.md`
**Estimated Prompt Size**: ~450 lines

**Requirements Refs**: FR-003, FR-004, FR-009, FR-010

### Included Subtasks

- [ ] T025 Create `apps/web/tests/e2e/specs/dashboard.spec.ts` — rider table display test (all columns visible: Rank, Name, Team, Price, Score, Value, Match, Actions)
- [ ] T026 Add dashboard spec: rider selection and team builder sidebar tests (checkbox toggle, budget tracking, projected score update)
- [ ] T027 Add dashboard spec: lock/exclude rider interaction tests (lock icon display, exclude greying, checkbox disable behavior)
- [ ] T028 Add dashboard spec: filter button tests (All, Selected, Locked, Excluded, Unmatched — verify correct filtering and counts)
- [ ] T029 Add dashboard spec: team completion flow (select 9 riders within budget, verify "Review Team" button appears, budget meter state)

### Implementation Notes

- Dashboard tests require the Setup flow as prerequisite — use a `beforeEach` or shared fixture that completes analysis first.
- Use `setupPage.analyzeValidRiders()` helper from fixture to get to Dashboard quickly.
- Rider-specific actions (lock, exclude, select) use `aria-label` attributes which already exist.
- Filter tests should verify both the count badges and the table content.

### Parallel Opportunities

- T025–T029 are in the same file but test independent UI sections. Can be developed in any order.

### Dependencies

- Depends on WP03 (needs page objects and fixtures).
- Can run in parallel with WP04 (different spec file).

### Risks & Mitigations

- Risk: DashboardPage is the most complex page object; tests may need many locator refinements. Mitigation: Start with T025 (read-only assertions) before interaction tests.
- Risk: Team completion test (T029) needs 9 affordable riders in the fixture data. Mitigation: Verify valid-price-list.txt has enough riders under the test budget.

---

## Work Package WP06: Optimization + Roster Specs (Priority: P2)

**Goal**: Write e2e tests for Optimization tab (US3) and Roster tab (US4).
**Independent Test**: `pnpm exec playwright test specs/optimization.spec.ts specs/roster.spec.ts` passes.
**Prompt**: `tasks/WP06-optimization-roster-specs.md`
**Estimated Prompt Size**: ~400 lines

**Requirements Refs**: FR-003, FR-004, FR-009, FR-010

### Included Subtasks

- [ ] T030 Create `apps/web/tests/e2e/specs/optimization.spec.ts` — optimization results display (projected total, budget efficiency, rider cards grid, score breakdown categories)
- [ ] T031 Add optimization spec: locked riders inclusion + apply to roster transition test
- [ ] T032 Create `apps/web/tests/e2e/specs/roster.spec.ts` — roster display tests (9 riders listed, captain badge on first, metrics sidebar: total score, expenditure, remaining, avg/rider)
- [ ] T033 Add roster spec: copy to clipboard + reset tests (button text change to "Copied!", reset returns to Setup)

### Implementation Notes

- Optimization tests require completing Setup + clicking "Get Optimal Team" — use fixture helpers.
- The optimizer calls the real ML backend; expect 10–20s response time.
- Roster tests require a complete team (either via optimizer or manual selection).
- Copy to clipboard test: use `page.evaluate(() => navigator.clipboard.readText())` with clipboard permissions.
- Reset test: verify all tabs re-lock and Setup tab is active.

### Parallel Opportunities

- T030–T031 (optimization) and T032–T033 (roster) are different spec files, can be developed in parallel.

### Dependencies

- Depends on WP03 (needs page objects and fixtures).
- Can run in parallel with WP04, WP05 (different spec files).

### Risks & Mitigations

- Risk: Optimizer response time may cause timeouts. Mitigation: Use `test.slow()` and 30s waits for optimization API.
- Risk: Clipboard API requires browser permission. Mitigation: Configure Playwright browser context with clipboard permissions granted.

---

## Work Package WP07: Navigation + Theme + Full Workflow (Priority: P2/P3)

**Goal**: Write e2e tests for tab state machine (US5), theme toggle (US6), full happy-path workflow (US7), and error handling (US8).
**Independent Test**: `pnpm exec playwright test specs/navigation.spec.ts specs/theme.spec.ts specs/full-workflow.spec.ts` passes.
**Prompt**: `tasks/WP07-navigation-theme-workflow.md`
**Estimated Prompt Size**: ~450 lines

**Requirements Refs**: FR-003, FR-004, FR-007, FR-008, FR-009

### Included Subtasks

- [ ] T034 Create `apps/web/tests/e2e/specs/navigation.spec.ts` — tab state machine (initial lock state, progressive unlock after analyze, unlock after optimize, invalidation on lock change re-locks downstream)
- [ ] T035 Create `apps/web/tests/e2e/specs/theme.spec.ts` — theme toggle (switch dark→light, light→dark, localStorage persistence, persistence across reload)
- [ ] T036 Create `apps/web/tests/e2e/specs/full-workflow.spec.ts` — complete happy path (setup → dashboard → lock rider → optimize → roster → copy → reset → verify initial state)
- [ ] T037 Add full-workflow spec: error handling edge cases (invalid input shows disabled button, mixed valid/invalid shows counts, budget-exceeded rider has disabled checkbox)
- [ ] T038 [P] Update `README.md` with e2e test documentation (run commands, structure overview, prerequisites)

### Implementation Notes

- Navigation tests validate the flow state machine by checking tab lock/unlock icons and clickability at each stage.
- Theme tests use `page.evaluate(() => document.documentElement.classList.contains('dark'))` to verify theme class.
- Theme persistence test uses `page.reload()` and re-checks theme state.
- Full workflow test is the longest single test — may take 60–90s with real backend calls.
- Error handling tests are fast (frontend-only validation).

### Parallel Opportunities

- T034 (navigation), T035 (theme), and T036–T037 (full workflow) are independent spec files.

### Dependencies

- Depends on WP03 (needs page objects and fixtures).
- Full workflow test (T036) logically validates all tabs, so it's best run after WP04–WP06 are proven to work.

### Risks & Mitigations

- Risk: Full workflow test is long and depends on multiple real API calls (analyze + optimize). Mitigation: Use `test.slow()` and increase test timeout to 120s for this spec.
- Risk: Theme test localStorage may carry state between tests. Mitigation: Use `page.evaluate(() => localStorage.clear())` in beforeEach or use a fresh browser context per test.

---

## Dependency & Execution Summary

```
WP01 ──┐
       ├──→ WP03 ──┬──→ WP04 (Setup specs)      ──┐
WP02 ──┘           ├──→ WP05 (Dashboard specs)    ├──→ WP07 (Nav + Theme + Full Workflow)
                   ├──→ WP06 (Optim + Roster specs)┘
                   └──→ WP07 (can start in parallel with WP04-06, but full-workflow test validates all)
```

- **Phase 0 (Foundation)**: WP01 + WP02 (parallel) — data-testid additions + config
- **Phase 1 (Infrastructure)**: WP03 — page objects + fixtures (depends on WP01+WP02)
- **Phase 2 (Core Specs)**: WP04 + WP05 + WP06 (parallel) — per-tab test specs
- **Phase 3 (Integration)**: WP07 — navigation, theme, full workflow

**Parallelization**: WP01 || WP02, then WP04 || WP05 || WP06. Maximum 3 agents can work simultaneously in Phase 2.

**MVP Scope**: WP01 + WP03 + WP04 + WP05 delivers working e2e tests for the Setup and Dashboard tabs (the P1 user stories, SC-001, SC-002).

---

## Subtask Index (Reference)

| Subtask ID | Summary                                                  | Work Package | Priority | Parallel? |
| ---------- | -------------------------------------------------------- | ------------ | -------- | --------- |
| T001       | Update playwright.config.ts testDir                      | WP01         | P0       | No        |
| T002       | data-testid: flow-tabs.tsx                               | WP01         | P0       | Yes       |
| T003       | data-testid: rider-input.tsx                             | WP01         | P0       | Yes       |
| T004       | data-testid: rider-table.tsx                             | WP01         | P0       | Yes       |
| T005       | data-testid: rider-list-page.tsx                         | WP01         | P0       | Yes       |
| T006       | data-testid: team-builder-panel.tsx                      | WP01         | P0       | Yes       |
| T007       | data-testid: index.tsx                                   | WP01         | P0       | Yes       |
| T008       | data-testid: \_\_root.tsx                                | WP02         | P0       | Yes       |
| T009       | data-testid: optimizer-panel.tsx                         | WP02         | P0       | Yes       |
| T010       | data-testid: optimal-team-card.tsx + score-breakdown.tsx | WP02         | P0       | Yes       |
| T011       | data-testid: team-summary.tsx                            | WP02         | P0       | Yes       |
| T012       | data-testid: race-profile-summary.tsx                    | WP02         | P0       | Yes       |
| T013       | Delete old test file + create directory scaffold         | WP02         | P0       | Yes       |
| T014       | Create nav.page.ts                                       | WP03         | P0       | Yes       |
| T015       | Create setup.page.ts                                     | WP03         | P0       | Yes       |
| T016       | Create dashboard.page.ts                                 | WP03         | P0       | Yes       |
| T017       | Create optimization.page.ts                              | WP03         | P0       | Yes       |
| T018       | Create roster.page.ts                                    | WP03         | P0       | Yes       |
| T019       | Create wait-helpers.ts                                   | WP03         | P0       | Yes       |
| T020       | Create test-fixtures.ts                                  | WP03         | P0       | No        |
| T021       | Setup spec: valid price list analysis                    | WP04         | P1       | No        |
| T022       | Setup spec: race URL auto-detect                         | WP04         | P1       | No        |
| T023       | Setup spec: game URL import                              | WP04         | P1       | No        |
| T024       | Setup spec: validation edge cases                        | WP04         | P1       | No        |
| T025       | Dashboard spec: rider table display                      | WP05         | P1       | No        |
| T026       | Dashboard spec: selection + team builder                 | WP05         | P1       | No        |
| T027       | Dashboard spec: lock/exclude interactions                | WP05         | P1       | No        |
| T028       | Dashboard spec: filter buttons                           | WP05         | P1       | No        |
| T029       | Dashboard spec: team completion flow                     | WP05         | P1       | No        |
| T030       | Optimization spec: results display                       | WP06         | P2       | Yes       |
| T031       | Optimization spec: locked riders + apply                 | WP06         | P2       | Yes       |
| T032       | Roster spec: roster display + metrics                    | WP06         | P2       | Yes       |
| T033       | Roster spec: copy + reset                                | WP06         | P2       | Yes       |
| T034       | Navigation spec: tab state machine                       | WP07         | P2       | Yes       |
| T035       | Theme spec: toggle + persistence                         | WP07         | P3       | Yes       |
| T036       | Full workflow spec: happy path                           | WP07         | P1       | No        |
| T037       | Full workflow spec: error edge cases                     | WP07         | P3       | No        |
| T038       | Update README with e2e test docs                         | WP07         | P3       | Yes       |
