---
work_package_id: WP06
title: Optimization Screen
lane: 'done'
dependencies:
  - WP01
base_branch: 009-peloton-design-system-redesign-WP01
base_commit: c4db9570d2f127116b9f0cd2c51d4fae6d2ccae8
created_at: '2026-03-22T12:41:43.394666+00:00'
subtasks:
  - T030
  - T031
  - T032
  - T033
  - T034
phase: Phase 2 - Advanced Screens
assignee: ''
agent: 'claude-opus'
shell_pid: '34212'
review_status: 'approved'
reviewed_by: 'egimenos'
history:
  - timestamp: '2026-03-22T12:03:57Z'
    lane: planned
    agent: system
    shell_pid: ''
    action: Prompt generated via /spec-kitty.tasks
requirement_refs:
  - FR-017
---

# Work Package Prompt: WP06 – Optimization Screen

## ⚠️ IMPORTANT: Review Feedback Status

- **Has review feedback?**: Check the `review_status` field above.

---

## Review Feedback

_[Empty initially.]_

---

## Objectives & Success Criteria

- Build the Optimization tab (Tab C) as a full-width view
- Header with "OPTIMAL CONFIGURATION", projected total, and budget efficiency
- Point distribution bar (GC/Stage/Mountain/Sprint colored segments)
- 9-rider card grid in 3-column layout
- "Apply to Roster" CTA that applies the optimal team and navigates to Roster tab
- Simulation Alternatives section is OMITTED (not yet implemented)

## Context & Constraints

- **Spec**: US5 (Optimization Results) — acceptance scenarios 1-4
- **Design Reference**: `redesign/stitch_cycling_fantasy_analizer/3._optimization_results_full_width/screen.png` and `code.html`
- **Existing components**: `optimizer-panel.tsx`, `optimal-team-card.tsx`, `score-breakdown.tsx`
- **Existing hooks**: `useOptimize`
- **Omitted**: "Simulation Alternatives" accordion (Stitch Screen 3 bottom section) — not implemented yet

**Implementation command**: `spec-kitty implement WP06 --base WP02`

## Subtasks & Detailed Guidance

### Subtask T030 – Restructure `optimizer-panel.tsx` as Optimization tab content

- **Purpose**: Transform from an inline panel to a full-width tab screen.
- **Steps**:
  1. Read current `optimizer-panel.tsx` props and structure
  2. Rewrite as the Optimization tab container with:
     - Header section:
       ```tsx
       <div className="flex flex-col md:flex-row justify-between items-end mb-10 gap-6">
         <div>
           <span className="text-secondary font-mono text-xs tracking-widest uppercase mb-2 block">
             Optimization Results
           </span>
           <h1 className="text-5xl font-extrabold font-headline tracking-tighter text-on-surface">
             OPTIMAL CONFIGURATION
           </h1>
         </div>
         <div className="flex items-center gap-8 bg-surface-container-low p-6 rounded-sm">
           <div className="text-right">
             <div className="text-xs font-mono text-on-surface-variant uppercase tracking-widest mb-1">
               Projected Total
             </div>
             <div className="text-4xl font-mono font-bold text-secondary tracking-tighter">
               {projectedTotal}
             </div>
           </div>
           <div className="h-12 w-px bg-outline-variant/20" />
           <div className="text-right">
             <div className="text-xs font-mono text-on-surface-variant uppercase tracking-widest mb-1">
               Budget Efficiency
             </div>
             <div className="text-4xl font-mono font-bold text-tertiary tracking-tighter">
               {efficiency}%
             </div>
           </div>
         </div>
       </div>
       ```
  3. Below header: "Primary Lineup" section title + "Apply to Roster" CTA button
  4. This component orchestrates ScoreBreakdown and OptimalTeamCard grid

- **Files**: `apps/web/src/features/optimizer/components/optimizer-panel.tsx`

### Subtask T031 – Restyle `score-breakdown.tsx` as point distribution bar

- **Purpose**: Visualize team composition by cycling discipline.
- **Steps**:
  1. Replace current score breakdown with a horizontal stacked bar:
     ```tsx
     <div className="bg-surface-container-low p-8 rounded-sm">
       <div className="flex justify-between items-end mb-4">
         <span className="text-xs font-mono uppercase tracking-widest text-on-surface-variant">
           Point Distribution Analysis
         </span>
         <div className="flex gap-4 text-[10px] font-mono uppercase tracking-widest">
           <span className="flex items-center gap-1.5">
             <span className="w-2 h-2 bg-gc rounded-full" /> GC
           </span>
           <span className="flex items-center gap-1.5">
             <span className="w-2 h-2 bg-stage rounded-full" /> STAGE
           </span>
           <span className="flex items-center gap-1.5">
             <span className="w-2 h-2 bg-mountain rounded-full" /> MOUNTAIN
           </span>
           <span className="flex items-center gap-1.5">
             <span className="w-2 h-2 bg-sprint rounded-full" /> SPRINT
           </span>
         </div>
       </div>
       <div className="h-6 w-full flex rounded-sm overflow-hidden bg-surface-container-highest">
         <div className="h-full bg-gc/80" style={{ width: `${gcPercent}%` }} />
         <div className="h-full bg-stage/80" style={{ width: `${stagePercent}%` }} />
         <div className="h-full bg-mountain/80" style={{ width: `${mountainPercent}%` }} />
         <div className="h-full bg-sprint/80" style={{ width: `${sprintPercent}%` }} />
       </div>
     </div>
     ```
  2. Calculate percentages from the team's category score distribution
  3. If category breakdown data isn't available, use equal segments as fallback

- **Files**: `apps/web/src/features/optimizer/components/score-breakdown.tsx`

### Subtask T032 – Restyle `optimal-team-card.tsx` as rider grid card

- **Purpose**: Display each rider in the optimal team as a card in a 3-column grid.
- **Steps**:
  1. Rider card design:
     ```tsx
     <div className="bg-surface-container-high p-5 flex items-center gap-4 group hover:bg-surface-bright transition-colors">
       <div className="w-12 h-12 rounded-sm bg-surface-container-highest flex-shrink-0 flex items-center justify-center">
         <BikeIcon className="text-on-primary-container w-6 h-6" />
       </div>
       <div className="flex-grow">
         <div className="text-[10px] font-mono text-on-surface-variant uppercase tracking-widest mb-0.5">
           {rider.shortName}
         </div>
         <div className="flex justify-between items-baseline">
           <span className="font-bold font-headline tracking-tight">{rider.team}</span>
           <span className="font-mono text-sm text-on-surface">{rider.points} pts</span>
         </div>
       </div>
     </div>
     ```
  2. Top 3 riders can have slightly larger card (w-16 h-16 avatar area) and colored name text (category color)
  3. Grid: `grid grid-cols-1 md:grid-cols-3 gap-1`
  4. No rider photos (omitted) — use placeholder icon

- **Files**: `apps/web/src/features/optimizer/components/optimal-team-card.tsx`

### Subtask T033 – Build Optimization tab container

- **Purpose**: Assemble all optimization components into the tab layout.
- **Steps**:
  1. Create the Optimization tab component that renders:
     - Header (from T030)
     - "Primary Lineup" title + "Apply to Roster" button
     - Score breakdown bar (T031)
     - Rider grid (T032, mapped from optimization results)
  2. Full-width layout — no sidebar on this tab
  3. "Apply to Roster" CTA: `bg-primary-fixed text-on-surface font-headline font-extrabold uppercase rounded-sm px-8 py-3`

### Subtask T034 – Wire "Apply to Roster" to flow state

- **Purpose**: Applying the optimal team should populate team builder state and navigate to Roster.
- **Steps**:
  1. On "Apply to Roster" click:
     ```typescript
     // Add all optimal riders to team builder
     optimalRiders.forEach((rider) => teamBuilder.addRider(rider.name));
     // Dispatch flow state
     flowDispatch({ type: 'TEAM_COMPLETE' });
     // Navigate
     navigate({ search: { tab: 'roster' } });
     ```
  2. Need access to both `useTeamBuilder` and `useFlowState` hooks
  3. Ensure team builder is cleared before adding optimal riders (avoid duplicates)

- **Files**: Optimization tab component
- **Notes**: The optimal riders data comes from the `useOptimize` hook response

## Risks & Mitigations

- **Data mapping**: The optimization response format may differ from what the rider cards expect. Check `OptimizeResponse` type and create a mapping function if needed.
- **Category percentages**: If the API doesn't return per-category breakdowns, calculate from individual rider scores or use a placeholder distribution.

## Review Guidance

- **Check**: Header shows projected total and budget efficiency in large monospace font
- **Check**: Distribution bar segments sum to 100% and use correct category colors
- **Check**: Rider grid shows 3 columns on desktop with all 9 riders
- **Check**: "Apply to Roster" populates team and navigates to Roster tab
- **Check**: No "Simulation Alternatives" section (omitted per spec)

## Activity Log

- 2026-03-22T12:03:57Z – system – lane=planned – Prompt created.
- 2026-03-22T12:41:44Z – claude-opus – shell_pid=34212 – lane=doing – Assigned agent via workflow command
- 2026-03-22T12:43:58Z – claude-opus – shell_pid=34212 – lane=for_review – Optimization screen complete: header with stats, distribution bar, rider grid, apply to roster wiring
- 2026-03-22T12:46:27Z – claude-opus – shell_pid=34212 – lane=done – Review passed: distribution bar with category tokens, 3-col rider grid, apply to roster wiring
