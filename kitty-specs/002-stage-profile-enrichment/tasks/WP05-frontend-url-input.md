---
work_package_id: WP05
title: Frontend — URL Input & Profile Display
lane: planned
dependencies: [WP04]
base_branch: main
subtasks:
  - T023
  - T024
  - T025
  - T026
  - T027
history:
  - timestamp: '2026-03-19T11:19:08Z'
    lane: planned
    agent: system
    shell_pid: ''
    action: Prompt generated via /spec-kitty.tasks
depends_on: [WP04]
estimated_prompt_size: ~400 lines
priority: P2
requirement_refs:
  - FR-008
  - FR-009
type: feature
---

# Work Package Prompt: WP05 – Frontend — URL Input & Profile Display

## Objectives & Success Criteria

- Create `race-profile-summary.tsx` component displaying profile distribution visually
- Replace the race type dropdown selector with a PCS URL text input in `rider-input.tsx`
- Auto-detect race type from the profile response and pass it to the analyze endpoint
- Handle loading, error, and empty states gracefully
- `pnpm build` succeeds, component tests pass

## Context & Constraints

- **Spec**: `kitty-specs/002-stage-profile-enrichment/spec.md` — FR-008, FR-009, US2 acceptance scenarios
- **Contracts**: `kitty-specs/002-stage-profile-enrichment/contracts/api.md` — `GET /api/race-profile` response shape
- **Constitution**: Feature-Sliced Design — components under `features/rider-list/`, shadcn/ui + Tailwind CSS, no cross-feature imports
- **Existing component**: `rider-input.tsx` currently has a race type `<Select>` dropdown (grand_tour / classic / mini_tour). This is being replaced by a URL input.
- **Shared types**: `RaceProfileResponse`, `StageInfo`, `ProfileSummary` from `packages/shared-types`

**Implementation command**: `spec-kitty implement WP05 --base WP04`

## Subtasks & Detailed Guidance

### Subtask T023 – Create race-profile-summary.tsx

- **Purpose**: Visual component displaying the profile distribution of a target race.
- **Files**: `apps/web/src/features/rider-list/components/race-profile-summary.tsx` (NEW)
- **Steps**:
  1. Create a component that receives `RaceProfileResponse` as props:
     ```typescript
     interface RaceProfileSummaryProps {
       profile: RaceProfileResponse;
     }
     ```
  2. Display:
     - Race name and auto-detected race type as a badge (e.g., "Tour de France" + "Grand Tour" badge)
     - Total stage count
     - Profile distribution as a horizontal bar or badge list:
       - p1 (Flat): count with a green/flat icon
       - p2 (Hills, flat finish): count
       - p3 (Hills, uphill finish): count
       - p4 (Mountains, flat finish): count
       - p5 (Mountains, summit finish): count with a mountain icon
       - ITT count, TTT count (if > 0)
     - Use shadcn/ui `Badge` or `Card` components
     - Use Tailwind colors to differentiate profile types (e.g., green for flat, orange for hills, red for mountains)
  3. For classics (totalStages === 0): show only the race-level profile type, no stage breakdown.
- **Parallel?**: Yes — can be built independently from T024-T027.
- **Notes**: Keep the component simple and informational. No interaction needed — purely display.

### Subtask T024 – Modify rider-input.tsx — URL input

- **Purpose**: Replace the race type dropdown with a PCS URL text input field.
- **Files**: `apps/web/src/features/rider-list/components/rider-input.tsx`
- **Steps**:
  1. Remove the existing race type `<Select>` dropdown and its associated state.
  2. Add a new text input for the PCS URL:
     ```tsx
     <Input
       placeholder="Paste PCS race URL (e.g., https://www.procyclingstats.com/race/tour-de-france/2025)"
       value={raceUrl}
       onChange={(e) => setRaceUrl(e.target.value)}
     />
     ```
  3. Add state for `raceUrl` (string) and `raceProfile` (RaceProfileResponse | null).
  4. When a profile is successfully fetched, show the `<RaceProfileSummary>` component below the input.
  5. The `raceType` for the analyze request should come from `raceProfile.raceType` instead of the old dropdown.
- **Notes**: The rest of the form (rider list textarea, budget input, seasons selector) remains unchanged.

### Subtask T025 – Add API hook for race profile fetch

- **Purpose**: Debounced API call to fetch profile when URL changes.
- **Files**: `apps/web/src/features/rider-list/hooks/` or inline in `rider-input.tsx`
- **Steps**:
  1. Create a hook or effect that:
     - Watches `raceUrl` state
     - Debounces by ~500ms (to avoid fetching on every keystroke)
     - Validates URL contains `procyclingstats.com/race/` before fetching
     - Calls `GET /api/race-profile?url=${encodeURIComponent(raceUrl)}`
     - Sets `raceProfile` state on success
     - Sets error state on failure
  2. Consider using a simple `useEffect` with `setTimeout`/`clearTimeout` for debounce, or a library if already available.
  3. Request should be aborted if URL changes before response arrives (use `AbortController`).
- **Parallel?**: Yes — can be built alongside T023.

### Subtask T026 – Handle loading/error/empty states

- **Purpose**: UX polish for the URL input and profile display flow.
- **Files**: Same as T024 (`rider-input.tsx`)
- **Steps**:
  1. **Loading state**: Show a spinner or skeleton while the profile is being fetched. Use shadcn/ui `Skeleton` or a simple spinner.
  2. **Error state**: Show an inline error message below the URL input (e.g., "Could not fetch race profile. Check the URL and try again."). Use shadcn/ui `Alert` with destructive variant.
  3. **Empty state**: When no URL has been entered, show a hint text: "Enter a PCS race URL to see the race profile and auto-detect the race type."
  4. **Success state**: Show `<RaceProfileSummary>` component.
  5. Use discriminated union state pattern:
     ```typescript
     type ProfileState =
       | { status: 'idle' }
       | { status: 'loading' }
       | { status: 'success'; data: RaceProfileResponse }
       | { status: 'error'; message: string };
     ```
- **Notes**: Follow constitution guidance on discriminated unions for state modeling.

### Subtask T027 – Update AnalyzeRequest submission

- **Purpose**: Pass auto-detected race type from profile response instead of manual selection.
- **Files**: `apps/web/src/features/rider-list/components/rider-input.tsx`
- **Steps**:
  1. Update the form submission to use `raceProfile.raceType` as the `raceType` field in the `AnalyzeRequest`.
  2. If no profile has been fetched (user hasn't entered a URL), the form should still be submittable — use a fallback race type or show a validation warning.
  3. Optionally pass `raceUrl` in the request for traceability (see contracts/api.md — `raceUrl?: string`).
  4. Verify the existing analyze flow continues to work with the auto-detected race type.
- **Notes**: The form should remain functional even without a race URL — the rider list and budget inputs are independent (US2 acceptance scenario 4).

## Risks & Mitigations

- Profile fetch can take up to 30 seconds (PCS scraping delays). Mitigation: clear loading indicator, consider showing a message like "Fetching race profile from PCS..."
- User may paste partial or incorrect URLs. Mitigation: validate URL format before making the API call.

## Review Guidance

- Verify the race type dropdown is completely removed.
- Verify the form still works without a race URL (graceful degradation).
- Verify loading state is visible and informative.
- Verify profile summary displays correctly for both stage races and classics.
- Verify the analyze request uses the auto-detected race type.

## Activity Log

- 2026-03-19T11:19:08Z – system – lane=planned – Prompt created.
