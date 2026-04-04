# Feature Specification: Race Selector with Auto Price Import

**Feature Branch**: `018-race-selector-auto-import`  
**Created**: 2026-04-04  
**Status**: Draft  
**Input**: Replace manual URL inputs in Setup tab with a single searchable combobox that auto-constructs PCS URL and auto-imports GMV price list via WordPress API fuzzy matching

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Select a Race from the Combobox (Priority: P1)

The user opens the Setup tab and sees a single searchable combobox listing known races (from 2024 onwards). They type part of a race name (e.g., "Catalunya") and the list filters down. They can also filter by race type (Grand Tour, classic, stage race, etc.) to narrow options. Upon selecting a race, the system automatically constructs the PCS URL and fetches the race profile.

**Why this priority**: This is the foundation — without race selection, nothing else works. It eliminates the manual PCS URL copy-paste which is the most frequent friction point.

**Independent Test**: Can be tested by selecting a race and verifying the race profile loads correctly without manually entering a URL.

**Acceptance Scenarios**:

1. **Given** the user opens the Setup tab, **When** they type "Catalunya" in the combobox, **Then** the list filters to show "Volta a Catalunya" entries (2024, 2025, 2026, etc.)
2. **Given** the user selects "Volta a Catalunya 2026", **When** the selection is confirmed, **Then** the system auto-constructs the PCS URL and fetches the race profile (stages, parcours distribution, race type)
3. **Given** the user applies the "Grand Tour" filter, **When** they open the combobox, **Then** only Grand Tour races appear (Tour de France, Giro, Vuelta)
4. **Given** the database has races from 2022 to 2026, **When** the combobox loads, **Then** only races from 2024 onwards are listed

---

### User Story 2 - Auto-Import Price List from GMV (Priority: P1)

After selecting a race, the system automatically searches the GrandesMiniVueltas WordPress API for a matching price list post. If a unique match is found, the price list is imported and riders are populated — zero manual intervention.

**Why this priority**: This is the second half of the core value proposition. Together with Story 1, it reduces the setup from "find 2 URLs, copy, paste" to "select race, done."

**Independent Test**: Can be tested by selecting a known race and verifying riders are auto-populated from the GMV price list.

**Acceptance Scenarios**:

1. **Given** the user selects "Volta a Catalunya 2026", **When** the backend searches cached GMV posts, **Then** it fuzzy-matches the post titled "Volta a Catalunya 2026" and auto-imports the price list
2. **Given** GMV posts are cached, **When** the user selects a race, **Then** the price list import does not require a separate network request to the GMV WordPress API (uses cache)
3. **Given** the GMV post title is "Tour de Flandes ME 2026" and the race name is "Ronde van Vlaanderen 2026", **When** fuzzy matching runs, **Then** it successfully matches despite naming differences
4. **Given** the backend finds no matching GMV post, **When** the search completes, **Then** the system shows a message indicating no match was found and prompts manual URL entry

---

### User Story 3 - Manual URL Fallback (Priority: P2)

When the automatic flow cannot find a match (new race not in DB, or no GMV post found), the user can expand a manual input section to enter URLs directly, preserving the current workflow as a fallback.

**Why this priority**: Essential safety net but secondary to the automated flow. Most races will be in the DB; this handles the edge cases.

**Independent Test**: Can be tested by expanding the manual section, entering URLs, and verifying the existing import flow works unchanged.

**Acceptance Scenarios**:

1. **Given** the automatic GMV match fails, **When** the user sees the "no match" message, **Then** a manual URL input section becomes visible
2. **Given** the user wants to analyze a race not in the database, **When** they expand the manual input section, **Then** they can enter PCS URL and GMV URL as before
3. **Given** the user has manually entered URLs, **When** they proceed, **Then** the existing race profile fetch and price import flows work identically to today

---

### Edge Cases

- What happens when the GMV WordPress API is down or unreachable? The system should gracefully fall back to manual URL input with an appropriate message.
- What happens when a race exists in the DB but has no corresponding GMV post (e.g., a non-GMV race)? The PCS profile loads but prices show "no match found" with manual fallback.
- What happens when a race slug in the DB doesn't match any PCS race (stale data)? The race profile fetch fails gracefully with an error message.
- What happens when the GMV cache expires mid-session? The next request triggers a cache refresh transparently.
- How does the system handle GMV posts with similar names (e.g., "E3 Harelbeke 2026" vs "E3 Saxo Classic 2026")? Fuzzy matching must use a confidence threshold; ambiguous matches are treated as no match.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST provide a searchable combobox listing distinct races from the database, filtered to year >= 2024
- **FR-002**: System MUST support filtering the race list by race type (Grand Tour, classic, stage race)
- **FR-003**: Combobox MUST support fuzzy text search on race name
- **FR-004**: Upon race selection, system MUST auto-construct the PCS URL from the race slug and year, and fetch the race profile
- **FR-005**: System MUST fetch and cache men's race posts from the GMV WordPress API (categories 23 and 21), excluding posts containing "Equipos y elecciones" or "Calendario" in the title
- **FR-006**: System MUST fuzzy-match the selected race name against cached GMV post titles to find the corresponding price list
- **FR-007**: When a unique GMV match is found (above confidence threshold), the system MUST auto-import the price list and populate the rider list
- **FR-008**: When no GMV match is found, the system MUST display a message and show a manual URL input fallback
- **FR-009**: The manual URL fallback MUST support the existing workflow (PCS URL + GMV URL inputs)
- **FR-010**: GMV post cache MUST have a configurable TTL (default: a few hours) and refresh transparently
- **FR-011**: System MUST only display men's race posts from GMV (no women's or sub-23 categories)

### Key Entities

- **Race Catalog Entry**: A distinct race known to the system — race slug, display name, race type, year. Derived from historical results data.
- **GMV Post**: A cached reference to a GrandesMiniVueltas WordPress post — post title, post URL, publication date. Represents a potential price list source.
- **GMV Match Result**: The outcome of fuzzy-matching a race name against cached GMV posts — matched post URL, confidence score, or "no match."

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Users can go from opening the Setup tab to having riders populated in under 10 seconds (vs. current ~60 seconds of manual URL finding and pasting)
- **SC-002**: 90%+ of races that exist both in the database and on GMV are successfully auto-matched without manual intervention
- **SC-003**: The manual fallback preserves 100% of current functionality — no regression in the existing URL-based workflow
- **SC-004**: The GMV post cache serves requests without additional network calls for the duration of its TTL
