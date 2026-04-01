# Feature Specification: Breakout Potential Index

**Feature Branch**: `015-breakout-potential-index`
**Created**: 2026-03-31
**Status**: Draft
**Mission**: software-dev
**Input**: Rules-based breakout detection system that enriches the analyze endpoint payload and provides frontend tools to identify undervalued riders in fantasy cycling.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Backend BPI Enrichment (Priority: P1)

As a fantasy cycling manager, when I analyze a price list, I want each rider's response to include a breakout potential score, upside scenario, and interpretable flags so that I can identify undervalued riders beyond what the raw prediction tells me.

**Why this priority**: Without the backend computation, nothing else works. This is the foundation — a pure domain service that consumes data already available in the analyze flow (seasonBreakdown, price, predictions, age, profile) and produces the BPI payload.

**Independent Test**: Submit a price list via the analyze endpoint and verify the response includes a `breakout` field for matched riders with `index` (0-100), `upsideP80` (number), and `flags` (string array). Verify unmatched riders have `breakout: null`.

**Acceptance Scenarios**:

1. **Given** a matched rider with 5 seasons of ascending totals (e.g., 0, 20, 60, 180, 280) and age 23, **When** the analyze endpoint processes the price list, **Then** the response includes `breakout.index >= 60` and `breakout.flags` contains `EMERGING_TALENT`.
2. **Given** a matched rider whose 2026 season total is more than 2x their historical average, **When** analyzed, **Then** `breakout.flags` contains `HOT_STREAK`.
3. **Given** a rider priced at 50 hillios with pts/hillio above the median of the price list, **When** analyzed, **Then** `breakout.flags` contains `DEEP_VALUE`.
4. **Given** a matched rider with a historical peak season of 300 pts but current ML prediction of 15 pts and age under 30, **When** analyzed, **Then** `breakout.flags` contains `CEILING_PLAY`.
5. **Given** a rider with >10% of historical points from mountain category and price <= 100, **When** analyzed, **Then** `breakout.flags` contains `BREAKAWAY_HUNTER`.
6. **Given** a sprint-profile rider (high stage+sprint %) priced under 125 and a race profile with >35% flat stages, **When** analyzed with profileSummary provided, **Then** `breakout.flags` contains `SPRINT_OPPORTUNITY`.
7. **Given** an unmatched rider, **When** analyzed, **Then** `breakout` is `null`.
8. **Given** a veteran rider (age > 33) with a high historical peak but declining recent seasons, **When** analyzed, **Then** the ceiling gap signal contributes 0 to the BPI (age filter prevents false positives).

---

### User Story 2 - BPI Column and Flag Badges in Rider Table (Priority: P2)

As a fantasy manager viewing the analysis results, I want to see a BPI score column and flag badges next to rider names so I can quickly spot breakout candidates while browsing the full rider list.

**Why this priority**: The primary way users interact with the data. Without visual indicators in the table, users would have to inspect raw JSON to use BPI.

**Independent Test**: After analyzing a price list, the rider table displays a sortable "BPI" column with color coding and flag chips appear next to rider names that have breakout flags.

**Acceptance Scenarios**:

1. **Given** analyzed riders are displayed in the table, **When** the user views the table, **Then** a "BPI" column shows each rider's breakout index (0-100) with color: green (>=70), amber (40-69), gray or no color (<40).
2. **Given** a rider has breakout flags, **When** displayed in the table, **Then** colored chips appear next to the rider name showing abbreviated flag labels (e.g., "HOT", "EMERGING", "VALUE").
3. **Given** a rider has no breakout flags, **When** displayed, **Then** no chips appear (clean row).
4. **Given** the BPI column header, **When** the user clicks it, **Then** the table sorts by BPI descending/ascending.
5. **Given** an unmatched rider, **When** displayed, **Then** the BPI column shows a dash or is empty.

---

### User Story 3 - Breakout Detail Panel (Priority: P3)

As a fantasy manager considering a specific cheap rider, I want to expand a rider row and see a detailed breakdown of the 5 BPI signals, the upside scenario, and flag explanations so I understand _why_ the system flagged this rider as a potential breakout.

**Why this priority**: Adds interpretability. Without this, the BPI is a black-box number. But the feature is usable without it (users can still sort by BPI and see flags).

**Independent Test**: Click/expand a rider row and verify the breakout detail section shows signal bars, upside comparison, and flag descriptions.

**Acceptance Scenarios**:

1. **Given** the user expands a matched rider row, **When** the breakout detail renders, **Then** it shows 5 signal bars (Trajectory, Recency, Ceiling, Route Fit, Variance) with their score out of the maximum and a brief label.
2. **Given** the user expands a rider row, **When** the breakout detail renders, **Then** it shows the prediction vs. upside P80 comparison (e.g., "Prediction: 51.7 | Optimistic: 145").
3. **Given** profileSummary was not provided in the analyze request, **When** the Route Fit signal is displayed, **Then** it shows as unavailable/N/A (not zero).
4. **Given** the user expands an unmatched rider, **When** viewing the row, **Then** no breakout detail section is shown.

---

### User Story 4 - Value Picks Quick Filter (Priority: P4)

As a fantasy manager filling cheap roster slots, I want a one-click "Value Picks" filter that shows only affordable riders with high breakout potential, sorted by BPI, so I can quickly find gems without manually scrolling.

**Why this priority**: A convenience feature that directly addresses the core use case. The user can achieve the same result manually (sort by BPI, scan cheap riders), but this shortcut saves time.

**Independent Test**: Click "Value Picks" button and verify the table filters to riders with price <= 125 hillios and BPI >= 50, sorted by BPI descending. Click again to return to normal view.

**Acceptance Scenarios**:

1. **Given** analyzed riders are displayed, **When** the user clicks "Value Picks", **Then** the table filters to riders with price <= 125 hillios AND breakout index >= 50, sorted by BPI descending.
2. **Given** the Value Picks filter is active, **When** the user clicks the button again (or a "clear" action), **Then** the table returns to the default view (sorted by prediction score).
3. **Given** no riders meet the Value Picks criteria (all cheap riders have BPI < 50), **When** the filter is activated, **Then** an empty state message is shown (e.g., "No value picks found for this race").

---

### Edge Cases

- What happens when a rider has only 1 season of data? Trajectory slope cannot be computed (needs >=2 points). The trajectory signal defaults to 0, variance gets a moderate default (data scarcity = some uncertainty).
- What happens when a rider has all zero-point seasons? All signals produce 0, BPI = 0, no flags, upside P80 = 0.
- What happens when no profileSummary is provided? The Sprint/Route Fit signal returns 0 and the SPRINT_OPPORTUNITY flag is never triggered. The signal displays as "N/A" in the detail panel.
- What happens when birthDate is null for a rider? Age defaults to 28 (median pro cyclist age). The age-dependent adjustments use this default, which is neutral — it neither boosts nor penalizes.
- What happens when mlPredictedScore and totalProjectedPts are both null/zero? Ceiling gap signal uses 0 prediction, which produces a high gap ratio. But this only happens for unmatched riders (where breakout is null anyway) or riders with no history (where peak is also 0).

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST compute a Breakout Potential Index (0-100) for every matched rider during the analyze flow, as a composite of 5 weighted signals.
- **FR-002**: System MUST compute an upside P80 value via weighted bootstrap sampling on the rider's season history.
- **FR-003**: System MUST assign breakout flags (EMERGING_TALENT, HOT_STREAK, DEEP_VALUE, CEILING_PLAY, SPRINT_OPPORTUNITY, BREAKAWAY_HUNTER) based on explicit boolean conditions per flag.
- **FR-004**: System MUST expose the rider's birth date from the database through the rider entity (currently stored but not loaded).
- **FR-005**: System MUST NOT modify existing scoring logic (rules-based or ML pipeline), sort order, or any existing fields in the AnalyzedRider payload.
- **FR-006**: System MUST return `breakout: null` for unmatched riders.
- **FR-007**: The BPI computation MUST be a pure function with no side effects, no database calls, and no external service dependencies.
- **FR-008**: Frontend MUST display a sortable BPI column in the rider analysis table with color coding (green >= 70, amber 40-69, gray < 40).
- **FR-009**: Frontend MUST display flag badges as colored chips next to rider names when flags are present.
- **FR-010**: Frontend MUST provide an expandable detail panel showing the 5 signal scores, upside P80 vs prediction comparison, and flag descriptions.
- **FR-011**: Frontend MUST provide a "Value Picks" toggle that filters to riders with price <= 125 hillios and BPI >= 50, sorted by BPI descending.

### BPI Signal Definitions

- **Signal 1 — Trajectory Slope (0-25)**: Linear regression slope of season totals over available years, multiplied by an age factor (1.5 for age < 25, 1.0 for 25-27, 0.5 for 28-31, 0.2 for 32+).
- **Signal 2 — Recency Burst (0-25)**: Ratio of current season total (weight=1.0) to average of older seasons. Only active when current season total > 20 points.
- **Signal 3 — Historical Ceiling Gap (0-20)**: Ratio of peak historical season to current prediction (ML or rules). Disabled when rider age > 33.
- **Signal 4 — Sprint/Route Fit (0-15)**: Dot product of rider category profile with race route profile (derived from PCS stage profile counts: p1=flat, p2/p3=hilly, p4/p5=mountain, itt/ttt=TT). Returns 0 when profileSummary is not provided.
- **Signal 5 — Variance/Upside (0-15)**: Coefficient of variation of non-zero season totals. Defaults to 7.5 when fewer than 2 data points.

### Breakout Flag Conditions

- **EMERGING_TALENT**: age < 25 AND seasonsUsed <= 3 AND raw trajectory slope > 30 pts/year (before age adjustment)
- **HOT_STREAK**: current season total > 2x average of other seasons
- **DEEP_VALUE**: price <= 100 hillios AND pointsPerHillio > median of all riders in the list
- **CEILING_PLAY**: peak historical season > 5x current prediction AND age < 30
- **SPRINT_OPPORTUNITY**: price <= 125 AND sprint+stage percentage of rider's total points > 15% AND flat stage percentage > 35% (flat = p1Count / total stage count from profileSummary; requires profileSummary)
- **BREAKAWAY_HUNTER**: price <= 100 AND mountain percentage of total points > 10%

### Key Entities

- **BreakoutSignals**: The computed result for a rider — index (0-100), upsideP80 (number), flags (string array), and individual signal scores for the detail panel.
- **Rider (updated)**: Existing entity extended with birthDate (Date | null), already present in the database but not yet loaded into the domain entity.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Every matched rider in the analyze response includes a `breakout` object with `index`, `upsideP80`, and `flags` fields.
- **SC-002**: Riders with known ascending career trajectories (young riders with increasing season totals) receive BPI scores in the top quartile (>=60) of the analyzed rider list.
- **SC-003**: The analyze endpoint response time does not increase by more than 50ms with BPI computation enabled (pure in-memory computation on data already loaded).
- **SC-004**: Users can sort the rider table by BPI and activate the Value Picks filter in a single click.
- **SC-005**: The breakout detail panel renders signal breakdowns for all 5 signals with their individual scores visible.
- **SC-006**: When validated against historical Tour de France data, riders flagged as DEEP_VALUE or HOT_STREAK include at least some riders who historically outperformed their price bracket.
