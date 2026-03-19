# Implementation Plan: Stage Profile Enrichment

**Branch**: `002-stage-profile-enrichment` | **Date**: 2026-03-19 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `kitty-specs/002-stage-profile-enrichment/spec.md`

## Summary

Enrich the scraping pipeline and data model with stage profile metadata (parcours type p1-p5, ITT/TTT flags, ProfileScore) so that future scoring can weight historical results by stage terrain type. Add a new endpoint and frontend input to fetch and display a target race's stage profile distribution from its PCS URL, replacing the manual race type selector with auto-detection.

## Technical Context

**Language/Version**: TypeScript (strict mode), Node.js 20+
**Primary Dependencies**: NestJS, Drizzle ORM, Cheerio (parsing), got-scraping (HTTP), React 18 + TanStack Start, Tailwind CSS + shadcn/ui
**Storage**: PostgreSQL via Drizzle ORM — new columns on existing `race_results` table
**Testing**: Jest (backend), Vitest + React Testing Library (frontend), Playwright (E2E)
**Target Platform**: Turborepo monorepo — `apps/api` (NestJS), `apps/web` (React), `packages/shared-types`
**Project Type**: Web application (frontend + backend)
**Performance Goals**: Profile distribution fetch < 30s (PCS scraping latency); no impact on existing scoring path
**Constraints**: Single-user tool, no concurrency requirements. Polite scraping (1.5s delay between requests)
**Scale/Scope**: ~200 riders per race, ~21 stages per Grand Tour, ~70 races per season

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- **DDD/Hexagonal Architecture**: PASS — new parsing logic in infrastructure adapters, profile data flows through existing domain entities, no new domain services required for this feature (scoring is out of scope)
- **No Python**: PASS — all parsing done with Cheerio in TypeScript
- **Testing requirements**: PASS — parser tests with HTML fixtures (Jest), frontend component tests (Vitest), E2E for URL input flow (Playwright)
- **TypeScript strict mode**: PASS — new enum + nullable columns follow existing patterns
- **English only**: PASS — all artifacts in English
- **Scoring model changes**: N/A — this feature does not modify the scoring algorithm. ADR not required.
- **Zero `any` types**: PASS — all new types are strongly typed
- **Conventional Commits**: PASS — will follow existing commit conventions

## Project Structure

### Documentation (this feature)

```
kitty-specs/002-stage-profile-enrichment/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── api.md           # New/updated endpoints
└── tasks.md             # Phase 2 output (NOT created by /spec-kitty.plan)
```

### Source Code (repository root)

```
apps/api/src/
├── infrastructure/
│   ├── database/schema/
│   │   ├── enums.ts                    # + parcoursTypeEnum
│   │   └── race-results.ts            # + parcoursType, isItt, isTtt, profileScore columns
│   └── scraping/parsers/
│       ├── stage-race.parser.ts        # MODIFY: extract profile from sidebar
│       ├── classic.parser.ts           # MODIFY: extract profile from sidebar
│       ├── race-overview.parser.ts     # NEW: parse stage list with profiles from overview page
│       ├── profile-extractor.ts        # NEW: shared sidebar profile extraction logic
│       └── parsed-result.type.ts       # MODIFY: add profile fields
├── domain/
│   └── race-result/
│       └── race-result.entity.ts       # MODIFY: add profile properties
├── application/
│   └── analyze/
│       └── fetch-race-profile.use-case.ts  # NEW: fetch profile distribution from PCS URL
└── presentation/
    └── race-profile.controller.ts      # NEW: GET /api/race-profile endpoint

apps/web/src/
├── features/
│   └── rider-list/components/
│       ├── rider-input.tsx             # MODIFY: replace race type selector with URL input
│       └── race-profile-summary.tsx    # NEW: display profile distribution

packages/shared-types/src/
├── enums.ts                            # + ParcoursType enum
└── api.ts                              # + RaceProfileDistribution types, update AnalyzeRequest
```

**Structure Decision**: Extends existing monorepo structure. No new apps or packages. All changes within existing `apps/api`, `apps/web`, and `packages/shared-types`.
