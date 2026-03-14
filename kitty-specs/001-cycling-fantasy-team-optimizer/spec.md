# Feature Specification: Cycling Fantasy Team Optimizer

**Feature Branch**: `001-cycling-fantasy-team-optimizer`
**Created**: 2026-03-14
**Status**: Draft
**Mission**: software-dev

## Overview

A web application that helps users select the best team of 9 cyclists for the Grandes miniVueltas fantasy cycling game. Users paste the official rider price list for a given race, the system enriches it with historical performance data from procyclingstats.com, and recommends optimal team combinations within the hillios budget.

**Target game**: [Grandes miniVueltas](https://grandesminivueltas.com) — 9 riders per team, budget in hillios (1,500H–2,000H depending on race type), points awarded for GC results, mountain passes, sprint intermediates, and daily stage rankings.

---

## User Scenarios & Testing *(mandatory)*

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

After stats are loaded, the user wants the system to suggest the best possible teams of 9 riders within the hillios budget, ranked by projected point potential based on historical performance and the Grandes miniVueltas scoring rules.

**Why this priority**: This is the differentiating feature — it saves the user from manually calculating hundreds of combinations.

**Independent Test**: Can be tested by verifying that the top recommended teams respect the budget constraint, contain exactly 9 riders, and the top-ranked team scores higher on the projected metric than a randomly assembled team.

**Acceptance Scenarios**:

1. **Given** a rider list with stats is loaded and a budget is set, **When** the user requests recommendations, **Then** the system displays the top 5 team combinations ranked by projected points, each with total cost ≤ budget.
2. **Given** a user wants to lock specific riders into the selection, **When** they mark riders as "must include", **Then** the recommendations only show teams that include those riders.
3. **Given** the budget is 2,000H and all recommended teams cost exactly 2,000H, **When** the user views them, **Then** each team shows itemized cost and projected point breakdown by scoring category.

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

- What happens when a rider name in the pasted list does not exactly match any profile on procyclingstats.com (e.g., accented characters, abbreviations)?
- How does the system handle riders who have just turned pro and have no historical data?
- What if the budget for a race is non-standard (e.g., 1,750H)?
- How does the system behave when procyclingstats.com blocks or rate-limits scraping requests?
- What if the same rider appears twice in the pasted list (duplicate entry)?

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST accept a plain-text paste of rider names, teams, and prices in the format used by Grandes miniVueltas race pages.
- **FR-002**: System MUST parse and display all riders with their team affiliation and price in hillios.
- **FR-003**: System MUST fetch historical performance data from procyclingstats.com for each rider in the list.
- **FR-004**: System MUST display per-rider statistics including: recent GC results (last 2 seasons), stage wins, mountain classification finishes, and sprint classification finishes.
- **FR-005**: System MUST generate optimal 9-rider team combinations within a configurable hillios budget.
- **FR-006**: System MUST rank recommended teams by projected points using the Grandes miniVueltas scoring system (GC: up to 200pts, mountain HC: 12pts, sprint intermediates: up to 6pts, daily stage: 15pts for 1st).
- **FR-007**: System MUST display at least the top 5 recommended teams with itemized cost and projected score breakdown.
- **FR-008**: Users MUST be able to lock specific riders as "must include" and exclude others from recommendations.
- **FR-009**: System MUST provide a manual team builder where users select riders and see live budget and projected score updates.
- **FR-010**: System MUST validate that a manual team has exactly 9 riders and stays within budget before displaying final summary.
- **FR-011**: System MUST handle gracefully the cases where rider data is unavailable on procyclingstats.com.
- **FR-012**: System MUST allow the user to set the race budget (hillios) before generating recommendations.

### Key Entities

- **Race**: A specific cycling competition for which the user is building a team. Has a name, budget in hillios, and an associated rider list.
- **Rider**: A cyclist available for selection. Has a name, team affiliation, price in hillios, and optionally a linked profile on procyclingstats.com.
- **RiderStats**: Historical performance data for a rider. Includes GC positions, stage wins, mountain classification results, and sprint classification results from recent seasons.
- **TeamSelection**: A set of exactly 9 riders assembled for a race. Has a total cost, projected points, and optional lock/exclude flags per rider.
- **ProjectedScore**: An estimated point total for a team based on historical performance weighted against the Grandes miniVueltas scoring rules.

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
