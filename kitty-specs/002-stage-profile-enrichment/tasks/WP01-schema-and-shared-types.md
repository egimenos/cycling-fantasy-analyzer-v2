---
work_package_id: WP01
title: Schema, Shared Types & Domain Entity
lane: planned
dependencies: []
base_branch: main
subtasks:
  - T001
  - T002
  - T003
  - T004
  - T005
  - T006
history:
  - timestamp: '2026-03-19T11:19:08Z'
    lane: planned
    agent: system
    shell_pid: ''
    action: Prompt generated via /spec-kitty.tasks
depends_on: []
estimated_prompt_size: ~350 lines
priority: P0
requirement_refs:
  - FR-005
  - FR-010
type: foundation
---

# Work Package Prompt: WP01 – Schema, Shared Types & Domain Entity

## Objectives & Success Criteria

- Add `ParcoursType` enum to shared types and Drizzle schema
- Add 4 nullable columns (`parcours_type`, `is_itt`, `is_ttt`, `profile_score`) to the `race_results` table
- Update `RaceResult` domain entity and `ParsedResult` interface with new profile fields
- Generate a Drizzle migration
- All packages compile: `pnpm build` succeeds

## Context & Constraints

- **Spec**: `kitty-specs/002-stage-profile-enrichment/spec.md` — FR-005, FR-010
- **Data model**: `kitty-specs/002-stage-profile-enrichment/data-model.md`
- **Constitution**: `.kittify/memory/constitution.md` — TypeScript strict mode, no `any`, `PascalCase` enums
- **Existing patterns**: See `stageNumber` (nullable integer) and `dnf` (boolean with default) in `race-results.ts` for the nullable column pattern

## Subtasks & Detailed Guidance

### Subtask T001 – Add ParcoursType enum to shared-types

- **Purpose**: Define the parcours type enum in the shared package so both frontend and backend can use it.
- **Files**: `packages/shared-types/src/enums.ts`, `packages/shared-types/src/index.ts`
- **Steps**:
  1. Add to `packages/shared-types/src/enums.ts`:
     ```typescript
     export enum ParcoursType {
       P1 = 'p1', // Flat
       P2 = 'p2', // Hills, flat finish
       P3 = 'p3', // Hills, uphill finish
       P4 = 'p4', // Mountains, flat finish
       P5 = 'p5', // Mountains, uphill finish
     }
     ```
  2. Ensure it's exported from `index.ts` (check existing export pattern).
- **Parallel?**: Yes — can be done alongside T002-T005.

### Subtask T002 – Add parcoursTypeEnum to Drizzle schema

- **Purpose**: Define the PostgreSQL enum type for parcours_type column.
- **Files**: `apps/api/src/infrastructure/database/schema/enums.ts`
- **Steps**:
  1. Add after existing enums:
     ```typescript
     export const parcoursTypeEnum = pgEnum('parcours_type', ['p1', 'p2', 'p3', 'p4', 'p5']);
     ```
  2. Follow the exact same pattern as `raceTypeEnum`, `raceClassEnum`, etc.
- **Notes**: The values `p1`-`p5` match PCS CSS class names exactly.

### Subtask T003 – Add 4 columns to race_results table

- **Purpose**: Extend the `race_results` schema with profile data columns.
- **Files**: `apps/api/src/infrastructure/database/schema/race-results.ts`
- **Steps**:
  1. Import `parcoursTypeEnum` from `./enums`.
  2. Add after the `scrapedAt` column:
     ```typescript
     parcoursType: parcoursTypeEnum('parcours_type'),  // nullable by default
     isItt: boolean('is_itt').notNull().default(false),
     isTtt: boolean('is_ttt').notNull().default(false),
     profileScore: integer('profile_score'),  // nullable by default
     ```
  3. The unique constraint remains unchanged: `(riderId, raceSlug, year, category, stageNumber)`.
- **Notes**: `is_itt` and `is_ttt` are `NOT NULL DEFAULT false` (same pattern as `dnf`). `parcours_type` and `profile_score` are nullable (will be null for GC/MOUNTAIN/SPRINT rows in stage races).

### Subtask T004 – Generate Drizzle migration

- **Purpose**: Create the SQL migration for the schema changes.
- **Steps**:
  1. Run: `pnpm --filter api drizzle-kit generate` (or the project's migration generation command)
  2. Verify the migration creates the `parcours_type` enum type and adds the 4 columns.
  3. The migration should be additive (ALTER TABLE ADD COLUMN) — no destructive changes.
- **Notes**: Since the DB will be re-seeded from scratch, migration correctness is important but rollback is not critical.

### Subtask T005 – Update RaceResult domain entity

- **Purpose**: Extend the domain entity with profile properties.
- **Files**: `apps/api/src/domain/race-result/race-result.entity.ts`
- **Steps**:
  1. Add to `RaceResultProps` interface:
     ```typescript
     readonly parcoursType: string | null;  // 'p1' | 'p2' | 'p3' | 'p4' | 'p5' | null
     readonly isItt: boolean;
     readonly isTtt: boolean;
     readonly profileScore: number | null;
     ```
  2. Add getter accessors in the `RaceResult` class following the existing pattern:
     ```typescript
     get parcoursType(): string | null { return this.props.parcoursType; }
     get isItt(): boolean { return this.props.isItt; }
     get isTtt(): boolean { return this.props.isTtt; }
     get profileScore(): number | null { return this.props.profileScore; }
     ```
  3. Update `RaceResult.create()` — ensure the `Omit<RaceResultProps, 'id'>` input type picks up the new fields.
- **Notes**: Follow DDD pattern — no framework dependencies in domain entity. Use the shared `ParcoursType` enum type if imported, or plain string union.

### Subtask T006 – Update ParsedResult interface

- **Purpose**: Add profile fields to the parser output type so parsers can return profile data.
- **Files**: `apps/api/src/infrastructure/scraping/parsers/parsed-result.type.ts`
- **Steps**:
  1. Add to the `ParsedResult` interface:
     ```typescript
     readonly parcoursType: string | null;  // 'p1'-'p5' or null
     readonly isItt: boolean;
     readonly isTtt: boolean;
     readonly profileScore: number | null;
     ```
  2. These fields will be populated by parsers in WP02. For now, existing parsers will need to pass default values (`null`, `false`, `false`, `null`) — but this will be handled in WP02 when parsers are updated.
- **Parallel?**: Yes — can be done alongside T001.
- **Notes**: All existing code that creates `ParsedResult` objects will need updating to include the new fields. This is intentional — TypeScript strict mode will flag every call site that needs updating.

## Risks & Mitigations

- Adding required fields to `ParsedResult` will break existing parsers until WP02 updates them. Mitigation: update parsers to pass defaults (`parcoursType: null, isItt: false, isTtt: false, profileScore: null`) as part of this WP, or accept build failures until WP02.
- **Recommended approach**: Add default values in `parseResultsTable()` (the base parser) so all existing callers continue to work. WP02 will then override these defaults with real data.

## Review Guidance

- Verify enum values match PCS conventions (`p1`-`p5`).
- Verify column nullability: `parcours_type` and `profile_score` are nullable; `is_itt` and `is_ttt` are NOT NULL DEFAULT false.
- Verify domain entity follows existing pattern (no framework imports).
- Verify `pnpm build` succeeds across all packages.

## Activity Log

- 2026-03-19T11:19:08Z – system – lane=planned – Prompt created.
