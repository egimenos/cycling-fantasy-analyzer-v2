---
work_package_id: WP09
title: Optimizer & Team Builder UI
lane: "doing"
dependencies:
- WP07
- WP08
base_branch: 001-cycling-fantasy-team-optimizer-WP08
base_commit: ab7fa4120ed314bdeb36421a91a088f11a9be758
created_at: '2026-03-16T22:04:26.979159+00:00'
subtasks:
- T043
- T044
- T045
- T046
phase: Phase 5 - Frontend
assignee: ''
agent: ''
shell_pid: "22543"
review_status: ''
reviewed_by: ''
history:
- timestamp: '2026-03-14T23:51:57Z'
  lane: planned
  agent: system
  shell_pid: ''
  action: Prompt generated via /spec-kitty.tasks
requirement_refs:
- FR-005
- FR-007
- FR-008
- FR-009
- FR-010
- FR-012
---

# WP09 — Optimizer & Team Builder UI

## Review Feedback

_No review feedback yet._

---

## Objectives

1. Build the optimizer feature UI that calls POST /api/optimize and displays the optimal team along with alternative team selections.
2. Implement the team builder feature for manual team selection with live budget tracking and score projection.
3. Add lock (must-include) and exclude (must-exclude) controls on rider rows that integrate with both the optimizer and team builder.
4. Ensure all async operations have proper loading, error, and empty states using the `AsyncState<T>` pattern from the constitution.

---

## Context

This work package builds the interactive team management UI that sits on top of the rider list (WP08) and the optimizer API (WP07). Users have two paths: automatic optimization (click a button, get the best team) or manual team building (select riders one by one). Both paths support lock/exclude constraints that allow fine-tuning.

**Key references:**
- `plan.md` — Phase 5 frontend features, optimizer UI wireframes
- `spec.md` — Team builder requirements, lock/exclude UX, alternative teams display
- `contracts/api.md` — OptimizeRequest/OptimizeResponse shapes
- `.kittify/memory/constitution.md` — AsyncState pattern, Feature-Sliced Design, no `any`

**Dependencies:** WP07 provides the backend optimizer endpoint. WP08 provides the frontend foundation, rider list, and shared UI components. This WP integrates both.

---

## Subtasks

### T043: Optimizer Feature

**Directory:** `apps/web/src/features/optimizer/`

**Step-by-step instructions:**

1. **`components/optimizer-panel.tsx`**:
   - "Get Optimal Team" button (shadcn/ui `Button` with primary variant):
     - Disabled until riders are analyzed (check if AnalyzeResponse exists and has matched riders)
     - Shows "Optimizing..." with spinner during API call
   - Budget confirmation: show current budget value before optimization
   - Layout: horizontal bar above or beside the rider table
   - On click: call `optimizeTeam()` from the `useOptimize` hook with current riders, budget, mustInclude, mustExclude
   - Props: `riders: AnalyzedRider[]`, `budget: number`, `mustInclude: string[]`, `mustExclude: string[]`, `onOptimized: (result: OptimizeResponse) => void`

2. **`components/optimal-team-card.tsx`**:
   - Card component (shadcn/ui `Card`) displaying the 9 selected riders:
     - Each rider row: name, team, price (formatted with "H" suffix), individual projected score
     - Highlight locked riders with a green left border or lock icon
   - Card footer:
     - Total Cost: formatted with "H" suffix and thousand separators
     - Budget Remaining: using the `BudgetIndicator` component from shared/ui
     - Total Projected Score: bold, large text
   - Header: "Optimal Team" with a trophy or star icon indicator
   - If no optimal team yet: show nothing (component is conditionally rendered)

3. **`components/score-breakdown.tsx`**:
   - Display score category breakdown for a team:
     - Categories: GC, Stage, Mountain, Sprint, Daily
     - Visualization option A: horizontal stacked bar chart using CSS (no charting library needed for MVP)
     - Visualization option B: row of colored category badges, each showing category name and point value
   - Props: `breakdown: Record<string, number>`
   - Color coding: each category has a distinct color (GC=blue, Stage=green, Mountain=orange, Sprint=red, Daily=purple)
   - Show below the team card footer or as an expandable section within the card

4. **`components/alternative-teams.tsx`**:
   - Collapsible accordion (shadcn/ui `Accordion`) with up to 4 alternative teams
   - Each accordion item:
     - Trigger: "Alternative Team #N — X pts" (where X is the total projected score)
     - Content: same layout as `OptimalTeamCard` but with a secondary style (muted card background)
   - Sort alternatives by totalProjectedPts descending (should already be sorted from API)
   - Show "No alternatives available" if the alternatives array is empty
   - Collapsed by default to keep the UI clean

5. **`hooks/use-optimize.ts`**:
   ```typescript
   function useOptimize() {
     const [result, setResult] = useState<OptimizeResponse | null>(null);
     const [isLoading, setIsLoading] = useState(false);
     const [error, setError] = useState<string | null>(null);

     const optimize = async (request: OptimizeRequest) => {
       setIsLoading(true);
       setError(null);
       const response = await optimizeTeam(request);
       setIsLoading(false);
       if (response.status === 'success') {
         setResult(response.data);
       } else {
         setError(response.error);
       }
     };

     const reset = () => {
       setResult(null);
       setError(null);
     };

     return { optimize, result, isLoading, error, reset };
   }
   ```

**Validation criteria:**
- Button is disabled before analysis completes
- Clicking "Get Optimal Team" triggers API call with correct payload
- Optimal team card displays exactly 9 riders with correct totals
- Score breakdown shows all 5 categories with correct values
- Alternative teams accordion works (expand/collapse)
- Loading spinner shown during optimization

---

### T044: Team Builder Feature

**Directory:** `apps/web/src/features/team-builder/`

**Step-by-step instructions:**

1. **`components/team-builder-panel.tsx`**:
   - Side panel layout (right sidebar or bottom panel, responsive):
     - Header: "Team Builder" with rider count "X / 9 selected"
     - Selected rider list: compact list of selected rider names with remove (X) button
     - Live budget counter: `BudgetIndicator` showing spent vs total budget
     - Live projected score: sum of selected riders' totalProjectedPts
   - When 9 riders are selected: show green "Team Complete!" indicator and render `TeamSummary`
   - When fewer than 9: show how many more riders needed
   - Layout considerations:
     - Desktop: fixed-position right sidebar (300px wide)
     - Mobile: collapsible bottom sheet or full-width section below table

2. **`components/team-summary.tsx`**:
   - Shown only when exactly 9 riders are selected
   - Full team summary card:
     - All 9 riders listed with name, team, price, score
     - Total cost with budget indicator
     - Total projected score
     - Score breakdown by category (reuse `ScoreBreakdown` from optimizer feature or extract to shared)
   - "Copy Team" button: copies team summary as formatted text to clipboard (rider names + total)
   - "Reset" button: clears all selections

3. **`hooks/use-team-builder.ts`**:
   ```typescript
   interface TeamBuilderState {
     selectedRiderIds: Set<string>;
     totalCost: number;
     totalScore: number;
     budgetRemaining: number;
   }

   function useTeamBuilder(budget: number, riders: AnalyzedRider[]) {
     const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

     const addRider = (riderId: string) => {
       if (selectedIds.size >= 9) return;
       const rider = riders.find(r => r.id === riderId);
       if (!rider || rider.unmatched) return;
       // Check budget
       const newCost = currentTotalCost + rider.priceHillios;
       if (newCost > budget) return; // Prevent over-budget
       setSelectedIds(prev => new Set([...prev, riderId]));
     };

     const removeRider = (riderId: string) => {
       setSelectedIds(prev => {
         const next = new Set(prev);
         next.delete(riderId);
         return next;
       });
     };

     const clearAll = () => setSelectedIds(new Set());

     const isSelected = (riderId: string) => selectedIds.has(riderId);

     // Computed values
     const selectedRiders = riders.filter(r => r.id && selectedIds.has(r.id));
     const totalCost = selectedRiders.reduce((sum, r) => sum + r.priceHillios, 0);
     const totalScore = selectedRiders.reduce((sum, r) => sum + (r.totalProjectedPts ?? 0), 0);
     const budgetRemaining = budget - totalCost;
     const isTeamComplete = selectedIds.size === 9;

     return {
       selectedRiders, selectedIds, totalCost, totalScore, budgetRemaining,
       isTeamComplete, addRider, removeRider, clearAll, isSelected,
     };
   }
   ```

4. Integration with rider table (from WP08):
   - Add a checkbox column to the rider table (leftmost column)
   - Checkbox is checked if rider is in the team builder selection
   - Checkbox is disabled if:
     - Rider is unmatched (no ID)
     - Team is full (9 riders) and this rider is not selected
     - Adding this rider would exceed the budget
   - Clicking checkbox calls `addRider` or `removeRider`
   - Show a subtle budget warning tooltip on disabled-due-to-budget checkboxes

**Validation criteria:**
- Selecting riders updates the team builder panel in real time
- Budget counter updates correctly as riders are added/removed
- Cannot select more than 9 riders
- Cannot exceed budget (selection is prevented, not just warned)
- Removing a rider frees budget and slot
- Team summary appears when exactly 9 riders are selected
- Clear all resets everything

**Edge cases to test:**
- Select 9 riders then try to add 10th — rejected
- Select rider that exactly fills remaining budget — allowed
- Select rider that exceeds budget by 1 — rejected with visual feedback
- Remove a rider, budget frees up, previously blocked rider becomes selectable
- Unmatched riders cannot be selected

---

### T045: Lock/Exclude UI Controls

**Step-by-step instructions:**

1. Add control buttons to each rider row in the rider table:
   - Lock button: toggle icon (unlocked/locked state)
     - Unlocked state: outline lock icon, neutral color
     - Locked state: filled lock icon, green color, green row highlight
   - Exclude button: X/circle icon
     - Normal state: subtle X icon, neutral color
     - Excluded state: filled X, red color, row grayed out with strikethrough on name

2. State management in rider-list feature:
   ```typescript
   const [lockedRiderIds, setLockedRiderIds] = useState<Set<string>>(new Set());
   const [excludedRiderIds, setExcludedRiderIds] = useState<Set<string>>(new Set());

   const toggleLock = (riderId: string) => {
     // If currently excluded, remove from excluded first
     if (excludedRiderIds.has(riderId)) {
       setExcludedRiderIds(prev => { const next = new Set(prev); next.delete(riderId); return next; });
     }
     setLockedRiderIds(prev => {
       const next = new Set(prev);
       if (next.has(riderId)) next.delete(riderId);
       else next.add(riderId);
       return next;
     });
   };

   const toggleExclude = (riderId: string) => {
     // If currently locked, remove from locked first
     if (lockedRiderIds.has(riderId)) {
       setLockedRiderIds(prev => { const next = new Set(prev); next.delete(riderId); return next; });
     }
     setExcludedRiderIds(prev => {
       const next = new Set(prev);
       if (next.has(riderId)) next.delete(riderId);
       else next.add(riderId);
       return next;
     });
   };
   ```

3. Lock behavior:
   - Locked riders are automatically selected in the team builder (call `addRider` when locked)
   - Locked riders cannot be deselected from team builder (checkbox is checked + disabled)
   - Locked rider IDs are passed as `mustInclude` to the optimizer API
   - Visual: green left border on row, lock icon filled green

4. Exclude behavior:
   - Excluded riders are removed from team builder if currently selected (call `removeRider`)
   - Excluded riders cannot be selected in team builder (checkbox is disabled)
   - Excluded rider IDs are passed as `mustExclude` to the optimizer API
   - Visual: row is grayed out (opacity 50%), name has strikethrough text, X icon is red

5. Mutual exclusivity: a rider cannot be both locked and excluded. Toggling one clears the other.

6. Pass `mustInclude` and `mustExclude` arrays down to the optimizer panel and include in the optimize request.

**Validation criteria:**
- Clicking lock icon toggles the lock state with correct visual feedback
- Clicking exclude icon toggles the exclude state with correct visual feedback
- Locking a rider auto-selects them in team builder
- Excluding a rider removes them from team builder
- A rider cannot be both locked and excluded simultaneously
- Lock/exclude state is passed correctly to the optimizer API
- Unmatched riders cannot be locked (they have no ID)

---

### T046: Error/Loading/Empty States

**Step-by-step instructions:**

1. Define the `AsyncState<T>` union type (per constitution):
   ```typescript
   type AsyncState<T> =
     | { status: 'idle' }
     | { status: 'loading' }
     | { status: 'error'; error: string }
     | { status: 'success'; data: T };
   ```

2. Apply `AsyncState` pattern to all async operations:
   - Analyze: `AsyncState<AnalyzeResponse>`
   - Optimize: `AsyncState<OptimizeResponse>`
   - Refactor `useAnalyze` and `useOptimize` hooks to return `AsyncState<T>` instead of separate boolean/value fields

3. Implement state-specific rendering for each feature:

   **Rider list page:**
   - `idle`: PasteInput + EmptyState with title "Paste a rider list to get started" and description "Copy a price list from the Grandes miniVueltas page and paste it above"
   - `loading`: PasteInput (disabled) + LoadingSpinner with message "Analyzing riders..."
   - `error`: PasteInput + ErrorAlert with server error message and retry button
   - `success`: PasteInput (compact) + metadata summary + RiderTable

   **Optimizer panel:**
   - `idle`: "Get Optimal Team" button (enabled if riders are analyzed)
   - `loading`: Button shows spinner + "Optimizing..." text, all controls disabled
   - `error`: ErrorAlert with message (e.g., "Budget too low for any valid team") and retry button
   - `success`: OptimalTeamCard + AlternativeTeams accordion

   **Team builder panel:**
   - Empty state (0 riders selected): "Select riders from the table or use the optimizer to build your team"
   - Partial state (1-8 riders): show selected riders + "N more riders needed"
   - Complete state (9 riders): TeamSummary with full details
   - Over-budget warning: if somehow the state becomes invalid, show a red alert

4. Ensure retry buttons correctly re-invoke the original action with the same parameters.

5. Transition animations (optional, low priority):
   - Fade in/out between states using CSS transitions or `framer-motion` if already installed
   - Skeleton loading for table rows during analyze

**Validation criteria:**
- Every feature has all 4 states (idle, loading, error, success) rendered correctly
- No white screens or unhandled states
- Retry buttons work and maintain the original request parameters
- Empty states have helpful, descriptive text
- Loading states disable interactive elements to prevent double-submissions

**Edge cases to test:**
- Rapid click on Analyze button — only one request fires (debounce or disable during loading)
- Network timeout during optimize — shows error with retry
- Server returns 422 (not enough riders) — shows descriptive error, not generic message
- Switch race type and re-analyze — previous results are cleared, new loading state shown

---

## Test Strategy

**Unit tests (target 90%+ coverage):**

- `apps/web/src/features/optimizer/__tests__/`:
  - `optimizer-panel.spec.tsx`: button disabled/enabled states, click triggers optimize, loading state
  - `optimal-team-card.spec.tsx`: renders 9 riders, correct totals, locked rider highlighting
  - `score-breakdown.spec.tsx`: renders all categories with correct values and colors
  - `alternative-teams.spec.tsx`: accordion expand/collapse, empty state when no alternatives
  - `use-optimize.spec.ts`: hook state transitions (idle -> loading -> success/error), reset

- `apps/web/src/features/team-builder/__tests__/`:
  - `team-builder-panel.spec.tsx`: renders selected riders, budget counter, remove button
  - `team-summary.spec.tsx`: renders when 9 riders selected, copy button, reset button
  - `use-team-builder.spec.ts`: add/remove riders, budget enforcement, 9-rider max, clear all

- `apps/web/src/features/rider-list/__tests__/`:
  - Update existing tests to include checkbox column, lock/exclude buttons
  - Test lock toggle, exclude toggle, mutual exclusivity
  - Test integration: lock auto-selects in team builder, exclude auto-removes

**Integration tests:**
- Full page test: paste input -> analyze -> lock 2 riders -> optimize -> verify locked riders in result -> switch to manual -> verify team builder state

**Testing tools:** Vitest + React Testing Library. Mock API calls with MSW.

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| State management complexity across features | High | Medium | Use clear prop drilling or lightweight context; avoid premature state library adoption; document data flow |
| Lock/exclude state conflicts with team builder | Medium | Medium | Enforce mutual exclusivity at state level; write thorough integration tests |
| Performance with frequent re-renders (budget recalculation on every selection) | Low | Medium | Memoize computed values with useMemo; profile if needed |
| Responsive layout challenges (sidebar + table + optimizer) | Medium | Medium | Design mobile-first; use Tailwind responsive utilities; test at 375px width |
| Feature coupling between rider-list, optimizer, and team-builder | High | Medium | Lift shared state to page level; pass via props; keep features independently testable |

---

## Review Guidance

When reviewing this WP, verify the following:

1. **State flow**: Trace the data flow from rider list -> lock/exclude -> optimizer -> team builder. Ensure no stale state or race conditions.
2. **Feature independence**: Each feature directory should be testable in isolation with mocked props. No direct imports between features.
3. **AsyncState compliance**: Verify all async operations use the `AsyncState<T>` pattern. No loose boolean + value combinations.
4. **Budget enforcement**: Test that it is impossible to exceed the budget through any combination of UI interactions (manual selection, locking, optimizer result).
5. **Accessibility**: Lock/exclude buttons have ARIA labels. Score breakdown is readable by screen readers. Keyboard navigation works for accordion and checkboxes.
6. **Visual consistency**: Colors, spacing, and typography match across all feature components. shadcn/ui theme tokens are used consistently.
7. **Mobile responsiveness**: Test the full layout at 375px width. Sidebar/panel should collapse or stack vertically.

---

## Activity Log

| Timestamp | Action | Agent | Details |
|-----------|--------|-------|---------|
| 2026-03-14T23:51:57Z | Created | system | Prompt generated via /spec-kitty.tasks |
