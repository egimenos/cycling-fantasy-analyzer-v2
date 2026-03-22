---
work_package_id: WP04
title: Dashboard Screen — Table & Race Bar
lane: 'done'
dependencies:
  - WP01
base_branch: 009-peloton-design-system-redesign-WP01
base_commit: c4db9570d2f127116b9f0cd2c51d4fae6d2ccae8
created_at: '2026-03-22T12:30:14.290049+00:00'
subtasks:
  - T019
  - T020
  - T021
  - T022
  - T023
  - T024
phase: Phase 1 - Screens
assignee: ''
agent: 'claude-opus'
shell_pid: '25095'
review_status: 'approved'
reviewed_by: 'egimenos'
history:
  - timestamp: '2026-03-22T12:03:57Z'
    lane: planned
    agent: system
    shell_pid: ''
    action: Prompt generated via /spec-kitty.tasks
requirement_refs:
  - FR-011
  - FR-012
  - FR-013
  - FR-014
  - FR-015
---

# Work Package Prompt: WP04 – Dashboard Screen — Table & Race Bar

## ⚠️ IMPORTANT: Review Feedback Status

- **Has review feedback?**: Check the `review_status` field above.

---

## Review Feedback

_[Empty initially.]_

---

## Objectives & Success Criteria

- Build the Dashboard tab's main content: race profile bar, collapsible config, and rider table
- Rider table with expandable rows showing category scores (GC/Stage/MTN/SPR) and performance history
- Lock/exclude actions work and trigger flow state invalidation for downstream tabs
- Score badges use correct color coding (top 25% green, middle 50% amber, bottom 25% red)
- Table uses "no-line" philosophy — no vertical lines, ghost border horizontal separators

## Context & Constraints

- **Spec**: US4 (Main Dashboard) — acceptance scenarios 1-6
- **Design Reference**: `redesign/stitch_cycling_fantasy_analizer/2._main_dashboard_analyzed_full_width/screen.png` and `code.html`
- **Research**: R-005 (TanStack Table expansion)
- **Existing components**: `rider-table.tsx`, `race-profile-summary.tsx`, `data-table.tsx`
- **Existing hooks**: `useAnalyze`, `useLockExclude` — preserve their APIs

**Implementation command**: `spec-kitty implement WP04 --base WP02`

## Subtasks & Detailed Guidance

### Subtask T019 – Restyle `race-profile-summary.tsx`

- **Purpose**: Show race metadata in a horizontal bar matching the Stitch design.
- **Steps**:
  1. Read current `race-profile-summary.tsx` props
  2. Restyle as a horizontal bar:
     ```
     bg-surface-container-low border border-outline-variant/15 rounded-sm py-4 px-6
     ```
  3. Left section: race icon + race name (font-headline font-extrabold) + type badge (e.g., "GRAND TOUR" in secondary colors)
  4. Middle section: rider count (`font-mono text-xl font-bold text-primary`) + matched count (`text-secondary`)
  5. Right section: status indicator — green pulse dot + "ANALYZED & OPTIMIZED" text in green
  6. Use `flex flex-wrap items-center justify-between gap-4`

- **Files**: `apps/web/src/features/rider-list/components/race-profile-summary.tsx`
- **Parallel?**: Yes — independent component

### Subtask T020 – Build collapsible configuration section

- **Purpose**: Show a summary of current inputs that can be expanded to edit.
- **Steps**:
  1. Create a new component or section within the Dashboard tab
  2. Use Radix `Collapsible` (already in dependencies):
     ```tsx
     <Collapsible>
       <div className="flex items-center justify-between px-6 py-3 bg-surface-container-high/40 border border-outline-variant/15 rounded-sm">
         <div className="flex items-center gap-3">
           <SettingsIcon className="text-outline w-4 h-4" />
           <span className="text-sm font-bold uppercase tracking-wider">
             Configuration & Inputs
           </span>
           <span className="text-[10px] font-mono text-outline ml-2">
             URL • PRICE LIST • BUDGET (100H)
           </span>
         </div>
         <CollapsibleTrigger className="flex items-center gap-4">
           <button className="bg-primary-container px-4 py-1.5 rounded-sm text-[10px] font-bold border border-primary/20">
             EDIT INPUTS
           </button>
           <ChevronDown className="text-outline w-4 h-4" />
         </CollapsibleTrigger>
       </div>
       <CollapsibleContent>{/* Show inputs summary or edit form */}</CollapsibleContent>
     </Collapsible>
     ```
  3. "Edit Inputs" could navigate back to Setup tab: `navigate({ search: { tab: 'setup' } })`

- **Files**: New component in Dashboard tab area
- **Parallel?**: Yes — independent from table work

### Subtask T021 – Restyle `rider-table.tsx`

- **Purpose**: Apply the new table design with proper columns, ghost borders, and score badges.
- **Steps**:
  1. Read current `rider-table.tsx` to understand its column definitions and props
  2. Update column definitions:
     - **Checkbox**: selection checkbox with `bg-surface-dim border-outline-variant rounded-none`
     - **Rank**: `font-mono font-bold text-primary` (zero-padded: 01, 02, ...)
     - **Rider Name**: `font-headline font-bold` + lock icon if locked
     - **Team**: `text-xs font-mono text-outline uppercase`
     - **Price (H)**: `text-right font-mono font-bold`
     - **Score**: Score badge component (see WP01 T006)
     - **Pts/H**: `text-right font-mono` (price efficiency ratio)
     - **Match**: Status badge — "OPTIMAL" (tertiary), "MATCH" (secondary), "EXCLUDED" (outline)
     - **Actions**: Lock icon + exclude (block) icon
  3. Table styling:
     - Header: `bg-surface-container-high/50 text-[10px] font-mono text-outline uppercase tracking-wider`
     - Rows: `divide-y divide-outline-variant/10` (ghost borders)
     - No vertical lines
     - Hover: `hover:bg-surface-container-high/50`
     - Excluded rows: `opacity-40 grayscale`
     - Selected/locked rows: subtle `bg-secondary-container/5` highlight
  4. Pagination: `font-mono text-xs text-outline` with page buttons

- **Files**: `apps/web/src/features/rider-list/components/rider-table.tsx`
- **Notes**: This is a significant restyle. Preserve all functional props (onToggleLock, onToggleExclude, onToggleSelect, etc.)

### Subtask T022 – Create `rider-detail-panel.tsx`

- **Purpose**: Build the expandable row detail showing category scores and performance history.
- **Steps**:
  1. Create `apps/web/src/features/rider-list/components/rider-detail-panel.tsx`
  2. Layout: `grid grid-cols-1 md:grid-cols-4 gap-6 p-6`
  3. Left column (1/4): Category score cards
     ```tsx
     <div className="grid grid-cols-2 gap-2">
       {/* GC score card */}
       <div className="bg-surface-container-high p-3 rounded-sm border-l-2 border-gc">
         <p className="text-[9px] text-outline uppercase font-mono">GC</p>
         <p className="font-mono font-bold text-gc text-lg">{scores.gc}</p>
       </div>
       {/* Stage, MTN, SPR cards similarly with border-stage, border-mountain, border-sprint */}
     </div>
     ```
  4. Right columns (3/4): Performance history table
     ```tsx
     <table className="w-full text-xs font-mono">
       <thead className="bg-surface-container-highest/50 text-outline">
         <tr>
           <th>Season</th>
           <th>Grand Tours</th>
           <th>Classic Wins</th>
           <th>UCI Pts</th>
         </tr>
       </thead>
       <tbody className="divide-y divide-outline-variant/10">
         {/* Rows with performance data */}
       </tbody>
     </table>
     ```
  5. The component receives the rider's full data as props
  6. Handle missing data gracefully (not all riders have category scores or history)

- **Files**: `apps/web/src/features/rider-list/components/rider-detail-panel.tsx` (new)
- **Notes**: The performance history data structure depends on what the API returns. Check `AnalyzeResponse` type for available fields. If history data doesn't exist yet, render a "No history available" message.

### Subtask T023 – Add expansion support to `data-table.tsx`

- **Purpose**: Enable TanStack Table's built-in row expansion.
- **Steps**:
  1. Read current `data-table.tsx` to understand its structure
  2. Add props:
     ```typescript
     interface DataTableProps<TData> {
       // ... existing props
       getRowCanExpand?: (row: Row<TData>) => boolean;
       renderSubComponent?: (props: { row: Row<TData> }) => React.ReactNode;
     }
     ```
  3. Pass to `useReactTable`:
     ```typescript
     const table = useReactTable({
       // ... existing options
       getRowCanExpand: props.getRowCanExpand,
     });
     ```
  4. In the table body, after each row, conditionally render the sub-component:
     ```tsx
     {
       row.getIsExpanded() && props.renderSubComponent && (
         <TableRow>
           <TableCell colSpan={row.getVisibleCells().length} className="p-0">
             <div className="border-t border-outline-variant/10 bg-surface-container-low">
               {props.renderSubComponent({ row })}
             </div>
           </TableCell>
         </TableRow>
       );
     }
     ```
  5. Add an expand toggle to the row — either on row click or via a dedicated expand button
  6. Expanded row background: `bg-surface-container-highest/30`

- **Files**: `apps/web/src/shared/ui/data-table.tsx`

### Subtask T024 – Wire lock/exclude changes to flow state invalidation

- **Purpose**: When the user changes lock/exclude in Dashboard, invalidate the Optimization tab.
- **Steps**:
  1. In the Dashboard tab component, intercept lock/exclude toggle calls
  2. After each lock/exclude change, dispatch:
     ```typescript
     flowDispatch({ type: 'INVALIDATE_FROM', step: 'optimization' });
     ```
  3. This removes 'optimization' and 'roster' from unlocked steps
  4. If user was on those tabs, they'd be redirected to Dashboard (handled by WP02's guard)

- **Files**: Dashboard tab component
- **Notes**: This ensures that if the user changes team composition, they must re-optimize.

## Risks & Mitigations

- **Category score data availability**: The `AnalyzeResponse` may not include per-category scores (GC, Stage, MTN, SPR). Check the shared types. If not available, use the composite score and note that category breakdown is a future enhancement.
- **Performance history data**: Similarly, 3-season history may not be in the API response. Stub with placeholder if needed.
- **Table column count**: More columns than before. Ensure minimum table width or horizontal scroll for narrower viewports.

## Review Guidance

- **Check**: Race profile bar shows all metadata (name, type, counts, status)
- **Check**: Table rows expand/collapse on click showing detail panel
- **Check**: Category score cards use correct colors (GC=blue, Stage=green, MTN=orange, SPR=red)
- **Check**: Lock/exclude actions work and invalidate Optimization tab
- **Check**: No vertical lines in the table — only ghost horizontal separators
- **Check**: Excluded rows are visually dimmed (opacity + grayscale)

## Activity Log

- 2026-03-22T12:03:57Z – system – lane=planned – Prompt created.
- 2026-03-22T12:30:15Z – claude-opus – shell_pid=25095 – lane=doing – Assigned agent via workflow command
- 2026-03-22T12:35:08Z – claude-opus – shell_pid=25095 – lane=for_review – Dashboard screen complete: race bar, collapsible config, restyled table with expandable category scores, flow invalidation on lock/exclude
- 2026-03-22T12:41:16Z – claude-opus – shell_pid=25095 – lane=done – Review passed: race bar, expandable rows with category scores, ghost borders, flow invalidation
