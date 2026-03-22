# Implementation Plan: E2E Test Suite for Redesigned Frontend

**Branch**: `010-e2e-test-suite-redesigned-frontend` | **Date**: 2026-03-22 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `kitty-specs/010-e2e-test-suite-redesigned-frontend/spec.md`

## Summary

Rewrite and expand the Playwright e2e test suite for the redesigned cycling analyzer frontend. The existing 5 tests in `full-workflow.spec.ts` are broken due to stale selectors after the UI redesign. This plan introduces a professional Page Object Model architecture with Playwright custom fixtures, adds `data-testid` attributes to frontend components, and expands coverage to all 4 tabs, the navigation state machine, and the theme toggle. Tests run against the real backend and real external services with no API mocking.

## Technical Context

**Language/Version**: TypeScript (strict mode), aligned with monorepo tsconfig
**Primary Dependencies**: `@playwright/test ^1.58.2` (already installed), React 19, Vite 6
**Storage**: N/A (tests interact with UI, backend handles persistence)
**Testing**: Playwright (e2e), Vitest + RTL (existing unit tests, unchanged)
**Target Platform**: Chromium headless (Playwright default browser)
**Project Type**: Web (monorepo workspace `apps/web`)
**Performance Goals**: Full suite completes in under 3 minutes
**Constraints**: No API mocking, no backend changes, English only
**Scale/Scope**: ~7 spec files, ~5 page objects, ~30 test cases, ~12 component files modified (data-testid only)

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Gate                                    | Status | Notes                                                            |
| --------------------------------------- | ------ | ---------------------------------------------------------------- |
| E2E: Playwright, all primary user flows | PASS   | This feature directly fulfills this requirement                  |
| Language: English only                  | PASS   | All test code and comments in English                            |
| TypeScript strict mode                  | PASS   | Tests inherit from monorepo tsconfig                             |
| Frontend: Feature-Sliced Design         | PASS   | No cross-feature imports; data-testid additions are leaf changes |
| No REST endpoints for scraping          | PASS   | No backend changes at all                                        |
| Conventional Commits                    | PASS   | Will follow commit conventions                                   |
| Husky + lint-staged                     | PASS   | Pre-commit hooks apply to test files too                         |

**Post-Phase 1 re-check**: No new violations. The test infrastructure lives entirely within `apps/web/tests/e2e/` and data-testid additions are non-functional changes to existing components.

## Project Structure

### Documentation (this feature)

```
kitty-specs/010-e2e-test-suite-redesigned-frontend/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: research findings
├── data-model.md        # Phase 1: page object and fixture models
├── quickstart.md        # Phase 1: setup and run instructions
├── meta.json            # Feature metadata
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (NOT created by plan)
```

### Source Code (repository root)

```
apps/web/
├── src/
│   ├── features/
│   │   ├── flow/components/flow-tabs.tsx              # +data-testid on tab buttons
│   │   ├── rider-list/components/
│   │   │   ├── rider-input.tsx                        # +data-testid on inputs/buttons
│   │   │   ├── rider-table.tsx                        # +data-testid on table/filters/actions
│   │   │   ├── rider-list-page.tsx                    # +data-testid on state indicators
│   │   │   └── race-profile-summary.tsx               # +data-testid on displays
│   │   ├── team-builder/components/
│   │   │   ├── team-builder-panel.tsx                 # +data-testid on panel elements
│   │   │   └── team-summary.tsx                       # +data-testid on roster displays
│   │   └── optimizer/components/
│   │       ├── optimizer-panel.tsx                     # +data-testid on results
│   │       ├── optimal-team-card.tsx                   # +data-testid on cards
│   │       └── score-breakdown.tsx                     # +data-testid on breakdown
│   └── routes/
│       ├── __root.tsx                                  # +data-testid on navbar/theme
│       └── index.tsx                                   # +data-testid on tab containers
├── tests/e2e/
│   ├── fixtures/
│   │   ├── test-fixtures.ts                            # NEW: Playwright custom fixtures
│   │   ├── valid-price-list.txt                        # (existing)
│   │   ├── invalid-price-list.txt                      # (existing)
│   │   └── partial-match-list.txt                      # (existing)
│   ├── pages/
│   │   ├── setup.page.ts                               # NEW: SetupPage POM
│   │   ├── dashboard.page.ts                           # NEW: DashboardPage POM
│   │   ├── optimization.page.ts                        # NEW: OptimizationPage POM
│   │   ├── roster.page.ts                              # NEW: RosterPage POM
│   │   └── nav.page.ts                                 # NEW: NavPage (tabs + theme)
│   ├── specs/
│   │   ├── setup.spec.ts                               # NEW: Setup tab tests
│   │   ├── dashboard.spec.ts                           # NEW: Dashboard tab tests
│   │   ├── optimization.spec.ts                        # NEW: Optimization tab tests
│   │   ├── roster.spec.ts                              # NEW: Roster tab tests
│   │   ├── navigation.spec.ts                          # NEW: Tab state machine tests
│   │   ├── theme.spec.ts                               # NEW: Theme toggle tests
│   │   └── full-workflow.spec.ts                       # REWRITE: Full happy path
│   ├── helpers/
│   │   └── wait-helpers.ts                             # NEW: Shared utilities
│   └── full-workflow.spec.ts                           # DELETE: Old broken test file
└── playwright.config.ts                                # UPDATE: testDir to include specs/
```

**Structure Decision**: Tests live within the existing `apps/web/tests/e2e/` directory, extended with `pages/`, `specs/`, `helpers/`, and an enhanced `fixtures/` directory. The old `full-workflow.spec.ts` at root level is replaced by `specs/full-workflow.spec.ts`. Playwright config updated to point testDir at `specs/`.

## Complexity Tracking

No constitution violations. All changes are within expected scope.
