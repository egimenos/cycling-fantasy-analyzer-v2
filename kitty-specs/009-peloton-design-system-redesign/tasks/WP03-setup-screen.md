---
work_package_id: WP03
title: Setup Screen
lane: 'done'
dependencies:
  - WP01
base_branch: 009-peloton-design-system-redesign-WP01
base_commit: c4db9570d2f127116b9f0cd2c51d4fae6d2ccae8
created_at: '2026-03-22T12:27:20.700548+00:00'
subtasks:
  - T014
  - T015
  - T016
  - T017
  - T018
phase: Phase 1 - Screens
assignee: ''
agent: 'claude-opus'
shell_pid: '22609'
review_status: 'approved'
reviewed_by: 'egimenos'
history:
  - timestamp: '2026-03-22T12:03:57Z'
    lane: planned
    agent: system
    shell_pid: ''
    action: Prompt generated via /spec-kitty.tasks
requirement_refs:
  - FR-009
  - FR-010
---

# Work Package Prompt: WP03 – Setup Screen

## ⚠️ IMPORTANT: Review Feedback Status

- **Has review feedback?**: Check the `review_status` field above.

---

## Review Feedback

_[Empty initially.]_

---

## Objectives & Success Criteria

- Build the Setup tab (Tab A) matching Stitch Screen 1 design
- 5/7 column split: inputs left, empty-state preview right
- All input controls styled with new design tokens
- Footer summary bar with rider count and budget allocation
- Clicking "Run Optimization Engine" triggers analysis and transitions to Dashboard tab
- Preserve all existing `rider-input.tsx` callback signatures

## Context & Constraints

- **Spec**: US3 (Roster Setup Screen) — acceptance scenarios 1-4
- **Design Reference**: `redesign/stitch_cycling_fantasy_analizer/1._initial_setup_simplified/screen.png` and `code.html`
- **Existing component**: `apps/web/src/features/rider-list/components/rider-input.tsx` — preserve `onAnalyze` prop signature
- **Flow state**: Use `useFlowState()` from WP02 to dispatch `ANALYZE_SUCCESS`

**Implementation command**: `spec-kitty implement WP03 --base WP02`

## Subtasks & Detailed Guidance

### Subtask T014 – Restyle `rider-input.tsx`

- **Purpose**: Transform the input form into the Stitch Screen 1 left panel design.
- **Steps**:
  1. Read the current `rider-input.tsx` to understand its props and callbacks
  2. Restructure the layout into labeled sections:
     - **Race URL**: Label "RACE URL (PROCYCLINGSTATS)" with `text-xs font-mono uppercase tracking-wider text-on-primary-container`. Input with `explore` icon (use Lucide `Globe` or `Search`). Auto-detect indicator text.
     - **Import Price List**: Label + input with `Link` icon + "Fetch" button
     - **Rider List Manual Input**: Label + textarea with monospace font, placeholder showing format example
     - **Budget**: Label "BUDGET (HILLIOS)" + number input with `Banknote` icon
  3. Wrap all inputs in a container: `bg-surface-container-low rounded-sm p-8 flex flex-col gap-6 shadow-xl border border-outline-variant/15`
  4. "Run Optimization Engine" button: full-width, `bg-primary text-primary-foreground py-4 rounded-sm font-headline font-extrabold uppercase tracking-widest text-sm` with analytics icon
  5. Section header above inputs:
     ```
     <span className="text-secondary font-mono text-xs tracking-widest uppercase">Optimization Engine</span>
     <h1 className="text-3xl font-headline font-extrabold text-on-surface tracking-tight">Roster Setup</h1>
     ```
  6. Keep ALL existing props: `onAnalyze`, `isLoading`
  7. Keep ALL existing internal state and logic — only change the JSX/styling

- **Files**: `apps/web/src/features/rider-list/components/rider-input.tsx`
- **Parallel?**: Yes — independent from T015

### Subtask T015 – Create empty-state preview component

- **Purpose**: Show a descriptive empty state on the right panel before analysis.
- **Steps**:
  1. Create a new component or update the Setup tab to include:
     ```tsx
     <div className="flex-1 min-h-[500px] rounded-sm bg-surface-container-low/30 border border-dashed border-outline-variant/20 flex flex-col items-center justify-center p-12 relative overflow-hidden">
       {/* Background watermark icon at 5% opacity */}
       <div className="relative z-10 flex flex-col items-center text-center max-w-md">
         <div className="w-16 h-16 rounded-full bg-surface-container-high flex items-center justify-center mb-6">
           {/* Use Lucide TrendingUp or BarChart3 icon */}
         </div>
         <h3 className="text-xl font-headline font-bold text-on-surface mb-3">
           No Roster Detected
         </h3>
         <p className="text-on-surface-variant font-body leading-relaxed mb-8">
           Input your budget and rider list to see the optimized lineup preview here. Our engine
           uses historical performance data to find the best value for your budget.
         </p>
         {/* Skeleton placeholder rows */}
       </div>
     </div>
     ```
  2. Include 2-3 skeleton placeholder rows (gray bars mimicking table rows)

- **Files**: New component in `apps/web/src/features/rider-list/components/` or inline in setup tab
- **Parallel?**: Yes — independent from T014

### Subtask T016 – Build Setup tab container

- **Purpose**: Assemble the left (inputs) and right (preview) panels into the Setup tab layout.
- **Steps**:
  1. Create a `SetupTab` component (or refactor into the route)
  2. Grid layout: `grid grid-cols-1 lg:grid-cols-12 gap-12`
     - Left: `lg:col-span-5` → RiderInput
     - Right: `lg:col-span-7` → Empty-state preview (or analysis loading state)
  3. Right panel header:
     ```
     <span className="text-outline font-mono text-xs uppercase">Real-time Preview</span>
     <h2 className="text-xl font-headline font-bold text-on-surface-variant">Analysis Pending</h2>
     ```

- **Files**: Setup tab component (location depends on WP02 structure — likely in `routes/index.tsx` or a new file)

### Subtask T017 – Build footer summary bar

- **Purpose**: Show a persistent summary at the bottom of the Setup tab.
- **Steps**:
  1. Component at the bottom of the Setup tab:
     ```tsx
     <div className="mt-6 bg-surface-container-high/40 p-6 rounded-sm flex justify-between items-center border border-outline-variant/5">
       <div className="flex gap-12">
         <div className="flex flex-col">
           <span className="text-[10px] text-outline uppercase font-mono tracking-tighter">
             Selected Riders
           </span>
           <span className="text-xl font-mono font-bold text-outline">-- / --</span>
         </div>
         <div className="flex flex-col">
           <span className="text-[10px] text-outline uppercase font-mono tracking-tighter">
             Budget Allocation
           </span>
           <span className="text-xl font-mono font-bold text-outline">0 / {budget}</span>
         </div>
       </div>
       <div className="flex gap-4 items-center">
         <span className="text-[10px] text-outline uppercase font-mono tracking-tighter italic">
           Status: System Ready
         </span>
         <div className="w-2 h-2 rounded-full bg-outline/20" />
       </div>
     </div>
     ```
  2. Budget value comes from the input field state

### Subtask T018 – Wire analyze action to flow state

- **Purpose**: Connect the analyze button to the tab flow — on success, unlock Dashboard and navigate.
- **Steps**:
  1. In the Setup tab, after `useAnalyze()` returns success:
     - Dispatch `{ type: 'ANALYZE_SUCCESS' }` to flow state
     - Navigate to `?tab=dashboard` via `useNavigate()`
  2. On re-analyze (user changes inputs and clicks again):
     - Dispatch `{ type: 'RESET' }` first (locks all tabs except setup)
     - Then trigger the new analysis
     - On success, dispatch `ANALYZE_SUCCESS` again
  3. Preserve the existing `handleAnalyze` callback logic (clearing team, setting budget, etc.)

- **Files**: Setup tab component
- **Notes**: The existing `useAnalyze` hook returns state with `status: 'success'`. Use a `useEffect` watching for this transition to dispatch and navigate.

## Risks & Mitigations

- **Preserve callback signatures**: The `rider-input.tsx` `onAnalyze` prop must keep its exact signature. Read the current implementation before modifying.
- **Race condition on navigate**: Ensure flow state dispatch happens before navigation, otherwise the Dashboard tab might still be locked when we try to navigate to it. Use synchronous dispatch (useReducer is synchronous).

## Review Guidance

- **Check**: Setup tab matches Stitch Screen 1 layout (5/7 split, dark panels)
- **Check**: All inputs use design tokens, no hardcoded colors
- **Check**: "Run Optimization Engine" triggers analysis and navigates to Dashboard on success
- **Check**: Re-analyzing resets the flow (tabs lock, then re-unlock)
- **Check**: Empty-state preview shows correctly with skeleton placeholders

## Activity Log

- 2026-03-22T12:03:57Z – system – lane=planned – Prompt created.
- 2026-03-22T12:27:21Z – claude-opus – shell_pid=22609 – lane=doing – Assigned agent via workflow command
- 2026-03-22T12:29:40Z – claude-opus – shell_pid=22609 – lane=for_review – Setup screen complete: 5/7 split layout, restyled inputs, empty state preview, footer summary, flow state wiring
- 2026-03-22T12:41:15Z – claude-opus – shell_pid=22609 – lane=done – Review passed: 5/7 split, restyled inputs, empty state, flow state wiring
