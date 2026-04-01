# Research: Breakout Potential Index

**Feature**: 015-breakout-potential-index
**Date**: 2026-04-01

## R-1: Bootstrap P80 Viability with Small Samples

**Decision**: Hybrid approach — weighted bootstrap for ≥3 seasons, heuristic multiplier for <3.

**Rationale**: Bootstrap resampling requires sufficient data diversity to produce meaningful confidence intervals. With 1-2 data points, the resampled distribution collapses to the observed values — the P80 becomes the max observed season total, which is uninformative for users seeking upside potential. A heuristic multiplier (`prediction × 1.8`) provides an actionable optimistic estimate for young/emerging riders, which is the core BPI audience.

**Alternatives considered**:

- Pure bootstrap (even with few samples): Rejected — P80 ≈ max(observed) for n<3, not useful
- Always heuristic: Rejected — loses the statistical grounding for riders with sufficient history
- Bayesian prior + bootstrap: Over-engineered for a rules-based feature; save for v2 if BPI proves valuable

## R-2: BPI Domain Placement

**Decision**: Isolated domain module `domain/breakout/` with pure function API.

**Rationale**: BPI is meta-analysis on scoring output, not scoring itself. Placing it in `domain/scoring/` would violate the single-responsibility principle and risk coupling with the scoring pipeline. The existing codebase has clear domain module boundaries (`domain/matching/`, `domain/scoring/`, `domain/optimizer/`) and BPI fits the same pattern.

**Alternatives considered**:

- Inside `domain/scoring/`: Rejected — BPI consumes scoring output but has fundamentally different concerns (potential vs. prediction)
- As an application-level service: Rejected — BPI is domain logic (rules about cycling talent), not orchestration
- As a separate NestJS module with DI: Over-engineered — a pure function needs no DI container

## R-3: birthDate Availability

**Decision**: Extend `RiderProps` and repository mapping to include `birthDate` from existing DB column.

**Rationale**: The `riders` table already has a `birth_date` column (populated by the scraping pipeline from PCS profiles). The domain entity simply doesn't map it yet. No migration needed — just extend the interface and adapter. Age is required for 3 of the 5 BPI signals (trajectory age factor, ceiling age gate, emerging talent flag).

**Alternatives considered**:

- Compute age from PCS slug at runtime: Fragile, not all slugs contain birth year
- Add age as a separate API call: Unnecessary I/O when data is already in the query result
- Default all ages to 28 (skip birthDate): Loses the core value of age-dependent signals

## R-4: Frontend Tab Implementation

**Decision**: Use a simple state-based tab switcher within the existing expandable row.

**Rationale**: The current `ExpandedRowContent` renders a 4-column grid. Wrapping it in a tab container (Performance | Breakout) preserves the existing layout while adding a new tab for BPI detail. No need for a heavy tab library — a simple `useState<'performance' | 'breakout'>` with conditional rendering and Tailwind styling matches the existing pattern.

**Alternatives considered**:

- Radix UI Tabs: Available in deps but overkill for 2 tabs in a table row
- Accordion sections: Doesn't communicate mutual exclusivity well
- Always-visible side-by-side: Too much information density in a table row

## R-5: Filter Button Integration

**Decision**: Add "Breakout" and "Value Picks" to existing `FILTER_OPTIONS` array with custom filter logic.

**Rationale**: The rider table already has a filter system with 5 options (All, Selected, Locked, Excluded, Unmatched) implemented via a `FILTER_OPTIONS` array and `filteredRiders` logic. The BPI filters follow the same pattern. "Breakout" (BPI ≥50) shows all breakout candidates; "Value Picks" (BPI ≥50 + price ≤125) is the subset for cheap roster slots.

**Alternatives considered**:

- Separate filter bar: Inconsistent with existing UX
- Dropdown with BPI threshold: Over-complicated for the use case
- Only Value Picks (spec original): User requested a broader "Breakout" filter too
