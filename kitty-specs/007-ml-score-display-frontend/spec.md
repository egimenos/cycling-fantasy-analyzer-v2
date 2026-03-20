# Feature Specification: ML Score Display in Frontend

**Feature Branch**: `007-ml-score-display-frontend`
**Created**: 2026-03-20
**Status**: Draft
**Mission**: software-dev

## User Scenarios & Testing

### User Story 1 - ML Score Visible in Rider Table (Priority: P1)

When a user analyzes a stage race (mini tour or grand tour) with ML scoring available, each rider row in the main table shows the ML predicted score alongside the existing rules-based score. A visual indicator (badge) signals that ML-enhanced scoring is active for this race. For classic races or when ML is unavailable, the table looks identical to before — no ML elements shown.

**Why this priority**: The rider table is the primary score display. Users need to see ML predictions here first to make informed team selections.

**Independent Test**: Analyze a stage race with ML service running → rider table shows ML score column and "ML" badge. Analyze a classic → no ML column, no badge.

**Acceptance Scenarios**:

1. **Given** analysis of a stage race with ML predictions available, **When** the rider table renders, **Then** each rider row displays the ML predicted score in addition to the rules-based score, and a visual indicator shows that hybrid scoring is active.
2. **Given** analysis of a classic race, **When** the rider table renders, **Then** no ML score is shown and no ML indicator is visible. The table looks identical to the pre-ML experience.
3. **Given** analysis of a stage race where ML service is down, **When** the rider table renders, **Then** all riders show `scoringMethod: "rules"` and no ML elements are visible.
4. **Given** a rider in a stage race where ML prediction is null (edge case), **When** the row renders, **Then** the ML score cell shows a dash or "n/a" instead of a number.

---

### User Story 2 - ML Details in Expanded Row (Priority: P1)

When a user expands a rider row to see the detailed breakdown, both scoring methods are clearly labeled and visible. The rules-based breakdown (gc, stage, mountain, sprint) remains as-is. The ML predicted score is shown separately with a clear label distinguishing it from the rules-based total.

**Why this priority**: The expanded detail is where users compare scoring methods and understand why a rider is ranked the way they are.

**Independent Test**: Expand a rider in a stage race → see "Rules-based: X pts" and "ML Predicted: Y pts" clearly labeled. Expand a rider in a classic → only rules-based shown.

**Acceptance Scenarios**:

1. **Given** an expanded rider row in a stage race with ML predictions, **When** the detail section renders, **Then** it shows the full rules-based category breakdown (gc, stage, mountain, sprint, total) AND the ML predicted score in a distinct section.
2. **Given** an expanded rider row in a classic race, **When** the detail section renders, **Then** only the rules-based breakdown is visible. No ML section is shown.

---

### User Story 3 - ML Score in Team Aggregates (Priority: P2)

When users build a team (manually or via optimizer) for a stage race, team total scores reflect which scoring method was used. The team summary shows both the rules-based total and the ML-predicted total when available.

**Why this priority**: Team optimization uses ML score for stage races. Users should see which score drove the optimization and compare against the rules-based alternative.

**Independent Test**: Build or optimize a team for a stage race → team summary shows both totals. Do the same for a classic → only rules-based total.

**Acceptance Scenarios**:

1. **Given** a completed team for a stage race with ML predictions, **When** the team summary renders, **Then** it shows both "Rules Total: X pts" and "ML Total: Y pts".
2. **Given** an optimized team for a stage race, **When** the optimal team card renders, **Then** it indicates that ML scoring was used for optimization and shows both totals.
3. **Given** a team for a classic race, **When** the team summary renders, **Then** only the rules-based total is shown.

---

### Edge Cases

- What happens when some riders in a stage race have `mlPredictedScore: null` but others don't? Show ML score where available, dash where null. Team ML total sums only non-null values with a note.
- What happens when all riders have `scoringMethod: "rules"` even for a stage race (ML service was down during analysis)? No ML elements visible — identical to classic race experience.
- What happens on narrow screens (mobile)? ML score column may be hidden or shown in the expanded row only.

## Requirements

### Functional Requirements

- **FR-001**: The rider table MUST display the ML predicted score for riders with `scoringMethod: "hybrid"`.
- **FR-002**: A visual indicator MUST distinguish hybrid-scored riders from rules-only riders.
- **FR-003**: The expanded rider detail MUST show both the rules-based breakdown and the ML predicted score with clear labels when in hybrid mode.
- **FR-004**: Team summary and optimizer results MUST show both rules-based and ML-predicted team totals when ML scores are available.
- **FR-005**: When `scoringMethod` is "rules" (classics or ML unavailable), the UI MUST be identical to the pre-ML experience — no empty ML columns, no placeholder badges.
- **FR-006**: Riders with `mlPredictedScore: null` in a hybrid race MUST show a clear "n/a" or dash instead of a number.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Users can identify whether ML scoring is active for a race within 2 seconds of viewing results.
- **SC-002**: Both scoring methods are visible simultaneously for stage races without requiring additional clicks beyond the current UX.
- **SC-003**: Classic race analysis experience is visually identical to the pre-ML version — zero regression.
- **SC-004**: Team totals are visible for both scoring methods when building teams for stage races.
