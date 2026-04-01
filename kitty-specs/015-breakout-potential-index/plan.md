# Implementation Plan: Breakout Potential Index

**Branch**: `015-breakout-potential-index` | **Date**: 2026-04-01 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/kitty-specs/015-breakout-potential-index/spec.md`

## Summary

Add a rules-based Breakout Potential Index (BPI) to the analyze flow that scores each matched rider (0-100) on breakout likelihood, computes an upside P80 scenario, and assigns interpretable flags. The backend computation is a pure domain function consuming existing data (seasonBreakdown, predictions, age, price, profileSummary). The frontend adds a sortable BPI column with color coding, flag badge chips, tabbed detail panel, and two quick filters (Breakout, Value Picks).

## Technical Context

**Language/Version**: TypeScript (strict mode) — NestJS backend, React 19 frontend
**Primary Dependencies**: NestJS, TanStack Table, TanStack Router, Tailwind CSS, shadcn/ui, Drizzle ORM
**Storage**: PostgreSQL 16 (existing — only change is loading `birth_date` column already present)
**Testing**: Jest (backend, 100% coverage for BPI domain logic), Vitest + RTL (frontend, 90%)
**Target Platform**: Linux server (Docker/Dokploy), Web browser
**Project Type**: Monorepo (Turborepo) — `apps/api`, `apps/web`, `packages/shared-types`
**Performance Goals**: BPI computation adds < 50ms to analyze response (pure in-memory, no I/O)
**Constraints**: BPI must be a pure function with zero side effects, no DB calls, no external deps
**Scale/Scope**: Single-user tool, ~200 riders per analysis

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Gate                              | Status | Notes                                                                                   |
| --------------------------------- | ------ | --------------------------------------------------------------------------------------- |
| DDD/Hexagonal compliance          | PASS   | BPI is an isolated domain module `domain/breakout/` — pure functions, no framework deps |
| No `any` types                    | PASS   | All types defined via interfaces in shared-types                                        |
| Scoring logic 100% coverage       | PASS   | BPI is scoring-adjacent — same 100% test coverage requirement applies                   |
| English only in repo              | PASS   | All code, comments, docs in English                                                     |
| Conventional commits              | PASS   | Feature branch with conventional commit messages                                        |
| No half-finished features         | PASS   | Feature is independently functional — BPI enriches existing flow without breaking it    |
| Domain never depends on framework | PASS   | `computeBreakout()` is a pure function taking plain data, returning plain data          |

No violations. No complexity tracking needed.

## Project Structure

### Documentation (this feature)

```
kitty-specs/015-breakout-potential-index/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── spec.md              # Feature specification
├── contracts/           # Phase 1 output
│   └── analyze-response.schema.ts
├── checklists/
│   └── requirements.md
└── research/            # Prior research artifacts
```

### Source Code (repository root)

```
# Backend — new domain module + use case integration
apps/api/src/
├── domain/
│   └── breakout/                    # NEW — isolated BPI domain module
│       ├── breakout.service.ts      # Pure function: computeBreakout()
│       ├── breakout.types.ts        # BreakoutResult, BreakoutSignals, BreakoutFlag
│       └── __tests__/
│           └── breakout.service.spec.ts  # 100% coverage
├── domain/rider/
│   └── rider.entity.ts             # MODIFIED — add birthDate to RiderProps
├── infrastructure/database/
│   └── rider.repository.adapter.ts # MODIFIED — map birthDate from DB row
├── application/analyze/
│   └── analyze-price-list.use-case.ts  # MODIFIED — call computeBreakout() post-ML

# Shared types — extend AnalyzedRider
packages/shared-types/src/
└── api.ts                           # MODIFIED — add BreakoutResult to AnalyzedRider

# Frontend — table enrichment + tabs + filters
apps/web/src/features/rider-list/
├── components/
│   ├── rider-table.tsx              # MODIFIED — BPI column, flag chips, filters
│   ├── breakout-detail-panel.tsx    # NEW — tabbed detail panel (Breakout tab)
│   └── bpi-badge.tsx                # NEW — color-coded BPI badge component
```

**Structure Decision**: BPI domain logic lives in a new `domain/breakout/` module following the existing DDD pattern (like `domain/scoring/`, `domain/matching/`). Frontend components follow Feature-Sliced Design under `features/rider-list/components/`.

## Architecture Decisions

### AD-1: BPI as Isolated Domain Module

**Decision**: Create `domain/breakout/` with a single pure function `computeBreakout()` rather than extending `ScoringService`.

**Rationale**: BPI analyzes _on top of_ scoring output — it's meta-analysis, not scoring itself. Keeping it isolated means:

- Zero risk of regressing existing scoring logic (FR-005)
- Trivially testable (pure function, no mocks needed)
- Clear domain boundary: scoring produces predictions, breakout evaluates potential

### AD-2: Upside P80 Hybrid Strategy

**Decision**: Use weighted bootstrap sampling when ≥3 seasons available, fall back to heuristic multiplier (`prediction × 1.8`) when <3 seasons.

**Rationale**: Bootstrap with 1-2 data points just reshuffles the same values — P80 collapses to the maximum observed value, which is uninformative. The heuristic provides an actionable upside estimate for young/emerging riders (the core BPI use case).

### AD-3: Tabbed Expandable Row

**Decision**: Split the expanded row content into tabs: "Performance" (existing content) and "Breakout" (BPI detail panel).

**Rationale**: Separates "what the rider has done" from "what the rider might do" — two distinct narratives. Prevents the expandable from becoming an overwhelming wall of data. Scales for future analysis tabs.

### AD-4: Two-Tier Filter System

**Decision**: Add two filter buttons — "Breakout" (BPI ≥50, any price) and "Value Picks" (BPI ≥50 AND price ≤125 hillios).

**Rationale**: User requested the ability to see all breakout candidates at a glance regardless of price, with Value Picks as a stricter subset for cheap roster slots.

## Integration Points

### Backend Flow (analyze-price-list.use-case.ts)

```
Existing flow:
  1. Match riders → 2. Fetch results → 3. Compute scores → 4. Fetch ML → 5. Enrich → 6. Sort → 7. Return

Modified flow:
  1. Match riders → 2. Fetch results → 3. Compute scores → 4. Fetch ML → 5. Enrich →
  5.5 Compute BPI (NEW) → 6. Sort → 7. Return
```

Step 5.5 calls `computeBreakout()` for each matched rider with:

- `seasonBreakdown` (from step 3)
- `mlPredictedScore` or `totalProjectedPts` (from step 5)
- `priceHillios` (from input)
- `birthDate` (from rider entity — newly loaded)
- `profileSummary` (from request, optional)
- `allRidersPtsPerHillio` (median computed once across the list)

### Rider Entity Change

`birthDate` already exists in the `riders` DB table but is not mapped to the domain entity. Changes needed:

1. Add `birthDate: Date | null` to `RiderProps` interface
2. Map `row.birthDate` in `RiderRepositoryAdapter.toDomain()`
3. No migration needed — column already exists

### Shared Types Change

Add to `AnalyzedRider`:

```typescript
breakout: BreakoutResult | null;
```

Where `BreakoutResult` contains `index`, `upsideP80`, `flags`, and `signals` (for detail panel).
