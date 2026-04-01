---
work_package_id: WP06
title: Frontend — Breakout & Value Picks Filters
lane: planned
dependencies: [WP04]
subtasks:
  - T025
  - T026
  - T027
phase: Phase 2 - Frontend
assignee: ''
agent: ''
shell_pid: ''
review_status: ''
reviewed_by: ''
history:
  - timestamp: '2026-04-01T17:57:39Z'
    lane: planned
    agent: system
    shell_pid: ''
    action: Prompt generated via /spec-kitty.tasks
requirement_refs:
  - FR-011
---

# Work Package Prompt: WP06 – Frontend — Breakout & Value Picks Filters

## Objectives & Success Criteria

- Add "Breakout" filter button (BPI ≥50, any price)
- Add "Value Picks" filter button (BPI ≥50 + price ≤125 hillios)
- Handle empty state when no riders match
- **Success**: Clicking "Breakout" shows only riders with BPI ≥50. Clicking "Value Picks" shows BPI ≥50 AND price ≤125, sorted by BPI descending. Empty state message when no riders match. Clicking again returns to default view.

## Context & Constraints

- **Spec**: `kitty-specs/015-breakout-potential-index/spec.md` (User Story 4 + expanded scope)
- **Existing filters**: `FILTER_OPTIONS` array in `rider-table.tsx` with 5 entries: all, selected, locked, excluded, unmatched. Each has `id`, `label`, `icon`, and a filter function.
- **Constitution**: Feature-Sliced Design. Tailwind CSS.
- **Planning decision**: Two filters instead of one — "Breakout" is broader (any price), "Value Picks" is the strict subset (cheap + breakout).

## Implementation Command

```bash
spec-kitty implement WP06 --base WP04
```

## Subtasks & Detailed Guidance

### Subtask T025 – Add "Breakout" filter button

**Purpose**: Let users quickly see all riders with meaningful breakout potential regardless of price.

**Steps**:

1. Open `apps/web/src/features/rider-list/components/rider-table.tsx`
2. Find the `FILTER_OPTIONS` array (should be around line 369-387)
3. Add a new entry:
   ```typescript
   {
     id: 'breakout',
     label: 'Breakout',
     icon: TrendingUp, // from lucide-react
     filter: (rider: AnalyzedRider) => (rider.breakout?.index ?? 0) >= 50,
   }
   ```
4. Import `TrendingUp` from `lucide-react` (or check which icon library is used).
5. Verify the filter integrates with the existing `filteredRiders` logic — check how the active filter state works:
   - Likely a `useState<string>('all')` controlling which filter is active
   - The `filteredRiders` useMemo applies the active filter's function
   - The new filter should work identically to existing ones

**Files**:

- `apps/web/src/features/rider-list/components/rider-table.tsx` (modify)

**Parallel?**: Yes — independent from T026.

**Notes**:

- The filter buttons should be mutually exclusive — selecting "Breakout" deselects any other active filter.
- Check if the existing filter uses toggle behavior (click to activate, click again to deactivate back to "all"). If so, the same behavior applies.
- Verify the icon import path — the project uses `lucide-react` per constitution.

### Subtask T026 – Add "Value Picks" filter button

**Purpose**: One-click filter to cheap riders with high breakout potential — the core fantasy scouting use case.

**Steps**:

1. Add another entry to `FILTER_OPTIONS`:
   ```typescript
   {
     id: 'valuePicks',
     label: 'Value Picks',
     icon: Gem, // from lucide-react — or Star, Sparkles, etc.
     filter: (rider: AnalyzedRider) =>
       (rider.breakout?.index ?? 0) >= 50 && rider.priceHillios <= 125,
   }
   ```
2. **Sort override**: When "Value Picks" is active, the table should sort by BPI descending instead of the default score sort. Check how sorting interacts with filters:
   - If sorting is controlled via `SortingState`, set it to `[{ id: 'bpi', desc: true }]` when Value Picks activates.
   - When deactivating, restore the previous/default sort.
   - This may require lifting the sort state or adding a `useEffect` that responds to filter changes:
   ```typescript
   useEffect(() => {
     if (activeFilter === 'valuePicks') {
       setSorting([{ id: 'bpi', desc: true }]);
     }
   }, [activeFilter]);
   ```

**Files**:

- `apps/web/src/features/rider-list/components/rider-table.tsx` (modify)

**Parallel?**: Yes — independent from T025.

**Notes**:

- The sort override on filter activation is a UX improvement from the spec. If it complicates the implementation significantly (e.g., the table sorting is deeply coupled), it can be deferred — the filter alone is valuable even without auto-sort.
- The price threshold (125) and BPI threshold (50) match the spec. These could be constants:
  ```typescript
  const BPI_BREAKOUT_THRESHOLD = 50;
  const VALUE_PICKS_PRICE_LIMIT = 125;
  ```

### Subtask T027 – Add empty state for filters

**Purpose**: Show a helpful message when a BPI filter returns zero results instead of an empty table.

**Steps**:

1. Find where `filteredRiders` is rendered into the table body
2. Add a condition for empty results:
   ```typescript
   {filteredRiders.length === 0 && activeFilter !== 'all' && (
     <div className="flex flex-col items-center justify-center py-12 text-gray-500">
       <p className="text-sm font-medium">
         {activeFilter === 'breakout'
           ? 'No breakout candidates found'
           : activeFilter === 'valuePicks'
             ? 'No value picks found for this race'
             : 'No riders match this filter'}
       </p>
       <button
         className="mt-2 text-xs text-blue-500 hover:text-blue-700"
         onClick={() => setActiveFilter('all')}
       >
         Show all riders
       </button>
     </div>
   )}
   ```
3. The empty state should:
   - Show a contextual message based on which filter is active
   - Provide a quick "Show all riders" link to clear the filter
   - Be styled consistently with any existing empty states in the app

**Files**:

- `apps/web/src/features/rider-list/components/rider-table.tsx` (modify)

**Parallel?**: No — depends on T025/T026 (filters must exist to test empty state).

**Notes**:

- Check if TanStack Table has its own empty state handling — the empty state may need to be rendered inside the table's `tbody` or outside the table component depending on the current implementation.
- The existing filter system may already handle empty states for "Selected" or "Locked" filters. If so, follow the same pattern and just add BPI-specific messages.

## Risks & Mitigations

- **Filter state conflicts**: BPI filters must be mutually exclusive with existing filters. Verify that selecting "Breakout" properly deselects "Selected", "Locked", etc.
- **Sort override side effects**: Changing sorting state programmatically when a filter activates might interfere with user-initiated sorts. Only auto-sort on filter activation, not on subsequent interactions.
- **Threshold hardcoding**: BPI ≥50 and price ≤125 are hardcoded. This is fine for v1 — if thresholds need to be configurable later, extract to constants.

## Review Guidance

- Verify "Breakout" shows ALL riders with BPI ≥50 (not just cheap ones).
- Verify "Value Picks" shows riders with BPI ≥50 AND price ≤125 only.
- Verify clicking an active filter deactivates it (returns to "All").
- Verify filters are mutually exclusive with existing filters.
- Verify empty state appears when no riders match and includes "Show all riders" action.
- Verify Value Picks auto-sorts by BPI descending.
- Test with a price list where no riders qualify for Value Picks — empty state should appear.

## Activity Log

- 2026-04-01T17:57:39Z – system – lane=planned – Prompt created.
