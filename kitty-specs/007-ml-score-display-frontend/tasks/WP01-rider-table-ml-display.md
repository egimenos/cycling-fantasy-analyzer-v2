---
work_package_id: WP01
title: ML Badge + Rider Table Integration
lane: 'done'
dependencies: []
base_branch: main
base_commit: 0a04a96a5579972aeff480d0ce47c5879f758031
created_at: '2026-03-20T20:02:14.300776+00:00'
subtasks: [T001, T002, T003, T004, T005, T006]
phase: Phase 1 - Core Display
assignee: ''
agent: 'claude-opus'
shell_pid: '51339'
review_status: 'approved'
reviewed_by: 'egimenos'
history:
  - timestamp: '2026-03-20T19:20:00Z'
    lane: planned
    agent: system
    shell_pid: ''
    action: Prompt generated via /spec-kitty.tasks
requirement_refs: [FR-001, FR-002, FR-003, FR-005, FR-006]
---

# Work Package Prompt: WP01 – ML Badge + Rider Table Integration

## Implementation Command

```bash
spec-kitty implement WP01
```

## Objectives & Success Criteria

- New `MlBadge` component renders a small pill badge for ML-scored riders
- Rider table shows ML score column for stage races with hybrid scoring
- Expanded row detail shows both rules-based breakdown and ML predicted score
- Classic races and ML-unavailable scenarios show zero ML UI elements
- Null ML scores display "n/a"

## Context & Constraints

- **UI Library**: shadcn/ui with Tailwind. Check existing `Badge` component at `apps/web/src/shared/ui/badge.tsx` for variant patterns.
- **Score badge**: Existing `ScoreBadge` at `apps/web/src/shared/ui/score-badge.tsx` for color-coding pattern.
- **Data**: `AnalyzedRider` from `@cycling-analyzer/shared-types` already has `scoringMethod: 'rules' | 'hybrid'` and `mlPredictedScore: number | null`.
- **Constitution**: Frontend follows Feature-Sliced Design. Shared components in `shared/ui/`.

## Subtasks & Detailed Guidance

### Subtask T001 – Create MlBadge component

- **Purpose**: Reusable badge indicating ML-enhanced scoring. Used across rider table, team cards, optimizer.
- **Steps**:
  1. Create `apps/web/src/shared/ui/ml-badge.tsx`
  2. Small pill badge with text "ML" and a distinctive color (purple or indigo to differentiate from existing green/yellow/red score badges)
  3. Use existing `Badge` component from shadcn or create a minimal styled component
  4. Props: none needed (always shows "ML"). Optionally accept `className` for positioning.
  5. Example rendering: `<MlBadge />` → small purple pill with "ML" text
- **Files**: `apps/web/src/shared/ui/ml-badge.tsx` (new, ~15 lines)
- **Parallel?**: Yes

### Subtask T002 – Add ML score column to rider table

- **Purpose**: Show ML predicted score in the main table alongside the existing Score column.
- **Steps**:
  1. Edit `apps/web/src/features/rider-list/components/rider-table.tsx`
  2. Add a new column after the existing "Score" column: header "ML Score"
  3. Cell: render `rider.mlPredictedScore?.toFixed(1)` or "n/a" if null
  4. Only show this column if ANY rider in the data has `scoringMethod === 'hybrid'`
     - Check: `const hasML = riders.some(r => r.scoringMethod === 'hybrid')`
     - If `!hasML`, don't add the column at all (clean for classics)
  5. Style: same formatting as the Score column (right-aligned numbers)
- **Files**: `apps/web/src/features/rider-list/components/rider-table.tsx` (modify)
- **Notes**: Read the existing table column definitions carefully. The table uses TanStack Table with column definitions array.

### Subtask T003 – Add ML badge to rider rows

- **Purpose**: Visual indicator that a rider has ML-enhanced scoring.
- **Steps**:
  1. In the same rider-table.tsx, modify the "Score" column cell
  2. When `rider.scoringMethod === 'hybrid'`, render `<MlBadge />` next to the score
  3. Position: small badge to the right of or above the score number
  4. When `scoringMethod === 'rules'`, no badge
- **Files**: `apps/web/src/features/rider-list/components/rider-table.tsx` (modify)

### Subtask T004 – Add ML score to expanded row detail

- **Purpose**: Show both scoring methods in the detailed breakdown.
- **Steps**:
  1. In rider-table.tsx, find the expanded row render section (where categoryScores are shown)
  2. When `scoringMethod === 'hybrid'`, add a section:
     ```
     ML Predicted: {mlPredictedScore.toFixed(1)} pts
     ```
  3. Visually distinguish from the rules breakdown — could be a separate card/section with the MlBadge
  4. Show below or alongside the existing "Total Projected" line
- **Files**: `apps/web/src/features/rider-list/components/rider-table.tsx` (modify)

### Subtask T005 – Conditional rendering for rules-only

- **Purpose**: Zero UI change for classic races and ML-unavailable scenarios.
- **Steps**:
  1. Ensure all ML elements are wrapped in `{scoringMethod === 'hybrid' && ...}` guards
  2. The ML column (T002) already handles this via `hasML` check
  3. The badge (T003) already checks per-rider
  4. The expanded detail (T004) already checks per-rider
  5. Verify: analyze a classic → screenshot matches pre-ML exactly
- **Files**: Same files as above (verification step)

### Subtask T006 – Handle null mlPredictedScore

- **Purpose**: Edge case where ML service returned partial results or rider has no prediction.
- **Steps**:
  1. In ML score column: `rider.mlPredictedScore !== null ? rider.mlPredictedScore.toFixed(1) : 'n/a'`
  2. In expanded detail: same pattern
  3. Style "n/a" with muted text color (text-muted-foreground in Tailwind)
- **Files**: Same files as above

## Review Guidance

- Verify classic race has ZERO ML UI elements (no empty columns, no badges)
- Verify stage race with ML shows both scores clearly
- Verify null ML scores show "n/a" not "null" or crash
- Verify MlBadge is visually distinct from existing badges

## Activity Log

- 2026-03-20T19:20:00Z – system – lane=planned – Prompt created.
- 2026-03-20T20:02:15Z – claude-opus – shell_pid=51339 – lane=doing – Assigned agent via workflow command
- 2026-03-20T20:03:48Z – claude-opus – shell_pid=51339 – lane=for_review – All 6 subtasks complete
- 2026-03-20T20:04:12Z – claude-opus – shell_pid=51339 – lane=done – Review passed: MlBadge component + rider table ML display with conditional rendering, null handling, dark mode.
