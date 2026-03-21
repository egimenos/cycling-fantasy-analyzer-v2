# Feature Specification: Complete Fantasy Game Scoring Pipeline

**Feature Branch**: `008-complete-fantasy-scoring`
**Created**: 2026-03-21
**Status**: Draft
**Input**: Capture all missing Grandes miniVueltas scoring categories from PCS, retrain ML, evaluate ρ improvement

## User Scenarios & Testing

### User Story 1 - Accurate rider scoring reflects actual game points (Priority: P1)

As a fantasy cycling player, when I analyze a rider list, the projected scores should reflect all the points the game actually awards — not just stage results and final classifications. Currently ~35% of game points are invisible to the system, causing GC riders and climbers to appear undervalued.

**Why this priority**: This is the foundational data problem. Everything else (ML retraining, UI accuracy) depends on capturing the complete scoring first.

**Independent Test**: Run `make seed` for a historical race (e.g., Tour de France 2024), then compare the system's calculated total for a known rider (e.g., Pogačar) against the actual game leaderboard. The totals should be within 10% of each other.

**Acceptance Scenarios**:

1. **Given** a seeded stage race with all stages scraped, **When** the system calculates Pogačar's total points for TdF 2024, **Then** the total includes stage results + GC final + daily GC + mountain passes + sprint final + regularidad final
2. **Given** a mountain stage with 3 categorized climbs (HC, Cat 1, Cat 2), **When** the scraper processes the stage page, **Then** the database contains one `mountain_pass` row per climb per rider in scoring position
3. **Given** a stage with 1 intermediate sprint, **When** the scraper processes the stage page, **Then** the database contains `sprint_intermediate` rows for the top 3 riders at that sprint with points 6/4/2
4. **Given** a stage with 2+ intermediate sprints, **When** the scraper processes the stage page, **Then** each sprint awards reduced points (3/2/1 per sprint)

---

### User Story 2 - ML model trained on complete scoring improves predictions (Priority: P2)

As the system operator, after retraining the ML model with the corrected target variable (actual game points including all categories), the Spearman ρ should improve because the model is now optimizing for the real game outcome rather than a partial proxy.

**Why this priority**: The ML model is the primary value driver of the optimizer. Training on the wrong target is the biggest single source of prediction error.

**Independent Test**: Run the benchmark suite before and after retraining. Compare Spearman ρ per race type to verify improvement.

**Acceptance Scenarios**:

1. **Given** the complete scoring data is seeded (2022–present), **When** the ML model is retrained, **Then** the training target (`actual_pts`) includes all game categories for each rider
2. **Given** the retrained model, **When** the benchmark suite is run on the 2025 holdout, **Then** mini tour ρ ≥ 0.58 and grand tour ρ ≥ 0.65 (currently 0.53 and 0.60)
3. **Given** the retrained model, **When** predictions are compared to the previous model, **Then** GC-specialist riders and climbers receive relatively higher scores than before

---

### User Story 3 - Full database seed captures all scoring categories (Priority: P1)

As the system operator, running `make seed` scrapes all stage pages for configured races (2022–present) and populates the database with all scoring categories: stage results, GC final, daily GC standings, individual mountain passes, intermediate sprints, daily regularidad, and final secondary classifications.

**Why this priority**: Equal to P1 because seeding is the prerequisite for Story 1. Without complete data in the DB, nothing downstream works.

**Independent Test**: After seeding, query the database for a known race and verify all expected categories exist with plausible row counts.

**Acceptance Scenarios**:

1. **Given** a clean database, **When** `make seed` is run for Paris-Nice 2026, **Then** the database contains rows for categories: `stage`, `gc`, `gc_daily`, `mountain`, `sprint`, `mountain_pass`, `sprint_intermediate`, `regularidad_daily`
2. **Given** a stage with no intermediate sprints or mountain passes, **When** the stage page is scraped, **Then** only `stage` and `gc_daily` rows are created (no phantom pass/sprint rows)
3. **Given** the full seed completes (2022–present), **When** row counts are checked, **Then** the database has approximately 35K+ new rows across the new categories

---

### Edge Cases

- What happens when PCS is missing data for a historical stage (e.g., older races without hidden tabs)? The scraper should log a warning and continue without crashing.
- What happens when a mountain pass heading doesn't match the expected format (e.g., no category indicator)? The parser should skip it with a warning, not fail the entire stage.
- What happens when a stage is a rest day or was cancelled? No classification tabs will be present; the scraper should handle this gracefully.
- What happens when a stage has 0 intermediate sprints? Tab 2 may only contain "Points at finish" — the parser should produce no `sprint_intermediate` rows.
- What happens with TTT stages? Daily GC may still apply but individual pass/sprint data may differ. The system should capture what's available.

## Requirements

### Functional Requirements

- **FR-001**: The scraper MUST parse hidden `div.resTab` tabs from PCS stage pages to extract daily GC standings, mountain pass results, intermediate sprint results, and daily regularidad standings
- **FR-002**: The scraper MUST extract mountain pass category (HC, 1, 2, 3, 4) and name from PCS headings in the format `"KOM Sprint (HC|1|2|3|4) Name (km)"`
- **FR-003**: The scraper MUST extract intermediate sprint locations from PCS headings in the format `"Sprint | Location (km)"` and MUST skip "Points at finish" subtabs
- **FR-004**: The system MUST persist daily GC standings (top 10 positions only) per stage
- **FR-005**: The system MUST persist individual mountain pass results for all categories (HC through Cat 4) with the number of scoring positions per the game rules
- **FR-006**: The system MUST persist intermediate sprint results (top 3 positions) per sprint
- **FR-007**: The system MUST persist daily regularidad standings (top 3 positions) per stage
- **FR-008**: The scoring engine MUST include new point tables matching the official game rules: daily GC (15/10/8/7/6/5/4/3/2/1), mountain passes (HC: 12/8/6/5/4/3/2/1, Cat1: 8/6/4/2/1, Cat2: 5/3/1, Cat3: 3/2, Cat4: 1), intermediate sprints (single: 6/4/2, multi: 3/2/1), daily regularidad (6/4/2)
- **FR-009**: The seed command MUST re-scrape all configured stage races from 2022 to present, populating all scoring categories
- **FR-010**: The ML training pipeline MUST compute `actual_pts` using ALL scoring categories (not just the current 4)
- **FR-011**: The system MUST produce a benchmark report comparing Spearman ρ before and after retraining with the complete scoring data

### Key Entities

- **Race Result (extended)**: A record of a rider's position in a specific scoring context. Gains new category values (`gc_daily`, `mountain_pass`, `sprint_intermediate`, `regularidad_daily`) and optional metadata fields (climb category/name, sprint name, km marker)
- **Scoring Table**: A mapping from (category, position, race_type, optional subcategory) to fantasy points. Extended with new game categories
- **ML Training Target**: The sum of all fantasy points a rider earns in a race. Now computed from 8 categories instead of 4

## Success Criteria

### Measurable Outcomes

- **SC-001**: After full seed, the database contains rows for all 8 scoring categories for every stage race from 2022 to present
- **SC-002**: For a reference Grand Tour (TdF 2024), the system's computed total points per rider are within 10% of the actual game leaderboard totals
- **SC-003**: After retraining, mini tour Spearman ρ reaches ≥ 0.58 (from current 0.53)
- **SC-004**: After retraining, grand tour Spearman ρ reaches ≥ 0.65 (from current 0.60)
- **SC-005**: The seed process completes for all historical races (2022–present) without manual intervention
