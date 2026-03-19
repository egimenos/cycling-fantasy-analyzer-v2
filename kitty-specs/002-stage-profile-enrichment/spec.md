# Feature Specification: Stage Profile Enrichment

**Feature Branch**: `002-stage-profile-enrichment`
**Created**: 2026-03-19
**Status**: Draft
**Mission**: software-dev

## Overview

The current scraping pipeline captures race results (GC, stage, mountain, sprint positions) but does not record the terrain profile of each stage. This means a stage win on a flat sprint finish is treated identically to a stage win on a mountain summit finish when computing rider scores.

This feature enriches the data layer with stage profile metadata — parcours type (p1 flat through p5 mountain summit finish), ITT/TTT classification, and PCS ProfileScore — so that future scoring models can weight historical results based on how well a rider's strengths match the profile distribution of a target race.

Additionally, the system will be able to scrape a target race's stage list from its PCS overview page, extracting the profile distribution (how many stages of each type) to serve as input for profile-aware scoring in a future feature.

**Explicitly out of scope**: The scoring algorithm that uses profile data to weight results. That will be defined and implemented in a separate feature after this data foundation is in place.

---

## User Scenarios & Testing _(mandatory)_

### User Story 0 - Capture Stage Profile Data During Scraping (Priority: P0)

When the scraping pipeline processes a stage race (Grand Tour or mini-tour), it captures the parcours type (p1-p5), whether the stage is an ITT or TTT, and the PCS ProfileScore for each stage result. Profile data is stored only on `category=STAGE` result rows (and `category=GC` for one-day classics). Race-level classification rows (GC, MOUNTAIN, SPRINT in stage races) do not carry profile data, since parcours is a property of an individual stage, not of a general classification. For one-day classics, it captures the race-level parcours type and ProfileScore on the GC row.

**Why this priority**: Without this data persisted, no downstream profile-aware scoring is possible. This is the data foundation for everything else.

**Independent Test**: Run the scraping pipeline for a known race (e.g., Tour de France 2024). Verify that every stage result in the data store includes a parcours type (p1-p5), the correct ITT/TTT flag, and a ProfileScore value. Verify that a classic race result (e.g., Milano-Sanremo 2024) also has a parcours type and ProfileScore.

**Acceptance Scenarios**:

1. **Given** the pipeline scrapes a stage race, **When** it processes stage results, **Then** each stage result record includes the stage's parcours type (p1 through p5), an ITT flag (true/false), a TTT flag (true/false), and the numeric ProfileScore.
2. **Given** the pipeline scrapes a one-day classic, **When** it processes the race result, **Then** the result record includes the race-level parcours type and ProfileScore.
3. **Given** a stage is a rest day, **When** the pipeline encounters it, **Then** it is skipped (no result record created).
4. **Given** a stage's parcours type or ProfileScore cannot be determined from the page, **When** the pipeline processes it, **Then** the fields are stored as null and the stage result is still persisted without failing the pipeline.

---

### User Story 1 - Scrape Target Race Profile Distribution (Priority: P1)

An operator or the system can fetch the stage list of an upcoming race from its PCS overview page and extract the profile distribution — how many stages of each parcours type (p1-p5), how many ITTs, how many TTTs, total stage count, and the distance per stage.

**Why this priority**: The profile distribution of the target race is the other half of the equation. Without knowing what the upcoming race looks like, historical profile data alone cannot inform scoring.

**Independent Test**: Provide the PCS URL of a known race (e.g., Tour de France 2025). Verify that the system returns the correct count of stages per parcours type, correctly identifies ITT/TTT stages, and includes distance per stage.

**Acceptance Scenarios**:

1. **Given** a valid PCS race overview URL for a stage race, **When** the system fetches and parses it, **Then** it returns a list of stages with: stage number, parcours type (p1-p5), ITT flag, TTT flag, distance in km, and departure/arrival cities.
2. **Given** a valid PCS race overview URL for a one-day classic, **When** the system fetches and parses it, **Then** it returns the race-level parcours type from the individual result page (since classics have no stage list on the overview page).
3. **Given** a PCS URL for a future one-day classic whose result page does not yet exist, **When** the system attempts to fetch profile data, **Then** it falls back to the most recent previous edition of the same race to obtain the parcours type (classics typically maintain their profile year over year).
4. **Given** an invalid or unreachable PCS URL, **When** the system attempts to fetch it, **Then** it returns a clear error indicating the URL could not be processed.
5. **Given** a race overview page where some stages lack profile icons (e.g., TBD stages), **When** the system parses it, **Then** those stages are included with null parcours type.

---

### User Story 2 - Submit Target Race URL in Frontend (Priority: P2)

A user pastes the PCS URL of the race they want to analyze (e.g., `https://www.procyclingstats.com/race/tour-de-france/2026`) in the frontend. The system fetches the stage profile distribution, auto-detects the race type (Grand Tour, Classic, or Mini Tour), and displays both alongside the analysis form. The PCS URL replaces the manual race type selector — one fewer step for the user.

**Why this priority**: This connects the backend capability to the user experience. The user needs to see the race profile to understand the context of the analysis, and auto-detecting the race type removes a manual input step.

**Independent Test**: Paste a PCS race URL in the frontend. Verify that the stage profile distribution is displayed (e.g., "5 flat stages, 3 hilly, 5 mountain summit finishes, 2 ITT"), the race type is auto-detected, and the manual race type selector is no longer required.

**Acceptance Scenarios**:

1. **Given** a user pastes a valid PCS race URL, **When** the system processes it, **Then** the frontend displays a summary of the race profile distribution showing the count of stages per parcours type, number of ITTs/TTTs, and total stage count, and the race type is auto-detected and shown to the user.
2. **Given** a user pastes a valid PCS race URL, **When** the system processes it, **Then** the manual race type selector is removed or auto-filled, requiring no manual selection from the user.
3. **Given** a user pastes an invalid URL, **When** the system attempts to process it, **Then** the frontend displays an error message prompting the user to check the URL.
4. **Given** the user has not yet pasted a race URL, **When** they view the analysis form, **Then** the race profile section is empty or shows a prompt to paste the URL. The rest of the form (rider list, budget) remains functional without a race URL.

---

### Edge Cases

- When PCS changes its HTML layout and profile icons are no longer parseable, the scraping pipeline should detect the failure (no valid p1-p5 class found) and store null rather than crash. The health monitoring system should flag this.
- When a race has a prologue (very short opening stage, often an ITT), it should be treated as a regular stage with its own parcours type and ITT flag.
- When the same race is scraped multiple times, profile data should be upserted (not duplicated), consistent with the existing pipeline behavior.
- When a stage race has mixed ITT and road stages with the same stage number format but different naming conventions, the ITT/TTT detection must rely on the stage name text pattern `(ITT)` / `(TTT)`, not on the parcours type icon (since an ITT can have any terrain profile p1-p5).
- When fetching profile data for a future one-day classic whose result page does not yet exist, the system falls back to the most recent previous edition of the same race. Classics typically maintain their parcours profile year over year.

---

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The scraping pipeline MUST capture the parcours type (p1 through p5) for every stage result in a stage race, extracted from the PCS stage page or race overview page.
- **FR-002**: The scraping pipeline MUST detect and record whether a stage is an Individual Time Trial (ITT) or Team Time Trial (TTT), based on the stage name text containing `(ITT)` or `(TTT)`.
- **FR-003**: The scraping pipeline MUST capture the numeric PCS ProfileScore for each stage (from the individual stage result page sidebar), storing it for potential future use.
- **FR-004**: The scraping pipeline MUST capture the parcours type and ProfileScore for one-day classics from the race result page sidebar.
- **FR-005**: The system MUST persist parcours type, ITT/TTT flags, and ProfileScore on race result rows where they apply: `category=STAGE` rows in stage races, and `category=GC` rows in one-day classics. Race-level classification rows (GC, MOUNTAIN, SPRINT in stage races) MUST NOT carry profile data.
- **FR-006**: The system MUST provide the ability to scrape an upcoming race's stage list from its PCS overview URL, returning the profile distribution (stage count per parcours type, ITT/TTT counts, distance per stage).
- **FR-007**: For one-day classics where the overview page has no stage list, the system MUST fetch the profile data from the individual race result page instead.
- **FR-007b**: For future one-day classics whose result page does not yet exist, the system MUST fall back to the most recent previous edition of the same race to obtain the parcours type.
- **FR-008**: The frontend MUST accept a PCS race URL as input, auto-detect the race type (Grand Tour, Classic, or Mini Tour), and display the resulting stage profile distribution to the user. The PCS URL replaces the manual race type selector.
- **FR-009**: The race profile distribution display MUST include: count of stages per parcours type (p1-p5), number of ITT stages, number of TTT stages, and total stage count.
- **FR-010**: When parcours type or ProfileScore cannot be extracted from a page, the system MUST store null values and continue processing without failing.
- **FR-011**: The existing database MUST be re-seeded from scratch with the new fields, since there is no production data to migrate.

### Key Entities

- **StageProfile**: The parcours classification of a stage or one-day race. Comprises a parcours type (p1-p5), ITT flag, TTT flag, and numeric ProfileScore. Attached only to `category=STAGE` result rows in stage races and `category=GC` rows in one-day classics. Not present on race-level classification rows (GC, MOUNTAIN, SPRINT in stage races).
- **RaceProfileDistribution**: An ephemeral summary of an upcoming race's stage composition. Contains the count of stages per parcours type, ITT/TTT counts, total stages, and per-stage metadata (distance, cities). Computed on demand from a PCS URL, not persisted.

---

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: After re-seeding, 100% of stage results for scraped stage races include a non-null parcours type (p1-p5) and ITT/TTT flag.
- **SC-002**: After re-seeding, 100% of scraped one-day classic results include a non-null parcours type.
- **SC-003**: Given a valid PCS race URL, the system returns the stage profile distribution in under 30 seconds (accounting for polite scraping delays).
- **SC-004**: The frontend displays the race profile distribution before the user submits the rider list, providing visible context for the analysis.
- **SC-005**: The profile data captured matches the PCS source data with 100% accuracy for a validation set of at least 3 known races (verified manually).

---

## Assumptions

- PCS HTML structure for stage lists and profile icons remains consistent with the patterns discovered during research (CSS class `icon profile p{N} mg_rp4`, stage name text `(ITT)`/`(TTT)`).
- No production data exists — the database can be wiped and re-seeded with enriched data without migration concerns.
- The scoring algorithm that consumes profile data will be designed and implemented in a separate feature. This feature only captures and exposes the data.
- The existing scraping pipeline infrastructure (HTTP client, throttling, health monitoring) is reused. No new scraping infrastructure is needed.
- ProfileScore is stored as a numeric value for future use, but no scoring logic in this feature depends on it.

---

## Clarifications

### Session 2026-03-19

- Q: How should the scoring algorithm use profile data to weight results? → A: Deferred to a future feature. This feature only captures the data foundation.
- Q: Do we need to migrate existing data? → A: No. Since there is no production data, we reset the database and re-seed from scratch with the new fields.
- Q: How does the user provide the target race? → A: User pastes the PCS URL of the race in the frontend. The system scrapes the stage list and displays the profile distribution.
- Q: Should ProfileScore be stored? → A: Yes, capture it now for potential future use even though no current scoring logic depends on it.
- Q: Which RaceResult rows carry profile data? → A: Only `category=STAGE` rows in stage races and `category=GC` rows in one-day classics. Race-level classification rows (GC, MOUNTAIN, SPRINT) in stage races do not carry profile data — parcours is a property of an individual stage, not a general classification.
- Q: How to get profile data for future one-day classics whose result page does not exist yet? → A: Fall back to the most recent previous edition of the same race. Classics typically maintain their parcours profile year over year.
- Q: Does the PCS URL replace the manual race type selector in the frontend? → A: Yes. The race type is auto-detected from the PCS URL, removing one manual step for the user.
