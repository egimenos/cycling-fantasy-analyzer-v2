---
work_package_id: WP03
title: Page Object Model + Custom Fixtures + Helpers
lane: planned
dependencies:
  - WP01
  - WP02
subtasks:
  - T014
  - T015
  - T016
  - T017
  - T018
  - T019
  - T020
phase: Phase 1 - Infrastructure
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
  - FR-001
  - FR-005
  - FR-006
---

# Work Package Prompt: WP03 – Page Object Model + Custom Fixtures + Helpers

## ⚠️ IMPORTANT: Review Feedback Status

**Read this first if you are implementing this task!**

- **Has review feedback?**: Check the `review_status` field above.

---

## Review Feedback

_[This section is empty initially.]_

---

## Objectives & Success Criteria

- Create 5 page objects (NavPage, SetupPage, DashboardPage, OptimizationPage, RosterPage) following the data-model.md definitions.
- Create shared wait helpers with timeout constants.
- Create Playwright custom fixtures via `test.extend<E2EFixtures>` that inject page objects and data fixtures.
- All page objects compile without errors and use the `data-testid` attributes added in WP01/WP02.

**Success criteria**:

- TypeScript compiles with no errors.
- `test-fixtures.ts` exports a `test` object and an `expect` re-export usable by spec files.
- Page objects expose the locators, actions, and assertion methods defined in data-model.md.

## Context & Constraints

- **Data model**: `kitty-specs/010-e2e-test-suite-redesigned-frontend/data-model.md` — exact page object interfaces
- **Research**: `kitty-specs/010-e2e-test-suite-redesigned-frontend/research.md` (R1: custom fixtures, R2: selector strategy)
- **Selector priority**: `data-testid` > `aria-label` > `getByRole` > `getByText`
- **Constitution**: English only, TypeScript strict, no `any` types

**Implementation command**: `spec-kitty implement WP03 --base WP01`

## Subtasks & Detailed Guidance

### Subtask T014 – Create nav.page.ts

- **Purpose**: Encapsulate tab navigation and theme toggle interactions.
- **File**: `apps/web/tests/e2e/pages/nav.page.ts`
- **Parallel?**: Yes
- **Steps**:
  1. Import `Page`, `Locator` from `@playwright/test`.
  2. Create `NavPage` class with constructor accepting `Page`.
  3. Define locators:
     ```typescript
     readonly setupTab: Locator;        // page.getByTestId('flow-tab-setup')
     readonly dashboardTab: Locator;     // page.getByTestId('flow-tab-dashboard')
     readonly optimizationTab: Locator;  // page.getByTestId('flow-tab-optimization')
     readonly rosterTab: Locator;        // page.getByTestId('flow-tab-roster')
     readonly themeToggle: Locator;      // page.getByTestId('nav-theme-toggle')
     ```
  4. Define actions:
     ```typescript
     async goToTab(tab: 'setup' | 'dashboard' | 'optimization' | 'roster'): Promise<void>
     async toggleTheme(): Promise<void>
     ```
  5. Define assertions:
     ```typescript
     async isTabLocked(tab: string): Promise<boolean>  // check disabled attribute
     async isTabActive(tab: string): Promise<boolean>   // check active styling/attribute
     async getCurrentTheme(): Promise<'light' | 'dark'> // check html classList
     ```
- **Notes**: `getCurrentTheme()` should use `page.evaluate(() => document.documentElement.classList.contains('dark'))`.

### Subtask T015 – Create setup.page.ts

- **Purpose**: Encapsulate all Setup tab interactions for rider input, budget, URLs, and analysis.
- **File**: `apps/web/tests/e2e/pages/setup.page.ts`
- **Parallel?**: Yes
- **Steps**:
  1. Create `SetupPage` class with constructor accepting `Page`.
  2. Define locators:
     ```typescript
     readonly raceUrlInput: Locator;    // page.getByTestId('setup-race-url-input')
     readonly gameUrlInput: Locator;    // page.getByTestId('setup-game-url-input')
     readonly fetchBtn: Locator;        // page.getByTestId('setup-fetch-btn')
     readonly ridersTextarea: Locator;  // page.getByTestId('setup-riders-textarea')
     readonly budgetInput: Locator;     // page.getByTestId('setup-budget-input')
     readonly analyzeBtn: Locator;      // page.getByTestId('setup-analyze-btn')
     readonly validCount: Locator;      // page.getByTestId('setup-valid-count')
     readonly invalidCount: Locator;    // page.getByTestId('setup-invalid-count')
     readonly analyzingSpinner: Locator; // page.getByTestId('setup-analyzing-spinner')
     readonly analysisError: Locator;   // page.getByTestId('setup-analysis-error')
     readonly emptyState: Locator;      // page.getByTestId('setup-empty-state')
     ```
  3. Define actions:
     ```typescript
     async goto(): Promise<void>                    // page.goto('/')
     async fillRiders(text: string): Promise<void>  // fill textarea
     async setBudget(budget: number): Promise<void>  // clear + fill budget input
     async setRaceUrl(url: string): Promise<void>
     async setGameUrl(url: string): Promise<void>
     async clickAnalyze(): Promise<void>
     async clickFetch(): Promise<void>
     // Composite action:
     async analyzeValidRiders(riderText: string, budget?: number): Promise<void>
     // Fills riders, sets budget (default 2000), clicks analyze, waits for dashboard
     ```
  4. Define assertions:
     ```typescript
     async isAnalyzeDisabled(): Promise<boolean>
     async getValidCount(): Promise<string>   // text content of valid count element
     async getInvalidCount(): Promise<string>
     ```
- **Notes**: The `analyzeValidRiders()` composite action is critical — it will be used as a prerequisite by Dashboard, Optimization, and Roster tests. It should wait for the dashboard tab content to become visible (using `page.getByTestId('tab-content-dashboard')`) after clicking analyze.

### Subtask T016 – Create dashboard.page.ts

- **Purpose**: Encapsulate rider table, filters, lock/exclude actions, and team builder sidebar.
- **File**: `apps/web/tests/e2e/pages/dashboard.page.ts`
- **Parallel?**: Yes
- **Steps**:
  1. Create `DashboardPage` class with constructor accepting `Page`.
  2. Define locators:

     ```typescript
     // Table
     readonly riderTable: Locator;      // page.getByTestId('dashboard-rider-table')
     readonly riderCount: Locator;      // page.getByTestId('dashboard-rider-count')

     // Filters
     readonly filterAll: Locator;       // page.getByTestId('dashboard-filter-all')
     readonly filterSelected: Locator;  // page.getByTestId('dashboard-filter-selected')
     readonly filterLocked: Locator;    // page.getByTestId('dashboard-filter-locked')
     readonly filterExcluded: Locator;  // page.getByTestId('dashboard-filter-excluded')
     readonly filterUnmatched: Locator; // page.getByTestId('dashboard-filter-unmatched')

     // Team Builder
     readonly teamBuilder: Locator;     // page.getByTestId('dashboard-team-builder')
     readonly rosterCount: Locator;     // page.getByTestId('dashboard-roster-count')
     readonly budgetRemaining: Locator; // page.getByTestId('dashboard-budget-remaining')
     readonly projectedScore: Locator;  // page.getByTestId('dashboard-projected-score')
     readonly optimizeBtn: Locator;     // page.getByTestId('dashboard-optimize-btn')
     readonly reviewTeamBtn: Locator;   // page.getByTestId('dashboard-review-btn')
     readonly clearAllBtn: Locator;     // page.getByTestId('dashboard-clear-all-btn')
     ```

  3. Define actions using `aria-label` for per-rider operations:

     ```typescript
     async selectRider(name: string): Promise<void>
     // page.getByLabel(`Select ${name}`).click()

     async lockRider(name: string): Promise<void>
     // page.getByLabel(`Lock ${name}`).click()

     async unlockRider(name: string): Promise<void>
     // page.getByLabel(`Unlock ${name}`).click()

     async excludeRider(name: string): Promise<void>
     // page.getByLabel(`Exclude ${name}`).click()

     async includeRider(name: string): Promise<void>
     // page.getByLabel(`Include ${name}`).click()

     async clickFilter(filter: 'all' | 'selected' | 'locked' | 'excluded' | 'unmatched'): Promise<void>

     async clickOptimize(): Promise<void>
     async clickReviewTeam(): Promise<void>

     async getTableRowCount(): Promise<number>
     // Count visible table rows
     ```

  4. Define assertions:
     ```typescript
     async getRosterCountText(): Promise<string>
     async getBudgetRemainingText(): Promise<string>
     async getProjectedScoreText(): Promise<string>
     async isReviewTeamVisible(): Promise<boolean>
     async isOptimizeVisible(): Promise<boolean>
     ```

- **Notes**: This is the most complex page object. Group locators into sections (table, filters, teamBuilder) with comments. Per-rider actions use `aria-label` which already exists in the components — no new testids needed for these.

### Subtask T017 – Create optimization.page.ts

- **Purpose**: Encapsulate optimization results display and the "Apply to Roster" action.
- **File**: `apps/web/tests/e2e/pages/optimization.page.ts`
- **Parallel?**: Yes
- **Steps**:
  1. Create `OptimizationPage` class with constructor accepting `Page`.
  2. Define locators:
     ```typescript
     readonly panel: Locator;            // page.getByTestId('optimization-panel')
     readonly projectedTotal: Locator;   // page.getByTestId('optimization-projected-total')
     readonly budgetEfficiency: Locator; // page.getByTestId('optimization-budget-efficiency')
     readonly applyBtn: Locator;         // page.getByTestId('optimization-apply-btn')
     readonly lineup: Locator;           // page.getByTestId('optimization-lineup')
     readonly scoreBreakdown: Locator;   // page.getByTestId('optimization-score-breakdown')
     ```
  3. Define actions:
     ```typescript
     async clickApplyToRoster(): Promise<void>
     async getRiderCardCount(): Promise<number>
     // Count elements matching [data-testid^="optimization-rider-card-"]
     async hasRiderCard(riderName: string): Promise<boolean>
     ```
  4. Define assertions:
     ```typescript
     async getProjectedTotalText(): Promise<string>
     async getBudgetEfficiencyText(): Promise<string>
     ```

### Subtask T018 – Create roster.page.ts

- **Purpose**: Encapsulate the final roster display, metrics, and export actions.
- **File**: `apps/web/tests/e2e/pages/roster.page.ts`
- **Parallel?**: Yes
- **Steps**:
  1. Create `RosterPage` class with constructor accepting `Page`.
  2. Define locators:
     ```typescript
     readonly completeBanner: Locator;  // page.getByTestId('roster-complete-banner')
     readonly resetBtn: Locator;        // page.getByTestId('roster-reset-btn')
     readonly copyBtn: Locator;         // page.getByTestId('roster-copy-btn')
     readonly riderList: Locator;       // page.getByTestId('roster-rider-list')
     readonly captainBadge: Locator;    // page.getByTestId('roster-captain-badge')
     readonly totalScore: Locator;      // page.getByTestId('roster-total-score')
     readonly totalCost: Locator;       // page.getByTestId('roster-total-cost')
     readonly remaining: Locator;       // page.getByTestId('roster-remaining')
     readonly avgRider: Locator;        // page.getByTestId('roster-avg-rider')
     ```
  3. Define actions:
     ```typescript
     async clickReset(): Promise<void>
     async clickCopy(): Promise<void>
     async getRiderCount(): Promise<number>
     // Count elements matching [data-testid^="roster-rider-"]
     ```
  4. Define assertions:
     ```typescript
     async getTotalScoreText(): Promise<string>
     async getTotalCostText(): Promise<string>
     async getCopyButtonText(): Promise<string>  // "Copy to Clipboard" or "Copied!"
     ```

### Subtask T019 – Create wait-helpers.ts

- **Purpose**: Centralize timeout constants and common wait patterns.
- **File**: `apps/web/tests/e2e/helpers/wait-helpers.ts`
- **Parallel?**: Yes
- **Steps**:
  1. Export timeout constants:
     ```typescript
     export const TIMEOUTS = {
       API_RESPONSE: 30_000, // Standard API call wait
       OPTIMIZATION: 30_000, // ML optimizer can be slow
       EXTERNAL_SERVICE: 30_000, // PCS / fantasy platform fetch
       UI_TRANSITION: 5_000, // Tab transitions, animations
       QUICK: 2_000, // Fast UI updates
     } as const;
     ```
  2. Export helper functions:
     ```typescript
     export async function waitForTabContent(page: Page, tab: string): Promise<void>;
     // await page.getByTestId(`tab-content-${tab}`).waitFor({ state: 'visible', timeout: TIMEOUTS.UI_TRANSITION })
     ```

### Subtask T020 – Create test-fixtures.ts

- **Purpose**: Define Playwright custom fixtures that inject page objects and data into all test specs.
- **File**: `apps/web/tests/e2e/fixtures/test-fixtures.ts`
- **Parallel?**: No (depends on T014–T019)
- **Steps**:
  1. Import all page objects and `readFileSync`.
  2. Define the fixture interface:
     ```typescript
     interface E2EFixtures {
       navPage: NavPage;
       setupPage: SetupPage;
       dashboardPage: DashboardPage;
       optimizationPage: OptimizationPage;
       rosterPage: RosterPage;
       validPriceList: string;
       invalidPriceList: string;
       partialMatchList: string;
     }
     ```
  3. Create custom test using `test.extend<E2EFixtures>`:

     ```typescript
     import { test as base } from '@playwright/test';

     export const test = base.extend<E2EFixtures>({
       navPage: async ({ page }, use) => {
         await use(new NavPage(page));
       },
       setupPage: async ({ page }, use) => {
         await use(new SetupPage(page));
       },
       dashboardPage: async ({ page }, use) => {
         await use(new DashboardPage(page));
       },
       optimizationPage: async ({ page }, use) => {
         await use(new OptimizationPage(page));
       },
       rosterPage: async ({ page }, use) => {
         await use(new RosterPage(page));
       },
       validPriceList: async ({}, use) => {
         const content = readFileSync(join(__dirname, 'valid-price-list.txt'), 'utf-8');
         await use(content);
       },
       invalidPriceList: async ({}, use) => {
         const content = readFileSync(join(__dirname, 'invalid-price-list.txt'), 'utf-8');
         await use(content);
       },
       partialMatchList: async ({}, use) => {
         const content = readFileSync(join(__dirname, 'partial-match-list.txt'), 'utf-8');
         await use(content);
       },
     });

     export { expect } from '@playwright/test';
     ```

  4. All spec files will import `{ test, expect }` from this file instead of `@playwright/test`.

- **Notes**: The `readFileSync` calls use `__dirname` to resolve fixture paths relative to the fixtures directory. The data fixture names match the existing txt files exactly.

## Risks & Mitigations

- **Risk**: DashboardPage is complex with ~20 locators. **Mitigation**: Group with comments, test compilation before proceeding.
- **Risk**: Page object methods might not match actual UI behavior. **Mitigation**: Each action method should be minimal (click, fill, wait) — business logic stays in spec files.

## Review Guidance

- Verify all page objects match the data-model.md definitions.
- Verify locator testid names match those added in WP01/WP02.
- Verify `test-fixtures.ts` exports both `test` and `expect`.
- Verify TypeScript compiles: `pnpm exec tsc --noEmit` (or just ensure no red squiggles).
- Verify fixture file paths resolve correctly for txt files.

## Activity Log

- 2026-03-22T18:05:31Z – system – lane=planned – Prompt created.
