# Implementation Plan: Profile-Aware Scoring

**Branch**: `003-profile-aware-scoring` | **Date**: 2026-03-19 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `kitty-specs/003-profile-aware-scoring/spec.md`

## Summary

Add a profile match weight as a 4th multiplicative factor in the rider scoring algorithm. The target race's terrain distribution (P1-P5, ITT/TTT) — already available from the `/api/race-profile` endpoint — is used to weight each rider's historical results: results matching the dominant terrain profiles carry more weight. When no profile is provided, scoring is identical to today (all weights 1.0).

## Technical Context

**Language/Version**: TypeScript (strict mode)
**Primary Dependencies**: NestJS (backend), React + TanStack Start (frontend), shared-types package
**Storage**: PostgreSQL via Drizzle ORM (no schema changes needed)
**Testing**: Jest (backend, 100% coverage for scoring), Vitest + RTL (frontend)
**Target Platform**: Web application (monorepo: apps/api + apps/web + packages/shared-types)
**Project Type**: Turborepo monorepo
**Performance Goals**: Scoring computation < 500ms per rider pool (no regression)
**Constraints**: Pure domain functions, no framework dependencies in scoring layer
**Scale/Scope**: Single-user tool, ~200 riders per analysis

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Gate                       | Status   | Notes                                                                                                                       |
| -------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------- |
| DDD/Hexagonal compliance   | PASS     | ProfileDistribution is a pure domain value object. computeProfileWeight() is a pure function. No framework deps in scoring. |
| 100% scoring test coverage | PASS     | All new scoring functions and modified signatures will have exhaustive unit tests.                                          |
| No `any` types             | PASS     | All new types are fully typed (ProfileDistribution, ProfileWeightConfig).                                                   |
| ADR for scoring changes    | REQUIRED | Must write ADR documenting the profile weight formula and rationale.                                                        |
| English only               | PASS     | All code, comments, docs in English.                                                                                        |
| Conventional commits       | PASS     | Will follow feat/test/docs prefixes.                                                                                        |

**Post-Phase 1 re-check**: ADR must be created as part of implementation. All other gates remain green — no new framework dependencies introduced, no `any` types, all domain logic is pure.

## Project Structure

### Documentation (this feature)

```
kitty-specs/003-profile-aware-scoring/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0: formula decisions and rationale
├── data-model.md        # Phase 1: ProfileDistribution value object
├── quickstart.md        # Phase 1: key files and build instructions
├── contracts/
│   └── analyze-request.md  # Updated AnalyzeRequest contract
├── meta.json
└── checklists/
    └── requirements.md
```

### Source Code (affected paths)

```
apps/api/src/
├── domain/scoring/
│   ├── scoring.service.ts          # MODIFY: add profileWeight to formulas
│   ├── scoring-weights.config.ts   # MODIFY: add profile weight constants
│   ├── profile-distribution.ts     # NEW: ProfileDistribution value object
│   └── temporal-decay.ts           # UNCHANGED
├── application/analyze/
│   └── analyze-price-list.use-case.ts  # MODIFY: convert & pass ProfileDistribution
└── presentation/
    └── analyze.controller.ts       # MODIFY: validate optional profileSummary

packages/shared-types/src/
└── api.ts                          # MODIFY: add profileSummary? to AnalyzeRequest

apps/web/src/features/rider-list/
└── components/rider-input.tsx      # MODIFY: include profileSummary in request

docs/adr/
└── YYYY-MM-DD-profile-aware-scoring.md  # NEW: ADR for scoring formula change
```

**Structure Decision**: No new directories or packages. Changes are localized to the existing scoring domain module, the analyze use case, and the frontend input component. One new file (`profile-distribution.ts`) in the scoring domain.

## Complexity Tracking

No constitution violations. All changes stay within existing architectural boundaries.

## Design Decisions

### D1: Profile Weight Formula

**Normalized proportional with floor** (see [research.md](research.md#r1-profile-weight-formula)):

```
profileWeight = max(FLOOR, parcoursShare / maxParcoursShare)
```

Where `parcoursShare(Px) = pxCount / totalStages` and `maxParcoursShare = max(all parcours shares)`.

The dominant profile gets weight 1.0. Others scale proportionally. Floor (0.25) prevents total discarding.

### D2: ITT Bonus

ITT results get `parcoursWeight + ITT_BONUS_FACTOR × ittRelevance` (see [research.md](research.md#r2-itttt-handling)). Parcours type dominates; ITT adds secondary signal.

### D3: Category Affinity

Mountain → average of P4+P5 shares. Sprint → average of P1+P2 shares. GC → neutral 1.0. (see [research.md](research.md#r3-non-stage-category-affinity))

### D4: Data Flow

Frontend passes existing `ProfileSummary` in `AnalyzeRequest` → use case converts to `ProfileDistribution` → passed to scoring functions. Pure domain, no HTTP in scoring.

### D5: Backward Compatibility

No `profileSummary` in request → all weights 1.0. Verified by regression tests comparing output with/without profile.
