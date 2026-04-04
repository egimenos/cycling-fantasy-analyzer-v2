# Work Packages: Race Selector with Auto Price Import

**Inputs**: Design documents from `kitty-specs/018-race-selector-auto-import/`
**Prerequisites**: plan.md (required), spec.md (user stories), research.md, data-model.md, contracts/

**Tests**: Testing guidance included per WP but no dedicated test-only work packages.

**Organization**: 25 fine-grained subtasks (`T001`–`T025`) roll up into 5 work packages (`WP01`–`WP05`). Each work package is independently deliverable and testable.

**Prompt Files**: Each work package references a matching prompt file in `tasks/`.

---

## Work Package WP01: Shared Types & Backend Ports (Priority: P0)

**Goal**: Establish the shared DTOs and domain ports that all subsequent work packages depend on.
**Independent Test**: Shared types compile, new port interfaces are importable, repository adapter returns filtered race list.
**Prompt**: `tasks/WP01-shared-types-and-ports.md`

### Included Subtasks

- [ ] T001 Add `RaceListItem` and `GmvMatchResponse` DTOs to `packages/shared-types/src/api.ts`
- [ ] T002 Create `GmvClientPort` interface in `apps/api/src/domain/gmv/gmv-client.port.ts`
- [ ] T003 Create `GmvPost` value type in `apps/api/src/domain/gmv/gmv-post.ts`
- [ ] T004 [P] Extend `RaceResultRepositoryPort` with `minYear` and `raceType` filter params
- [ ] T005 [P] Update `RaceResultRepositoryAdapter.findDistinctRacesWithDate()` to accept filters

### Implementation Notes

- DTOs in shared-types are used by both API and frontend — keep them serialization-friendly (no class instances, just interfaces).
- Port follows existing pattern: interface + Symbol token (see `PCS_SCRAPER_PORT` for reference).
- Repository method `findDistinctRacesWithDate()` already exists — extend it, don't create a new one.

### Parallel Opportunities

- T004 and T005 (repository changes) can proceed in parallel with T002–T003 (GMV domain types).

### Dependencies

- None (starting package).

### Risks & Mitigations

- Shared-types change triggers rebuild of both API and web. Ensure `make build` passes.

**Requirements Refs**: FR-001, FR-002

---

## Work Package WP02: Backend GMV Infrastructure (Priority: P0)

**Goal**: Implement the GMV WordPress API client adapter and in-memory cache service.
**Independent Test**: Adapter fetches posts from GMV WP API; cache serves stale data within TTL; GmvModule is importable.
**Prompt**: `tasks/WP02-gmv-infrastructure.md`

### Included Subtasks

- [ ] T006 Create `GmvClientAdapter` in `apps/api/src/infrastructure/gmv/gmv-client.adapter.ts`
- [ ] T007 Create `GmvPostCacheService` in `apps/api/src/infrastructure/gmv/gmv-post-cache.service.ts`
- [ ] T008 Create `GmvModule` in `apps/api/src/infrastructure/gmv/gmv.module.ts`

### Implementation Notes

- Adapter fetches `GET /wp-json/wp/v2/posts?categories=23,21&per_page=100&_fields=id,title,link,date`.
- Filter out posts containing "Equipos y elecciones" or "Calendario" in title.
- Cache is a NestJS singleton service with `Map` + timestamp TTL (4 hours default).
- Use native `fetch()` (same pattern as `MlScoringAdapter`).
- Module exports `GMV_CLIENT_PORT` symbol.

### Parallel Opportunities

- Can proceed in parallel with WP04 (frontend) once WP01 is done.

### Dependencies

- Depends on WP01 (needs `GmvClientPort` and `GmvPost` types).

### Risks & Mitigations

- GMV WordPress API could be rate-limited or blocked. Mitigation: aggressive caching (4h TTL), graceful error handling returning empty array.
- Title format could change. Mitigation: filter is loose (contains check, not exact match).

**Requirements Refs**: FR-005, FR-010, FR-011

---

## Work Package WP03: Backend Use Cases & Controller (Priority: P1)

**Goal**: Implement the race listing use case, GMV auto-import use case with fuzzy matching, and the REST endpoints.
**Independent Test**: `GET /api/races` returns filtered race list; `GET /api/gmv-match` returns matched GMV post with imported riders; `GET /api/race-profile` accepts slug+year params.
**Prompt**: `tasks/WP03-use-cases-and-controller.md`

### Included Subtasks

- [ ] T009 Create `ListRacesUseCase` in `apps/api/src/application/analyze/list-races.use-case.ts`
- [ ] T010 Create race name alias map in `apps/api/src/application/analyze/race-name-aliases.ts`
- [ ] T011 [P] Implement fuzzy matching utility in `apps/api/src/application/analyze/fuzzy-match-gmv.ts`
- [ ] T012 Create `GmvAutoImportUseCase` in `apps/api/src/application/analyze/gmv-auto-import.use-case.ts`
- [ ] T013 Extend `FetchRaceProfileUseCase` to accept `{ raceSlug, year }` as alternative input
- [ ] T014 Create `RaceCatalogController` in `apps/api/src/presentation/race-catalog.controller.ts`
- [ ] T015 Update `AnalyzeModule` to import `GmvModule` and register new providers/controllers

### Implementation Notes

- `ListRacesUseCase` is thin: injects `RACE_RESULT_REPOSITORY_PORT`, calls `findDistinctRacesWithDate()` with filters.
- Fuzzy match: normalize strings (lowercase, strip accents via `normalize('NFD').replace(/[\u0300-\u036f]/g, '')`), remove year, tokenize, compute overlap ratio. Threshold ≥ 0.7.
- Alias map handles ~10 known mismatches (e.g., `ronde-van-vlaanderen` → `Tour de Flandes`).
- `GmvAutoImportUseCase` orchestrates: get cached posts → fuzzy match → if match, call existing `ImportPriceListUseCase` with matched URL.
- `FetchRaceProfileUseCase.execute()` already calls `parseUrl()` internally — add an alternative `executeBySlug(raceSlug, year)` method that skips URL parsing.
- Controller follows existing pattern: `@Controller('api')`, inject use cases, thin delegation.

### Parallel Opportunities

- T010 (alias map) and T011 (fuzzy match) can proceed in parallel — they are pure functions.

### Dependencies

- Depends on WP01 (shared types, ports) and WP02 (GMV adapter, cache).

### Risks & Mitigations

- Fuzzy matching may fail for some race name combinations. Mitigation: alias map covers known cases; low-confidence matches fall through to manual fallback.
- `ImportPriceListUseCase` expects a URL — no changes needed, just pass the matched GMV post URL.

**Requirements Refs**: FR-001, FR-002, FR-004, FR-006, FR-007, FR-008

---

## Work Package WP04: Frontend Race Selector (Priority: P1)

**Goal**: Build the searchable combobox component, API hooks, and race selector with type filters.
**Independent Test**: Combobox renders with race list, supports fuzzy search and type filtering, triggers callbacks on selection.
**Prompt**: `tasks/WP04-frontend-race-selector.md`

### Included Subtasks

- [ ] T016 Install `cmdk` package; create `Combobox` primitive in `apps/web/src/shared/ui/combobox.tsx`
- [ ] T017 [P] Add `fetchRaces()` and `gmvMatch()` to `apps/web/src/shared/lib/api-client.ts`
- [ ] T018 [P] Create `useRaceCatalog` hook in `apps/web/src/features/rider-list/hooks/use-race-catalog.ts`
- [ ] T019 [P] Create `useGmvAutoImport` hook in `apps/web/src/features/rider-list/hooks/use-gmv-auto-import.ts`
- [ ] T020 Create `RaceSelector` component in `apps/web/src/features/rider-list/components/race-selector.tsx`
- [ ] T021 Update `useRaceProfile` hook to support `{ raceSlug, year }` input (not just URL)

### Implementation Notes

- `cmdk` provides the `Command` component; wrap with Radix `Popover` for dropdown behavior (shadcn/ui combobox pattern).
- Style with existing design tokens: `bg-surface-container-high`, `text-on-surface`, `border-outline-variant/15`.
- `RaceSelector` combines: combobox + optional race type filter buttons (GT/Classic/Stage) + inline status messages.
- `useRaceCatalog` fetches once on mount, memoizes the list. No refetch needed (race catalog is static).
- `useGmvAutoImport` takes `{ raceSlug, year }`, calls `gmvMatch()`, returns `AsyncState<GmvMatchResponse>`.
- `useRaceProfile` currently takes a URL string. Change to accept either URL or `{ raceSlug, year }`, auto-constructing PCS URL internally.

### Parallel Opportunities

- T017, T018, T019 are independent (different files, no shared state).

### Dependencies

- Depends on WP01 (shared types for DTOs).
- Can proceed in parallel with WP02 and WP03 (backend work). Frontend can develop against mocked API responses.

### Risks & Mitigations

- `cmdk` bundle size impact. Mitigation: ~3KB gzipped, negligible.
- Combobox accessibility (keyboard nav, screen readers). Mitigation: `cmdk` + Radix handle this natively.

**Requirements Refs**: FR-001, FR-002, FR-003

---

## Work Package WP05: Frontend Integration & Wiring (Priority: P1)

**Goal**: Wire the race selector into the Setup tab, replacing manual URL inputs. Add manual fallback.
**Independent Test**: Full flow works: select race → profile loads + riders auto-populate. Manual fallback accessible when auto-match fails. E2E tests pass.
**Prompt**: `tasks/WP05-frontend-integration.md`

### Included Subtasks

- [ ] T022 Update `RiderInput` to replace URL inputs with `RaceSelector` + manual fallback section
- [ ] T023 Update `index.tsx` parent state management (replace `raceUrl`/`gameUrl` with `selectedRace`)
- [ ] T024 Update `SetupTab` props interface to pass new state shape
- [ ] T025 Update E2E tests in `apps/web/tests/e2e/` for new setup flow

### Implementation Notes

- `RiderInput` currently has 4 inputs (race URL, game URL, textarea, budget). Replace first two with `RaceSelector`.
- Add collapsible "Enter URLs manually" section below `RaceSelector` that shows the old URL inputs — visible when auto-match fails or user clicks "manual mode".
- Parent state in `index.tsx`: replace `raceUrl: string` + `gameUrl: string` with `selectedRace: RaceListItem | null`. Derive `raceUrl` from slug+year when needed for the analyze request.
- On race selection: trigger `useRaceProfile` (slug+year mode) and `useGmvAutoImport` in parallel.
- On GMV auto-import success: populate `riderText` state with formatted CSV.
- On GMV auto-import failure: show "no match found" message, expand manual fallback.
- E2E tests: update setup flow tests to use combobox interaction instead of URL input.

### Parallel Opportunities

- T025 (E2E) can proceed in parallel with T022–T024 if the component structure is agreed.

### Dependencies

- Depends on WP03 (backend endpoints must be available) and WP04 (race selector component).

### Risks & Mitigations

- Breaking existing flow. Mitigation: manual fallback preserves 100% of current functionality.
- E2E test flakiness with combobox. Mitigation: use `data-testid` attributes on combobox trigger and items.

**Requirements Refs**: FR-004, FR-007, FR-008, FR-009

---

## Dependency & Execution Summary

```
WP01 (Shared Types & Ports)
  ├──→ WP02 (GMV Infrastructure) ──→ WP03 (Use Cases & Controller) ──┐
  └──→ WP04 (Frontend Race Selector) ────────────────────────────────┴──→ WP05 (Integration)
```

- **Sequence**: WP01 → {WP02 ∥ WP04} → WP03 → WP05
- **Parallelization**: WP02 (backend infra) and WP04 (frontend) can run in parallel after WP01.
- **MVP Scope**: WP01 + WP02 + WP03 + WP04 + WP05 (all packages needed for feature to work end-to-end; WP01–WP03 delivers a testable backend, WP04–WP05 delivers the frontend).

---

## Subtask Index (Reference)

| Subtask ID | Summary | Work Package | Priority | Parallel? |
| ---------- | ------- | ------------ | -------- | --------- |
| T001 | Add RaceListItem & GmvMatchResponse DTOs | WP01 | P0 | No |
| T002 | Create GmvClientPort interface | WP01 | P0 | No |
| T003 | Create GmvPost value type | WP01 | P0 | No |
| T004 | Extend RaceResultRepositoryPort with filters | WP01 | P0 | Yes |
| T005 | Update RaceResultRepositoryAdapter with filters | WP01 | P0 | Yes |
| T006 | Create GmvClientAdapter (WP API fetch) | WP02 | P0 | No |
| T007 | Create GmvPostCacheService (TTL cache) | WP02 | P0 | No |
| T008 | Create GmvModule (NestJS wiring) | WP02 | P0 | No |
| T009 | Create ListRacesUseCase | WP03 | P1 | No |
| T010 | Create race name alias map | WP03 | P1 | Yes |
| T011 | Implement fuzzy matching utility | WP03 | P1 | Yes |
| T012 | Create GmvAutoImportUseCase | WP03 | P1 | No |
| T013 | Extend FetchRaceProfileUseCase for slug+year | WP03 | P1 | No |
| T014 | Create RaceCatalogController | WP03 | P1 | No |
| T015 | Update AnalyzeModule imports | WP03 | P1 | No |
| T016 | Install cmdk, create Combobox component | WP04 | P1 | No |
| T017 | Add fetchRaces() and gmvMatch() to api-client | WP04 | P1 | Yes |
| T018 | Create useRaceCatalog hook | WP04 | P1 | Yes |
| T019 | Create useGmvAutoImport hook | WP04 | P1 | Yes |
| T020 | Create RaceSelector component | WP04 | P1 | No |
| T021 | Update useRaceProfile for slug+year | WP04 | P1 | No |
| T022 | Update RiderInput with RaceSelector | WP05 | P1 | No |
| T023 | Update index.tsx parent state | WP05 | P1 | No |
| T024 | Update SetupTab props | WP05 | P1 | No |
| T025 | Update E2E tests for new flow | WP05 | P1 | Yes |
