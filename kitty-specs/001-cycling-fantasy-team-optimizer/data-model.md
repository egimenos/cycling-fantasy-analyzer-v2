# Data Model: Cycling Fantasy Team Optimizer

**Feature**: 001-cycling-fantasy-team-optimizer
**Date**: 2026-03-14
**Status**: Draft (pre-planning)

---

## Overview

The system has two distinct data concerns:

1. **Persistent data** — scraped from PCS, stored in the database, updated by the pipeline
2. **Ephemeral data** — computed at request time from the persistent store + user input; never stored

---

## Persistent Entities (stored in DB)

### Rider

Canonical identity of a professional cyclist as known by PCS.

| Attribute | Type | Notes |
|-----------|------|-------|
| `id` | UUID | Internal PK |
| `pcs_slug` | string | PCS URL slug (e.g., `tadej-pogacar`) — unique |
| `full_name` | string | As displayed on PCS (may contain accents) |
| `normalized_name` | string | NFD-normalized, accent-stripped version for matching |
| `current_team` | string | Team name as of last scrape |
| `nationality` | string | 2-char country code |
| `last_scraped_at` | datetime | Timestamp of last successful data fetch |

---

### RaceResult

A single raw position entry for a rider in a specific race and scoring category.
**Only raw positions are stored** — no PCS points. All derived scores are computed downstream by the scoring engine.

| Attribute | Type | Notes |
|-----------|------|-------|
| `id` | UUID | Internal PK |
| `rider_id` | UUID | FK → Rider |
| `race_slug` | string | PCS race slug (e.g., `tour-de-france`) |
| `race_name` | string | Human-readable name |
| `race_type` | enum | `grand_tour` \| `classic` \| `mini_tour` |
| `race_class` | enum | `UWT` \| `Pro` \| `1` — only professional men's categories |
| `year` | integer | Season year |
| `category` | enum | See below by race type |
| `position` | integer | Finishing position (1-based); null if DNF/DNS |
| `stage_number` | integer | Only for `stage` category; null otherwise |
| `dnf` | boolean | Did Not Finish flag |
| `scraped_at` | datetime | When this record was created/updated |

**Categories by race type:**

| Race Type | Categories |
|-----------|-----------|
| Stage race (GT, mini-tour) | `gc`, `stage`, `mountain`, `sprint` |
| Classic (one-day) | `final` |

**Unique constraint**: `(rider_id, race_slug, year, category, stage_number)`

**Scope constraints:**
- Men's races only — women's races excluded
- Professional categories only: UCI WorldTour (.UWT), ProSeries (.Pro), .1 races
- Excluded: amateur categories (.2, 2.2, 1.2)

---

### ScrapeJob

Tracks the status of each scraping pipeline execution.

| Attribute | Type | Notes |
|-----------|------|-------|
| `id` | UUID | Internal PK |
| `race_slug` | string | Race being scraped |
| `year` | integer | Season being scraped |
| `status` | enum | `pending` \| `running` \| `success` \| `failed` |
| `started_at` | datetime | |
| `completed_at` | datetime | nullable |
| `error_message` | string | nullable; populated on failure |
| `records_upserted` | integer | Count of records created/updated |

---

## Ephemeral Entities (computed, never stored)

### PriceListEntry

A rider entry parsed from the user's pasted price list.

| Attribute | Type | Notes |
|-----------|------|-------|
| `raw_name` | string | As pasted by user |
| `raw_team` | string | As pasted by user |
| `price_hillios` | integer | Price in the game's currency |
| `matched_rider_id` | UUID \| null | Resolved via fuzzy match against Rider table |
| `match_confidence` | float | 0–1 score from fuzzysort |
| `unmatched` | boolean | True if no match above confidence threshold |

---

### RiderScore

Computed score for a rider in the context of a specific upcoming race type.

| Attribute | Type | Notes |
|-----------|------|-------|
| `rider_id` | UUID | |
| `race_type` | enum | `grand_tour` \| `classic` \| `mini_tour` |
| `projected_gc_pts` | float | Weighted avg GC points projection |
| `projected_stage_pts` | float | Weighted avg stage win points projection |
| `projected_mountain_pts` | float | Weighted avg mountain classification projection |
| `projected_sprint_pts` | float | Weighted avg sprint classification projection |
| `projected_daily_pts` | float | Weighted avg daily stage points projection |
| `total_projected_pts` | float | Sum of all category projections |
| `seasons_used` | integer | Number of seasons with data (1–3) |

**Scoring weights (temporal decay)**:
- Current season (year N): × 1.0
- Previous season (year N-1): × 0.6
- Two seasons ago (year N-2): × 0.3

---

### TeamSelection

A set of 9 PriceListEntries representing the user's or system's optimal team.

| Attribute | Type | Notes |
|-----------|------|-------|
| `riders` | PriceListEntry[9] | Exactly 9 riders |
| `total_cost_hillios` | integer | Sum of all rider prices |
| `total_projected_pts` | float | Sum of all rider RiderScores |
| `budget_remaining` | integer | Budget - total_cost |
| `is_budget_valid` | boolean | total_cost ≤ configured budget |

---

## Race Type Taxonomy

Maps PCS race categories to our three internal types:

| Internal Type | PCS Race Examples | Page Structure |
|--------------|-------------------|----------------|
| `grand_tour` | Tour de France, Giro d'Italia, Vuelta a España | Multi-page: `/gc`, `/stage-{n}`, classification sub-tables |
| `mini_tour` | Paris-Nice, Tirreno-Adriatico, Critérium du Dauphiné, Tour de Romandie, Volta a Catalunya | Multi-page: same as Grand Tour |
| `classic` | Milan-San Remo, Tour of Flanders, Paris-Roubaix, Liège-Bastogne-Liège, Il Lombardia | Single page: `/race/{slug}/{year}` — one results table |

**Excluded from scope:**
- Women's races (all categories)
- Amateur/continental: .2, 2.2, 1.2 race classes

---

## Key Relationships

```
Rider (1) ──── (N) RaceResult
Rider (1) ──── (N) [computed] RiderScore
PriceListEntry (N) ──── (0..1) Rider  [via fuzzy match]
TeamSelection (1) ──── (9) PriceListEntry
ScrapeJob (1) ──── (N) RaceResult  [tracks what was scraped]
```

---

## Storage Notes

- Persistent entities: PostgreSQL (both local via Docker Compose and production) — full environment parity
- ORM: Drizzle ORM (TypeScript-native, SQL-like query builder, fits DDD/hexagonal behind repository ports)
- No caching layer required for v1 — RiderScore is computed on-demand from DB queries
- RaceResult records are upserted (not duplicated) on re-scrape
- DB schema should be managed via migrations (not auto-sync)
