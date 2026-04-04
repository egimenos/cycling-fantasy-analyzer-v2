---
work_package_id: WP04
title: Frontend Race Selector
lane: planned
dependencies: [WP01]
subtasks:
- T016
- T017
- T018
- T019
- T020
- T021
phase: Phase 2 - Frontend Components
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
- FR-001
- FR-002
- FR-003
---

# Work Package Prompt: WP04 – Frontend Race Selector

## Implement Command

```bash
spec-kitty implement WP04 --base WP01
```

## Objectives & Success Criteria

- `cmdk` package installed and a reusable `Combobox` primitive component exists in `apps/web/src/shared/ui/`.
- API client has `fetchRaces()` and `gmvMatch()` functions.
- `useRaceCatalog` hook fetches and caches the race list.
- `useGmvAutoImport` hook handles GMV match requests.
- `RaceSelector` component renders a searchable combobox with race type filter pills.
- `useRaceProfile` hook supports slug+year input.
- Components render correctly and handle loading/error states.
- `make lint` passes.

## Context & Constraints

- **Spec**: `kitty-specs/018-race-selector-auto-import/spec.md` (User Stories 1 & 2)
- **Plan**: `kitty-specs/018-race-selector-auto-import/plan.md`
- **Contracts**: `kitty-specs/018-race-selector-auto-import/contracts/get-races.md`, `contracts/gmv-auto-import.md`
- **Existing patterns**:
  - Select component: `apps/web/src/shared/ui/select.tsx` (Radix-based, style reference)
  - API client: `apps/web/src/shared/lib/api-client.ts` (fetch wrapper)
  - Hooks: `apps/web/src/features/rider-list/hooks/use-race-profile.ts` (AsyncState pattern)
  - Design tokens: `bg-surface-container-high`, `text-on-surface`, `border-outline-variant/15`, `focus:ring-primary-fixed`
- **From WP01**: Shared types `RaceListItem`, `RaceListResponse`, `GmvMatchResponse`
- **Note**: This WP can proceed in parallel with WP02 and WP03 (backend). Develop against expected API shapes; backend will be ready by integration time (WP05).

## Subtasks & Detailed Guidance

### Subtask T016 – Install cmdk & create Combobox primitive

- **Purpose**: Add the `cmdk` package and create a reusable combobox component following the shadcn/ui pattern (Command + Popover).
- **Files**:
  - `apps/web/package.json` (dependency)
  - `apps/web/src/shared/ui/combobox.tsx` (new file)
- **Steps**:
  1. Install `cmdk`:
     ```bash
     cd apps/web && pnpm add cmdk
     ```
  2. Create `combobox.tsx` following the shadcn/ui combobox pattern:
     ```typescript
     import * as React from 'react';
     import { Command } from 'cmdk';
     import * as Popover from '@radix-ui/react-popover';
     import { cn } from '../lib/utils';

     // Build composable parts:
     // - ComboboxRoot (Popover.Root + Command)
     // - ComboboxTrigger (button showing selected value or placeholder)
     // - ComboboxContent (Popover.Content + Command.List)
     // - ComboboxInput (Command.Input for search)
     // - ComboboxItem (Command.Item with check icon for selected)
     // - ComboboxEmpty (Command.Empty "No results" message)
     // - ComboboxGroup (Command.Group with label)
     ```
  3. Style following existing design tokens:
     - Trigger: `bg-surface-container-high text-on-surface border border-outline-variant/15 rounded-md`
     - Content: same background, with `shadow-lg` and `animate-in/animate-out`
     - Input: `border-b border-outline-variant/15` inside content
     - Item: `px-3 py-2 cursor-pointer hover:bg-surface-container-highest rounded-sm`
     - Selected item: check icon (`lucide-react` `Check`)
  4. Export all parts from the barrel.
- **Parallel?**: No — T020 (RaceSelector) depends on this.
- **Notes**:
  - `cmdk` provides built-in fuzzy filtering via `Command.Input` — no need for custom client-side search logic.
  - Radix `Popover` provides positioning, focus trap, and accessibility (escape to close, click outside).
  - The component should be generic/reusable — not race-specific. Race-specific logic goes in `RaceSelector`.

### Subtask T017 – Add fetchRaces() and gmvMatch() to api-client

- **Purpose**: API client functions for the two new backend endpoints.
- **Files**: `apps/web/src/shared/lib/api-client.ts`
- **Steps**:
  1. Add to the existing api-client:
     ```typescript
     export function fetchRaces(
       params?: { minYear?: number; raceType?: string },
       signal?: AbortSignal,
     ): Promise<ApiResult<RaceListResponse>> {
       const searchParams = new URLSearchParams();
       if (params?.minYear) searchParams.set('minYear', String(params.minYear));
       if (params?.raceType) searchParams.set('raceType', params.raceType);
       const query = searchParams.toString();
       return apiGet<RaceListResponse>(`/api/races${query ? `?${query}` : ''}`, signal);
     }

     export function gmvMatch(
       raceSlug: string,
       raceName: string,
       year: number,
       signal?: AbortSignal,
     ): Promise<ApiResult<GmvMatchResponse>> {
       const params = new URLSearchParams({
         raceSlug,
         raceName,
         year: String(year),
       });
       return apiGet<GmvMatchResponse>(`/api/gmv-match?${params}`, signal);
     }
     ```
  2. Import `RaceListResponse` and `GmvMatchResponse` from `@cycling-analyzer/shared-types`.
- **Parallel?**: Yes — independent file, no shared state with T018/T019.

### Subtask T018 – Create useRaceCatalog hook

- **Purpose**: Fetch the race catalog once on mount, provide the list for the combobox.
- **Files**: `apps/web/src/features/rider-list/hooks/use-race-catalog.ts` (new file)
- **Steps**:
  1. Create the hook:
     ```typescript
     import { useEffect, useState } from 'react';
     import { fetchRaces } from '@/shared/lib/api-client';
     import type { RaceListItem } from '@cycling-analyzer/shared-types';

     type RaceCatalogState =
       | { status: 'idle' }
       | { status: 'loading' }
       | { status: 'success'; races: RaceListItem[] }
       | { status: 'error'; error: string };

     export function useRaceCatalog() {
       const [state, setState] = useState<RaceCatalogState>({ status: 'idle' });

       useEffect(() => {
         const controller = new AbortController();
         setState({ status: 'loading' });

         fetchRaces(undefined, controller.signal).then((result) => {
           if (result.status === 'success') {
             setState({ status: 'success', races: result.data.races });
           } else {
             setState({ status: 'error', error: result.error });
           }
         });

         return () => controller.abort();
       }, []);

       return state;
     }
     ```
  2. Fetches once on mount with no refetch. The race catalog is static during a session.
  3. Uses `AbortController` for cleanup (same pattern as `useRaceProfile`).
- **Parallel?**: Yes — independent hook, different file.

### Subtask T019 – Create useGmvAutoImport hook

- **Purpose**: Handle GMV auto-match + import when a race is selected.
- **Files**: `apps/web/src/features/rider-list/hooks/use-gmv-auto-import.ts` (new file)
- **Steps**:
  1. Create the hook:
     ```typescript
     import { useCallback, useState } from 'react';
     import { gmvMatch } from '@/shared/lib/api-client';
     import type { GmvMatchResponse } from '@cycling-analyzer/shared-types';

     type GmvImportState =
       | { status: 'idle' }
       | { status: 'loading' }
       | { status: 'success'; data: GmvMatchResponse }
       | { status: 'error'; error: string };

     export function useGmvAutoImport() {
       const [state, setState] = useState<GmvImportState>({ status: 'idle' });

       const importForRace = useCallback(
         async (raceSlug: string, raceName: string, year: number) => {
           setState({ status: 'loading' });
           const result = await gmvMatch(raceSlug, raceName, year);

           if (result.status === 'success') {
             setState({ status: 'success', data: result.data });
           } else {
             setState({ status: 'error', error: result.error });
           }
         },
         [],
       );

       const reset = useCallback(() => setState({ status: 'idle' }), []);

       return { state, importForRace, reset };
     }
     ```
  2. Returns `{ state, importForRace, reset }` — follows the same pattern as `useAnalyze`.
  3. `importForRace` is called by `RaceSelector` (or parent) when a race is selected.
- **Parallel?**: Yes — independent hook, different file.

### Subtask T020 – Create RaceSelector component

- **Purpose**: The main UI component: a searchable combobox with race type filter pills, status messages, and selection callback.
- **Files**: `apps/web/src/features/rider-list/components/race-selector.tsx` (new file)
- **Steps**:
  1. Create the component:
     ```typescript
     interface RaceSelectorProps {
       races: RaceListItem[];
       isLoading: boolean;
       selectedRace: RaceListItem | null;
       onSelect: (race: RaceListItem) => void;
     }
     ```
  2. Layout structure:
     ```
     ┌──────────────────────────────────────────────┐
     │  Race type filters (optional):               │
     │  [All] [Grand Tour] [Stage Race] [Classic]   │
     │                                              │
     │  [🔍 Search races...                    ▼]   │  ← Combobox
     │     Volta a Catalunya 2026                   │
     │     Paris-Nice 2026                          │
     │     Tirreno-Adriatico 2026                   │
     │     ...                                      │
     └──────────────────────────────────────────────┘
     ```
  3. Implementation details:
     - Use the `Combobox` primitive from T016.
     - Filter pills: small buttons/badges that set a local `selectedType` state. When active, filter the races list by `raceType` before passing to combobox.
     - Each combobox item shows: `raceName (year)` — e.g., "Volta a Catalunya (2026)".
     - Group items by year in the dropdown (use `ComboboxGroup`).
     - On selection: call `onSelect(race)` callback.
     - Show a "No races found" message when filter + search yields empty results.
  4. Style:
     - Filter pills: `px-2 py-0.5 text-xs rounded-full border` with active state `bg-primary text-on-primary`.
     - Use `lucide-react` icons: `Search` for input, `ChevronDown` for trigger, `Check` for selected.
- **Parallel?**: No — depends on T016 (Combobox primitive).
- **Notes**: The component is purely presentational — it receives the races list and callbacks. State management (fetching races, triggering GMV import) happens in the parent or hooks.

### Subtask T021 – Update useRaceProfile for slug+year

- **Purpose**: Allow the race profile hook to work with a slug+year pair (from combobox selection) instead of only a full PCS URL.
- **Files**: `apps/web/src/features/rider-list/hooks/use-race-profile.ts`
- **Steps**:
  1. Current hook signature: `useRaceProfile(raceUrl: string)`.
  2. Change to accept either a URL string or a race selection:
     ```typescript
     type RaceProfileInput =
       | { mode: 'url'; url: string }
       | { mode: 'slug'; raceSlug: string; year: number };

     export function useRaceProfile(input: RaceProfileInput | null): AsyncState<RaceProfileResponse>
     ```
  3. In the `useEffect`:
     - If `mode === 'url'`: existing behavior (validate PCS URL, call `fetchRaceProfile`).
     - If `mode === 'slug'`: call new endpoint `fetchRaceProfileBySlug(raceSlug, year)`.
  4. Add `fetchRaceProfileBySlug()` to api-client (alongside T017):
     ```typescript
     export function fetchRaceProfileBySlug(
       raceSlug: string,
       year: number,
       signal?: AbortSignal,
     ): Promise<ApiResult<RaceProfileResponse>> {
       const params = new URLSearchParams({ raceSlug, year: String(year) });
       return apiGet<RaceProfileResponse>(`/api/race-profile-by-slug?${params}`, signal);
     }
     ```
  5. Keep backward compatibility: when in URL mode, the 500ms debounce and PCS URL validation still apply.
- **Parallel?**: No — changes existing hook, integration-sensitive.
- **Notes**: The manual fallback will still use URL mode. The combobox path uses slug mode.

## Risks & Mitigations

- **`cmdk` styling conflicts**: cmdk uses minimal default styles. Use `cn()` utility for Tailwind class merging.
- **Combobox performance with 200+ items**: cmdk handles filtering internally with good performance. Group by year to improve scannability.
- **Race name display**: `raceName` from DB may have inconsistent casing. The combobox displays as-is; normalize if needed later.

## Review Guidance

- Verify Combobox is generic and reusable (not race-specific).
- Verify RaceSelector renders correctly with mock data (loading, empty, populated states).
- Verify filter pills work correctly (all types, individual type, reset).
- Verify hooks use AbortController for cleanup.
- Verify `useRaceProfile` backward compatibility (URL mode still works).
- Run `make lint`.

## Activity Log

- 2026-04-04T21:24:32Z – system – lane=planned – Prompt created.
