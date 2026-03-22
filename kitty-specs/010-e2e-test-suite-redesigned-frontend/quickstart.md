# Quickstart: E2E Test Suite for Redesigned Frontend

**Feature**: 010-e2e-test-suite-redesigned-frontend
**Date**: 2026-03-22

## Prerequisites

- Node.js (project version)
- pnpm installed
- Docker running (for PostgreSQL + ML service)
- Playwright browsers installed

## Setup

```bash
# 1. Start infrastructure (DB + ML service)
make dev-infra

# 2. Install dependencies (if not already)
pnpm install

# 3. Install Playwright browsers (if first time)
cd apps/web && pnpm exec playwright install --with-deps chromium

# 4. Start the dev server (API + Web)
make dev
```

## Running Tests

```bash
# Run all e2e tests (from apps/web)
cd apps/web
pnpm test:e2e

# Run a specific spec file
pnpm exec playwright test specs/setup.spec.ts

# Run in headed mode (see browser)
pnpm exec playwright test --headed

# Run with Playwright UI
pnpm exec playwright test --ui

# Run with debug mode
pnpm exec playwright test --debug
```

## Key Files

### Test Infrastructure

| File                                  | Purpose                                      |
| ------------------------------------- | -------------------------------------------- |
| `tests/e2e/fixtures/test-fixtures.ts` | Playwright custom fixtures with page objects |
| `tests/e2e/pages/*.page.ts`           | Page Object Model classes                    |
| `tests/e2e/helpers/wait-helpers.ts`   | Shared wait/retry utilities                  |

### Spec Files

| File                                    | Covers                  |
| --------------------------------------- | ----------------------- |
| `tests/e2e/specs/setup.spec.ts`         | Setup tab (US1)         |
| `tests/e2e/specs/dashboard.spec.ts`     | Dashboard tab (US2)     |
| `tests/e2e/specs/optimization.spec.ts`  | Optimization tab (US3)  |
| `tests/e2e/specs/roster.spec.ts`        | Roster tab (US4)        |
| `tests/e2e/specs/navigation.spec.ts`    | Tab state machine (US5) |
| `tests/e2e/specs/theme.spec.ts`         | Theme toggle (US6)      |
| `tests/e2e/specs/full-workflow.spec.ts` | Full happy path (US7)   |

### Frontend Changes (data-testid only)

| File                                                          | Changes                       |
| ------------------------------------------------------------- | ----------------------------- |
| `src/features/flow/components/flow-tabs.tsx`                  | Tab button testids            |
| `src/features/rider-list/components/rider-input.tsx`          | Input/button testids          |
| `src/features/rider-list/components/rider-table.tsx`          | Table/filter testids          |
| `src/features/rider-list/components/rider-list-page.tsx`      | State indicator testids       |
| `src/features/team-builder/components/team-builder-panel.tsx` | Panel testids                 |
| `src/features/team-builder/components/team-summary.tsx`       | Roster testids                |
| `src/features/optimizer/components/optimizer-panel.tsx`       | Optimization testids          |
| `src/features/optimizer/components/optimal-team-card.tsx`     | Card testids                  |
| `src/routes/__root.tsx`                                       | Navbar/theme testids          |
| `src/routes/index.tsx`                                        | Tab content container testids |

## Conventions

- **Selectors**: `data-testid` > `aria-label` > `getByRole` > `getByText`. Never CSS classes.
- **TestID naming**: `data-testid="<context>-<element>"` in kebab-case
- **Page objects**: One per tab, expose locators + actions + assertions
- **Fixtures**: Playwright `test.extend<>` for type-safe page object injection
- **Timeouts**: 30s for API-dependent waits, 60s per test (configured in playwright.config.ts)
