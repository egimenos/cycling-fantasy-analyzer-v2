---
work_package_id: WP01
title: Shared Types & Backend Ports
lane: planned
dependencies: []
subtasks:
- T001
- T002
- T003
- T004
- T005
phase: Phase 0 - Foundation
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
---

# Work Package Prompt: WP01 – Shared Types & Backend Ports

## Implement Command

```bash
spec-kitty implement WP01
```

## Objectives & Success Criteria

- Shared DTOs (`RaceListItem`, `GmvMatchResponse`) are defined in `packages/shared-types/` and importable by both API and web.
- `GmvClientPort` interface and `GmvPost` type exist in the API domain layer.
- `RaceResultRepositoryPort` supports optional `minYear` and `raceType` filter params.
- `RaceResultRepositoryAdapter` applies those filters in the SQL query.
- `make build` and `make typecheck` pass.

## Context & Constraints

- **Spec**: `kitty-specs/018-race-selector-auto-import/spec.md`
- **Plan**: `kitty-specs/018-race-selector-auto-import/plan.md`
- **Data Model**: `kitty-specs/018-race-selector-auto-import/data-model.md`
- **Contracts**: `kitty-specs/018-race-selector-auto-import/contracts/get-races.md`, `contracts/gmv-auto-import.md`
- **Architecture**: DDD/Hexagonal. Domain ports define interfaces + Symbol tokens. Infrastructure adapters implement them. Domain must never import from infrastructure.
- **Existing patterns**: See `apps/api/src/domain/scrape-job/scrape-job.repository.port.ts` for port pattern. See `apps/api/src/infrastructure/database/race-result.repository.adapter.ts` for Drizzle query pattern.

## Subtasks & Detailed Guidance

### Subtask T001 – Add RaceListItem & GmvMatchResponse DTOs to shared-types

- **Purpose**: Define the API response shapes for the race catalog and GMV match endpoints, shared between API and frontend.
- **Files**: `packages/shared-types/src/api.ts`
- **Steps**:
  1. Open `packages/shared-types/src/api.ts` and add these interfaces:
     ```typescript
     export interface RaceListItem {
       raceSlug: string;
       raceName: string;
       raceType: RaceType;
       year: number;
     }

     export interface RaceListResponse {
       races: RaceListItem[];
     }

     export interface GmvMatchResponse {
       matched: boolean;
       postTitle: string | null;
       postUrl: string | null;
       confidence: number | null;
       riders: ParsedPriceEntry[] | null;
     }
     ```
  2. Ensure `RaceType` and `ParsedPriceEntry` are already exported (they should be — verify).
  3. Export the new interfaces from the package barrel file if one exists.
- **Parallel?**: No — other subtasks in this WP depend on these types.
- **Notes**: Keep interfaces simple — no class instances, no methods. These are serialized over HTTP.

### Subtask T002 – Create GmvClientPort interface

- **Purpose**: Define the domain port for fetching GMV WordPress posts. This will be implemented by an infrastructure adapter in WP02.
- **Files**: `apps/api/src/domain/gmv/gmv-client.port.ts` (new file, new directory)
- **Steps**:
  1. Create directory `apps/api/src/domain/gmv/`.
  2. Create `gmv-client.port.ts`:
     ```typescript
     import { GmvPost } from './gmv-post';

     export interface GmvClientPort {
       /** Fetch GMV posts (implementations may cache internally) */
       getPosts(): Promise<GmvPost[]>;
     }

     export const GMV_CLIENT_PORT = Symbol('GmvClientPort');
     ```
  3. Create `index.ts` barrel export in `apps/api/src/domain/gmv/`.
- **Parallel?**: Yes — can proceed alongside T004/T005.
- **Notes**: Follow the same Symbol token pattern as `PCS_SCRAPER_PORT`, `RIDER_MATCHER_PORT`, etc.

### Subtask T003 – Create GmvPost value type

- **Purpose**: Define the domain representation of a GMV WordPress post.
- **Files**: `apps/api/src/domain/gmv/gmv-post.ts` (new file)
- **Steps**:
  1. Create `gmv-post.ts` in `apps/api/src/domain/gmv/`:
     ```typescript
     export interface GmvPost {
       id: number;
       title: string;
       url: string;
       date: string;
     }
     ```
  2. Export from the barrel `index.ts`.
- **Parallel?**: Yes — can proceed alongside T004/T005.
- **Notes**: This is a simple value type, not a domain entity. No methods, no validation. Mapped from WP API response shape in the adapter.

### Subtask T004 – Extend RaceResultRepositoryPort with filter params

- **Purpose**: Allow querying distinct races with optional year and race type filters, needed by the ListRacesUseCase.
- **Files**: `apps/api/src/domain/race-result/race-result.repository.port.ts` (or wherever this port is defined — check the existing file)
- **Steps**:
  1. Find the existing `RaceResultRepositoryPort` interface and the `findDistinctRacesWithDate()` method signature.
  2. Add an optional filter parameter:
     ```typescript
     export interface RaceCatalogFilter {
       minYear?: number;
       raceType?: RaceType;
     }

     // In the port interface:
     findDistinctRacesWithDate(filter?: RaceCatalogFilter): Promise<RaceSummary[]>;
     ```
  3. Ensure `RaceSummary` type includes `raceSlug`, `raceName`, `year`, `raceType` (it should already — verify).
- **Parallel?**: Yes — can proceed alongside T002/T003.
- **Notes**: The optional parameter ensures backward compatibility — existing callers without filters still work.

### Subtask T005 – Update RaceResultRepositoryAdapter with filtered query

- **Purpose**: Implement the filter logic in the Drizzle query.
- **Files**: `apps/api/src/infrastructure/database/race-result.repository.adapter.ts`
- **Steps**:
  1. Find `findDistinctRacesWithDate()` method in the adapter.
  2. Update to accept the filter parameter and apply `WHERE` clauses:
     ```typescript
     async findDistinctRacesWithDate(filter?: RaceCatalogFilter): Promise<RaceSummary[]> {
       const conditions = [isNotNull(raceResults.raceDate)];

       if (filter?.minYear) {
         conditions.push(gte(raceResults.year, filter.minYear));
       }
       if (filter?.raceType) {
         conditions.push(eq(raceResults.raceType, filter.raceType));
       }

       const rows = await this.db
         .selectDistinct({
           raceSlug: raceResults.raceSlug,
           raceName: raceResults.raceName,
           year: raceResults.year,
           raceType: raceResults.raceType,
         })
         .from(raceResults)
         .where(and(...conditions))
         .orderBy(desc(raceResults.year), asc(raceResults.raceName));

       return rows.map((row) => ({
         raceSlug: row.raceSlug,
         raceName: row.raceName,
         year: row.year,
         raceType: row.raceType as RaceType,
       }));
     }
     ```
  3. Import `gte`, `asc`, `and` from Drizzle if not already imported.
- **Parallel?**: Yes — can proceed alongside T002/T003.
- **Notes**: Existing callers passing no filter should still work (backward compatible). Check for existing tests on this method and update them if needed.

## Risks & Mitigations

- **Shared types rebuild**: Changes to `packages/shared-types/` trigger downstream builds. Run `make build` to verify.
- **Port interface break**: Adding optional param is backward-compatible, but verify no existing caller breaks.

## Review Guidance

- Verify DDD boundary: domain types in `domain/`, no infrastructure imports.
- Verify Symbol token naming convention matches existing ports.
- Verify Drizzle query produces correct SQL with and without filters.
- Run `make typecheck` and `make build`.

## Activity Log

- 2026-04-04T21:24:32Z – system – lane=planned – Prompt created.
