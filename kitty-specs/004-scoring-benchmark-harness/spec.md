# Feature Specification: Scoring Benchmark Harness

**Feature Branch**: `004-scoring-benchmark-harness`
**Created**: 2026-03-19
**Status**: Draft
**Input**: User description: "Build a benchmarking harness that measures how well our scoring algorithm predicts real race outcomes."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Add Race Date to Schema (Priority: P1)

The system must store the actual date each race took place, not just the year. This is foundational — without precise race dates, temporal cutoffs for the benchmark are impossible. The user re-seeds the database after this change to populate the new field for all existing results.

**Why this priority**: Every other feature depends on knowing _when_ a race happened. Without this, we cannot filter "data available before race X."

**Independent Test**: After re-seeding, query any race result and confirm it has a populated `race_date`. Verify that the date matches the real-world date of that race on ProCyclingStats.

**Acceptance Scenarios**:

1. **Given** the database schema is updated, **When** the seed command scrapes a race, **Then** each result row includes the actual race date parsed from PCS.
2. **Given** a stage race spanning multiple days, **When** results are scraped, **Then** `race_date` reflects the date of the specific stage (for stage results) or the final day (for GC/classifications).
3. **Given** the user runs the seed command on an already-populated database, **When** existing results lack `race_date`, **Then** the system backfills the date from PCS without duplicating results.

---

### User Story 2 - Scrape and Persist Startlists (Priority: P1)

When the user benchmarks a race, the system fetches the startlist from PCS, identifying which riders started. Startlists are persisted in a new table for reuse and future ML work. If a startlist was already fetched, it is reused without re-scraping.

**Why this priority**: The benchmark needs to know _who started_ a race to form the prediction pool. Using finishers would be data leakage. Persisting startlists avoids redundant scraping and enables future ML features.

**Independent Test**: Run the startlist scraper for a known race (e.g., Tour de France 2025) and verify the stored rider list matches the PCS startlist page.

**Acceptance Scenarios**:

1. **Given** a race slug and year, **When** the system fetches the startlist from PCS, **Then** it returns a list of rider PCS slugs who were on the startlist.
2. **Given** a startlist has already been fetched and persisted, **When** the benchmark requests it again, **Then** the persisted data is returned without re-scraping.
3. **Given** a rider on the startlist does not exist in the `riders` table, **When** the startlist is persisted, **Then** the rider is created in the `riders` table as well.

---

### User Story 3 - Single Race Benchmark (Priority: P1)

The user selects a past race through an interactive CLI prompt. The system calculates two scores for each rider on the startlist:

- **Predicted score**: `totalProjectedPts` computed using only results with `race_date` before the target race's date.
- **Actual score**: `totalProjectedPts` computed from the rider's actual results _in that specific race_ — the points they truly generated according to the fantasy league rules.

The system ranks riders by each score and outputs a side-by-side comparison plus a Spearman rank correlation coefficient.

**Why this priority**: This is the core value proposition — turning algorithm tuning from guesswork into measurable feedback.

**Independent Test**: Run the benchmark for a single race. Verify predicted scores use only pre-race data. Verify actual scores match manual calculation from real results. Confirm the Spearman correlation is mathematically correct.

**Acceptance Scenarios**:

1. **Given** the user launches the benchmark CLI, **When** prompted, **Then** they can interactively select a race from available races in the database (filtered to races with complete results).
2. **Given** a selected race, **When** the benchmark runs, **Then** predicted `totalProjectedPts` for each startlist rider is computed using only race results dated before the target race.
3. **Given** a selected race, **When** the benchmark runs, **Then** actual `totalProjectedPts` for each startlist rider is computed from that race's real results using the same scoring tables and rules.
4. **Given** both predicted and actual rankings, **When** results are displayed, **Then** the terminal shows a table with columns: rank, rider name, predicted pts, actual pts, predicted rank, actual rank.
5. **Given** both rankings, **When** the correlation is computed, **Then** a Spearman rank correlation coefficient (ρ) is displayed, ranging from -1 to +1.

---

### User Story 4 - Multi-Race Benchmark Suite (Priority: P2)

The user can select multiple races and run the benchmark across all of them. The system outputs per-race correlation scores plus an aggregate metric (mean Spearman ρ) to assess overall prediction quality.

**Why this priority**: A single race can be noisy. Running across multiple races gives a robust, statistically meaningful score for algorithm quality.

**Independent Test**: Select 3+ races, run the suite, and verify individual correlations match single-race runs. Verify the aggregate is the correct mean.

**Acceptance Scenarios**:

1. **Given** the user launches the multi-race benchmark, **When** prompted, **Then** they can select multiple races interactively.
2. **Given** multiple selected races, **When** the benchmark suite completes, **Then** a summary table shows each race's Spearman ρ plus the aggregate mean ρ.
3. **Given** the suite is running, **When** each race completes, **Then** progress is shown in the terminal (e.g., "Race 3/7: Paris-Nice 2025 — ρ = 0.72").

---

### User Story 5 - Startlist Persistence for Future ML (Priority: P3)

Startlists are stored with rider composition, team assignments, and bib numbers when available. This structured data supports future machine learning features beyond the current benchmark scope.

**Why this priority**: Low incremental effort during startlist scraping, but high future value for ML feature development.

**Independent Test**: Query the startlists table and verify it contains structured rider data (rider reference, team, bib number) for previously benchmarked races.

**Acceptance Scenarios**:

1. **Given** a startlist is scraped, **When** it is persisted, **Then** each entry includes rider reference, team name, and bib number (if available on PCS).
2. **Given** the startlists table is populated, **When** queried externally, **Then** it provides a complete snapshot of who was registered for each race.

---

### Edge Cases

- What happens when a rider on the startlist has zero prior results in the database? They should receive a `totalProjectedPts` of 0 for the prediction (no data = no prediction), but still appear in the output.
- What happens when a rider DNF'd the race? Their actual score should reflect only the points they accumulated before abandoning (stages completed, any classifications earned).
- What happens when a race has no mountain or sprint classification results? The actual score calculation should handle missing categories gracefully (0 points for that category).
- What happens when `race_date` is missing for some results? The benchmark should warn the user and exclude races with incomplete date data from selection.
- What happens when a startlist rider doesn't exist in the `riders` table? The system creates the rider record during startlist persistence.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST add a `race_date` field (date type) to the race results schema, representing the actual calendar date of the race or stage.
- **FR-002**: System MUST parse race dates from PCS during scraping and populate `race_date` for all results.
- **FR-003**: System MUST support backfilling `race_date` for existing results without creating duplicates.
- **FR-004**: System MUST store startlists in a dedicated persistent table, linked to race slug and year.
- **FR-005**: System MUST scrape startlists from PCS on demand when not already persisted.
- **FR-006**: System MUST compute predicted `totalProjectedPts` using only results with `race_date` strictly before the target race date.
- **FR-007**: System MUST compute actual `totalProjectedPts` from a race's real results using the same scoring rules (position points tables, cross-type weights, race class weights, temporal decay, profile weight).
- **FR-008**: System MUST compute Spearman rank correlation between predicted and actual rider rankings.
- **FR-009**: System MUST provide an interactive CLI for race selection (no memorization of slugs required).
- **FR-010**: System MUST support running benchmarks across multiple races with aggregate correlation output.
- **FR-011**: System MUST display a terminal table showing per-rider predicted vs actual points and rankings.
- **FR-012**: System MUST reuse persisted startlists when available instead of re-scraping.
- **FR-013**: Startlist scraping and benchmark execution MUST be CLI-only (no REST endpoints).

### Key Entities

- **Race Date**: The actual calendar date a race or stage took place. Added to existing race results. For stage races, this is the date of the specific stage; for GC/classification results, the final day of the race.
- **Startlist Entry**: A record of a rider's participation in a race before it starts. Linked to a rider and a specific race edition (slug + year). Includes team and optionally bib number.
- **Benchmark Result**: The output of comparing predicted vs actual scores for a race. Contains per-rider predicted and actual `totalProjectedPts`, their respective rankings, and the Spearman ρ coefficient.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Users can run a single-race benchmark end-to-end in under 2 minutes (excluding initial startlist scraping time).
- **SC-002**: The benchmark produces a numerically correct Spearman rank correlation coefficient, verifiable against manual calculation for a known dataset.
- **SC-003**: Predicted scores use zero data from after the target race date — no temporal data leakage.
- **SC-004**: Multi-race benchmark suite completes for 10+ races and produces an aggregate correlation metric.
- **SC-005**: Changing a scoring weight and re-running the benchmark produces a visibly different correlation score, confirming the feedback loop works.
- **SC-006**: All existing race results have a populated `race_date` after re-seeding the database.

## Assumptions

- PCS startlist pages follow a consistent URL pattern (`race/{slug}/{year}/startlist`) and contain structured rider data parseable with the existing scraping infrastructure.
- The existing scoring functions (`computeRiderScore`, position point tables, cross-type weights, etc.) can be called with a filtered result set (pre-race-date) without modification to their interfaces.
- Re-seeding the database is acceptable to the user — no need for incremental migration of `race_date`.
- Race dates are available on PCS race pages and can be extracted during scraping.
- The Spearman rank correlation is a sufficient initial metric; additional metrics (e.g., top-10 accuracy, NDCG) can be added later.
