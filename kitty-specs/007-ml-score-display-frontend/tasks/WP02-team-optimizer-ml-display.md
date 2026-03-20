---
work_package_id: WP02
title: Team Aggregates + Optimizer ML Display
lane: 'done'
dependencies: [WP01]
base_branch: 007-ml-score-display-frontend-WP01
base_commit: 0a04a96a5579972aeff480d0ce47c5879f758031
created_at: '2026-03-20T20:02:19.425178+00:00'
subtasks: [T007, T008, T009, T010, T011, T012]
phase: Phase 2 - Team Display
assignee: ''
agent: 'claude-opus'
shell_pid: '51697'
review_status: 'approved'
reviewed_by: 'egimenos'
history:
  - timestamp: '2026-03-20T19:20:00Z'
    lane: planned
    agent: system
    shell_pid: ''
    action: Prompt generated via /spec-kitty.tasks
requirement_refs: [FR-004, FR-005]
---

# Work Package Prompt: WP02 – Team Aggregates + Optimizer ML Display

## Implementation Command

```bash
spec-kitty implement WP02 --base WP01
```

## Objectives & Success Criteria

- Team builder panel shows ML total alongside rules total for stage races
- Team summary (9 riders complete) shows both totals
- Optimal team card shows ML total with ML badge
- Alternative teams show ML total in accordion headers
- Classic races show only rules total (no ML elements)

## Context & Constraints

- **MlBadge**: Already created in WP01, import from `shared/ui/ml-badge`
- **Team builder hook**: `apps/web/src/features/team-builder/hooks/use-team-builder.ts` manages `totalScore` (sum of `totalProjectedPts`). Need to also track ML total.
- **Optimizer response**: `TeamSelection` from shared-types contains riders with individual scores.
- **Null handling**: Some riders may have `mlPredictedScore: null`. Sum only non-null values.

## Subtasks & Detailed Guidance

### Subtask T010 – Compute ML team total

- **Purpose**: Calculate aggregated ML score for a set of riders.
- **Steps**:
  1. Create a utility function (or add to team-builder hook):
     ```typescript
     function computeMlTotal(riders: AnalyzedRider[]): number | null {
       const mlRiders = riders.filter((r) => r.mlPredictedScore !== null);
       if (mlRiders.length === 0) return null;
       return mlRiders.reduce((sum, r) => sum + (r.mlPredictedScore ?? 0), 0);
     }
     ```
  2. Returns null if no riders have ML scores (classic race or ML down)
  3. Used by team-builder-panel, team-summary, and optimal-team-card
- **Files**: `apps/web/src/features/team-builder/hooks/use-team-builder.ts` or new utility

### Subtask T007 – Team builder panel ML total

- **Purpose**: Show ML projected total in the sidebar while building a team.
- **Steps**:
  1. Edit `apps/web/src/features/team-builder/components/team-builder-panel.tsx`
  2. Below existing "Projected Score: X pts", add "ML Score: Y pts" when available
  3. Use `computeMlTotal()` from selected riders
  4. Wrap in conditional: only show when ML total is not null
  5. Include small `<MlBadge />` next to the ML total
- **Files**: `apps/web/src/features/team-builder/components/team-builder-panel.tsx` (modify)

### Subtask T008 – Team summary ML total

- **Purpose**: Show both totals when 9-rider team is complete.
- **Steps**:
  1. Edit `apps/web/src/features/team-builder/components/team-summary.tsx`
  2. Add ML total below or alongside the existing "Total Score" display
  3. Label clearly: "Rules: X pts" and "ML: Y pts" with MlBadge
  4. Conditional: only when ML total is not null
- **Files**: `apps/web/src/features/team-builder/components/team-summary.tsx` (modify)

### Subtask T009 – Optimal team card ML total

- **Purpose**: Optimizer results show which scoring method was used and both totals.
- **Steps**:
  1. Edit `apps/web/src/features/optimizer/components/optimal-team-card.tsx`
  2. In the header/summary area, show ML total alongside rules total
  3. Add `<MlBadge />` if ML scoring was used
  4. Optionally add a tooltip: "Team optimized using ML predictions"
  5. Conditional: only when riders have ML scores
- **Files**: `apps/web/src/features/optimizer/components/optimal-team-card.tsx` (modify)

### Subtask T011 – Conditional hide for classics

- **Purpose**: No ML UI in team views for classic races.
- **Steps**:
  1. All ML elements in T007-T009 are already conditional (null check)
  2. Verify: build team for classic → only rules total shown
  3. Verify: optimize classic → no ML badge or total
- **Files**: Same files (verification step)

### Subtask T012 – Alternative teams ML total

- **Purpose**: Show ML total in accordion headers for alternative team options.
- **Steps**:
  1. Edit `apps/web/src/features/optimizer/components/alternative-teams.tsx`
  2. In accordion trigger, add ML total: "X pts (ML: Y pts)" when available
  3. Conditional rendering for non-ML teams
- **Files**: `apps/web/src/features/optimizer/components/alternative-teams.tsx` (modify)

## Review Guidance

- Verify classic race team views have ZERO ML elements
- Verify stage race team views show both totals
- Verify null ML scores don't crash team total computation
- Verify MlBadge renders consistently across all team views

## Activity Log

- 2026-03-20T19:20:00Z – system – lane=planned – Prompt created.
- 2026-03-20T20:02:20Z – claude-opus – shell_pid=51697 – lane=doing – Assigned agent via workflow command
- 2026-03-20T20:07:47Z – claude-opus – shell_pid=51697 – lane=for_review – All 6 subtasks complete
- 2026-03-20T20:08:13Z – claude-opus – shell_pid=51697 – lane=done – Review passed: ML totals in team builder, summary, optimizer, alternatives. Conditional rendering, computeMlTotal utility, 103/104 tests pass.
