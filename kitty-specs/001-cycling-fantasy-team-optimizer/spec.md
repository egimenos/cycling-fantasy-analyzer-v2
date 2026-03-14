# Feature Specification: Cycling Fantasy Team Optimizer

**Feature Branch**: `001-cycling-fantasy-team-optimizer`
**Created**: 2026-03-14
**Status**: Draft
**Mission**: software-dev

## Overview

A web application with two distinct layers:

1. **Data layer**: A scraping and persistence pipeline that continuously collects and stores cyclist results from procyclingstats.com. This historical dataset is the foundation that makes meaningful scoring possible.
2. **UI layer**: A stateless interface where the user pastes a rider price list for a specific race. The system queries the persisted results, computes a score per rider (function of price and historical performance), displays the ranked list, and computes the optimal 9-rider team within the hillios budget. No session state is required in the UI.

**Target game**: [Grandes miniVueltas](https://grandesminivueltas.com) — 9 riders per team, budget in hillios (1,500H–2,000H depending on race type), points awarded for GC results, mountain passes, sprint intermediates, and daily stage rankings.

---

## User Scenarios & Testing *(mandatory)*

### User Story 0 - Scrape and Persist PCS Results (Priority: P0)

An operator (the app owner) runs the data pipeline to scrape race results from procyclingstats.com and store them persistently. This must happen before any scoring is possible. The pipeline should cover all relevant races (Grand Tours, classics, mini-tours) for at least the last 2 seasons.

**Why this priority**: The entire scoring system depends on this data. Without it, the app cannot compute meaningful rider scores.

**Independent Test**: Can be tested by running the pipeline and verifying that the data store contains race results for a known set of riders and races (e.g., TdF 2024 GC top-20).

**Acceptance Scenarios**:

1. **Given** the pipeline is run, **When** it completes, **Then** the data store contains GC results, stage wins, mountain classification, and sprint classification data for all scraped races.
2. **Given** a race was already scraped, **When** the pipeline runs again, **Then** it updates existing records without creating duplicates.
3. **Given** procyclingstats.com rate-limits the pipeline, **When** the limit is hit, **Then** the pipeline pauses, respects the limit, and resumes automatically.

---

### User Story 1 - Load Race Rider List (Priority: P1)

A user navigates to the app for a specific race (e.g., Tour de France 2025). They paste the rider list and prices copied from the Grandes miniVueltas race page. The system parses the content and displays a clean table of all available riders with their team and price in hillios.

**Why this priority**: Without this input step, no other feature is possible. It is the entry point for all analysis.

**Independent Test**: Can be fully tested by pasting a rider list and verifying that the app correctly displays all rider names, teams, and prices in a structured table.

**Acceptance Scenarios**:

1. **Given** a user has copied a rider price list from Grandes miniVueltas, **When** they paste it into the input area and confirm, **Then** the system displays a table with all riders showing name, team, and price in hillios.
2. **Given** a pasted list contains formatting inconsistencies (extra spaces, mixed case), **When** the system parses it, **Then** it normalizes the data and displays clean entries without manual correction.
3. **Given** the pasted content is empty or unrecognizable, **When** the user submits, **Then** the system displays a clear error message explaining the expected format.

---

### User Story 2 - View Rider Historical Stats (Priority: P2)

After loading a rider list, a user wants to see each rider's historical performance to make informed selection decisions. The system fetches relevant stats from procyclingstats.com and displays them alongside each rider's price.

**Why this priority**: The core value proposition of the app — without stats, the tool is no better than the raw price list itself.

**Independent Test**: Can be tested by loading a rider list and verifying that at least GC finishing positions, stage wins, and mountain/sprint classification results are shown per rider for recent races.

**Acceptance Scenarios**:

1. **Given** a rider list has been loaded, **When** the system fetches stats, **Then** each rider shows their recent GC results (top-10 finishes), stage wins, mountain points, and sprint points from the last 2 seasons.
2. **Given** a rider has no profile on procyclingstats.com, **When** the system attempts to fetch data, **Then** the rider row is flagged as "no data available" and still appears in the list.
3. **Given** the procyclingstats.com service is temporarily unavailable, **When** the system tries to fetch data, **Then** it shows a warning and allows the user to proceed with manual assessment.

---

### User Story 3 - Get Optimal Team Recommendations (Priority: P3)

After the ranked rider list is displayed, the user sets the hillios budget and the system computes the optimal 9-rider team combination that maximizes total projected score within that budget.

**Why this priority**: This is the differentiating feature — it solves the combinatorial optimization problem the user cannot do manually.

**Independent Test**: Can be tested by verifying that the recommended team respects the budget constraint, contains exactly 9 riders, and scores higher on projected points than a randomly assembled budget-compliant team.

**Acceptance Scenarios**:

1. **Given** a rider list with scores is loaded and a budget is set, **When** the user requests the optimal team, **Then** the system displays the best team combination with total cost ≤ budget and maximum projected score.
2. **Given** a user wants to lock specific riders into the selection, **When** they mark riders as "must include", **Then** the recommendation only shows teams that include those riders.
3. **Given** the budget is 2,000H, **When** the user views the recommended team, **Then** each rider shows their individual score, price, and the team's total projected score breakdown by scoring category.

---

### User Story 4 - Manual Team Builder (Priority: P4)

The user wants to manually assemble their team, selecting and deselecting riders from the list while seeing live budget consumption and a projected points estimate.

**Why this priority**: Users may have knowledge or intuitions not captured in historical stats (e.g., a rider's recent form, course profile fit) and need manual override capability.

**Independent Test**: Can be tested by manually selecting 9 riders and verifying that the budget counter updates correctly and a projected score is shown.

**Acceptance Scenarios**:

1. **Given** a rider list is loaded, **When** a user selects a rider, **Then** the rider is added to the team panel and the remaining budget decreases by the rider's price.
2. **Given** a user has selected 8 riders and tries to add a 10th, **When** they select another rider, **Then** the system prevents the selection and prompts them to remove a rider first.
3. **Given** a team is fully assembled, **When** the user views the summary, **Then** they see total cost, remaining budget, and projected points broken down by scoring category.

---

### Edge Cases

- When a rider name does not exactly match PCS, the system uses fuzzy matching on both name and team name simultaneously to automatically resolve the most probable profile match.
- How does the system handle riders who have just turned pro and have no historical data?
- What if the budget for a race is non-standard (e.g., 1,750H)?
- How does the system behave when procyclingstats.com blocks or rate-limits scraping requests?
- What if the same rider appears twice in the pasted list (duplicate entry)?

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-000**: System MUST include a data pipeline that scrapes race results from procyclingstats.com and persists them in a local data store. This pipeline runs independently of the UI and must be executable on demand or on a schedule.
- **FR-001**: System MUST accept a plain-text paste of rider names, teams, and prices in the format used by Grandes miniVueltas race pages.
- **FR-002**: System MUST parse and display all riders with their team affiliation and price in hillios.
- **FR-003**: System MUST query the persisted historical results for each rider in the pasted list (not fetch live from PCS at query time) to compute scores.
- **FR-004**: System MUST display per-rider statistics including: recent GC results (last 2 seasons), stage wins, mountain classification finishes, and sprint classification finishes.
- **FR-004b**: System MUST compute and display a composite score per rider — a function of price (hillios) and projected historical performance — and sort the rider list by this score descending.
- **FR-005**: System MUST compute the optimal 9-rider team (knapsack optimization) within a configurable hillios budget, maximizing total projected score.
- **FR-006**: System MUST rank recommended teams by projected points using a weighted model: historical results filtered by race type (Grand Tour / classic / mini-tour), with temporal decay weights (current season ×1.0, previous ×0.6, two seasons ago ×0.3), computing per-category projections (GC, stage wins, mountain, sprint, daily ranking) and applying the Grandes miniVueltas scoring rules (GC: up to 200pts, mountain HC: 12pts, sprint intermediates: up to 6pts, daily stage: 15pts for 1st).
- **FR-007**: System MUST display at least the top 5 recommended teams with itemized cost and projected score breakdown.
- **FR-008**: Users MUST be able to lock specific riders as "must include" and exclude others from recommendations.
- **FR-009**: System MUST provide a manual team builder where users select riders and see live budget and projected score updates.
- **FR-010**: System MUST validate that a manual team has exactly 9 riders and stays within budget before displaying final summary.
- **FR-011**: System MUST automatically resolve rider identity via fuzzy matching using both rider name and team name against procyclingstats.com profiles, without requiring user intervention. If no match exceeds the confidence threshold, the rider is flagged as "no data available".
- **FR-011b**: The fuzzy matching confidence threshold must be tunable to balance precision vs. recall.
- **FR-012**: System MUST allow the user to set the race budget (hillios) before generating recommendations.

### Key Entities

- **Rider**: A professional cyclist tracked in the system. Has a canonical identity (name + team) linked to a procyclingstats.com profile. Identified via fuzzy matching on name + team.
- **RaceResult**: A persisted historical result for a rider in a specific race. Includes: race name, race type (Grand Tour / classic / mini-tour), season, GC position, stage wins, mountain classification finish, sprint classification finish, and daily stage results. Scraped from procyclingstats.com and stored persistently.
- **RiderScore**: A computed score for a rider in the context of a specific upcoming race type. Derived from RaceResults using the temporal decay model (×1.0 / ×0.6 / ×0.3) and Grandes miniVueltas scoring weights. Computed on-demand, not stored.
- **PriceListEntry**: A rider entry from the user's pasted price list for a specific race. Contains name, team, and price in hillios. Ephemeral — exists only for the current session.
- **TeamSelection**: A set of exactly 9 PriceListEntries assembled for a race. Has a total cost and projected score. Ephemeral — not persisted.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can go from pasting a rider list to seeing enriched stats for all riders in under 60 seconds.
- **SC-002**: The top recommended team consistently scores higher projected points than a randomly assembled budget-compliant team in at least 80% of test cases.
- **SC-003**: Users can complete the full workflow (paste list → view stats → get recommendations → finalize team) without reading any documentation.
- **SC-004**: The system correctly parses rider lists from Grandes miniVueltas for at least the last 3 published races without manual correction.
- **SC-005**: Budget constraints are respected in 100% of generated recommendations — no team exceeds the configured hillios limit.

---

## Assumptions

- The format of rider price lists on Grandes miniVueltas is consistent enough across races to be parsed with a single parser (may need minor adjustments per race).
- procyclingstats.com allows scraping for personal/non-commercial use; rate limiting and polite scraping practices will be applied.
- Historical data from the last 2 seasons is sufficient for projecting performance in upcoming races.
- The Grandes miniVueltas scoring system remains stable; the system is designed around the rules documented at the time of development.
- Initial version targets a single user with no authentication or multi-user support needed.
- The application is designed to run locally (`localhost`) as the primary deployment target, with the option to deploy to a public web server when needed.
- The UI is stateless — no session history between visits is required. Each use starts fresh with a new paste.
- The system requires a persistent data store for scraped PCS race results. This is a backend concern, separate from the UI's statelesness.

---

## Clarifications

### Session 2026-03-14

- Q: Where will the application run? → A: Both — designed to run locally (`localhost`) as the primary target, with the ability to deploy to a public web server accessible from any device.
- Q: How should the projected rider score be calculated? → A: Per-category model with race type filtering and temporal decay — historical results from the same race type (GT/classic/mini-tour), weighted by recency (×1.0 / ×0.6 / ×0.3 per season), computing projected probability per scoring category (GC, stages, mountain, sprint) and applying the Grandes miniVueltas scoring rules.
- Q: Does the UI need data persistence between sessions? → A: The UI is stateless (no session, no user history). However, the system DOES require a persistent backend data store: a pipeline that scrapes and stores PCS results, from which scores are computed when a rider list is received. Without persisted data, scores would not be meaningful.
- Q: How to resolve name mismatches between the pasted list and PCS? → A: Always automatic fuzzy matching, using name + team as combined signals (both are available in the price list and on PCS), without user intervention.
- Q: Is it necessary to export the final selected team? → A: Not for now — viewing it on screen is sufficient.
- Q: (User clarification) Does persistence apply only to UI sessions or also to PCS data? → A: The system needs to scrape AND persist PCS results in a backend data store. Without that persisted data, scores are not meaningful. The UI is stateless, but the backend data layer is permanent.
