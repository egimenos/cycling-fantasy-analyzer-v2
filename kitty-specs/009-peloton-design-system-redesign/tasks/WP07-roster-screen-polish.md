---
work_package_id: WP07
title: Roster Screen & Final Polish
lane: 'done'
dependencies:
  - WP01
  - WP04
subtasks:
  - T035
  - T036
  - T037
  - T038
  - T039
  - T040
phase: Phase 2 - Advanced Screens
assignee: ''
agent: ''
shell_pid: ''
review_status: 'approved'
reviewed_by: 'egimenos'
history:
  - timestamp: '2026-03-22T12:03:57Z'
    lane: planned
    agent: system
    shell_pid: ''
    action: Prompt generated via /spec-kitty.tasks
requirement_refs:
  - FR-018
---

# Work Package Prompt: WP07 – Roster Screen & Final Polish

## ⚠️ IMPORTANT: Review Feedback Status

- **Has review feedback?**: Check the `review_status` field above.

---

## Review Feedback

_[Empty initially.]_

---

## Objectives & Success Criteria

- Build the Final Roster tab (Tab D) with success banner, 9-rider list, metrics sidebar
- Copy to Clipboard and Reset functionality
- End-to-end flow verification: A→B→D (manual) and A→B→C→D (optimizer)
- Reset/invalidation logic works correctly
- Responsive layouts work from 1024px to 1920px
- All existing functionality preserved with zero regressions

## Context & Constraints

- **Spec**: US6 (Final Team Roster) — acceptance scenarios 1-6
- **Design Reference**: `redesign/stitch_cycling_fantasy_analizer/4._final_team_roster_full_width/screen.png` and `code.html`
- **Existing component**: `apps/web/src/features/team-builder/components/team-summary.tsx`
- **This is the final WP** — all previous work must be integrated

**Implementation command**: `spec-kitty implement WP07 --base WP06`

## Subtasks & Detailed Guidance

### Subtask T035 – Restyle `team-summary.tsx` as Final Roster view

- **Purpose**: Transform team summary into the final roster screen with success banner and rider list.
- **Steps**:
  1. Read current `team-summary.tsx` props
  2. Success banner at top:
     ```tsx
     <div className="bg-green-900/20 border-l-4 border-green-500 p-6 rounded-sm mb-10 flex flex-col md:flex-row justify-between items-center gap-4">
       <div className="flex items-center gap-4">
         <div className="bg-green-500 text-surface-dim p-2 rounded-full">
           <CheckCircleIcon className="w-5 h-5" />
         </div>
         <div>
           <h1 className="font-headline text-2xl font-extrabold tracking-tight text-green-100">
             Team Complete!
           </h1>
           <p className="text-green-200/60 text-sm">
             Your roster is mathematically optimized for the upcoming stage.
           </p>
         </div>
       </div>
       <div className="flex gap-3">{/* Reset and Copy buttons — see T037, T038 */}</div>
     </div>
     ```
  3. Layout: `grid grid-cols-1 lg:grid-cols-12 gap-10`
     - Left (8 cols): Rider list
     - Right (4 cols): Metrics sidebar
  4. Rider list — each rider row:
     ```tsx
     <div className="bg-surface-container-high p-4 flex items-center gap-4 group hover:bg-surface-container-highest transition-all">
       <div className="w-12 h-12 rounded-sm bg-surface-container-highest flex items-center justify-center">
         <BikeIcon className="text-on-primary-container w-5 h-5" />
       </div>
       <div className="flex-grow">
         <div className="flex items-center gap-2">
           <span className="font-headline font-bold text-on-surface">{rider.name}</span>
           {index === 0 && (
             <span className="bg-tertiary/20 text-tertiary text-[10px] px-1.5 font-bold rounded-sm border border-tertiary/30">
               CAPTAIN
             </span>
           )}
         </div>
         <span className="text-xs text-on-surface-variant">{rider.team}</span>
       </div>
       <div className="grid grid-cols-3 gap-8 text-right pr-4">
         <div>
           <div className="text-[10px] text-on-primary-container font-mono uppercase">Cost</div>
           <div className="font-mono text-primary font-bold">{rider.price}H</div>
         </div>
         <div>
           <div className="text-[10px] text-on-primary-container font-mono uppercase">Proj</div>
           <div className="font-mono text-tertiary font-bold">{rider.score}</div>
         </div>
         <div>
           <div className="text-[10px] text-on-primary-container font-mono uppercase">Form</div>
           <div className="font-mono text-green-400 font-bold">{rider.form ?? '—'}</div>
         </div>
       </div>
     </div>
     ```
  5. First rider gets "CAPTAIN" badge (purely visual — highest-ranked rider)
  6. Section title: "OFFICIAL 9-RIDER ROSTER" with `font-headline text-lg font-bold uppercase`

- **Files**: `apps/web/src/features/team-builder/components/team-summary.tsx`
- **Parallel?**: Yes — independent from T036

### Subtask T036 – Build roster metrics sidebar

- **Purpose**: Display aggregated team statistics.
- **Steps**:
  1. Create metrics sidebar component or section:

     ```tsx
     <div className="bg-surface-container-low p-8 rounded-sm space-y-10 border-t-2 border-primary">
       <h3 className="font-headline text-xl font-extrabold tracking-tight">Roster Metrics</h3>

       {/* Total Projected Score */}
       <div className="space-y-2">
         <label className="font-mono text-[10px] tracking-widest text-on-primary-container uppercase">
           Total Proj. Score
         </label>
         <div className="flex items-baseline gap-2">
           <span className="font-headline text-5xl font-black text-on-surface tracking-tighter">
             {totalScore}
           </span>
           <span className="font-mono text-tertiary text-lg font-bold">PTS</span>
         </div>
       </div>

       {/* Budget Stats */}
       <div className="space-y-2">
         <div className="flex justify-between text-[10px] font-mono uppercase tracking-widest">
           <span className="text-on-primary-container">Total Expenditure</span>
           <span className="text-on-surface font-bold">
             {totalCost} / {budget}
           </span>
         </div>
         <div className="h-1.5 bg-surface-container-highest w-full rounded-full overflow-hidden">
           <div className="h-full bg-primary" style={{ width: `${(totalCost / budget) * 100}%` }} />
         </div>
       </div>

       {/* Grid: Remaining + Avg/Rider */}
       <div className="grid grid-cols-2 gap-4">
         <div className="bg-surface-container-high p-4 rounded-sm">
           <span className="font-mono text-[9px] uppercase text-on-primary-container block mb-1">
             Remaining
           </span>
           <span className="font-mono text-xl font-bold text-on-surface">{remaining}H</span>
         </div>
         <div className="bg-surface-container-high p-4 rounded-sm">
           <span className="font-mono text-[9px] uppercase text-on-primary-container block mb-1">
             Avg/Rider
           </span>
           <span className="font-mono text-xl font-bold text-on-surface">{avgCost}H</span>
         </div>
       </div>
     </div>
     ```

  2. Compute: totalScore, totalCost, remaining, avgCost from the selected riders data

- **Files**: Roster tab component area
- **Parallel?**: Yes — independent from T035

### Subtask T037 – Implement Copy to Clipboard

- **Purpose**: Allow the user to copy the final team roster as text.
- **Steps**:
  1. Format the team as readable text:
     ```
     CYCLING FANTASY OPTIMIZER - TEAM ROSTER
     =========================================
     1. Tadej Pogačar (UAE Team Emirates) - 28.5H - Score: 98.2
     2. Jonas Vingegaard (Team Visma) - 26.0H - Score: 96.8
     ... (all 9 riders)
     =========================================
     Total Cost: 95.0H / 100H | Projected Score: 1,482
     ```
  2. Use `navigator.clipboard.writeText(formattedText)`
  3. Show toast on success: `toast.success('Team copied to clipboard!')`
  4. Button styling: `bg-primary-fixed text-on-surface rounded-sm px-6 py-2 text-sm font-bold` with clipboard icon

- **Files**: Roster tab component
- **Parallel?**: Yes — independent from T038

### Subtask T038 – Implement Reset button

- **Purpose**: Clear everything and go back to Dashboard.
- **Steps**:
  1. On click:
     ```typescript
     teamBuilder.clearAll();
     // Clear lock/exclude state
     // Dispatch RESET to flow (locks optimization + roster tabs)
     flowDispatch({ type: 'RESET' });
     navigate({ search: { tab: 'setup' } });
     ```
  2. Button styling: `bg-surface-container-high hover:bg-surface-container-highest px-6 py-2 rounded-sm text-sm font-bold` with refresh icon
  3. No confirmation dialog needed (per spec)

- **Files**: Roster tab component
- **Parallel?**: Yes — independent from T037

### Subtask T039 – End-to-end flow integration

- **Purpose**: Verify the complete flow works across all tabs.
- **Steps**:
  1. Test path A→B→D (manual):
     - Setup: enter riders, analyze
     - Dashboard: manually select 9 riders
     - "Review Team" → Roster tab shows team
  2. Test path A→B→C→D (optimizer):
     - Setup: enter riders, analyze
     - Dashboard: click "Get Optimal Team"
     - Optimization: view results, click "Apply to Roster"
     - Roster tab shows optimal team
  3. Test reset:
     - From Roster, click Reset → goes to Setup
     - All tabs lock except Setup
  4. Test invalidation:
     - From Dashboard, change a lock/exclude → Optimization tab locks
     - Must re-optimize before accessing Optimization again
  5. Test backward navigation:
     - From Optimization, go back to Dashboard → Dashboard state preserved
     - Modify something → Optimization invalidated
  6. Fix any integration issues found
  7. Ensure the existing `rider-list-page.tsx` content is properly distributed across tabs (not duplicated)

- **Files**: Route and tab components
- **Notes**: This is integration work — may require adjustments to previous WPs' components

### Subtask T040 – Responsive layout adjustments

- **Purpose**: Ensure all tabs work from 1024px to 1920px viewports.
- **Steps**:
  1. Tab bar: horizontal scroll or wrap on narrow viewports
  2. Setup tab: stack columns vertically below `lg` breakpoint
  3. Dashboard: sidebar stacks below table below `lg`
  4. Optimization: rider grid goes from 3-col to 2-col to 1-col
  5. Roster: metrics sidebar stacks below rider list below `lg`
  6. Nav bar: title + buttons only (no nav links to hide)
  7. Test at 1024px, 1280px, 1440px, 1920px

- **Files**: All tab components, `__root.tsx`
- **Notes**: Desktop-first — all `lg:` prefixed classes should handle the responsive breakpoint

## Risks & Mitigations

- **Copy to clipboard HTTPS**: `navigator.clipboard.writeText()` requires HTTPS or localhost. Vite dev server uses localhost, so this works in dev. Verify in production.
- **State cleanup on reset**: Must clear ALL state — analyze data, optimize data, team builder selections, lock/exclude sets. Missing any will cause stale data on the next flow.
- **Integration complexity**: This WP depends on all previous WPs. If earlier WPs have issues, they'll surface here. Budget extra time for fixes.

## Review Guidance

- **Check**: Success banner shows with correct styling
- **Check**: Roster list shows all 9 riders with captain badge on first
- **Check**: Metrics sidebar shows correct totals
- **Check**: Copy to clipboard produces readable text and shows toast
- **Check**: Reset clears everything and returns to Setup
- **Check**: Full flow A→B→D works
- **Check**: Full flow A→B→C→D works
- **Check**: Invalidation: Dashboard change → Optimization locks
- **Check**: Layouts work at 1024px and 1920px

## Activity Log

- 2026-03-22T12:03:57Z – system – lane=planned – Prompt created.
- 2026-03-22T12:46:06Z – unknown – lane=for_review – Roster screen complete: success banner, 9-rider list with captain badge, metrics sidebar, copy to clipboard, reset, full flow integration
- 2026-03-22T12:46:28Z – unknown – lane=done – Review passed: success banner, captain badge, metrics sidebar, clipboard, reset, full flow integration
