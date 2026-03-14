# Research: Cycling Fantasy Team Optimizer

**Feature**: 001-cycling-fantasy-team-optimizer
**Date**: 2026-03-14
**Status**: Complete

---

## Research Questions

1. What is the HTML structure of procyclingstats.com and what data is available for scraping?
2. Is there a native API for PCS, or is HTML scraping required?
3. What is the best fuzzy matching approach for resolving rider name/team mismatches in TypeScript?
4. How should the scraping pipeline be implemented given our TypeScript-first stack?

---

## Findings

### RQ1 — PCS Data Structure & URL Patterns

No native JSON API exists on procyclingstats.com. All data extraction requires HTML scraping. The site uses server-side rendering, so requests with standard HTTP headers are sufficient — no headless browser required.

**Key URL patterns:**

| Data | URL Pattern |
|------|-------------|
| Rider profile | `/rider/{slug}` (e.g., `/rider/tadej-pogacar`) |
| Rider season results | `/rider/{slug}/{year}` |
| Race GC results | `/race/{race-slug}/{year}/gc` |
| Race stage list | `/race/{race-slug}/{year}/stages` |
| Individual stage | `/race/{race-slug}/{year}/stage-{n}` |
| Race startlist | `/race/{race-slug}/{year}/startlist` |
| Rider search | `/riders.php?{firstname,lastname,nationality}` |

**Data available per page:**

- **Rider profile**: career stats, team history, season summaries
- **GC results**: rank, rider name, team, time gap, PCS points, rider URL
- **Stage results**: winner, all finishers, GC/points/KOM sub-tables at stage level
- **Startlist**: all riders in a race with team and rider URL

**HTML parsing approach**: CSS selector-based table/list extraction. PCS uses standard HTML tables without heavy JavaScript dependencies.

**⚠ Risk**: PCS updates its HTML layout periodically (confirmed issues reported ~July 2025). This can silently break scrapers. Mitigation: integration tests against live pages + structured error detection.

---

### RQ2 — Official Python Package vs. TypeScript Scraping

**Key discovery**: An official, actively maintained Python package exists — `procyclingstats` (PyPI, GitHub: `themm1/procyclingstats`).

| Aspect | Python (`procyclingstats` pkg) | TypeScript (custom, Axios + Cheerio) |
|--------|-------------------------------|--------------------------------------|
| Maintenance | Community-maintained, handles layout changes | Self-maintained, fragile to site changes |
| Integration with our stack | Requires Python sidecar service | Native to NestJS monorepo |
| Data classes | `Rider`, `Race`, `Stage`, `RaceStartlist` | Custom implementation |
| Reliability | Higher (community monitors layout changes) | Lower (we own breakage detection) |
| Complexity | Adds Python service to Docker Compose | Simpler — single language |

**Decision**: Use TypeScript (Axios + Cheerio) for v1 to keep the stack simple. Accept the maintenance risk by:
1. Writing integration tests that run against real PCS pages on a schedule
2. Structuring scrapers as isolated adapters (hexagonal pattern) so they can be swapped for the Python package later if maintenance cost grows.

**If scraper breakage becomes frequent post-launch, migrate to Python sidecar wrapping the `procyclingstats` package.** This is the defined fallback path.

---

### RQ3 — Fuzzy Matching: Rider Identity Resolution

**Requirement**: Match rider entries from a pasted price list (name + team) against PCS profiles (name + team). Mismatches arise from accented characters, name abbreviations, and team name variations (e.g., `UAE Team Emirates` vs `UAE Team Emirates-XRG`).

**Recommendation: `fuzzysort` v3.1.0+**

| Library | Multi-field | Accent handling | Bundle | Status |
|---------|-------------|----------------|--------|--------|
| fuzzysort | ✅ (keys + weights) | ✅ built-in v3.1+ | 5KB | Active |
| fuse.js | ✅ (keys + weights) | ✅ with preprocessing | 13KB | Active |
| string-similarity | ❌ | ❌ | small | **Archived** |
| uFuzzy | ❌ native multi-field | partial | 7.5KB | Active |

**fuzzysort** wins: native accent/diacritic handling, multi-field weighted search, 5KB bundle, full TypeScript support.

**Matching strategy:**
1. Pre-normalize both datasets with NFD unicode normalization (`str.normalize('NFD').replace(/[\u0300-\u036f]/g, '')`) as an additional safety layer
2. Run `fuzzysort.go(priceListName, pcsRiders, { keys: [{key:'name', weight:2}, {key:'team', weight:1}] })`
3. Accept match if score exceeds configured confidence threshold (tunable, default conservative)
4. Flag riders below threshold as `unmatched` — displayed in UI with no score

---

### RQ4 — Knapsack Optimization Algorithm

**Requirement**: Select 9 riders from ~200 that maximize total projected score within a hillios budget constraint. This is a **0/1 knapsack problem**.

**Approach for v1**: Dynamic programming knapsack.
- Input: list of riders with `(score, price)` tuples, budget B, team size = 9
- Complexity: O(n × B × k) where n = riders, B = budget in hillios, k = max team size
- With n ≈ 200, B ≈ 2000, k = 9: computationally trivial for server-side execution
- NestJS can solve this in-memory per request — no distributed computing needed

**TypeScript library**: No external library needed. Implement as a pure domain function.

---

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Use TypeScript (Axios + Cheerio) for PCS scraping, not the Python package | Keep stack simple; accept maintenance risk; scrapers isolated as hexagonal adapters for easy future swap |
| D2 | Use `fuzzysort` for rider name/team matching | Best accent handling, multi-field support, smallest bundle, active maintenance |
| D3 | Apply NFD unicode normalization before fuzzy matching as preprocessing step | Defense-in-depth; handles edge cases fuzzysort may miss |
| D4 | Implement knapsack optimization as a pure TypeScript domain function (DP) | No external dependency needed; O(n×B×k) is trivial at this scale |
| D5 | Scrape GC, stage wins, mountain classification, and sprint classification from per-race pages, not rider profile pages | Race result pages have structured tables; rider profile pages aggregate but are harder to parse by race type |

---

## Open Questions / Risks

- **R1 (HIGH)**: PCS HTML layout changes can break scrapers silently. Mitigation: scheduled integration tests against live pages; alerts on parse failures. Fallback: Python sidecar with `procyclingstats` package.
- **R2 (MEDIUM)**: `robots.txt` on PCS not verified. Must check before deploying scraping pipeline at scale. Implement polite scraping (1-2s delays, respectful User-Agent).
- **R3 (MEDIUM)**: Rider slug generation for PCS URLs (e.g., "Tadej Pogačar" → `tadej-pogacar`) needs a reliable normalization function. Edge cases: compound surnames, generational suffixes (Jr./Sr.).
- **R4 (LOW)**: The scoring model uses historical data from "the same race type". Need to define canonical race type taxonomy that maps PCS race categories to our three types: Grand Tour, Classic, Mini-Tour.
- **R5 (LOW)**: Budget is in hillios (integer values). Knapsack DP table size = budget × team_size. Max budget 2000H is fine for DP; no performance concern.
