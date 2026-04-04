# Implementation Plan: Race Selector with Auto Price Import

**Branch**: `feat/race-selector-auto-import` | **Date**: 2026-04-04 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `kitty-specs/018-race-selector-auto-import/spec.md`

## Summary

Replace the two manual URL inputs in the Setup tab (PCS race URL + GMV price list URL) with a single searchable combobox populated from the database. On selection, the backend auto-constructs the PCS URL for race profile fetching and queries the GrandesMiniVueltas WordPress REST API to fuzzy-match and auto-import the price list. Falls back to manual URL entry when no match is found.

## Technical Context

**Language/Version**: TypeScript 5.x (API + Frontend), Node.js 20+  
**Primary Dependencies**: NestJS 11 (API), React 19 + Vite (Frontend), Drizzle ORM, Tailwind CSS v4, shadcn/ui  
**Storage**: PostgreSQL 16 (existing race_results table for race catalog, in-memory cache for GMV posts)  
**Testing**: Jest (API), Vitest + RTL (Frontend), Playwright (E2E)  
**Target Platform**: Web (desktop + mobile responsive)  
**Project Type**: Monorepo (apps/api, apps/web, packages/shared-types)  
**Performance Goals**: Race list loads < 500ms, GMV auto-match < 3s (includes cache refresh if needed)  
**Constraints**: GMV WordPress API is public, no auth required. Rate limit unknown — cache aggressively.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Status | Notes |
|------|--------|-------|
| DDD/Hexagonal boundaries | PASS | New GMV client as port+adapter, use case orchestrates |
| No scraping via REST | PASS | GMV WP API is a public REST API, not scraping. Price list import reuses existing scraping adapter |
| TypeScript strict, no `any` | PASS | All new types properly defined |
| Conventional commits | PASS | Will follow existing patterns |
| English only | PASS | All code, docs, comments in English |
| Feature branch, no direct main commits | PASS | Working on `feat/race-selector-auto-import` |
| Testing coverage ≥ 90% | PASS | Unit tests for all new use cases, adapters, components |

## Project Structure

### Documentation (this feature)

```
kitty-specs/018-race-selector-auto-import/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 research
├── data-model.md        # Key entities and data flow
├── contracts/           # API contracts
│   ├── get-races.md
│   └── gmv-auto-import.md
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Source Code (repository root)

```
apps/api/src/
├── domain/
│   └── gmv/
│       └── gmv-client.port.ts           # Port: fetch GMV posts
├── application/
│   └── analyze/
│       ├── list-races.use-case.ts       # New: query distinct races from DB
│       ├── gmv-auto-import.use-case.ts  # New: cache GMV posts, fuzzy match, import
│       └── fetch-race-profile.use-case.ts  # Modified: accept slug+year (not just URL)
├── infrastructure/
│   └── gmv/
│       ├── gmv-client.adapter.ts        # Adapter: fetch WP API posts
│       ├── gmv-post-cache.service.ts    # In-memory cache with TTL
│       └── gmv.module.ts               # NestJS module wiring
└── presentation/
    └── race-catalog.controller.ts       # New: GET /api/races, GET /api/gmv-match

apps/web/src/
├── shared/
│   └── ui/
│       └── combobox.tsx                 # New: searchable combobox (cmdk + Radix)
├── features/
│   └── rider-list/
│       ├── components/
│       │   ├── rider-input.tsx          # Modified: combobox replaces URL inputs
│       │   └── race-selector.tsx        # New: combobox + filters + manual fallback
│       └── hooks/
│           ├── use-race-catalog.ts      # New: fetch race list from API
│           └── use-gmv-auto-import.ts   # New: trigger GMV match + import
└── routes/
    └── index.tsx                        # Modified: state management changes

packages/shared-types/src/
└── api.ts                               # New DTOs: RaceListItem, GmvMatchResponse
```

## Complexity Tracking

No constitution violations — no entries needed.
