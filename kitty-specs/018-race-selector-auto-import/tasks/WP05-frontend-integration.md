---
work_package_id: WP05
title: Frontend Integration & Wiring
lane: planned
dependencies:
- WP03
- WP04
subtasks:
- T022
- T023
- T024
- T025
phase: Phase 3 - Integration
assignee: ''
agent: ''
shell_pid: ''
review_status: ''
reviewed_by: ''
history:
- timestamp: '2026-04-04T21:24:32Z'
  lane: planned
  agent: system
  shell_pid: ''
  action: Prompt generated via /spec-kitty.tasks
requirement_refs:
- FR-004
- FR-007
- FR-008
- FR-009
---

# Work Package Prompt: WP05 – Frontend Integration & Wiring

## Implement Command

```bash
spec-kitty implement WP05 --base WP04
```

Note: WP05 depends on both WP03 and WP04. Since `--base` accepts one value, base on WP04 (frontend changes) and ensure WP03 (backend) has been merged to the target branch.

## Objectives & Success Criteria

- `RiderInput` component uses `RaceSelector` instead of manual URL inputs.
- Manual URL fallback is available as a collapsible section.
- Selecting a race triggers parallel race profile fetch + GMV auto-import.
- On GMV match success: riders auto-populate in the textarea.
- On GMV match failure: "no match" message shown, manual fallback expanded.
- Parent state in `index.tsx` manages the new flow correctly.
- E2E tests updated to use the combobox interaction.
- `make lint` passes. E2E tests pass.

## Context & Constraints

- **Spec**: `kitty-specs/018-race-selector-auto-import/spec.md` (all User Stories)
- **From WP03**: Backend endpoints `GET /api/races`, `GET /api/gmv-match`, `GET /api/race-profile-by-slug`
- **From WP04**: `RaceSelector` component, `useRaceCatalog`, `useGmvAutoImport`, `useRaceProfile` (slug mode)
- **Existing files to modify**:
  - `apps/web/src/features/rider-list/components/rider-input.tsx` (~277 lines)
  - `apps/web/src/routes/index.tsx` (~324 lines)
  - `apps/web/src/routes/tabs/setup-tab.tsx` (~205 lines)
  - `apps/web/tests/e2e/` (setup flow tests)
- **Key constraint**: Manual fallback MUST preserve 100% of current functionality (FR-009).

## Subtasks & Detailed Guidance

### Subtask T022 – Update RiderInput with RaceSelector + manual fallback

- **Purpose**: Replace the Race URL and Game URL inputs with the RaceSelector combobox. Add a collapsible manual fallback section.
- **Files**: `apps/web/src/features/rider-list/components/rider-input.tsx`
- **Steps**:
  1. Read the current `RiderInput` component thoroughly. It has 4 input sections:
     - Race URL input (with Globe icon, triggers `useRaceProfile`)
     - Import Price List (URL input + Fetch button)
     - Manual Rider Input textarea
     - Budget input
  2. Replace the first two sections (Race URL + Import Price List) with:
     ```
     ┌─────────────────────────────────────────────────┐
     │  Race Selector                                  │
     │  [🔍 Search races...                       ▼]   │  ← RaceSelector component
     │                                                 │
     │  ▸ Enter URLs manually  (collapsible)           │  ← Disclosure/accordion
     │    ┌───────────────────────────────────────────┐ │
     │    │ Race URL: [________________________]      │ │
     │    │ Game URL: [_______________] [Fetch]       │ │
     │    └───────────────────────────────────────────┘ │
     │                                                 │
     │  Race Profile Summary (if loaded)               │
     │  Rider Input textarea                           │
     │  Budget input                                   │
     │  [Analyze Riders]                               │
     └─────────────────────────────────────────────────┘
     ```
  3. Props changes to `RiderInput`:
     - Add: `races: RaceListItem[]`, `raceCatalogLoading: boolean`, `selectedRace: RaceListItem | null`, `onRaceSelect: (race: RaceListItem | null) => void`
     - Add: `gmvImportState: GmvImportState` (to show loading/success/error for GMV)
     - Keep: `text`, `onTextChange`, `budget`, `onBudgetChange`, `profileState`, `isLoading`, `onAnalyze`
     - Keep: `raceUrl`, `onRaceUrlChange`, `gameUrl`, `onGameUrlChange` (for manual fallback)
  4. Manual fallback section:
     - Use a `details`/`summary` HTML element or a simple `useState` toggle.
     - Initially collapsed. Auto-expands when GMV import fails (no match).
     - Contains the original Race URL + Import Price List inputs (unchanged logic).
  5. GMV import status display:
     - Loading: "Searching for price list..." with spinner
     - Success + matched: "Found: {postTitle}" with green check
     - Success + no match: "No price list found for this race" with yellow warning
     - Error: "Failed to search for price list" with red alert
- **Parallel?**: No — this is the main integration point.
- **Notes**:
  - The RaceProfileSummary component should still render below the selector (it already handles its own loading/error states).
  - The textarea should be auto-populated when GMV import succeeds (parent handles this via effect in T023).
  - Don't remove the old URL-based code — wrap it in the collapsible fallback section.

### Subtask T023 – Update index.tsx parent state management

- **Purpose**: Wire the new race selection flow into the parent page state.
- **Files**: `apps/web/src/routes/index.tsx`
- **Steps**:
  1. Add new state:
     ```typescript
     const [selectedRace, setSelectedRace] = useState<RaceListItem | null>(null);
     ```
  2. Add hooks:
     ```typescript
     const raceCatalog = useRaceCatalog();
     const { state: gmvImportState, importForRace, reset: resetGmvImport } = useGmvAutoImport();
     ```
  3. Modify `useRaceProfile` input:
     - When `selectedRace` is set: use slug mode `{ mode: 'slug', raceSlug: selectedRace.raceSlug, year: selectedRace.year }`
     - When `raceUrl` is set (manual fallback): use URL mode `{ mode: 'url', url: raceUrl }`
     - When neither: `null` (idle)
  4. Handle race selection:
     ```typescript
     const handleRaceSelect = useCallback((race: RaceListItem | null) => {
       setSelectedRace(race);
       if (race) {
         // Clear manual inputs
         setRaceUrl('');
         setGameUrl('');
         // Trigger GMV auto-import
         importForRace(race.raceSlug, race.raceName, race.year);
       } else {
         resetGmvImport();
       }
     }, [importForRace, resetGmvImport]);
     ```
  5. Auto-populate riders on GMV success:
     ```typescript
     useEffect(() => {
       if (gmvImportState.status === 'success' && gmvImportState.data.matched && gmvImportState.data.riders) {
         const riderLines = gmvImportState.data.riders
           .map((r) => `${r.name}, ${r.team}, ${r.price}`)
           .join('\n');
         setRiderText(riderLines);
       }
     }, [gmvImportState]);
     ```
  6. Update `handleAnalyze` to use `selectedRace` data when available:
     - `raceType` from `selectedRace.raceType` or from `profileState.data.raceType`
     - `raceSlug` from `selectedRace.raceSlug`
     - `year` from `selectedRace.year`
  7. Update `handleFullReset` to also clear `selectedRace` and `resetGmvImport()`.
- **Parallel?**: No — depends on component changes in T022.
- **Notes**: Keep `raceUrl` and `gameUrl` state for the manual fallback. They coexist with `selectedRace` — when `selectedRace` is set, manual inputs are hidden; when manual mode is active, `selectedRace` is null.

### Subtask T024 – Update SetupTab props interface

- **Purpose**: Pass new props through SetupTab to RiderInput.
- **Files**: `apps/web/src/routes/tabs/setup-tab.tsx`
- **Steps**:
  1. Update `SetupTabProps` to include:
     ```typescript
     // New props
     races: RaceListItem[];
     raceCatalogLoading: boolean;
     selectedRace: RaceListItem | null;
     onRaceSelect: (race: RaceListItem | null) => void;
     gmvImportState: GmvImportState;
     ```
  2. Pass these through to `RiderInput`.
  3. The SetupTab component itself stays thin — it just passes props down and renders the preview panel.
- **Parallel?**: Yes — simple prop threading, can proceed alongside T022.

### Subtask T025 – Update E2E tests for new setup flow

- **Purpose**: Update Playwright tests to work with the new combobox-based setup instead of URL inputs.
- **Files**: `apps/web/tests/e2e/` (check existing setup flow tests)
- **Steps**:
  1. Read existing E2E tests that interact with the setup tab.
  2. Update test flows:
     - Old: type URL into race URL input → wait for profile → type game URL → click fetch → wait for riders → click analyze
     - New: click combobox → type race name → select from dropdown → wait for profile + riders auto-populate → click analyze
  3. Add `data-testid` attributes to key elements in `RaceSelector`:
     - `data-testid="race-selector-trigger"` on the combobox trigger
     - `data-testid="race-selector-input"` on the search input
     - `data-testid="race-selector-item"` on each item (with race slug)
  4. Also test the manual fallback:
     - Click "Enter URLs manually" → verify old inputs appear → complete flow manually
  5. Playwright combobox interaction pattern:
     ```typescript
     // Open combobox
     await page.getByTestId('race-selector-trigger').click();
     // Type to filter
     await page.getByTestId('race-selector-input').fill('Catalunya');
     // Select item
     await page.getByTestId('race-selector-item').filter({ hasText: 'Volta a Catalunya' }).click();
     // Wait for auto-import
     await page.waitForSelector('[data-testid="gmv-import-status"]');
     ```
- **Parallel?**: Yes — can proceed once T022's `data-testid` attributes are agreed upon.
- **Notes**: E2E tests run against a seeded DB. Ensure the seed includes races from 2024+ so the combobox has data.

## Risks & Mitigations

- **Breaking existing flow**: Manual fallback preserves all current functionality. E2E tests verify both paths.
- **E2E flakiness**: Combobox interactions can be flaky in Playwright. Use `data-testid` selectors and `waitForSelector` for stability.
- **State complexity**: `selectedRace` vs `raceUrl`/`gameUrl` coexistence. Clear separation: combobox sets `selectedRace`, manual inputs set `raceUrl`/`gameUrl`. They are mutually exclusive in practice.

## Review Guidance

- Test the full flow manually: open app → select race from combobox → verify profile loads + riders populate → click analyze.
- Test manual fallback: expand manual section → enter URLs → verify old flow works.
- Test GMV failure case: select a race that has no GMV match → verify "no match" message + manual fallback expands.
- Verify no regressions in existing E2E tests.
- Run `make lint`.

## Activity Log

- 2026-04-04T21:24:32Z – system – lane=planned – Prompt created.
