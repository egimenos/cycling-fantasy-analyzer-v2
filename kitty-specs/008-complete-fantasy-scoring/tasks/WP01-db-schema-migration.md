---
work_package_id: WP01
title: DB Schema Migration
lane: planned
dependencies: []
subtasks:
  - T001
  - T002
  - T003
phase: Phase 0 - Foundation
assignee: ''
agent: ''
shell_pid: ''
review_status: ''
reviewed_by: ''
history:
  - timestamp: '2026-03-21T13:44:59Z'
    lane: planned
    agent: system
    shell_pid: ''
    action: Prompt generated via /spec-kitty.tasks
requirement_refs:
  - FR-004
  - FR-005
  - FR-006
  - FR-007
---

# Work Package Prompt: WP01 – DB Schema Migration

## ⚠️ IMPORTANT: Review Feedback Status

- **Has review feedback?**: Check the `review_status` field above.
- **Mark as acknowledged**: Update `review_status: acknowledged` when addressing feedback.

---

## Review Feedback

_[This section is empty initially.]_

---

## Objectives & Success Criteria

- Extend `race_results` table with 4 new nullable columns: `climb_category`, `climb_name`, `sprint_name`, `km_marker`
- Support new `category` values: `gc_daily`, `mountain_pass`, `sprint_intermediate`, `regularidad_daily`
- Migration applies cleanly on existing database without data loss
- All existing queries continue to work (backward compatible)

## Context & Constraints

- **Architecture**: DDD/Hexagonal — schema lives in `apps/api/src/infrastructure/database/`
- **ORM**: Drizzle ORM with PostgreSQL
- **Constitution**: No breaking changes to existing data
- **Reference**: `kitty-specs/008-complete-fantasy-scoring/data-model.md`

## Subtasks & Detailed Guidance

### Subtask T001 – Add new columns to race_results Drizzle schema

- **Purpose**: Add nullable metadata columns for mountain passes and sprints.
- **Steps**:
  1. Find the `race_results` table definition in the Drizzle schema (look in `apps/api/src/infrastructure/database/` or `apps/api/src/` for `schema.ts` or similar)
  2. Add these columns:
     - `climb_category` — `varchar(4)` nullable — values: 'HC', '1', '2', '3', '4'
     - `climb_name` — `varchar(100)` nullable — e.g., "Col de Peyresourde"
     - `sprint_name` — `varchar(100)` nullable — e.g., "Marignac"
     - `km_marker` — `real` nullable — distance in stage (e.g., 37.0)
  3. All columns MUST be nullable — existing rows have no data for these
- **Files**: `apps/api/src/infrastructure/database/schema.ts` (or wherever Drizzle schema is defined)
- **Parallel?**: No — prerequisite for T002, T003

### Subtask T002 – Add new category enum values

- **Purpose**: The `category` column currently holds: `stage`, `gc`, `mountain`, `sprint`. We need to add support for new values.
- **Steps**:
  1. Check how `category` is defined — if it's a Drizzle enum, add new values; if it's a plain varchar, no schema change needed (just document the new values)
  2. New category values: `gc_daily`, `mountain_pass`, `sprint_intermediate`, `regularidad_daily`
  3. If using a TypeScript enum/type for category, update it to include new values
  4. Ensure the domain layer's `ResultCategory` enum (in `packages/shared-types` or `apps/api/src/domain/`) includes the new values
- **Files**: Schema file + domain enum types
- **Parallel?**: No — needed before migration

### Subtask T003 – Generate and apply Drizzle migration

- **Purpose**: Create the SQL migration file that alters the table.
- **Steps**:
  1. Run `cd apps/api && npx drizzle-kit generate` to generate migration from schema diff
  2. Review the generated SQL — should be ALTER TABLE ADD COLUMN statements, all nullable
  3. Apply with `cd apps/api && npx drizzle-kit migrate` or `make db-migrate`
  4. Verify: connect to DB and confirm columns exist: `\d race_results`
- **Files**: `apps/api/drizzle/` (generated migration file)
- **Parallel?**: No — final step

## Risks & Mitigations

- **Risk**: Migration fails on production DB with existing data → **Mitigation**: All columns nullable, no NOT NULL constraints
- **Risk**: Category enum migration requires special handling in PostgreSQL → **Mitigation**: If category is varchar, no enum migration needed. If pgEnum, use ALTER TYPE ADD VALUE.

## Review Guidance

- Verify all new columns are nullable
- Verify migration is reversible (can drop columns)
- Verify no existing queries break (new columns have no impact on SELECT \*)
- Verify domain types updated

## Activity Log

- 2026-03-21T13:44:59Z – system – lane=planned – Prompt created.
