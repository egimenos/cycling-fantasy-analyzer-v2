# Feature Specification: E2E Test Suite for Redesigned Frontend

**Feature Branch**: `010-e2e-test-suite-redesigned-frontend`
**Created**: 2026-03-22
**Status**: Draft
**Mission**: software-dev

## User Scenarios & Testing

### User Story 1 - Setup Tab: Analyze a Valid Price List (Priority: P1)

A developer runs the e2e suite and the Setup tab flow is validated end-to-end: entering rider data (manually or via import), setting a budget, optionally providing a race URL for auto-detection, and clicking "Analyze Riders" to transition to the Dashboard tab with results displayed.

**Why this priority**: The Setup tab is the entry point of the entire application. If this flow breaks, nothing downstream works. Fixing and covering this flow restores the broken existing tests and validates the most critical user path.

**Independent Test**: Can be fully tested by navigating to the app, filling the rider textarea with fixture data, setting a budget, clicking Analyze, and verifying the Dashboard tab unlocks with a populated rider table.

**Acceptance Scenarios**:

1. **Given** a user on the Setup tab, **When** they paste a valid price list and click "Analyze Riders", **Then** the Dashboard tab unlocks and displays a rider table with matched riders.
2. **Given** a user on the Setup tab, **When** they enter a valid race URL, **Then** the race profile summary appears with race type, stage profiles, and rider counts.
3. **Given** a user on the Setup tab, **When** they provide a game URL and click "Fetch", **Then** the rider textarea is populated with imported rider data.
4. **Given** a user on the Setup tab with no valid riders entered, **When** they look at the Analyze button, **Then** it is disabled.
5. **Given** a user on the Setup tab, **When** they enter text with some invalid lines, **Then** the validation feedback shows correct counts of valid and invalid entries.

---

### User Story 2 - Dashboard Tab: Rider Management and Team Building (Priority: P1)

A developer runs the e2e suite and the Dashboard tab is validated: the rider table displays correctly with all columns, riders can be selected/deselected via checkboxes, locked/unlocked, excluded/included, filtered by status, and the Team Builder sidebar reflects selections in real time with budget tracking.

**Why this priority**: The Dashboard is the core interactive surface of the application where users spend most of their time. It contains the most complex interactions (table, filters, lock/exclude, team builder panel).

**Independent Test**: Can be tested by first completing the Setup flow (as prerequisite), then interacting with the rider table and team builder panel.

**Acceptance Scenarios**:

1. **Given** a user on the Dashboard tab with analyzed riders, **When** they view the rider table, **Then** all columns are visible (Rank, Name, Team, Price, Score, Value, Match, Actions).
2. **Given** a user on the Dashboard tab, **When** they click a rider's checkbox, **Then** the Team Builder panel updates to show the selected rider with correct budget tracking.
3. **Given** a user on the Dashboard tab, **When** they lock a rider, **Then** the rider shows a lock icon, cannot be deselected, and filter counts update.
4. **Given** a user on the Dashboard tab, **When** they exclude a rider, **Then** the rider appears greyed out, its checkbox is disabled, and the "Excluded" filter count updates.
5. **Given** a user on the Dashboard tab, **When** they click filter buttons (All, Selected, Locked, Excluded, Unmatched), **Then** the table filters to show only matching riders.
6. **Given** a user on the Dashboard tab, **When** they select 9 riders within budget, **Then** the "Review Team" button appears in the Team Builder panel.
7. **Given** a user on the Dashboard tab with a rider selected whose price exceeds remaining budget, **Then** that rider's price is displayed in error color and their checkbox is disabled.

---

### User Story 3 - Optimization Tab: Get and Apply Optimal Team (Priority: P2)

A developer runs the e2e suite and the Optimization flow is validated: clicking "Get Optimal Team" calls the real backend optimizer, results display with score breakdown by category, and "Apply to Roster" transitions to the Roster tab.

**Why this priority**: Optimization is the core ML-powered feature, but depends on Setup and Dashboard being functional first.

**Independent Test**: Can be tested by completing Setup, then clicking "Get Optimal Team" on the Dashboard and verifying the Optimization tab displays results.

**Acceptance Scenarios**:

1. **Given** a user on the Dashboard tab with analyzed riders, **When** they click "Get Optimal Team", **Then** the Optimization tab unlocks and displays the optimal team configuration.
2. **Given** a user on the Optimization tab, **When** they view results, **Then** the projected total score, budget efficiency, score breakdown (GC, Stage, Mountain, Sprint), and rider cards are visible.
3. **Given** a user on the Optimization tab with locked riders, **When** they view the optimal team, **Then** all locked riders are included in the lineup.
4. **Given** a user on the Optimization tab, **When** they click "Apply to Roster", **Then** the Roster tab unlocks and displays the team.

---

### User Story 4 - Roster Tab: Review and Export Team (Priority: P2)

A developer runs the e2e suite and the Roster tab is validated: the final 9-rider roster displays with metrics, the copy-to-clipboard function works, and reset returns to Setup.

**Why this priority**: The Roster tab is the final step in the workflow. It's simpler than Dashboard but critical for the complete flow.

**Independent Test**: Can be tested by completing the full flow through Optimization, then verifying the Roster tab content and actions.

**Acceptance Scenarios**:

1. **Given** a user on the Roster tab with a complete team, **When** they view the roster, **Then** all 9 riders are listed with name, team, cost, projected score, and value.
2. **Given** a user on the Roster tab, **When** they view the metrics sidebar, **Then** total projected score, total expenditure, remaining budget, and average cost per rider are displayed.
3. **Given** a user on the Roster tab, **When** they click "Copy to Clipboard", **Then** the button text changes to "Copied!" and the roster text is in the clipboard.
4. **Given** a user on the Roster tab, **When** they click "Reset", **Then** the app returns to the Setup tab with all state cleared.

---

### User Story 5 - Tab Navigation and State Machine (Priority: P2)

A developer runs the e2e suite and the tab navigation state machine is validated: tabs unlock progressively, locked tabs cannot be navigated to, and invalidation (e.g., changing lock/exclude after optimization) correctly re-locks downstream tabs.

**Why this priority**: The state machine is the backbone of the workflow. If it breaks, users can reach invalid states.

**Independent Test**: Can be tested by walking through the tab progression and verifying lock/unlock states at each step.

**Acceptance Scenarios**:

1. **Given** a fresh app load, **When** the user views the tab bar, **Then** only the Setup tab is unlocked; Dashboard, Optimization, and Roster show lock icons and are not clickable.
2. **Given** a user who has completed analysis, **When** they view the tab bar, **Then** Setup and Dashboard are unlocked.
3. **Given** a user who has optimized, **When** they go back to Dashboard and change a rider's lock status, **Then** the Optimization and Roster tabs re-lock (invalidation).

---

### User Story 6 - Theme Toggle (Priority: P3)

A developer runs the e2e suite and the light/dark theme toggle is validated: clicking the toggle switches the theme, the preference persists across page reloads, and UI elements render correctly in both themes.

**Why this priority**: Theme toggle is a quality-of-life feature, not core workflow. Lower priority but still worth covering since it was a recent addition.

**Independent Test**: Can be tested independently on any page without completing any workflow.

**Acceptance Scenarios**:

1. **Given** a user on any page in dark mode, **When** they click the theme toggle (Sun icon), **Then** the page switches to light mode and the html element has no `.dark` class.
2. **Given** a user who toggled to light mode, **When** they reload the page, **Then** light mode persists (localStorage).
3. **Given** a user in light mode, **When** they click the theme toggle (Moon icon), **Then** the page returns to dark mode.

---

### User Story 7 - Full End-to-End Workflow (Priority: P1)

A developer runs the e2e suite and a complete happy-path workflow is validated from start to finish: Setup (enter riders + race URL) -> Dashboard (review, lock riders) -> Optimization (get optimal team) -> Roster (review, copy, reset).

**Why this priority**: This is the integration smoke test that verifies all tabs work together in sequence. It catches regressions that per-tab tests might miss.

**Independent Test**: A single test that walks through the entire application flow, verifying each transition.

**Acceptance Scenarios**:

1. **Given** a user starting fresh, **When** they complete the full workflow (analyze -> review -> optimize -> roster -> copy -> reset), **Then** each step succeeds and the app returns to initial state after reset.

---

### User Story 8 - Error Handling and Edge Cases (Priority: P3)

A developer runs the e2e suite and error paths are validated: invalid input rejection, backend errors surface user-friendly messages, and the app remains in a usable state.

**Why this priority**: Error handling is important for robustness but secondary to happy-path coverage.

**Independent Test**: Can be tested by deliberately triggering error conditions.

**Acceptance Scenarios**:

1. **Given** a user on the Setup tab, **When** they enter completely invalid text, **Then** the Analyze button remains disabled and "0 valid" feedback is shown.
2. **Given** a user on the Setup tab, **When** they enter a mix of valid and invalid lines, **Then** validation feedback shows correct counts for both.
3. **Given** a user on the Dashboard tab, **When** they attempt to select a rider that would exceed the budget, **Then** the checkbox is disabled and the price shows in error styling.

---

### Edge Cases

- What happens when the user selects exactly 9 riders and then tries to select a 10th?
- What happens when all riders are excluded?
- What happens when budget is set to a value lower than the cheapest rider?
- What happens when the browser window is resized (responsive layout)?
- What happens when the user navigates directly to a URL (deep linking)?

## Requirements

### Functional Requirements

- **FR-001**: Test suite MUST use Page Object Model pattern with dedicated page objects for each tab (Setup, Dashboard, Optimization, Roster) and shared components (Navigation, Theme Toggle).
- **FR-002**: Frontend components MUST have `data-testid` attributes on key interactive elements to provide stable selectors that survive styling changes.
- **FR-003**: Test suite MUST run against the real backend and real external services (PCS, fantasy platform) without API mocking.
- **FR-004**: Test suite MUST organize tests into separate spec files per feature area plus one full-workflow integration spec.
- **FR-005**: Test suite MUST include reusable helper functions and typed fixtures to reduce duplication across spec files.
- **FR-006**: Selector strategy MUST prefer `data-testid` first, then ARIA roles/labels, then visible text, and CSS selectors only as last resort.
- **FR-007**: Test suite MUST validate tab navigation state machine including progressive unlock and downstream invalidation.
- **FR-008**: Test suite MUST validate theme toggle functionality including persistence across page reloads.
- **FR-009**: All test code and comments MUST be written in English.
- **FR-010**: Test suite MUST NOT modify or add any backend API endpoints.

### Key Entities

- **Page Object**: Encapsulates selectors and actions for a specific page/tab, providing a clean API for test specs to interact with the UI.
- **Test Fixture**: Predefined data sets (rider lists, expected responses) used across multiple test specs for consistency.
- **Flow State**: The application's tab unlock state at any point in the workflow, determined by the state machine transitions.

## Success Criteria

### Measurable Outcomes

- **SC-001**: All existing 5 test scenarios pass against the redesigned frontend (zero regressions from current broken state).
- **SC-002**: Test coverage spans all 4 application tabs with at least 3 test cases per tab.
- **SC-003**: Full end-to-end workflow test completes successfully from Setup through Roster and back via Reset.
- **SC-004**: No test uses CSS class selectors (e.g., `.font-medium`, `.bg-primary`) as primary element locators.
- **SC-005**: Adding or changing a Tailwind class on any component does not break any test.
- **SC-006**: Theme toggle test validates both light and dark modes including localStorage persistence.
- **SC-007**: Test suite completes in under 3 minutes on a standard development machine.

## Assumptions

- The backend API (`/api/analyze`, `/api/optimize`, `/api/race-profile`, `/api/import-price-list`) is running and accessible on the dev server.
- External services (ProCyclingStats, fantasy platform) are available during test runs. Tests that depend on external services may be marked as flaky-tolerant with appropriate retry configuration.
- The existing `playwright.config.ts` configuration (headless, port 3000, auto-start dev server) remains unchanged.
- The existing test fixtures (`valid-price-list.txt`, `invalid-price-list.txt`, `partial-match-list.txt`) contain data that the backend can process successfully.
