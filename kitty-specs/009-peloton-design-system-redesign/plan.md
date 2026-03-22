# Implementation Plan: Peloton Design System Redesign

**Branch**: `009-peloton-design-system-redesign` | **Date**: 2026-03-22 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `kitty-specs/009-peloton-design-system-redesign/spec.md`

## Summary

Complete UX/UI redesign of the Cycling Fantasy Optimizer frontend, applying "The Technical Peloton" design system from Google Stitch. The monolithic single-page view is restructured into a tab-based progressive flow (Setup → Dashboard → Optimization → Roster) with URL-persisted tab state. The design system introduces a dark-theme-only palette with 4-layer surface hierarchy, "No-Line" philosophy, and tri-font typography (Manrope/Inter/JetBrains Mono). Existing shadcn/ui components are refactored to match the new tokens. All existing business logic hooks are preserved; only the presentation layer changes.

## Technical Context

**Language/Version**: TypeScript (strict mode), React 19.1.0
**Primary Dependencies**: Vite 6.4.1, TanStack Router 1.120.x, TanStack Table 8.21.x, Tailwind CSS 4.1.x, Radix UI, CVA, Sonner
**Storage**: N/A (frontend only — no storage changes)
**Testing**: Vitest + React Testing Library (unit), Playwright (E2E)
**Target Platform**: Desktop-first web SPA (1024px–1920px)
**Project Type**: Monorepo (Turborepo) — changes scoped to `apps/web/`
**Performance Goals**: No performance regressions from current state
**Constraints**: Dark theme only for this iteration. Design token values MUST use CSS custom properties — no hardcoded hex/oklch values in components.
**Scale/Scope**: ~16 shared UI components, ~10 feature components, 1 route, 5 hooks (all preserved)

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Gate                           | Status | Notes                                                                  |
| ------------------------------ | ------ | ---------------------------------------------------------------------- |
| Frontend: React 19 + Vite      | PASS   | No changes to framework                                                |
| Frontend: TanStack Router      | PASS   | Adding URL search params for tab state — idiomatic usage               |
| Frontend: Tailwind CSS         | PASS   | Extending theme with new design tokens                                 |
| Frontend: shadcn/ui components | PASS   | Refactoring existing components, not replacing                         |
| Feature-Sliced Design          | PASS   | New `features/flow/` module for tab state; existing features preserved |
| No cross-feature imports       | PASS   | Tab state orchestration lives in route-level, not inside features      |
| TypeScript strict, zero `any`  | PASS   | No changes to type strictness                                          |
| Testing: 90% unit coverage     | PASS   | Tests will be updated to match new component structure                 |
| Testing: Playwright E2E        | PASS   | E2E tests updated for tab-based flow                                   |
| English only                   | PASS   | All code, comments, docs in English                                    |
| Conventional Commits           | PASS   | Will follow existing pattern                                           |

No violations. No complexity tracking needed.

## Project Structure

### Documentation (this feature)

```
kitty-specs/009-peloton-design-system-redesign/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── spec.md              # Feature specification
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Source Code (repository root)

```
apps/web/
├── index.html                          # Add Google Fonts preconnect
├── src/
│   ├── styles/
│   │   └── app.css                     # REWRITE: New design tokens (surface hierarchy,
│   │                                   #   category colors, typography, spacing)
│   ├── routes/
│   │   ├── __root.tsx                  # REWRITE: Glassmorphic nav bar, tab bar, Outlet
│   │   └── index.tsx                   # REWRITE: Tab-based flow orchestrator
│   │
│   ├── features/
│   │   ├── flow/                       # NEW: Tab state management
│   │   │   ├── hooks/
│   │   │   │   └── use-flow-state.ts   # Tab unlock/reset/invalidation logic
│   │   │   ├── components/
│   │   │   │   └── flow-tabs.tsx       # Tab bar component
│   │   │   └── types.ts               # FlowStep, FlowState types
│   │   │
│   │   ├── rider-list/
│   │   │   └── components/
│   │   │       ├── rider-input.tsx     # RESTYLE: Setup tab inputs (left panel)
│   │   │       ├── rider-table.tsx     # RESTYLE: Dashboard table with expandable rows
│   │   │       ├── rider-detail-panel.tsx  # NEW: Expanded row (category scores + history)
│   │   │       └── race-profile-summary.tsx # RESTYLE: Race summary bar
│   │   │
│   │   ├── team-builder/
│   │   │   └── components/
│   │   │       ├── team-builder-panel.tsx   # RESTYLE: Dashboard sidebar
│   │   │       └── team-summary.tsx         # RESTYLE: Roster tab view
│   │   │
│   │   └── optimizer/
│   │       └── components/
│   │           ├── optimizer-panel.tsx       # RESTYLE → becomes Optimization tab content
│   │           ├── optimal-team-card.tsx     # RESTYLE: Rider grid cards
│   │           └── score-breakdown.tsx       # RESTYLE: Point distribution bar
│   │
│   └── shared/
│       └── ui/
│           ├── button.tsx              # RESTYLE: Sharp corners, metallic gradient for primary
│           ├── card.tsx                 # RESTYLE: No-line philosophy, surface layers
│           ├── badge.tsx               # RESTYLE: Sharp corners, category color tokens
│           ├── table.tsx               # RESTYLE: No vertical lines, ghost borders
│           ├── data-table.tsx          # RESTYLE: Updated row states, expandable support
│           ├── input.tsx               # RESTYLE: Surface-container-high bg, no border
│           ├── textarea.tsx            # RESTYLE: Same as input
│           ├── accordion.tsx           # RESTYLE: No borders, tonal shifts
│           ├── score-badge.tsx         # RESTYLE: Monospace, category colors
│           ├── budget-indicator.tsx    # RESTYLE: Gradient bar, surface track
│           ├── empty-state.tsx         # RESTYLE: New layout matching Stitch screen 1
│           ├── loading-spinner.tsx     # RESTYLE: Match new palette
│           ├── error-alert.tsx         # RESTYLE: Match new palette
│           ├── select.tsx              # RESTYLE: Match new tokens
│           ├── alert.tsx               # RESTYLE: Match new tokens
│           └── ml-badge.tsx            # RESTYLE: Match new tokens
```

**Structure Decision**: Existing feature-sliced architecture is preserved. One new feature module (`features/flow/`) is added for tab state management. All changes are scoped to `apps/web/src/`. No backend changes.

## Design Decisions

### DD-001: Design Tokens as CSS Custom Properties

All color, typography, spacing, and elevation values from the "Technical Peloton" design system are defined as CSS custom properties in `app.css` and mapped to Tailwind via `@theme`. Components reference Tailwind classes (e.g., `bg-surface-dim`, `text-on-surface`, `font-headline`) — never hardcoded hex values.

**Rationale**: Enables future light theme support without touching components. Aligns with shadcn/ui's existing CSS variable pattern. Single source of truth for all design tokens.

### DD-002: Tab State via URL Search Params + Context

The active tab is stored in TanStack Router's search params (`?tab=setup`). The unlock state (which tabs are available) is managed via React Context with a reducer. This gives URL-shareable/refreshable state for the active tab, plus in-memory state for the flow progression.

**Rationale**: TanStack Router is already the routing solution. Search params are the idiomatic way to persist UI state across refreshes. Context + reducer gives clean state machine semantics for unlock/invalidate logic.

### DD-003: Big Bang Per Screen (No Incremental Migration)

Each screen is rewritten from scratch using new design tokens and layout. The app will be non-functional during intermediate stages of implementation. This is acceptable because the app is not launched.

**Rationale**: User explicitly chose this approach. Avoids hybrid states where old and new designs coexist, which would be confusing and hard to maintain.

### DD-004: Google Fonts via CDN with Preconnect

Manrope, Inter, and JetBrains Mono are loaded from Google Fonts CDN with `<link rel="preconnect">` in `index.html`. Font families are declared as Tailwind theme extensions.

**Rationale**: All three are open-source (OFL). CDN loading is simplest for a single-user tool. Preconnect ensures fast font delivery.

### DD-005: Expanded Rider Row as Inline Detail Panel

The rider table uses expandable rows (already supported by TanStack Table's expansion API). When expanded, a detail panel shows category score cards (GC/Stage/MTN/SPR) and a 3-season performance history mini-table. This is a new component (`rider-detail-panel.tsx`) rendered via TanStack Table's `renderSubComponent`.

**Rationale**: The design shows this as an inline expansion, not a modal or flyout. TanStack Table natively supports row expansion, so this is the most natural implementation.

## Complexity Tracking

No constitution violations. No complexity tracking needed.
