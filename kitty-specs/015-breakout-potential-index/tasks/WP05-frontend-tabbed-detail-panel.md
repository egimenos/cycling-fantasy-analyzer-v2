---
work_package_id: WP05
title: Frontend — Tabbed Detail Panel
lane: planned
dependencies: [WP04]
subtasks:
  - T021
  - T022
  - T023
  - T024
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
  - FR-010
---

# Work Package Prompt: WP05 – Frontend — Tabbed Detail Panel

## Objectives & Success Criteria

- Refactor the expandable row into a tabbed interface: "Performance" (existing) | "Breakout" (new)
- Create a breakout detail panel showing 5 signal bars, P80 comparison, and flag descriptions
- Handle edge cases: missing profileSummary, unmatched riders
- **Success**: Expanding a matched rider shows two tabs. "Performance" tab shows existing season breakdown. "Breakout" tab shows signal bars, P80 comparison. Unmatched riders show only Performance tab (no tab bar).

## Context & Constraints

- **Spec**: `kitty-specs/015-breakout-potential-index/spec.md` (User Story 3)
- **Plan**: `kitty-specs/015-breakout-potential-index/plan.md` (AD-3: Tabbed Expandable Row)
- **Existing component**: `ExpandedRowContent` in `rider-table.tsx` (lines ~243-359) — renders a 4-column grid with category scores, ML info, season history, and match details.
- **Constitution**: Feature-Sliced Design. Tailwind CSS. No heavy tab library — simple state-based tabs.

## Implementation Command

```bash
spec-kitty implement WP05 --base WP04
```

## Subtasks & Detailed Guidance

### Subtask T021 – Refactor ExpandedRowContent into tabs

**Purpose**: Split existing expandable content into a tabbed layout without losing any current functionality.

**Steps**:

1. Open `apps/web/src/features/rider-list/components/rider-table.tsx`
2. Find the `ExpandedRowContent` component
3. Add tab state:
   ```typescript
   const [activeTab, setActiveTab] = useState<'performance' | 'breakout'>('performance');
   ```
4. Wrap existing content in a tab container:

   ```typescript
   // Only show tabs for matched riders with breakout data
   const showTabs = !rider.unmatched && rider.breakout != null;

   return (
     <div className="p-4">
       {showTabs && (
         <div className="mb-4 flex gap-4 border-b border-gray-200">
           <button
             className={`pb-2 text-sm font-medium ${
               activeTab === 'performance'
                 ? 'border-b-2 border-blue-500 text-blue-600'
                 : 'text-gray-500 hover:text-gray-700'
             }`}
             onClick={() => setActiveTab('performance')}
           >
             Performance
           </button>
           <button
             className={`pb-2 text-sm font-medium ${
               activeTab === 'breakout'
                 ? 'border-b-2 border-blue-500 text-blue-600'
                 : 'text-gray-500 hover:text-gray-700'
             }`}
             onClick={() => setActiveTab('breakout')}
           >
             Breakout
           </button>
         </div>
       )}

       {activeTab === 'performance' || !showTabs ? (
         {/* Existing ExpandedRowContent content here */}
       ) : (
         <BreakoutDetailPanel breakout={rider.breakout!} prediction={rider.mlPredictedScore ?? rider.totalProjectedPts ?? 0} />
       )}
     </div>
   );
   ```

5. Move existing content (category scores grid, season history, match info) into the Performance tab block.

**Files**:

- `apps/web/src/features/rider-list/components/rider-table.tsx` (modify)

**Parallel?**: No — must be done first to establish the tab structure.

**Notes**:

- The tab state is local to each expanded row. TanStack Table's expanded row state is independent of the tab state.
- Unmatched riders: no tab bar at all, just the existing content (which shows "No match found" or similar).
- Default tab is "Performance" to preserve existing UX — users see what they've always seen unless they click "Breakout".
- Check if the existing design uses specific color tokens (`border-outline`, `text-surface-*`, etc.) instead of raw Tailwind colors. Match the existing style.

### Subtask T022 – Create breakout detail panel with signal bars

**Purpose**: Show the 5 BPI signal scores as visual horizontal bars so users understand the BPI composition.

**Steps**:

1. Create `apps/web/src/features/rider-list/components/breakout-detail-panel.tsx`
2. Implement signal bars:

   ```typescript
   interface BreakoutDetailPanelProps {
     breakout: BreakoutResult;
     prediction: number;
   }

   const SIGNAL_CONFIG = [
     { key: 'trajectory' as const, label: 'Trajectory', max: 25, description: 'Career direction adjusted by age' },
     { key: 'recency' as const, label: 'Recency', max: 25, description: 'Current season vs historical average' },
     { key: 'ceiling' as const, label: 'Ceiling Gap', max: 20, description: 'Historical peak vs current prediction' },
     { key: 'routeFit' as const, label: 'Route Fit', max: 15, description: 'Rider profile vs race terrain' },
     { key: 'variance' as const, label: 'Variance', max: 15, description: 'Season-to-season unpredictability' },
   ];

   export function BreakoutDetailPanel({ breakout, prediction }: BreakoutDetailPanelProps): JSX.Element {
     return (
       <div className="grid grid-cols-2 gap-6">
         {/* Left: Signal bars */}
         <div className="space-y-3">
           <h4 className="text-sm font-semibold text-gray-700">Signal Breakdown</h4>
           {SIGNAL_CONFIG.map(({ key, label, max, description }) => {
             const value = breakout.signals[key];
             const pct = (value / max) * 100;
             const isNA = key === 'routeFit' && value === 0 && !breakout.signals.routeFit;
             // Note: check if routeFit 0 means N/A or actual 0 score

             return (
               <div key={key}>
                 <div className="flex justify-between text-xs text-gray-600">
                   <span>{label}</span>
                   <span>{value}/{max}</span>
                 </div>
                 <div className="mt-1 h-2 w-full rounded-full bg-gray-200">
                   <div
                     className="h-2 rounded-full bg-blue-500"
                     style={{ width: `${pct}%` }}
                   />
                 </div>
                 <p className="mt-0.5 text-[10px] text-gray-400">{description}</p>
               </div>
             );
           })}
         </div>

         {/* Right: Summary + Flags */}
         <div>
           {/* P80 comparison rendered in T023 */}
           {/* Flag descriptions */}
         </div>
       </div>
     );
   }
   ```

3. Each bar shows: label, score/max, a horizontal progress bar, and a brief description.

**Files**:

- `apps/web/src/features/rider-list/components/breakout-detail-panel.tsx` (new)

**Parallel?**: Yes — can proceed alongside T023.

**Notes**:

- Signal bar color could vary by fill percentage (green > 70%, amber > 40%, gray otherwise) — but uniform blue is simpler and cleaner for v1.
- The description text is tiny (10px) — it adds context without cluttering.
- Check if the project has an existing progress bar or bar chart component in `shared/ui/` that could be reused.

### Subtask T023 – Add prediction vs P80 comparison

**Purpose**: Show the user the gap between the conservative prediction and the optimistic scenario.

**Steps**:

1. In `breakout-detail-panel.tsx`, add a comparison section in the right column:
   ```typescript
   <div className="rounded-lg bg-gray-50 p-4">
     <h4 className="text-sm font-semibold text-gray-700">Upside Scenario</h4>
     <div className="mt-3 flex items-end gap-4">
       <div>
         <p className="text-xs text-gray-500">Prediction</p>
         <p className="text-2xl font-bold text-gray-700">
           {prediction.toFixed(1)}
         </p>
       </div>
       <div className="text-gray-400">→</div>
       <div>
         <p className="text-xs text-gray-500">Optimistic (P80)</p>
         <p className="text-2xl font-bold text-green-600">
           {breakout.upsideP80.toFixed(1)}
         </p>
       </div>
     </div>
     {breakout.upsideP80 > prediction && prediction > 0 && (
       <p className="mt-2 text-xs text-green-600">
         +{((breakout.upsideP80 / prediction - 1) * 100).toFixed(0)}% upside potential
       </p>
     )}
   </div>
   ```
2. Below the P80 comparison, add flag descriptions if any flags are present:
   ```typescript
   {breakout.flags.length > 0 && (
     <div className="mt-4">
       <h4 className="text-sm font-semibold text-gray-700">Breakout Indicators</h4>
       <ul className="mt-2 space-y-1">
         {breakout.flags.map((flag) => (
           <li key={flag} className="flex items-start gap-2 text-xs text-gray-600">
             <FlagChip flag={flag} />
             <span>{FLAG_DESCRIPTIONS[flag]}</span>
           </li>
         ))}
       </ul>
     </div>
   )}
   ```
3. Define `FLAG_DESCRIPTIONS` mapping each flag to a human-readable explanation:
   ```typescript
   const FLAG_DESCRIPTIONS: Record<BreakoutFlag, string> = {
     EMERGING_TALENT: 'Young rider with steep upward career trajectory',
     HOT_STREAK: 'Current season is 2x+ their historical average',
     DEEP_VALUE: 'Cheap rider with above-median points per hillio',
     CEILING_PLAY: 'Historical peak far exceeds current prediction',
     SPRINT_OPPORTUNITY: 'Sprint profile on a flat-friendly course',
     BREAKAWAY_HUNTER: 'Mountain points on a budget — breakaway potential',
   };
   ```

**Files**:

- `apps/web/src/features/rider-list/components/breakout-detail-panel.tsx` (modify)

**Parallel?**: Yes — separate section from T022's signal bars.

**Notes**:

- Import or share `FlagChip` from `rider-table.tsx` (or move it to a shared location if WP04 created it inline).
- The percentage upside only shows when P80 > prediction and prediction > 0 (avoid division by zero or misleading -100% for zero predictions).

### Subtask T024 – Handle missing data and edge cases

**Purpose**: Ensure graceful degradation when data is incomplete.

**Steps**:

1. **Route Fit N/A**: When `profileSummary` was not provided in the analyze request, the `routeFit` signal will be 0. Display it differently in the signal bars:
   - Instead of showing "0/15" with an empty bar, show "N/A" with a muted style:

   ```typescript
   const isRouteFitNA = key === 'routeFit' && value === 0;
   // In the bar rendering:
   {isRouteFitNA ? (
     <span className="text-xs text-gray-400 italic">N/A — no race profile provided</span>
   ) : (
     // normal bar rendering
   )}
   ```

   - Note: The backend sends routeFit=0 both when no profileSummary and when profileSummary yields 0 fit. To distinguish, check if any rider in the response has routeFit > 0. If none do, it's likely because profileSummary was not provided. Alternatively, accept this ambiguity in v1.

2. **Unmatched riders**: No breakout tab shown (handled in T021). Verify the tab bar doesn't appear.

3. **Zero BPI**: Some matched riders will have BPI=0 (e.g., all-zero seasons). The Breakout tab should still show signal bars (all zeros) — this is informative, not broken.

4. **Missing flags**: If `flags` is an empty array, don't show the "Breakout Indicators" section at all.

**Files**:

- `apps/web/src/features/rider-list/components/breakout-detail-panel.tsx` (modify)
- `apps/web/src/features/rider-list/components/rider-table.tsx` (verify T021 edge cases)

**Parallel?**: No — pass over T021-T023 for edge cases.

**Notes**:

- The Route Fit N/A detection is imperfect in v1 — we'd need a backend flag to distinguish "no profile provided" from "zero fit". Accept the ambiguity for now; if routeFit=0, show N/A. In practice, zero fit with a real profile is extremely rare.

## Risks & Mitigations

- **Tab state reset on re-sort**: If the table re-renders when sorting, expanded rows might collapse or reset tab state. Key the expanded content by `rider.rawName` or `rider.matchedRider?.id` to preserve React state.
- **Large component**: `rider-table.tsx` is already large. Extracting `BreakoutDetailPanel` to its own file (done in T022) keeps the main file manageable.
- **Import cycle**: `FlagChip` might be defined in `rider-table.tsx` (from WP04). If so, extract it to a shared location (e.g., `bpi-badge.tsx`) to avoid the breakout panel importing from the table.

## Review Guidance

- Verify "Performance" tab shows exactly the same content as before this change (no regressions).
- Verify "Breakout" tab shows 5 signal bars with correct labels and max values.
- Verify P80 comparison shows meaningful numbers (not NaN, not "0.0 → 0.0" for valid riders).
- Verify flag descriptions match the spec's intent.
- Verify unmatched riders see no tab bar.
- Verify Route Fit shows "N/A" when appropriate.
- Test on narrow viewports — the 2-column grid should stack on mobile.

## Activity Log

- 2026-04-01T17:57:39Z – system – lane=planned – Prompt created.
