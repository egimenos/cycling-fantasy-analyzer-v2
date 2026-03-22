---
work_package_id: WP05
title: Dashboard Screen — Team Builder Sidebar
lane: 'done'
dependencies:
  - WP01
base_branch: 009-peloton-design-system-redesign-WP01
base_commit: c4db9570d2f127116b9f0cd2c51d4fae6d2ccae8
created_at: '2026-03-22T12:36:13.865236+00:00'
subtasks:
  - T025
  - T026
  - T027
  - T028
  - T029
phase: Phase 1 - Screens
assignee: ''
agent: 'claude-opus'
shell_pid: '28434'
review_status: 'approved'
reviewed_by: 'egimenos'
history:
  - timestamp: '2026-03-22T12:03:57Z'
    lane: planned
    agent: system
    shell_pid: ''
    action: Prompt generated via /spec-kitty.tasks
requirement_refs:
  - FR-016
---

# Work Package Prompt: WP05 – Dashboard Screen — Team Builder Sidebar

## ⚠️ IMPORTANT: Review Feedback Status

- **Has review feedback?**: Check the `review_status` field above.

---

## Review Feedback

_[Empty initially.]_

---

## Objectives & Success Criteria

- Restyle the Team Builder sidebar to match Stitch Screen 2 right panel
- Active roster display with rider cards, empty slot placeholders, budget meter, projected score
- "Get Optimal Team" CTA triggers optimization and navigates to Optimization tab
- "Review Team" CTA appears when 9 riders are manually selected, navigates to Roster tab
- Sidebar is sticky during table scrolling
- Assemble complete Dashboard tab layout (70% table + 30% sidebar)

## Context & Constraints

- **Spec**: US4 acceptance scenarios 6-7
- **Design Reference**: `redesign/stitch_cycling_fantasy_analizer/2._main_dashboard_analyzed_full_width/code.html` — Team Builder sidebar section
- **Existing component**: `apps/web/src/features/team-builder/components/team-builder-panel.tsx` — preserve all props
- **Existing hooks**: `useTeamBuilder`, `useOptimize`

**Implementation command**: `spec-kitty implement WP05 --base WP04`

## Subtasks & Detailed Guidance

### Subtask T025 – Restyle `team-builder-panel.tsx`

- **Purpose**: Apply the new Team Builder design with rider cards and empty slots.
- **Steps**:
  1. Read current `team-builder-panel.tsx` props and structure
  2. Container: `bg-surface-container-high p-6 rounded-sm border border-outline-variant/10 sticky top-24`
  3. Header:
     ```tsx
     <h3 className="font-headline font-extrabold text-xl tracking-tight">TEAM BUILDER</h3>
     <p className="text-[10px] font-mono text-outline uppercase tracking-widest">Live Optimization</p>
     ```
  4. Active roster count: `font-mono font-bold text-secondary text-sm` showing "X / 9 riders"
  5. Selected rider cards:
     ```tsx
     <div className="flex items-center gap-3 bg-surface-container-low p-2.5 border border-outline-variant/10 rounded-sm">
       <div className="w-10 h-10 bg-surface-container-highest rounded-sm flex-shrink-0 flex items-center justify-center">
         <UserIcon className="text-outline w-5 h-5" />
       </div>
       <div className="flex-grow">
         <p className="text-xs font-bold font-headline">{rider.shortName}</p>
         <p className="text-[10px] text-outline font-mono">
           {rider.price}H • {rider.role}
         </p>
       </div>
       <XIcon
         className="text-outline hover:text-error w-4 h-4 cursor-pointer"
         onClick={() => onRemove(rider)}
       />
     </div>
     ```
  6. Empty slots (9 minus selected count):
     ```tsx
     <div className="h-10 border border-dashed border-outline-variant/30 rounded-sm flex items-center justify-center text-[10px] text-outline/50 uppercase font-mono tracking-widest">
       Empty Slot
     </div>
     ```
  7. Preserve all existing callbacks: `onRemoveRider`, `onClearAll`

- **Files**: `apps/web/src/features/team-builder/components/team-builder-panel.tsx`

### Subtask T026 – Restyle budget meter

- **Purpose**: Display budget usage as a gradient progress bar.
- **Steps**:
  1. Within the sidebar, add budget section:
     ```tsx
     <div className="space-y-3 pt-4 border-t border-outline-variant/10">
       <div className="flex items-center justify-between text-[10px] font-mono text-outline uppercase">
         <span>Remaining Budget</span>
         <span className="text-on-surface font-bold">
           {remaining} / {budget} H
         </span>
       </div>
       <div className="h-2 w-full bg-surface-container-highest rounded-full overflow-hidden">
         <div
           className={cn(
             'h-full transition-all duration-500 rounded-full',
             isOverBudget
               ? 'bg-error animate-pulse'
               : 'bg-gradient-to-r from-secondary to-blue-400',
           )}
           style={{ width: `${usagePercent}%` }}
         />
       </div>
       <p className="text-[9px] text-outline italic">
         {isOverBudget ? 'Over budget!' : `Efficient build: ${usagePercent}% utilized`}
       </p>
     </div>
     ```
  2. Over-budget state: bar turns red with pulse animation

- **Files**: Within `team-builder-panel.tsx` or as sub-component

### Subtask T027 – Add projected score and "Get Optimal Team" CTA

- **Purpose**: Display the team's projected score and the optimize button.
- **Steps**:
  1. Projected score display:
     ```tsx
     <div className="flex justify-between items-center">
       <span className="text-xs text-outline font-mono uppercase">Projected Score</span>
       <span className="font-mono font-bold text-2xl text-secondary">
         {totalScore.toLocaleString()}
       </span>
     </div>
     ```
  2. CTA button:
     ```tsx
     <button
       onClick={onOptimize}
       className="w-full py-4 bg-gradient-to-br from-primary-fixed-dim to-primary-container text-on-surface font-headline font-extrabold uppercase tracking-widest text-sm rounded-sm hover:scale-[1.02] active:scale-95 transition-all shadow-lg shadow-black/40"
     >
       Get Optimal Team
     </button>
     ```
  3. The `onOptimize` callback triggers the optimization API call

### Subtask T028 – Add "Review Team" CTA

- **Purpose**: When 9 riders are selected manually, show a button to go to the Roster tab.
- **Steps**:
  1. Conditionally render when `isTeamComplete` is true:
     ```tsx
     {
       isTeamComplete && (
         <button
           onClick={() => {
             flowDispatch({ type: 'TEAM_COMPLETE' });
             navigate({ search: { tab: 'roster' } });
           }}
           className="w-full py-3 bg-green-500/20 text-green-400 border border-green-500/30 font-headline font-bold uppercase tracking-wider text-sm rounded-sm hover:bg-green-500/30 transition-colors"
         >
           Review Team →
         </button>
       );
     }
     ```
  2. This button replaces "Get Optimal Team" when the team is manually complete

### Subtask T029 – Wire team builder to flow state

- **Purpose**: Connect optimize and team-complete actions to the flow state machine.
- **Steps**:
  1. When optimization succeeds:
     ```typescript
     flowDispatch({ type: 'OPTIMIZE_SUCCESS' });
     navigate({ search: { tab: 'optimization' } });
     ```
  2. When team is manually completed (9/9):
     - Show "Review Team" button (T028)
     - On click: dispatch `TEAM_COMPLETE` and navigate to roster
  3. Assemble the complete Dashboard tab layout:
     ```tsx
     <div className="flex flex-col lg:flex-row gap-6">
       <section className="lg:w-[70%]">
         <RaceProfileSummary />
         <CollapsibleConfig />
         <RiderTable />
       </section>
       <aside className="lg:w-[30%]">
         <TeamBuilderPanel />
       </aside>
     </div>
     ```

- **Files**: Dashboard tab component
- **Notes**: The 70/30 split uses flexbox percentages, not CSS grid, matching the Stitch design

## Risks & Mitigations

- **Sticky sidebar**: `sticky top-24` requires the parent container to have sufficient height. If the table has few rows, the sidebar won't stick. Test with both short and long rider lists.
- **Optimize API integration**: The existing `useOptimize` hook must be connected. Read its current API before wiring.

## Review Guidance

- **Check**: Sidebar shows correct rider cards and empty slots
- **Check**: Budget bar fills proportionally with gradient
- **Check**: Over-budget shows red pulse animation
- **Check**: "Get Optimal Team" triggers optimization
- **Check**: At 9/9 riders, "Review Team" appears and navigates to Roster
- **Check**: Sidebar sticks during scroll
- **Check**: Dashboard is 70/30 layout on desktop

## Activity Log

- 2026-03-22T12:03:57Z – system – lane=planned – Prompt created.
- 2026-03-22T12:36:15Z – claude-opus – shell_pid=28434 – lane=doing – Assigned agent via workflow command
- 2026-03-22T12:38:30Z – claude-opus – shell_pid=28434 – lane=for_review – Dashboard sidebar complete: rider cards, empty slots, budget gradient bar, projected score, Get Optimal Team + Review Team CTAs with flow wiring
- 2026-03-22T12:41:18Z – claude-opus – shell_pid=28434 – lane=done – Review passed: rider cards, budget gradient, CTAs, optimize wiring
