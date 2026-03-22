# Data Model: E2E Test Suite for Redesigned Frontend

**Feature**: 010-e2e-test-suite-redesigned-frontend
**Date**: 2026-03-22

## Entities

This feature does not introduce new data models. It operates on the existing frontend UI and backend APIs. The "data model" here describes the test infrastructure entities.

### Page Objects

Each page object encapsulates selectors and actions for a tab/component.

```
SetupPage
├── locators: raceUrlInput, gameUrlInput, ridersTextarea, budgetInput, analyzeBtn, fetchBtn
├── actions: fillRiders(text), setBudget(n), setRaceUrl(url), setGameUrl(url), clickAnalyze(), clickFetch()
└── assertions: isAnalyzeDisabled(), getValidCount(), getInvalidCount()

DashboardPage
├── locators: riderTable, filterButtons, teamBuilderPanel, optimizeBtn, reviewTeamBtn
├── actions: selectRider(name), lockRider(name), excludeRider(name), clickFilter(name), clickOptimize(), clickReviewTeam()
└── assertions: getRiderCount(), getSelectedCount(), getBudgetRemaining(), getProjectedScore()

OptimizationPage
├── locators: projectedTotal, budgetEfficiency, scoreBreakdown, riderCards, applyToRosterBtn
├── actions: clickApplyToRoster()
└── assertions: getProjectedTotal(), getBudgetEfficiency(), getRiderCardCount()

RosterPage
├── locators: rosterList, metricsPanel, resetBtn, copyBtn
├── actions: clickReset(), clickCopy()
└── assertions: getRiderCount(), getTotalScore(), getCaptainName()

NavPage
├── locators: tabButtons[], themeToggleBtn
├── actions: goToTab(name), toggleTheme()
└── assertions: isTabLocked(name), isTabActive(name), getCurrentTheme()
```

### Test Fixtures (Playwright)

```typescript
// Custom fixture types injected via test.extend<>
interface E2EFixtures {
  setupPage: SetupPage;
  dashboardPage: DashboardPage;
  optimizationPage: OptimizationPage;
  rosterPage: RosterPage;
  navPage: NavPage;
  validPriceList: string; // Content of valid-price-list.txt
  invalidPriceList: string; // Content of invalid-price-list.txt
  partialMatchList: string; // Content of partial-match-list.txt
}
```

### Flow States (for navigation assertions)

```
FlowState = {
  unlockedSteps: Step[]  // ['setup'] | ['setup', 'dashboard'] | etc.
  activeStep: Step       // Current visible tab
}

Transitions:
  INITIAL       → { unlockedSteps: ['setup'], activeStep: 'setup' }
  ANALYZE_OK    → { unlockedSteps: ['setup', 'dashboard'], activeStep: 'dashboard' }
  OPTIMIZE_OK   → { unlockedSteps: ['setup', 'dashboard', 'optimization'], activeStep: 'optimization' }
  TEAM_COMPLETE → { unlockedSteps: ['setup', 'dashboard', 'optimization', 'roster'], activeStep: 'roster' }
  INVALIDATE    → Re-locks downstream steps
  RESET         → Back to INITIAL
```
