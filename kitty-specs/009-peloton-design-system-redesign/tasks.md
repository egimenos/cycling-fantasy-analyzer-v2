# Work Packages: Peloton Design System Redesign

**Inputs**: Design documents from `kitty-specs/009-peloton-design-system-redesign/`
**Prerequisites**: plan.md (required), spec.md (user stories), research.md, data-model.md, quickstart.md

**Tests**: Testing updates included where critical for regression safety (new tab flow, component API changes).

**Organization**: Fine-grained subtasks (`Txxx`) roll up into work packages (`WPxx`). Each work package is independently deliverable and testable.

**Prompt Files**: Each work package references a matching prompt file in `tasks/`.

---

## Work Package WP01: Design System Foundation (Priority: P0)

**Goal**: Replace the existing shadcn/ui grayscale theme with "The Technical Peloton" design tokens — surface hierarchy, category colors, typography families, and sharp border-radius — so that all downstream screen work builds on the correct visual language.
**Independent Test**: App loads with dark navy background (#0b1326), correct fonts (Manrope headlines, Inter body, JetBrains Mono numbers), and no 1px solid borders on existing components.
**Prompt**: `tasks/WP01-design-system-foundation.md`
**Estimated Size**: ~450 lines

### Included Subtasks

- [ ] T001 Replace CSS custom properties in `apps/web/src/styles/app.css` with new design tokens (surface hierarchy, on-surface, primary/secondary, category colors, typography, radius)
- [ ] T002 Add Google Fonts preconnect and stylesheet links to `apps/web/index.html` for Manrope, Inter, JetBrains Mono
- [ ] T003 [P] Restyle `button.tsx` — sharp corners (0.125rem), metallic gradient for primary variant, new color tokens
- [ ] T004 [P] Restyle `card.tsx`, `badge.tsx` — no-line philosophy, surface layer backgrounds, category color variants for badges
- [ ] T005 [P] Restyle `input.tsx`, `textarea.tsx`, `select.tsx` — surface-container-high background, no visible border, focus ring with primary-fixed
- [ ] T006 [P] Restyle `score-badge.tsx`, `ml-badge.tsx`, `budget-indicator.tsx` — monospace font, gradient progress bar, category color coding
- [ ] T007 [P] Restyle `accordion.tsx`, `empty-state.tsx`, `error-alert.tsx`, `alert.tsx`, `loading-spinner.tsx` — new palette, tonal shift separators

### Implementation Notes

- Start with `app.css` (T001) and `index.html` (T002) — these are prerequisites for all other subtasks
- T003–T007 can proceed in parallel once tokens are in place
- Preserve all existing component APIs (props, variants) — only change styling
- Remove light mode CSS variables (dark-only for this iteration), but keep the `@custom-variant dark` mechanism for future use

### Parallel Opportunities

- T003, T004, T005, T006, T007 are all independent file-level changes

### Dependencies

- None (starting package)

### Risks & Mitigations

- Tailwind 4 `@theme` syntax differs from v3 config — verify token names generate correct utility classes by checking `bg-surface-dim`, `text-on-surface`, `font-headline` etc.
- Removing light mode may break if any component conditionally uses `.dark` — audit for `dark:` prefixed classes

**Requirements Refs**: FR-001, FR-002, FR-003, FR-019, FR-020

---

## Work Package WP02: Tab Flow Infrastructure (Priority: P0)

**Goal**: Build the tab-based progressive navigation system (Setup → Dashboard → Optimization → Roster) with URL-persisted active tab, context-managed unlock state, and glassmorphic navigation bar.
**Independent Test**: App renders 4 tabs, only Setup is clickable initially. Tab selection persists in URL (`?tab=setup`). Nav bar has backdrop blur effect.
**Prompt**: `tasks/WP02-tab-flow-infrastructure.md`
**Estimated Size**: ~500 lines

### Included Subtasks

- [ ] T008 Create `features/flow/types.ts` — FlowStep enum, FlowState interface, FlowAction discriminated union
- [ ] T009 Create `features/flow/hooks/use-flow-state.ts` — useReducer-based state machine with FlowContext provider
- [ ] T010 Create `features/flow/components/flow-tabs.tsx` — horizontal tab bar component with locked/active/completed visual states
- [ ] T011 Rewrite `routes/__root.tsx` — glassmorphic nav bar (backdrop-blur, semi-transparent bg), branded title, Toaster
- [ ] T012 Rewrite `routes/index.tsx` — add validateSearch for `?tab=` param, render FlowProvider + FlowTabs + tab content switcher
- [ ] T013 Create tab content switcher — conditionally render Setup/Dashboard/Optimization/Roster components based on active tab and unlock state

### Implementation Notes

- T008 must come first (types used everywhere)
- T009 depends on T008 (uses FlowState/FlowAction types)
- T010 depends on T008 (uses FlowStep for tab labels)
- T011 is independent (layout only)
- T012–T013 depend on T008–T010

### Parallel Opportunities

- T011 (nav bar) is independent from T008–T010 (flow state logic)

### Dependencies

- Depends on WP01 (needs design tokens for glassmorphic nav, tab styling)

### Risks & Mitigations

- Check if Zod is in dependencies for validateSearch; fallback to plain validation function if not
- Ensure FlowProvider wraps the entire tab content area so all children can access flow state

**Requirements Refs**: FR-004, FR-005, FR-006, FR-007, FR-008

---

## Work Package WP03: Setup Screen (Priority: P1) 🎯 MVP

**Goal**: Build the Roster Setup tab (Tab A) with 5/7 column split layout — input controls on the left, empty-state preview on the right — matching the Stitch Screen 1 design.
**Independent Test**: App shows Setup tab with all input fields styled to new design. Clicking "Run Optimization Engine" triggers analysis and transitions to Dashboard tab.
**Prompt**: `tasks/WP03-setup-screen.md`
**Estimated Size**: ~400 lines

### Included Subtasks

- [ ] T014 Restyle `rider-input.tsx` — new layout with labeled sections (Race URL, Import Price List, Manual Input, Budget), Material Symbols icons, new input styling
- [ ] T015 Create empty-state preview component for right panel — icon, "No Roster Detected" title, descriptive text, skeleton placeholders
- [ ] T016 Build Setup tab container — 5/7 grid split, left panel (inputs), right panel (preview)
- [ ] T017 Build footer summary bar — selected riders count, budget allocation, status indicator
- [ ] T018 Wire analyze action to flow state — on success dispatch ANALYZE_SUCCESS, auto-navigate to Dashboard tab

### Implementation Notes

- T014 is a restyle of existing component — preserve all props and callback signatures
- T015 is a new component replacing the old EmptyState in the Setup context
- T016 assembles T014 + T015 into the tab layout
- T017 is a new presentational component at the bottom of the Setup tab
- T018 connects the existing `useAnalyze` hook to the new flow state

### Parallel Opportunities

- T014 and T015 can proceed in parallel (different components)

### Dependencies

- Depends on WP01 (design tokens), WP02 (tab infrastructure, flow state)

### Risks & Mitigations

- Preserve existing `onAnalyze` callback signature in `rider-input.tsx` to avoid breaking hook connections

**Requirements Refs**: FR-009, FR-010

---

## Work Package WP04: Dashboard Screen — Table & Race Bar (Priority: P1)

**Goal**: Build the Dashboard tab's main content area — race profile summary bar, collapsible configuration section, and the rider data table with expandable detail rows showing category scores and performance history.
**Independent Test**: After analysis, Dashboard tab shows race info bar, collapsible config, and rider table. Clicking a row expands to show GC/Stage/MTN/SPR score cards and performance history. Lock/exclude actions work correctly.
**Prompt**: `tasks/WP04-dashboard-table.md`
**Estimated Size**: ~500 lines

### Included Subtasks

- [ ] T019 Restyle `race-profile-summary.tsx` — race name, type badge, rider/matched counts, analysis status indicator with green pulse
- [ ] T020 Build collapsible configuration section — summarize inputs (URL, price list, budget), "Edit Inputs" button, Radix Collapsible
- [ ] T021 Restyle `rider-table.tsx` — new column layout (checkbox, rank, name, team, price, score badge, pts/H, match status, actions), no vertical lines, ghost border rows
- [ ] T022 Create `rider-detail-panel.tsx` — expandable sub-row with category score cards (GC blue, Stage green, MTN orange, SPR red with colored left borders) and 3-season performance history mini-table
- [ ] T023 Add TanStack Table expansion support to `data-table.tsx` — `getRowCanExpand`, `toggleExpanded`, `renderSubComponent` integration
- [ ] T024 Wire table interactions to flow state — lock/exclude changes dispatch INVALIDATE_FROM for optimization tab

### Implementation Notes

- T019, T020 are independent presentational components
- T021 depends on T023 (data-table expansion support)
- T022 is the sub-component rendered inside expanded rows
- T024 connects interactions to the flow state from WP02
- The expandable row uses TanStack Table's native expansion API, NOT a custom accordion

### Parallel Opportunities

- T019, T020 can proceed in parallel with T023
- T022 can proceed once T023 is scaffolded

### Dependencies

- Depends on WP01 (design tokens), WP02 (flow state for invalidation)

### Risks & Mitigations

- Ensure expanded row detail panel receives the correct rider data (category scores may not exist for all riders — handle gracefully with fallback values)
- Performance history data may not be available from the current API — stub with placeholder if needed

**Requirements Refs**: FR-011, FR-012, FR-013, FR-014, FR-015

---

## Work Package WP05: Dashboard Screen — Team Builder Sidebar (Priority: P1)

**Goal**: Build the Dashboard tab's right sidebar — Team Builder panel with active roster, budget meter, projected score, and team completion flow.
**Independent Test**: Selecting riders from the table updates the sidebar. Budget bar fills proportionally. At 9/9 riders, "Review Team" CTA appears and navigates to Roster tab.
**Prompt**: `tasks/WP05-dashboard-sidebar.md`
**Estimated Size**: ~350 lines

### Included Subtasks

- [ ] T025 Restyle `team-builder-panel.tsx` — "TEAM BUILDER" header, active roster count (X/9), rider cards with remove button, empty slot placeholders with dashed borders
- [ ] T026 Restyle budget meter — gradient progress bar (secondary-to-blue-400), remaining budget display, efficiency percentage
- [ ] T027 Add projected score display and "Get Optimal Team" CTA button with metallic gradient
- [ ] T028 Add "Review Team" CTA — appears when 9 riders selected, navigates to Roster tab
- [ ] T029 Wire team builder to flow state — team completion dispatches TEAM_COMPLETE, optimize click dispatches to Optimization tab

### Implementation Notes

- T025 is a restyle of existing component — preserve all props
- T026–T028 are sub-sections within the sidebar
- T029 connects existing `useTeamBuilder` and `useOptimize` hooks to flow state
- Dashboard layout (70/30 split) is assembled here by combining WP04 (table) + WP05 (sidebar)

### Parallel Opportunities

- T025–T028 are independent styling tasks within the same component

### Dependencies

- Depends on WP01 (design tokens), WP02 (flow state), WP04 (table must exist for the dashboard layout)

### Risks & Mitigations

- Sidebar must be `sticky top-24` to stay visible during table scrolling — verify this works with the tab layout

**Requirements Refs**: FR-016

---

## Work Package WP06: Optimization Screen (Priority: P2)

**Goal**: Build the Optimization tab (Tab C) — full-width view showing optimal configuration header, point distribution analysis bar, 9-rider card grid, and "Apply to Roster" action.
**Independent Test**: After clicking "Get Optimal Team" from Dashboard, Optimization tab shows projected total, budget efficiency, category distribution bar, and rider grid. "Apply to Roster" navigates to Roster tab.
**Prompt**: `tasks/WP06-optimization-screen.md`
**Estimated Size**: ~400 lines

### Included Subtasks

- [ ] T030 Restructure `optimizer-panel.tsx` as full-width Optimization tab content — "OPTIMAL CONFIGURATION" header with projected total and budget efficiency stats
- [ ] T031 Restyle `score-breakdown.tsx` as point distribution bar — horizontal stacked bar with GC (blue), Stage (green), Mountain (orange), Sprint (red) segments, legend
- [ ] T032 Restyle `optimal-team-card.tsx` — rider card with photo placeholder, name, team, projected points; 3-column grid layout
- [ ] T033 Build Optimization tab container — header + distribution bar + rider grid + "Apply to Roster" CTA
- [ ] T034 Wire "Apply to Roster" to flow state — applies optimal team to team builder state, dispatches TEAM_COMPLETE, navigates to Roster tab

### Implementation Notes

- T030–T032 are component restyles, can proceed in parallel
- T033 assembles T030–T032 into the tab layout
- T034 connects to existing `useOptimize` hook and team builder state
- Remove the old "alternative teams" section if it was displaying — those features are deferred

### Parallel Opportunities

- T030, T031, T032 can all proceed in parallel

### Dependencies

- Depends on WP01 (design tokens), WP02 (flow state)

### Risks & Mitigations

- Ensure the optimization response data structure maps cleanly to the new rider card grid — may need a transform

**Requirements Refs**: FR-017

---

## Work Package WP07: Roster Screen & Final Polish (Priority: P2)

**Goal**: Build the Final Roster tab (Tab D) with success banner, 9-rider roster list, metrics sidebar, copy-to-clipboard, and reset functionality. Handle end-to-end flow integration and responsive layout.
**Independent Test**: Complete a team (manual or optimizer). Roster tab shows success banner, all 9 riders with cost/projected/form, metrics sidebar, and working Copy/Reset buttons. Full flow A→B→(C)→D works. Re-analyze resets correctly.
**Prompt**: `tasks/WP07-roster-screen-polish.md`
**Estimated Size**: ~500 lines

### Included Subtasks

- [ ] T035 Restyle `team-summary.tsx` as Final Roster view — success banner ("Team Complete!"), 9-rider list with name, team, cost, projected score, form rating, captain badge for top rider
- [ ] T036 Build roster metrics sidebar — total projected score with global average comparison, expenditure progress bar, remaining budget, average cost per rider
- [ ] T037 Implement Copy to Clipboard — format team as readable text, copy via navigator.clipboard API, toast confirmation
- [ ] T038 Implement Reset button — clear team state, dispatch RESET to flow state, navigate back to Dashboard tab
- [ ] T039 End-to-end flow integration — verify A→B→D (manual) and A→B→C→D (optimizer) paths, reset/invalidation behavior, tab state preservation on backward navigation
- [ ] T040 Responsive layout adjustments — ensure all 4 tabs render correctly from 1024px to 1920px, tab bar responsive, sidebar stacks below table on narrower viewports

### Implementation Notes

- T035–T036 are component work, can proceed in parallel
- T037–T038 are small interaction features
- T039 is integration verification — connect all pieces from WP02–WP06
- T040 is cross-cutting responsive work

### Parallel Opportunities

- T035 and T036 are independent (different components)
- T037 and T038 are independent (different actions)

### Dependencies

- Depends on WP01–WP06 (all previous work packages)

### Risks & Mitigations

- Copy to clipboard requires HTTPS or localhost — ensure dev server satisfies this
- Reset logic must cleanly clear all state (analyze, optimize, team builder, locks, excludes) — test edge cases

**Requirements Refs**: FR-018

---

## Dependency & Execution Summary

```
WP01 (Design Tokens) ──┐
                        ├──→ WP02 (Tab Flow) ──┐
                        │                       ├──→ WP03 (Setup Screen) ──┐
                        │                       │                          │
                        │                       ├──→ WP04 (Dashboard Table)├──→ WP05 (Sidebar) ──┐
                        │                       │                          │                      │
                        │                       ├──→ WP06 (Optimization)   │                      │
                        │                       │                          │                      │
                        │                       └──────────────────────────┴──────────────────────┴──→ WP07 (Roster & Polish)
```

- **Sequence**: WP01 → WP02 → WP03 + WP04 + WP06 (parallel) → WP05 → WP07
- **Parallelization**: After WP02, WP03/WP04/WP06 can run in parallel. WP05 depends on WP04.
- **MVP Scope**: WP01 + WP02 + WP03 + WP04 + WP05 constitute the minimum release (Setup + Dashboard with team building).

---

## Subtask Index (Reference)

| Subtask ID | Summary                                                     | Work Package | Priority | Parallel? |
| ---------- | ----------------------------------------------------------- | ------------ | -------- | --------- |
| T001       | Design tokens in app.css                                    | WP01         | P0       | No        |
| T002       | Google Fonts in index.html                                  | WP01         | P0       | No        |
| T003       | Restyle button.tsx                                          | WP01         | P0       | Yes       |
| T004       | Restyle card.tsx, badge.tsx                                 | WP01         | P0       | Yes       |
| T005       | Restyle input.tsx, textarea.tsx, select.tsx                 | WP01         | P0       | Yes       |
| T006       | Restyle score-badge, ml-badge, budget-indicator             | WP01         | P0       | Yes       |
| T007       | Restyle accordion, empty-state, error-alert, alert, spinner | WP01         | P0       | Yes       |
| T008       | Flow types (FlowStep, FlowState, FlowAction)                | WP02         | P0       | No        |
| T009       | useFlowState hook + FlowContext provider                    | WP02         | P0       | No        |
| T010       | FlowTabs component                                          | WP02         | P0       | No        |
| T011       | Glassmorphic nav bar (\_\_root.tsx)                         | WP02         | P0       | Yes       |
| T012       | Route with validateSearch (?tab=)                           | WP02         | P0       | No        |
| T013       | Tab content switcher                                        | WP02         | P0       | No        |
| T014       | Restyle rider-input.tsx                                     | WP03         | P1       | Yes       |
| T015       | Empty-state preview component                               | WP03         | P1       | Yes       |
| T016       | Setup tab container (5/7 split)                             | WP03         | P1       | No        |
| T017       | Footer summary bar                                          | WP03         | P1       | No        |
| T018       | Wire analyze → flow state                                   | WP03         | P1       | No        |
| T019       | Restyle race-profile-summary.tsx                            | WP04         | P1       | Yes       |
| T020       | Collapsible configuration section                           | WP04         | P1       | Yes       |
| T021       | Restyle rider-table.tsx                                     | WP04         | P1       | No        |
| T022       | Create rider-detail-panel.tsx                               | WP04         | P1       | No        |
| T023       | Add expansion support to data-table.tsx                     | WP04         | P1       | No        |
| T024       | Wire lock/exclude → flow invalidation                       | WP04         | P1       | No        |
| T025       | Restyle team-builder-panel.tsx                              | WP05         | P1       | Yes       |
| T026       | Restyle budget meter                                        | WP05         | P1       | Yes       |
| T027       | Projected score + "Get Optimal Team" CTA                    | WP05         | P1       | Yes       |
| T028       | "Review Team" CTA (on 9/9)                                  | WP05         | P1       | No        |
| T029       | Wire team builder → flow state                              | WP05         | P1       | No        |
| T030       | Restructure optimizer-panel.tsx                             | WP06         | P2       | Yes       |
| T031       | Restyle score-breakdown.tsx                                 | WP06         | P2       | Yes       |
| T032       | Restyle optimal-team-card.tsx                               | WP06         | P2       | Yes       |
| T033       | Optimization tab container                                  | WP06         | P2       | No        |
| T034       | Wire "Apply to Roster" → flow state                         | WP06         | P2       | No        |
| T035       | Restyle team-summary.tsx as final roster                    | WP07         | P2       | Yes       |
| T036       | Roster metrics sidebar                                      | WP07         | P2       | Yes       |
| T037       | Copy to Clipboard                                           | WP07         | P2       | Yes       |
| T038       | Reset button                                                | WP07         | P2       | Yes       |
| T039       | End-to-end flow integration                                 | WP07         | P2       | No        |
| T040       | Responsive layout adjustments                               | WP07         | P2       | No        |
