---
work_package_id: WP05
title: Optimizer ML Integration
lane: planned
dependencies: [WP04]
subtasks:
  - T027
  - T028
  - T029
  - T030
phase: Phase 4 - Optimizer
assignee: ''
agent: ''
shell_pid: ''
review_status: ''
reviewed_by: ''
history:
  - timestamp: '2026-03-20T16:27:36Z'
    lane: planned
    agent: system
    shell_pid: ''
    action: Prompt generated via /spec-kitty.tasks
requirement_refs:
  - FR-009
---

# Work Package Prompt: WP05 – Optimizer ML Integration

## ⚠️ IMPORTANT: Review Feedback Status

- **Has review feedback?**: Check `review_status` field above.

---

## Review Feedback

_[Empty initially.]_

---

## Implementation Command

```bash
spec-kitty implement WP05 --base WP04
```

---

## Objectives & Success Criteria

- Team optimizer uses `mlPredictedScore` for stage races when available
- Classic races use `totalProjectedPts` as before
- Fallback: no ML predictions → use rules-based score
- Optimizer produces different (improved) team selections for stage races with ML

## Context & Constraints

- **Optimizer code**: `apps/api/src/domain/optimizer/knapsack.service.ts` — space-optimized 0/1 knapsack DP
- **Input type**: `ScoredRider` with `totalProjectedPts` and `categoryScores`
- **Key constraint**: Do NOT modify the knapsack algorithm itself. Only change the input score.
- **How it works**: The optimizer takes `ScoredRider[]`, each with a score and cost (price), and selects the optimal 9-rider team under budget. The score used for optimization determines which riders are selected.

## Subtasks & Detailed Guidance

### Subtask T027 – Modify ScoredRider or optimizer input for ML score

- **Purpose**: The optimizer needs access to the ML predicted score to use it for ranking.
- **Steps**:
  1. Read `apps/api/src/domain/optimizer/types.ts` to understand `ScoredRider` interface
  2. Option A: Add optional `mlPredictedScore?: number` to `ScoredRider`
  3. Option B: Add `effectiveScore: number` that's already resolved (ML or rules)
  4. Recommendation: Option B is cleaner — the orchestrating code sets `effectiveScore` to either `mlPredictedScore` (for stage races) or `totalProjectedPts` (for classics/fallback). The optimizer always uses `effectiveScore`.
  5. Update `ScoredRider` in `apps/api/src/domain/optimizer/types.ts`
- **Files**: `apps/api/src/domain/optimizer/types.ts` (modify)
- **Notes**: Check if `ScoredRider` is used elsewhere in the codebase (grep for it). Any changes must be compatible.

### Subtask T028 – Wire ML score into optimizer orchestration

- **Purpose**: When optimizing for a stage race with ML predictions, use `mlPredictedScore` as the effective score.
- **Steps**:
  1. Read `apps/api/src/application/optimize/optimize-team.use-case.ts` to understand orchestration
  2. The use case receives pre-scored riders from the analysis flow
  3. Before passing to the knapsack, set `effectiveScore`:
     ```typescript
     const ridersWithEffectiveScore = scoredRiders.map((rider) => ({
       ...rider,
       effectiveScore: rider.mlPredictedScore ?? rider.totalProjectedPts,
     }));
     ```
  4. Update knapsack to use `effectiveScore` instead of `totalProjectedPts` for scoring
  5. Alternative: if the optimizer already uses a generic `score` field, just populate it differently
- **Files**: `apps/api/src/application/optimize/optimize-team.use-case.ts` (modify), `apps/api/src/domain/optimizer/knapsack.service.ts` (may need minor change)
- **Notes**: The optimizer's composite score (60% performance + 40% value) may need adjustment — `pointsPerHillio` should use the effective score too

### Subtask T029 – Ensure optimizer fallback

- **Purpose**: If ML predictions are null, optimizer must fall back to rules-based scoring seamlessly.
- **Steps**:
  1. When `mlPredictedScore` is null for a rider (no ML predictions):
     - `effectiveScore` defaults to `totalProjectedPts`
  2. This should be handled naturally by the null coalescing in T028: `rider.mlPredictedScore ?? rider.totalProjectedPts`
  3. Verify: analyze a stage race with ML service DOWN → optimizer still produces valid team using rules-based scores
- **Files**: Same as T028

### Subtask T030 – Verify optimizer with ML scores

- **Purpose**: Validate that ML-based optimization produces different (and presumably better) teams.
- **Steps**:
  1. Analyze a stage race with ML predictions available
  2. Note the selected team
  3. Compare with what the optimizer would select using only rules-based scores (can be done by temporarily disabling ML)
  4. The teams should differ — ML predictions rank riders differently than rules
  5. Over a benchmark suite, ML-optimized teams should correlate better with actual outcomes
- **Files**: No new files — validation step

## Risks & Mitigations

- **Score scale mismatch**: ML predicted scores may be on a different scale than rules-based `totalProjectedPts`. This could affect the composite score (60/40 split) and `pointsPerHillio`. Mitigation: verify that ML scores are on a similar scale (both represent predicted points in the same race). If scales differ significantly, normalization may be needed.
- **Breaking existing optimization**: Changing `ScoredRider` type could break compilation. Run `make typecheck` after each change.

## Review Guidance

- Verify knapsack algorithm itself is NOT modified — only input scores change
- Verify fallback works: null ML score → rules-based score used
- Verify `make typecheck` passes with modified `ScoredRider` type

## Activity Log

- 2026-03-20T16:27:36Z – system – lane=planned – Prompt created.
