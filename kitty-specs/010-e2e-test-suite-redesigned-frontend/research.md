# Research: E2E Test Suite for Redesigned Frontend

**Feature**: 010-e2e-test-suite-redesigned-frontend
**Date**: 2026-03-22

## R1: Playwright Custom Fixtures vs Manual Page Object Instantiation

**Decision**: Use Playwright `test.extend<>` custom fixtures for page object injection.

**Rationale**: Playwright's native fixture system provides automatic setup/teardown, type-safe injection, and composability. A test can request `{ setupPage, dashboardPage }` and Playwright handles lifecycle. This is the idiomatic approach recommended in official Playwright docs.

**Alternatives considered**:

- Manual `new SetupPage(page)` in `beforeEach` — works but verbose, no automatic cleanup, harder to compose multi-page flows
- Global setup scripts — too coarse for per-test page objects

## R2: Selector Strategy for Redesigned Frontend

**Decision**: Add `data-testid` attributes surgically to frontend components. Selector priority: `data-testid` > existing `aria-label` > `getByRole` > `getByText` > CSS (never).

**Rationale**: The current frontend has zero `data-testid` attributes but does have `aria-label` on key interactive elements (Lock/Unlock, Select, Exclude/Include rider buttons). Adding `data-testid` provides stable selectors decoupled from styling. Existing `aria-label` values are already well-named and can be leveraged directly.

**Naming convention**: `data-testid="<context>-<element>"` in kebab-case.

- Context = component scope (e.g., `setup`, `dashboard`, `roster`, `nav`)
- Element = what it is (e.g., `analyze-btn`, `rider-table`, `budget-input`)

**Alternatives considered**:

- Rely solely on ARIA roles/labels — insufficient coverage, not all elements have accessibility labels
- CSS selectors — explicitly rejected per spec (SC-004, SC-005)

## R3: Test Organization and File Structure

**Decision**: Organize tests into `tests/e2e/specs/` (one file per feature area + full workflow), `tests/e2e/pages/` (page objects), `tests/e2e/fixtures/` (data + Playwright fixtures).

**Rationale**: Separation of concerns between test specs, page objects, and fixtures. Each spec file focuses on one tab/feature, making failures easy to locate. The full-workflow spec acts as integration smoke test.

**File structure**:

```
tests/e2e/
├── fixtures/
│   ├── test-fixtures.ts          # Playwright custom fixtures (test.extend)
│   ├── valid-price-list.txt      # (existing)
│   ├── invalid-price-list.txt    # (existing)
│   └── partial-match-list.txt    # (existing)
├── pages/
│   ├── setup.page.ts             # SetupPage object
│   ├── dashboard.page.ts         # DashboardPage object
│   ├── optimization.page.ts      # OptimizationPage object
│   ├── roster.page.ts            # RosterPage object
│   └── nav.page.ts               # NavBar + ThemeToggle
├── specs/
│   ├── setup.spec.ts             # Setup tab tests
│   ├── dashboard.spec.ts         # Dashboard tab tests
│   ├── optimization.spec.ts      # Optimization tab tests
│   ├── roster.spec.ts            # Roster tab tests
│   ├── navigation.spec.ts        # Tab state machine tests
│   ├── theme.spec.ts             # Theme toggle tests
│   └── full-workflow.spec.ts     # Full happy-path integration
└── helpers/
    └── wait-helpers.ts           # Shared timeout/retry utilities
```

**Alternatives considered**:

- Single large spec file — hard to maintain, slow to debug
- One spec per acceptance scenario — too granular, excessive file count

## R4: Real Backend Integration Strategy

**Decision**: Tests run against the real backend with no API mocking. External service calls (PCS, fantasy platform) are real.

**Rationale**: User explicitly requested "authentic e2e" tests. The dev server auto-starts via `playwright.config.ts` (`pnpm dev` on port 3000). The API runs on port 3001 (VITE_API_URL default).

**Flakiness mitigation**:

- Increase timeouts for external-dependent tests (PCS scraping has 1.5s rate limiting)
- Use Playwright `retries: 1` (already configured)
- Tests that depend on external services should use generous `toBeVisible({ timeout: 30_000 })` waits
- Consider tagging external-dependent tests for optional skip in CI environments without network access

**Alternatives considered**:

- Full API mocking with `route.fulfill()` — rejected per user preference
- Hybrid approach — rejected, user wants all-real

## R5: Components Requiring data-testid Additions

**Decision**: Add data-testid to ~60 elements across 12 component files.

**Key files and element counts**:

| File                       | Elements                        | Priority |
| -------------------------- | ------------------------------- | -------- |
| `flow-tabs.tsx`            | 4 tab buttons                   | P1       |
| `rider-input.tsx`          | 7 inputs/buttons                | P1       |
| `rider-table.tsx`          | 5 filter buttons + dynamic rows | P1       |
| `rider-list-page.tsx`      | 3 state indicators              | P1       |
| `team-builder-panel.tsx`   | 8 displays/buttons              | P1       |
| `team-summary.tsx`         | 10 displays/buttons             | P2       |
| `optimizer-panel.tsx`      | 5 displays/buttons              | P2       |
| `optimal-team-card.tsx`    | 1 per card (dynamic)            | P2       |
| `score-breakdown.tsx`      | 2 containers                    | P3       |
| `race-profile-summary.tsx` | 4 displays                      | P3       |
| `__root.tsx`               | 2 (navbar, theme toggle)        | P2       |
| `index.tsx`                | 4 tab content containers        | P1       |

**Rationale**: Only add testids to elements that tests actually need to locate. Avoid spraying testids on every element — that creates maintenance burden without test value.

## R6: API Contracts for Test Assertions

**Decision**: Tests assert on UI state, not raw API responses. However, understanding the response shapes informs what the UI should display.

**Key API contracts**:

- `POST /api/analyze` → Returns `AnalyzeResponse` with `riders[]`, `totalSubmitted`, `totalMatched`, `unmatchedCount`
- `POST /api/optimize` → Returns `OptimizeResponse` with `optimalTeam` (riders, cost, score, breakdown) and `alternativeTeams[]`
- `GET /api/race-profile?url=` → Returns `RaceProfileResponse` with race metadata, stages, profile summary
- `GET /api/import-price-list?url=` → Returns `{ riders: PriceListEntryDto[] }`

**Rationale**: E2e tests should validate what the user sees, not the API wire format. But knowing the response structure helps write meaningful assertions (e.g., "the table should show X matched riders" where X comes from the API response).
