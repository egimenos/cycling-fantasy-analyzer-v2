# Feature Specification: Peloton Design System Redesign

**Feature Branch**: `009-peloton-design-system-redesign`
**Created**: 2026-03-22
**Status**: Draft
**Input**: Complete UX/UI redesign based on Google Stitch designs ("The Technical Peloton" design system), restructuring the SPA into a tab-based progressive flow.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Design System Foundation (Priority: P1)

The user opens the application and sees an entirely new visual identity: a dark, professional interface inspired by sports-science cockpits. The color palette uses deep navy tones (#0b1326 base) with layered surfaces for depth. Headlines use Manrope (bold, wide), UI labels use Inter, and all numeric data (scores, prices, budgets) use JetBrains Mono for perfect column alignment. There are no 1px solid borders anywhere — sections are separated by tonal shifts, spacing, and subtle shadows. The top navigation bar uses glassmorphism (semi-transparent with backdrop blur).

**Why this priority**: The design system is the foundation everything else builds on. Without the color tokens, typography, and surface hierarchy, no other screen can be implemented correctly.

**Independent Test**: Open the app and verify the visual language matches the design system: dark background, correct fonts loading, no hard borders between sections, glassmorphic nav bar, correct color tokens applied.

**Acceptance Scenarios**:

1. **Given** the app loads, **When** the user views any screen, **Then** the background uses the 4-layer surface hierarchy (surface-dim #0b1326, surface-container-low #131b2e, surface-container-high #222a3d, surface-bright #31394d)
2. **Given** any numeric value is displayed, **When** the user inspects the font, **Then** it uses JetBrains Mono
3. **Given** any headline is displayed, **When** the user inspects the font, **Then** it uses Manrope with extrabold weight
4. **Given** any content sections are adjacent, **When** the user inspects the boundary, **Then** there are no 1px solid borders — separation is achieved via tonal shifts, spacing, or shadows at max 4% opacity
5. **Given** the top navigation bar is visible, **When** the user views it, **Then** it has a semi-transparent background with backdrop blur effect

---

### User Story 2 - Tab-Based Progressive Flow (Priority: P1)

The user navigates the app through a horizontal tab bar with 4 tabs: Setup, Dashboard, Optimization, and Roster. Tabs unlock progressively as the user completes each step. Only the Setup tab is accessible initially. After analyzing, the Dashboard tab unlocks. From Dashboard, clicking "Get Optimal Team" unlocks the Optimization tab. Completing a team (manually from Dashboard or by accepting from Optimization) unlocks the Roster tab.

**Why this priority**: The tab structure is the architectural backbone of the redesign — it changes how the user interacts with every feature.

**Independent Test**: Navigate through the full flow A→B→C→D and verify tab states, locking behavior, and reset logic.

**Acceptance Scenarios**:

1. **Given** the app loads fresh, **When** the user sees the tab bar, **Then** only the "Setup" tab is active; Dashboard, Optimization, and Roster tabs are visible but disabled
2. **Given** the user has completed analysis, **When** the analyze response returns, **Then** the "Dashboard" tab unlocks and the view transitions to it automatically
3. **Given** the user is on Dashboard, **When** they click "Get Optimal Team" and results return, **Then** the "Optimization" tab unlocks and the view transitions to it
4. **Given** the user is on Dashboard, **When** they manually select 9 riders, **Then** the "Roster" tab unlocks and a "Review Team" CTA appears to navigate to it
5. **Given** the user is on Optimization, **When** they click "Apply to Roster", **Then** the "Roster" tab unlocks and the view transitions to it
6. **Given** the user is on Dashboard or later, **When** they click "Analyze" again (or modify inputs in Setup), **Then** all tabs from Dashboard onward reset and the flow restarts from Setup
7. **Given** the user is on Optimization, **When** they navigate back to Dashboard and change a lock/exclude, **Then** the Optimization tab resets (must re-optimize)

---

### User Story 3 - Roster Setup Screen (Priority: P2)

The user arrives at the Setup tab and sees a split-panel layout. The left panel (5 columns) contains all input controls: Race URL field with auto-detect indicator, Import Price List with fetch button, a manual rider list textarea, and budget input. The right panel (7 columns) shows an empty-state preview with a descriptive message and skeleton placeholders. A prominent "Run Optimization Engine" CTA button sits at the bottom of the input panel. A footer summary bar shows selected riders count and budget allocation status.

**Why this priority**: This is the entry point — the first thing users see. It must work correctly before any other screen matters.

**Independent Test**: Load the app, fill in inputs, press Analyze, and verify the data is sent correctly and the view transitions to Dashboard.

**Acceptance Scenarios**:

1. **Given** the Setup tab is active, **When** the user views the layout, **Then** inputs are on the left (5/12 columns) and the preview area is on the right (7/12 columns)
2. **Given** no data has been entered, **When** the user views the right panel, **Then** an empty state is shown with an icon, title "No Roster Detected", and a descriptive message
3. **Given** the user has entered a race URL, rider list, and budget, **When** they click "Run Optimization Engine", **Then** the analysis is triggered and the view transitions to Dashboard on success
4. **Given** the user views the footer summary, **When** no analysis has run, **Then** it shows "-- / --" for riders and "0 / [budget]" for budget allocation with a "System Ready" status

---

### User Story 4 - Main Dashboard Screen (Priority: P2)

After analysis, the user sees the Dashboard tab with three sections: (1) a race profile summary bar at the top showing race name, type badge, rider/matched counts, and analysis status; (2) a collapsible configuration section summarizing the current inputs; (3) a main content area split between a rider table (70% width) and a Team Builder sidebar (30% width).

The rider table shows columns: checkbox, rank, rider name, team, price, score (color-coded badge), pts/H ratio, match status, and action buttons (lock/exclude). Rows are expandable — clicking a row reveals a detail panel with category score cards (GC, Stage, MTN, SPR with color-coded left borders) and a 3-season performance history table.

The Team Builder sidebar shows: active roster count (X/9), rider cards with remove buttons, empty slot placeholders with dashed borders, remaining budget progress bar, projected score, and a "Get Optimal Team" CTA button.

**Why this priority**: This is the core working screen where users spend most of their time analyzing riders and building teams.

**Independent Test**: After analysis, verify the table displays correct data, rows expand with detail panels, lock/exclude actions work, and the Team Builder sidebar updates in real-time.

**Acceptance Scenarios**:

1. **Given** analysis is complete, **When** the Dashboard loads, **Then** a race profile bar shows the race name, type (e.g. "Grand Tour"), total riders, matched riders, and a green "Analyzed" status indicator
2. **Given** the Dashboard is active, **When** the user views the configuration section, **Then** it shows a collapsible summary of inputs (URL, price list, budget) with an "Edit Inputs" button
3. **Given** the rider table is displayed, **When** the user clicks a rider row, **Then** it expands to show category scores (GC/Stage/MTN/SPR as color-coded cards) and performance history table
4. **Given** a rider row is visible, **When** the user clicks the lock icon, **Then** the rider is locked (icon fills, row gets a subtle highlight), and the Team Builder sidebar updates
5. **Given** a rider row is visible, **When** the user clicks the exclude icon, **Then** the rider is excluded (row dims with reduced opacity and grayscale), and the rider cannot be selected
6. **Given** riders are added to the team, **When** the Team Builder sidebar updates, **Then** it shows rider cards with name, price, and role; empty slots show dashed borders; the budget bar reflects remaining budget; the projected score updates
7. **Given** 9 riders are selected, **When** the team is complete, **Then** a "Review Team" button appears enabling navigation to the Roster tab

---

### User Story 5 - Optimization Results Screen (Priority: P3)

When the user requests optimization from the Dashboard, the Optimization tab shows the results. The header displays "OPTIMAL CONFIGURATION" with the projected total score and budget efficiency percentage. Below, a point distribution analysis bar visualizes the team composition by category (GC/Stage/Mountain/Sprint with corresponding colors). The primary lineup is shown as a grid of rider cards (3 columns) displaying rider name, team, and projected points.

**Why this priority**: The optimization view adds significant value but depends on the Dashboard being complete first.

**Independent Test**: From Dashboard, click "Get Optimal Team", verify the Optimization tab shows correct results with rider grid and distribution bar.

**Acceptance Scenarios**:

1. **Given** optimization completes, **When** the Optimization tab loads, **Then** the header shows the projected total score and budget efficiency percentage
2. **Given** the optimal lineup is displayed, **When** the user views the rider grid, **Then** 9 rider cards are shown in a 3-column grid with name, team, and projected points
3. **Given** the point distribution bar is visible, **When** the user views it, **Then** it shows colored segments for GC (blue), Stage (green), Mountain (orange), Sprint (red) proportional to team composition
4. **Given** the optimal lineup is displayed, **When** the user clicks "Apply to Roster", **Then** the optimal team is applied to the Team Builder state and the view transitions to the Roster tab

---

### User Story 6 - Final Team Roster Screen (Priority: P3)

The Roster tab shows the finalized team with a success banner ("Team Complete!"), action buttons (Reset, Copy to Clipboard), and the official 9-rider roster list with cost, projected score, and form rating for each rider. A right sidebar (4/12 columns) displays roster metrics: total projected score with comparison to global average, total expenditure progress bar, remaining budget, average cost per rider, and action buttons ("Lock Lineup & Export" as primary CTA).

**Why this priority**: This is the final step — it only matters once the team is built via either path.

**Independent Test**: Complete a team (manually or via optimizer), verify the Roster tab shows all 9 riders with correct metrics and export functionality works.

**Acceptance Scenarios**:

1. **Given** a complete team exists, **When** the Roster tab loads, **Then** a green success banner shows "Team Complete!" with Reset and Copy to Clipboard buttons
2. **Given** the roster list is displayed, **When** the user views it, **Then** each rider shows name, team, cost, projected score, and form rating
3. **Given** the first rider in the list, **When** the user views it, **Then** it is marked as "Captain" with a visual badge
4. **Given** the metrics sidebar is visible, **When** the user views it, **Then** it shows total projected score, expenditure bar (spent/total), remaining budget, and average cost per rider
5. **Given** the user clicks "Copy to Clipboard", **When** the action completes, **Then** the team roster is copied to the clipboard in a readable text format
6. **Given** the user clicks "Reset", **When** confirmed, **Then** the team is cleared, and the flow resets back to the Dashboard tab

---

### Edge Cases

- What happens when the user navigates to a disabled tab? The click is ignored and the tab shows a visual indication that it's locked.
- What happens when the API returns an error during analysis? The Setup tab shows an error alert and the Dashboard tab remains locked.
- What happens when optimization returns no valid team (budget too low)? The Optimization tab shows an appropriate message instead of an empty grid.
- What happens when the user resizes to mobile? The tab bar remains accessible, and layouts stack vertically (inputs full-width, sidebar below table).
- What happens when the user has 9 riders selected and tries to add another? The add action is prevented with a toast notification.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST implement a 4-layer surface color hierarchy using the Material Design tokens defined in the design system (surface-dim, surface-container-low, surface-container-high, surface-bright)
- **FR-002**: System MUST load and apply three font families: Manrope (headlines), Inter (UI/labels), JetBrains Mono (all numeric data)
- **FR-003**: System MUST NOT use 1px solid borders for section separation; structural definition MUST use tonal shifts, spacing, or shadows at max 4% opacity
- **FR-004**: System MUST render the top navigation bar with glassmorphism (semi-transparent background with backdrop blur)
- **FR-005**: System MUST display a horizontal tab bar with 4 tabs: Setup, Dashboard, Optimization, Roster
- **FR-006**: System MUST enforce progressive tab unlocking: Setup → Dashboard (after analysis) → Optimization (after optimization request) → Roster (after team completion)
- **FR-007**: System MUST reset all tabs from Dashboard onward when the user re-triggers analysis from Setup
- **FR-008**: System MUST invalidate downstream tabs when the user modifies state in an earlier tab (e.g., changing lock/exclude in Dashboard invalidates Optimization)
- **FR-009**: System MUST display the Setup screen with a 5/7 column split layout (inputs left, preview right)
- **FR-010**: System MUST display an empty-state preview with icon and descriptive message when no analysis has been run
- **FR-011**: System MUST display the Dashboard with a race profile summary bar showing race metadata and analysis status
- **FR-012**: System MUST provide a collapsible configuration section in the Dashboard summarizing current inputs
- **FR-013**: System MUST render the rider table with sortable columns, expandable detail rows (category scores + performance history), and lock/exclude action buttons
- **FR-014**: System MUST render rider score badges with color coding based on relative position (top 25% green, middle 50% amber, bottom 25% red)
- **FR-015**: System MUST display category scores (GC, Stage, MTN, SPR) with consistent color coding: GC=blue (#3B82F6), Stage=green (#22C55E), Mountain=orange (#F97316), Sprint=red (#EF4444)
- **FR-016**: System MUST display the Team Builder sidebar with active roster count, rider cards, empty slot placeholders, budget progress bar, and projected score
- **FR-017**: System MUST display optimization results with projected total, budget efficiency, point distribution bar by category, and 9-rider card grid
- **FR-018**: System MUST display the final roster with success banner, rider list (cost/projected/form), metrics sidebar, and Copy to Clipboard functionality
- **FR-019**: System MUST support dark theme as the primary (and initially only) theme
- **FR-020**: System MUST use sharp corners (border-radius 0.125rem) for buttons and cards, consistent with the "technical edge" aesthetic

### Key Entities

- **Tab State**: Represents the current state of each tab (locked, active, completed) and controls navigation flow
- **Design Tokens**: The set of color, typography, spacing, and elevation values from the "Technical Peloton" design system that all components reference
- **Rider Detail Panel**: The expandable section within each rider table row containing category scores and performance history

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: All 4 screens (Setup, Dashboard, Optimization, Roster) render correctly and match the approved design mockups in layout, colors, and typography
- **SC-002**: Users can complete the full flow (Setup → analyze → build team → view roster) through the tab-based interface without errors
- **SC-003**: Tab state management works correctly: progressive unlock, backward navigation preserves state, downstream invalidation on upstream changes, reset on re-analysis
- **SC-004**: All existing functionality (analyze, optimize, lock/exclude, team build, copy to clipboard) continues to work after the redesign with no regressions
- **SC-005**: The "No-Line" design principle is consistently applied: no 1px solid borders are used for section separation anywhere in the application
- **SC-006**: All numeric data throughout the app uses JetBrains Mono, all headlines use Manrope, and all UI labels use Inter
- **SC-007**: The application remains usable on viewports from 1024px to 1920px wide (desktop-first, responsive to common desktop sizes)

## Assumptions

- Dark theme is the only theme for this iteration; light theme support is deferred to a future feature.
- Rider photos are not available in the current data model and are omitted from all screens.
- "Simulation Alternatives" (alternate optimization strategies) shown in the Stitch design are not yet implemented and are omitted.
- "Risk Quotient" and "Strategy Insight" shown in the Stitch design are not yet implemented and are omitted.
- The multi-page navigation (Lineup, Riders, Stages, Rules) shown in Stitch screens 3-4 is not implemented; the app remains an SPA with tabs within a single page.
- The "Captain" designation on the final roster is purely visual (the highest-ranked rider gets the badge) — no captain-specific scoring logic exists.
- Existing E2E and unit tests will need updating to reflect the new component structure and visual changes.
- Google Fonts (Manrope, Inter, JetBrains Mono) are loaded from CDN or self-hosted; no licensing issues apply as all three are open-source fonts.
