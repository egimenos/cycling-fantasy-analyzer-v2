# Implementation Plan: Complete Fantasy Game Scoring Pipeline

**Branch**: `008-complete-fantasy-scoring` | **Date**: 2026-03-21 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `kitty-specs/008-complete-fantasy-scoring/spec.md`

## Summary

Extend the existing PCS scraper to parse hidden classification tabs (daily GC, mountain passes, intermediate sprints, daily regularidad) from stage pages already being fetched. Add new scoring tables to `points.py`, migrate the DB schema with new category values and optional metadata columns, run a full seed backfill (2022–present), retrain the ML model on the corrected target variable, and benchmark Spearman ρ improvement.

## Technical Context

**Language/Version**: TypeScript (NestJS backend, strict mode) + Python 3.11 (ML service)
**Primary Dependencies**: NestJS, Cheerio (parsing), Drizzle ORM (migrations), scikit-learn (ML), got-scraping (HTTP)
**Storage**: PostgreSQL 16 (existing `race_results` table extended)
**Testing**: Jest (backend unit), Vitest (frontend), pytest (ML)
**Target Platform**: Linux server (Dokploy VPS), Docker Compose locally
**Project Type**: Monorepo (Turborepo) — `apps/api`, `apps/web`, `ml/`
**Performance Goals**: Seed backfill ~462 stage pages at 1.5s throttle ≈ 12 min. No API latency impact (scraping is async CLI).
**Constraints**: PCS rate limiting (1.5s between requests). Scraping is CLI/cron only (no REST endpoints per security policy).
**Scale/Scope**: ~35K new DB rows from backfill. Single-user tool.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                   | Status | Notes                                                                                              |
| --------------------------- | ------ | -------------------------------------------------------------------------------------------------- |
| DDD/Hexagonal Architecture  | PASS   | Parser lives in infrastructure layer, scoring in domain, use case orchestrates                     |
| English only                | PASS   | All code, comments, docs in English                                                                |
| TypeScript strict mode      | PASS   | Backend changes follow strict mode                                                                 |
| Python (ML service)         | NOTED  | Constitution says "No Python in v1" but ML service already exists in production (v2). No conflict. |
| Scraping: CLI/cron only     | PASS   | Seed runs via CLI command, no REST endpoint for scraping                                           |
| Scoring logic 100% coverage | PASS   | New scoring tables in `points.py` and domain scoring service must have full test coverage          |
| Conventional Commits        | PASS   | All commits follow convention                                                                      |

**No violations. Proceeding.**

## Project Structure

### Documentation (this feature)

```
kitty-specs/008-complete-fantasy-scoring/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 research (completed during discovery)
├── data-model.md        # Data model (completed during discovery)
├── meta.json            # Feature metadata
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── research/
    ├── evidence-log.csv
    └── source-register.csv
```

### Source Code (affected paths)

```
apps/api/src/
├── infrastructure/
│   └── scraping/
│       └── parsers/              # Extended: new stage classification parsers
├── domain/
│   └── scoring/
│       └── scoring.service.ts    # Extended: new category scoring
├── application/
│   └── scraping/                 # Extended: seed use case handles new categories
└── cli.ts                        # Existing seed-database command (no changes expected)

ml/src/
├── points.py                     # Extended: new scoring tables
├── features.py                   # Extended: actual_pts includes all categories
├── data.py                       # Extended: query loads new categories
└── retrain.py                    # No changes expected (reads from DB)

apps/api/drizzle/
└── XXXX_add_stage_classifications.sql  # New migration
```

**Structure Decision**: Extends existing monorepo structure. No new packages or services. Parser additions follow the existing infrastructure/scraping/parsers/ pattern. ML changes are contained within `ml/src/`.

## Architecture

### Phase Dependency Graph

```
[1] DB Migration (new columns + category values)
        │
        ▼
[2] Parser Extensions (parse hidden tabs) ──────┐
        │                                        │
        ▼                                        ▼
[3] Scoring Tables (points.py)          [4] Seed Backfill (run by user)
        │                                        │
        ▼                                        ▼
[5] ML Target Update (features.py + data.py)
        │
        ▼
[6] Retrain + Benchmark (evaluate ρ)
```

### Key Design Decisions

**D1: Extend `race_results` table vs new table**

- Decision: Extend `race_results` with new `category` values and nullable metadata columns
- Rationale: Same entity (rider result in a scoring context), avoids JOIN complexity in ML data loading. Nullable columns add minimal overhead for existing rows.
- Alternative rejected: Separate `stage_classifications` table — adds JOIN complexity to every ML query and the scoring service for little benefit.

**D2: Parser approach — one function per tab vs unified parser**

- Decision: One parser function per classification type (daily GC, mountain passes, sprints), called from a coordinator that iterates tabs
- Rationale: Each tab has different heading formats and extraction logic. Separate functions are easier to test and debug independently.

**D3: Mountain pass category extraction**

- Decision: Regex on heading text: `/KOM Sprint \((HC|[1-4])\)\s+(.+?)\s*\((\d+(?:\.\d+)?)\s*km\)/`
- Rationale: PCS headings follow consistent format verified across multiple races (TdF 2024, Paris-Nice 2026). Regex captures category, name, and km in one pass.

**D4: Sprint intermediate detection**

- Decision: Match headings starting with `"Sprint |"`, skip `"Points at finish"` subtabs
- Rationale: "Points at finish" duplicates stage results already captured. Only intermediate sprint headings contain location data.

**D5: Multi-sprint point reduction**

- Decision: Count sprint subtabs per stage. If >1 sprint, use reduced table (3/2/1); if exactly 1, use full table (6/4/2)
- Rationale: Matches official game rules for stages with multiple intermediate sprints.

### Data Flow

```
PCS stage page HTML (already fetched by existing scraper)
    │
    ├─ Tab 0 [visible] ──→ parseStageResults()        [EXISTS]
    ├─ Tab 1 [hidden]  ──→ parseDailyGC()             [NEW] → race_results (category='gc_daily', top 10)
    ├─ Tab 2 [hidden]  ──→ parseIntermediateSprints()  [NEW] → race_results (category='sprint_intermediate')
    │                      (skip "Points at finish")
    ├─ Tab 3 [hidden]  ──→ parseMountainPasses()       [NEW] → race_results (category='mountain_pass')
    │                      + parseKomDaily()            [NEW] → race_results (category='regularidad_daily' concept via KOM today)
    └─ Tab 4/5         ──→ skip (youth/teams)

                            │
                            ▼
                     race_results table
                            │
                            ▼
              points.py: get_points() extended
                            │
                            ▼
              features.py: actual_pts = SUM(all categories)
                            │
                            ▼
              train.py → model retrained
                            │
                            ▼
              benchmark: compare ρ before/after
```

## Complexity Tracking

No constitution violations to justify.

---

_STOP: Plan complete. Run `/spec-kitty.tasks` to generate work packages._
