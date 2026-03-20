# Work Packages: ML Score Display in Frontend

**Organization**: 12 subtasks in 2 work packages. Frontend-only — no backend changes.

---

## Work Package WP01: ML Badge + Rider Table Integration (Priority: P1)

**Goal**: Create the reusable ML badge component and integrate ML scoring into the rider table (main score column + expanded detail).
**Independent Test**: Analyze a stage race → ML badge visible, ML score shown. Analyze a classic → no ML elements.
**Prompt**: `tasks/WP01-rider-table-ml-display.md`

**Requirements Refs**: FR-001, FR-002, FR-003, FR-005, FR-006

### Included Subtasks

- [ ] T001 [P] Create `MlBadge` shared component in `apps/web/src/shared/ui/ml-badge.tsx`
- [ ] T002 Add ML score column to rider table in `apps/web/src/features/rider-list/components/rider-table.tsx`
- [ ] T003 Add ML badge indicator to rider rows with `scoringMethod: "hybrid"`
- [ ] T004 Add ML predicted score to expanded row detail section
- [ ] T005 Conditional rendering: hide all ML elements when `scoringMethod === "rules"`
- [ ] T006 Handle `mlPredictedScore: null` edge case (show "n/a")

### Dependencies

- None (starting package)

---

## Work Package WP02: Team Aggregates + Optimizer ML Display (Priority: P2)

**Goal**: Show ML score totals in team builder, team summary, and optimizer results.
**Independent Test**: Build team for stage race → see both rules and ML totals. Optimize → ML total visible.
**Prompt**: `tasks/WP02-team-optimizer-ml-display.md`

**Requirements Refs**: FR-004, FR-005

### Included Subtasks

- [ ] T007 Modify `team-builder-panel.tsx` — show ML projected total alongside rules total for stage races
- [ ] T008 Modify `team-summary.tsx` — show both totals when team complete
- [ ] T009 Modify `optimal-team-card.tsx` — show ML total, indicate ML-optimized
- [ ] T010 Compute ML team total (sum `mlPredictedScore`, handle nulls)
- [ ] T011 Conditional rendering: hide ML totals for classic races
- [ ] T012 Update `alternative-teams.tsx` — show ML total in accordion headers

### Dependencies

- Depends on WP01 (MlBadge component)

---

## Dependency & Execution Summary

```
WP01 (Rider Table + Badge) → WP02 (Team Aggregates)
```

- **MVP**: WP01 — riders see ML scores in the main table
- **Parallelization**: None (sequential, WP02 reuses MlBadge from WP01)

---

## Subtask Index

| Subtask | Summary                               | WP   | Parallel? |
| ------- | ------------------------------------- | ---- | --------- |
| T001    | MlBadge shared component              | WP01 | Yes       |
| T002    | ML score column in rider table        | WP01 | No        |
| T003    | ML badge in rider rows                | WP01 | No        |
| T004    | ML score in expanded detail           | WP01 | No        |
| T005    | Conditional rendering (rules = no ML) | WP01 | No        |
| T006    | Handle null mlPredictedScore          | WP01 | No        |
| T007    | Team builder panel ML total           | WP02 | No        |
| T008    | Team summary ML total                 | WP02 | No        |
| T009    | Optimal team card ML total            | WP02 | No        |
| T010    | ML team total computation             | WP02 | No        |
| T011    | Conditional hide for classics         | WP02 | No        |
| T012    | Alternative teams ML total            | WP02 | No        |
