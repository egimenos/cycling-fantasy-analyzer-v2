# Research: PCS Scraping Strategy & Validation Guardrails

**Feature**: 001-cycling-fantasy-team-optimizer
**Date**: 2026-03-15
**Status**: Complete
**Depends on**: research.md (general findings), previous project analysis (egimenos/cycling-fantasy-league-analyzer)

---

## Executive Summary

This document details the complete scraping strategy for ProCyclingStats (PCS), covering:
1. **Race discovery** — how to obtain the list of races to scrape
2. **Per-case scraping strategies** — exact approach for each page type
3. **Validation guardrails** — checks to ensure parsed data is correct, not just "some data"
4. **Cloudflare mitigation** — handling anti-bot protection

All strategies are based on analysis of a working Python scraper (egimenos/cycling-fantasy-league-analyzer, ~August 2025) and the `themm1/procyclingstats` community package.

---

## 1. Race Discovery Strategy

### Problem
How do we obtain the list of races to scrape? The current spec proposes a static `RACE_CATALOG` hardcoded in the domain. This is fragile and requires manual updates every season.

### Recommended Approach: Dynamic Discovery + Domain Validation

Scrape the PCS race calendar dynamically, then validate against domain knowledge.

#### 1.1 PCS Calendar URL Pattern

```
https://www.procyclingstats.com/races.php?year={year}&circuit={circuit_id}&filter=Filter
```

| Circuit | ID | Description |
|---------|-----|-------------|
| UCI WorldTour | `1` | Top-tier races (Grand Tours, Monuments, major stage races) |
| UCI ProSeries | `26` | Second-tier professional races |
| Europe Tour | `13` | Third-tier (optional — may include too many small races) |

**Decision**: Scrape circuits `1` (WorldTour) and `26` (ProSeries) for v1. Skip Europe Tour to reduce noise.

#### 1.2 Calendar Page HTML Structure

```html
<table class="basic">
  <thead>
    <tr>
      <th>Date</th>
      <th>Race</th>
      <th>Cat.</th>
      <th>Class</th>
      <th>Winner</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>25.01 - 02.02</td>
      <td><a href="race/tour-down-under/2025/gc">Tour Down Under</a></td>
      <td>ME</td>
      <td>2.UWT</td>
      <td><a href="rider/...">Winner Name</a></td>
    </tr>
    <tr>
      <td>22.03</td>
      <td><a href="race/milano-sanremo/2025/result">Milano-Sanremo</a></td>
      <td>ME</td>
      <td>1.UWT</td>
      <td><a href="rider/...">Winner Name</a></td>
    </tr>
  </tbody>
</table>
```

#### 1.3 Parsing Strategy

```
Selector: table.basic (or table[class*="basic"])
For each row in tbody:
  1. Extract href from the <a> in the Race column
  2. Strip trailing /gc, /result, /results from href → base race URL
  3. Read Class column text:
     - Starts with "2." → STAGE_RACE (e.g., "2.UWT", "2.Pro")
     - Starts with "1." → ONE_DAY (e.g., "1.UWT", "1.Pro")
  4. Read Cat. column: filter to "ME" only (men's elite)
  5. Deduplicate by base race URL
```

#### 1.4 Race Discovery Guardrails

| Check | Rule | Action on failure |
|-------|------|-------------------|
| **Minimum race count** | WorldTour circuit must yield >= 25 races per year | FAIL — page structure likely changed |
| **Expected races present** | Grand Tours (tour-de-france, giro-d-italia, vuelta-a-espana) must appear | WARN — scraping may have missed them |
| **No duplicate slugs** | After deduplication, no race appears twice | FAIL — parsing logic error |
| **Valid href format** | Every href must match `race/[a-z0-9-]+/\d{4}` | SKIP entry — malformed link |
| **Only men's races** | Cat. column must be "ME" (filter out WE = women's elite) | SKIP entry |
| **Class validation** | Class must start with "1." or "2." | SKIP entry — unknown category |

---

## 2. Scraping Strategies by Race Type

### 2.1 Stage Race (Grand Tours & Mini Tours)

**Examples**: Tour de France, Giro d'Italia, Paris-Nice, Tirreno-Adriatico

#### 2.1.1 Entry Point: GC Page

```
URL: /race/{slug}/{year}/gc
```

**Purpose**: Get race metadata AND discover all classification/stage URLs.

**HTML Structure for navigation**:
```html
<div class="selectNav">
  <a>« PREV</a>
  <a>NEXT »</a>
  <select>
    <option value="race/tour-de-france/2024/stage-1">Stage 1</option>
    <option value="race/tour-de-france/2024/stage-2">Stage 2</option>
    ...
    <option value="race/tour-de-france/2024/stage-21">Stage 21</option>
    <option value="race/tour-de-france/2024/points">Points classification</option>
    <option value="race/tour-de-france/2024/kom">Mountains classification</option>
    <option value="race/tour-de-france/2024/gc">Final GC</option>
    <option value="race/tour-de-france/2024/teams">Teams classification</option>
    <option value="race/tour-de-france/2024/youth">Youth classification</option>
  </select>
</div>
```

**Parsing Strategy**:
```
1. Find div.selectNav that contains PREV/NEXT links
2. Find the <select> within that container
3. For each <option>:
   - Skip if URL contains "teams" or "youth"
   - If URL matches /stage-(\d+)/ AND does NOT contain "points" or "kom":
     → classify as STAGE, extract stage number
   - If option text contains "points classification":
     → classify as SPRINT/POINTS
   - If option text contains "mountains classification":
     → classify as MOUNTAIN/KOM
   - If option text contains "final gc":
     → classify as GC/GENERAL
4. Result: list of (url, classification_type, stage_number?) tuples
```

#### 2.1.2 Results Table (shared structure for all classification pages)

Every classification page (GC, stage, points, KOM) uses the same table structure:

```html
<div class="resTab">               <!-- may have class "hide" if not active tab -->
  <table class="results">
    <thead>
      <tr>
        <th></th>                   <!-- rank/position column (sometimes empty header) -->
        <th>Rider</th>
        <th>Team</th>              <!-- or "Tm" for compact tables -->
        <th>Time</th>              <!-- or "Points" or "Pnt" depending on classification -->
        <th>Pnt</th>               <!-- PCS points -->
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>1</td>                 <!-- position -->
        <td><a href="rider/tadej-pogacar">POGAČAR Tadej</a></td>
        <td>UAE Team Emirates</td>
        <td>83h 38' 56"</td>
        <td>850</td>
      </tr>
      <tr>
        <td>2</td>
        <td><a href="rider/jonas-vingegaard">VINGEGAARD Jonas</a></td>
        <td>Team Visma | Lease a Bike</td>
        <td>+ 6:17</td>
        <td>600</td>
      </tr>
      <!-- DNF example -->
      <tr>
        <td>DNF</td>
        <td><a href="rider/some-rider">RIDER Name</a></td>
        <td>Team Name</td>
        <td></td>
        <td></td>
      </tr>
    </tbody>
  </table>
</div>
```

**Key Selector**: `div.resTab:not(.hide) table.results`
- The `:not(.hide)` ensures we get the active/visible tab's table
- Multiple `div.resTab` may exist on one page (different classification tabs)

**Row Parsing Strategy**:
```
For each <tr> in tbody:
  1. Get all <td> cells
  2. Determine column indices from thead headers:
     - Find index of "Rider" header
     - Find index of "Team" or "Tm" header
     - Find index of "Pnt" header (PCS points) — OPTIONAL for our use case
  3. Position: first <td> text
     - If numeric → valid position
     - If "DNF", "DNS", "OTL", "DSQ" → position = null, dnf = true
     - If empty → skip row (separator/header row)
  4. Rider: find <a> in the Rider cell
     - Name: link text (format: "LASTNAME Firstname")
     - Slug: href attribute (format: "rider/firstname-lastname")
  5. Team: text of Team cell
```

#### 2.1.3 What to Scrape per Stage Race

| Classification | URL Pattern | Category | Stage # | What we capture |
|---------------|-------------|----------|---------|-----------------|
| **GC Final** | `/race/{slug}/{year}/gc` | `GC` | null | Position of every rider in final GC standings |
| **Each Stage** | `/race/{slug}/{year}/stage-{n}` | `STAGE` | n | Finishing position of every rider in that stage |
| **Points/Sprint** | `/race/{slug}/{year}/points` | `SPRINT` | null | Final points classification positions |
| **Mountains/KOM** | `/race/{slug}/{year}/kom` | `MOUNTAIN` | null | Final mountains classification positions |

**Note**: We capture **positions** (1st, 2nd, 3rd...), NOT PCS points. PCS points are their own weighting system incompatible with our scoring engine.

#### 2.1.4 Stage Race Guardrails

| Check | Rule | Action on failure |
|-------|------|-------------------|
| **Stage count** | Grand Tour: 21 stages. Mini tour: 4-8 stages typically | WARN if outside expected range |
| **GC rider count** | Grand Tour GC: 100-180 riders. Mini tour: 80-200 | WARN if < 50 or > 250 |
| **Stage rider count** | Each stage should have >= 80% of GC riders | WARN — possible parsing error |
| **Position sequence** | Positions must be sequential: 1, 2, 3, ... with no gaps (DNFs appear at end with null position) | FAIL — parsing logic error |
| **No duplicate positions** | No two riders share the same position in any classification | FAIL — parsing error |
| **Winner validation** | For fixture tests: GC winner must match known result (e.g., TdF 2024 = Pogačar) | FAIL — wrong data parsed |
| **Rider slug format** | Every rider slug must match `rider/[a-z0-9-]+` | WARN — unexpected format |
| **Rider name non-empty** | Every parsed rider must have a non-empty name | FAIL — parsing error |
| **Team name non-empty** | Every parsed rider must have a non-empty team | WARN — sometimes legitimately missing |
| **Classification completeness** | Must find GC, Points, KOM, and >= N stages | WARN if any classification missing |
| **Select menu exists** | The `div.selectNav` with `<select>` must be found | FAIL — page structure changed |

---

### 2.2 One-Day Race (Classics)

**Examples**: Milano-Sanremo, Tour of Flanders, Paris-Roubaix, Liège-Bastogne-Liège

#### 2.2.1 Entry Point

```
URL: /race/{slug}/{year}/result  (or just /race/{slug}/{year})
```

The URL from the calendar page may end in `/result` or `/gc`. For one-day races, both typically work, but `/result` is the canonical endpoint.

#### 2.2.2 HTML Structure

Same `div.resTab:not(.hide) table.results` structure as stage races.
- Single results table with finishing positions
- No `div.selectNav` with stage navigation
- Category is always `FINAL`
- No `stageNumber`

#### 2.2.3 What to Scrape per Classic

| Classification | URL Pattern | Category | Stage # | What we capture |
|---------------|-------------|----------|---------|-----------------|
| **Final Result** | `/race/{slug}/{year}/result` | `FINAL` | null | Finishing position of every rider |

#### 2.2.4 Classic Race Guardrails

| Check | Rule | Action on failure |
|-------|------|-------------------|
| **Rider count** | Classics: 100-250 starters, finisher count varies | WARN if < 50 or > 300 |
| **Position sequence** | Positions must be sequential starting from 1 | FAIL — parsing error |
| **No duplicate positions** | No two riders share the same position | FAIL — parsing error |
| **Single classification** | Only one FINAL classification should exist | FAIL if multiple found |
| **Winner validation** | For fixture tests: winner must match known result | FAIL — wrong data parsed |
| **DNF handling** | DNF riders should have position = null, dnf = true | FAIL if DNF has numeric position |

---

### 2.3 Race Metadata Extraction

On any race page, extract the race name and year from the `<h1>` tag:

```html
<h1>2024 Tour de France</h1>
```

**Parsing**:
```
1. Find h1 tag (or .page-title > .main > h1)
2. Extract text
3. Year: regex /^\d{4}/ from the title text
4. Name: full title text
```

**Guardrail**: Year extracted from title must match year in the URL.

---

## 3. Complete Scraping Flow

```
SCRAPE YEAR (year: number)
│
├─ 1. DISCOVER RACES
│   ├─ Fetch /races.php?year={year}&circuit=1&filter=Filter   (WorldTour)
│   ├─ Fetch /races.php?year={year}&circuit=26&filter=Filter  (ProSeries)
│   ├─ Parse table.basic → list of (raceUrl, raceType)
│   ├─ Deduplicate by base URL
│   └─ VALIDATE: >= 25 races, Grand Tours present, no duplicates
│
├─ 2. FOR EACH RACE
│   │
│   ├─ 2a. IF ONE_DAY (classic):
│   │   ├─ Fetch /race/{slug}/{year}/result
│   │   ├─ Parse results table → positions
│   │   ├─ VALIDATE: sequential positions, rider count in range
│   │   └─ Save: race + FINAL classification
│   │
│   └─ 2b. IF STAGE_RACE:
│       ├─ Fetch /race/{slug}/{year}/gc
│       ├─ Extract select menu → list of classification URLs
│       ├─ VALIDATE: select menu found, expected classifications present
│       │
│       ├─ FOR EACH CLASSIFICATION URL:
│       │   ├─ Fetch page
│       │   ├─ Parse results table → positions
│       │   ├─ VALIDATE: sequential positions, rider count
│       │   └─ Save classification results
│       │
│       └─ VALIDATE: GC + stages + points + KOM all present
│
└─ 3. FINAL VALIDATION
    ├─ Total riders across all races > 500 (sanity)
    ├─ No race returned 0 results (all parsed something)
    └─ Log summary: races scraped, total riders, any warnings
```

---

## 4. Shared Validation Module

Create a dedicated validation layer that runs after each parse operation:

### 4.1 ParsedResultsValidator

```typescript
interface ValidationResult {
  valid: boolean;
  warnings: string[];
  errors: string[];
}

// Validates a single classification's parsed results
function validateClassificationResults(
  results: ParsedResult[],
  context: {
    raceSlug: string;
    classificationType: string;
    stageNumber?: number;
    expectedMinRiders?: number;
    expectedMaxRiders?: number;
  }
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Non-empty results
  if (results.length === 0) {
    errors.push(`No results parsed for ${context.classificationType}`);
    return { valid: false, warnings, errors };
  }

  // 2. Position sequence check
  const positions = results
    .filter(r => r.position !== null)
    .map(r => r.position!)
    .sort((a, b) => a - b);

  for (let i = 0; i < positions.length; i++) {
    if (positions[i] !== i + 1) {
      errors.push(
        `Position gap: expected ${i + 1}, got ${positions[i]} ` +
        `in ${context.raceSlug} ${context.classificationType}`
      );
      break;
    }
  }

  // 3. No duplicate positions
  const positionSet = new Set(positions);
  if (positionSet.size !== positions.length) {
    errors.push(`Duplicate positions found in ${context.raceSlug}`);
  }

  // 4. Rider count range
  const min = context.expectedMinRiders ?? 50;
  const max = context.expectedMaxRiders ?? 300;
  if (results.length < min || results.length > max) {
    warnings.push(
      `Unexpected rider count: ${results.length} ` +
      `(expected ${min}-${max}) in ${context.raceSlug}`
    );
  }

  // 5. DNF consistency
  for (const r of results) {
    if (r.dnf && r.position !== null) {
      errors.push(`DNF rider "${r.riderName}" has position ${r.position}`);
    }
    if (!r.dnf && r.position === null && r.riderName) {
      warnings.push(`Non-DNF rider "${r.riderName}" has null position`);
    }
  }

  // 6. Rider data completeness
  for (const r of results) {
    if (!r.riderName || r.riderName.trim() === '') {
      errors.push('Empty rider name found');
    }
    if (!r.riderSlug || !/^rider\/[a-z0-9-]+$/.test(r.riderSlug)) {
      warnings.push(`Invalid rider slug format: "${r.riderSlug}"`);
    }
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
  };
}
```

### 4.2 Expected Rider Count Ranges

| Race Type | Classification | Min Riders | Max Riders |
|-----------|---------------|------------|------------|
| Grand Tour | GC Final | 100 | 180 |
| Grand Tour | Stage | 80 | 200 |
| Grand Tour | Points/KOM | 20 | 180 |
| Mini Tour | GC Final | 60 | 200 |
| Mini Tour | Stage | 50 | 200 |
| Classic | Final | 80 | 250 |

### 4.3 Stage Race Completeness Check

```typescript
function validateStageRaceCompleteness(
  classifications: { type: string; stageNumber?: number }[],
  raceSlug: string,
  expectedStages?: number,
): ValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  const types = new Set(classifications.map(c => c.type));

  if (!types.has('GC')) errors.push(`Missing GC classification for ${raceSlug}`);
  if (!types.has('SPRINT')) warnings.push(`Missing sprint/points classification for ${raceSlug}`);
  if (!types.has('MOUNTAIN')) warnings.push(`Missing mountain/KOM classification for ${raceSlug}`);

  const stages = classifications
    .filter(c => c.type === 'STAGE' && c.stageNumber != null)
    .map(c => c.stageNumber!);

  if (stages.length === 0) {
    errors.push(`No individual stages found for ${raceSlug}`);
  } else if (expectedStages && stages.length !== expectedStages) {
    warnings.push(
      `Expected ${expectedStages} stages, found ${stages.length} for ${raceSlug}`
    );
  }

  // Check stage numbers are sequential
  const sorted = [...stages].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i] !== i + 1) {
      warnings.push(`Stage sequence gap: expected stage ${i + 1}, found ${sorted[i]}`);
      break;
    }
  }

  return { valid: errors.length === 0, warnings, errors };
}
```

---

## 5. Cloudflare / Anti-Bot Mitigation

### Current Situation
As of March 2026, PCS uses Cloudflare protection that returns 403 for standard HTTP clients (curl, Axios, WebFetch). The previous Python project (~August 2025) used plain `requests.get()` successfully, meaning Cloudflare protection was either weaker or not present at that time.

### Mitigation Options (ranked by preference)

| Option | Complexity | Reliability | Performance |
|--------|-----------|-------------|-------------|
| **A. Axios with full browser headers + cookies** | Low | Medium | Fast |
| **B. cloudscraper or similar anti-bot library** | Low | Medium-High | Fast |
| **C. Playwright headless browser** | Medium | High | Slow (~2s/page) |
| **D. Proxy rotation service** | High | High | Variable |

### Recommendation for v1

**Try Option A first** (Axios with proper headers), fall back to **Option C** (Playwright) if needed.

For Axios, set these headers:
```typescript
{
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ...',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
}
```

If Cloudflare requires a JS challenge, Axios won't work and we'll need Playwright. The PcsClientAdapter should be designed as a port/adapter so the HTTP transport can be swapped without changing parsers.

### Key Design Principle
**Parsers must be pure functions**: They accept HTML strings, return parsed data. They don't know HOW the HTML was fetched. This means:
- If we switch from Axios to Playwright, only the fetcher changes
- Parsers remain testable with static HTML fixtures
- Validation runs the same regardless of transport

---

## 6. Data Model: What We Capture vs What We Skip

### We Capture (per result row)
- `position`: integer (1, 2, 3, ...) or null for DNF/DNS
- `riderName`: string (as displayed: "POGAČAR Tadej")
- `riderSlug`: string (from href: "rider/tadej-pogacar")
- `teamName`: string
- `dnf`: boolean
- `category`: GC | STAGE | SPRINT | MOUNTAIN | FINAL
- `stageNumber`: integer | null

### We Skip
- **PCS points** — incompatible with our scoring engine
- **Time gaps** — not needed for position-based scoring
- **UCI points** — not relevant to our model
- **Nationality** — can be scraped separately from rider profiles if needed
- **Team classification** — not relevant to individual rider scoring
- **Youth classification** — subset of GC, not independently valuable

---

## 7. Key Selectors Reference (Quick Reference)

| Page | Element | Selector | Notes |
|------|---------|----------|-------|
| Calendar | Race table | `table.basic` or `table[class*="basic"]` | Contains all races for a circuit/year |
| Calendar | Race link | `tbody tr td a` (in Race column) | href = race URL with /gc or /result suffix |
| Calendar | Race class | `tbody tr td` (Class column) | Text like "2.UWT", "1.Pro" |
| Any race | Results table | `div.resTab:not(.hide) table.results` | Active tab's results |
| Any race | Table headers | `thead th` | Look for "Rider", "Team"/"Tm", "Pnt" |
| Any race | Result row | `tbody tr` | Each row = one rider result |
| Any race | Rider link | `td a[href*="rider/"]` | Name in text, slug in href |
| Any race | Position | First `td` text | Numeric or "DNF"/"DNS"/"OTL" |
| Stage race | Navigation | `div.selectNav select option` | All classification URLs |
| Any race | Race title | `h1` | Contains year + race name |

---

## 8. Fixture Test Strategy

### Required Fixtures (to capture manually from a browser)

| Fixture File | Source URL | Purpose |
|-------------|-----------|---------|
| `races-calendar-2024-uwt.html` | `/races.php?year=2024&circuit=1&filter=Filter` | Race discovery parsing |
| `tdf-2024-gc.html` | `/race/tour-de-france/2024/gc` | GC + select menu parsing |
| `tdf-2024-stage-1.html` | `/race/tour-de-france/2024/stage-1` | Stage result parsing |
| `tdf-2024-points.html` | `/race/tour-de-france/2024/points` | Points classification |
| `tdf-2024-kom.html` | `/race/tour-de-france/2024/kom` | Mountain classification |
| `msr-2024.html` | `/race/milano-sanremo/2024/result` | Classic result parsing |
| `paris-nice-2024-gc.html` | `/race/paris-nice/2024/gc` | Mini tour GC parsing |

### Known Results for Fixture Validation

| Race | Year | GC Winner | Stage 1 Winner |
|------|------|-----------|----------------|
| Tour de France | 2024 | Tadej Pogačar (rider/tadej-pogacar) | Romain Bardet |
| Milano-Sanremo | 2024 | Jasper Philipsen | — |
| Paris-Nice | 2024 | Matteo Jorgenson | — |

### How to Capture Fixtures

Since PCS blocks automated requests, fixtures must be captured manually:

1. Open the URL in a real browser
2. Right-click → "Save Page As" → "Web Page, HTML Only"
3. Save to `apps/api/test/fixtures/pcs/`
4. Trim to relevant sections if > 500KB (keep `<table class="results">` and `<div class="selectNav">`)

Alternatively, use a one-time Playwright script to capture all fixtures in batch.

---

## 9. Open Questions

| # | Question | Impact | Proposed Resolution |
|---|----------|--------|-------------------|
| Q1 | Has PCS changed their HTML structure since the Python project (Aug 2025)? | HIGH | Capture fresh fixtures and validate selectors before coding parsers |
| Q2 | Does Axios with browser headers bypass Cloudflare in 2026? | HIGH | Test during T013 implementation; have Playwright fallback ready |
| Q3 | Should we capture rider nationality from result pages or separate rider profile pages? | LOW | Skip for v1; nationality is in the riders table but not critical for scoring |
| Q4 | How to handle split/cancelled stages (e.g., TdF 2024 had a rest day stage renumbering)? | MEDIUM | Use the stage numbers from PCS URLs; our system doesn't care about gaps |
| Q5 | Rate limiting: is 1500ms between requests sufficient, or will PCS still throttle/block? | MEDIUM | Start with 1500ms; increase to 2500ms if we see 429 responses |

---

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Dynamic race discovery from PCS calendar pages, not static catalog | Avoids manual updates each season; the previous Python project used this successfully |
| D2 | Keep `RACE_CATALOG` as domain validation (expected races), not as the discovery source | Domain layer defines what races we care about; infrastructure discovers what's available; intersection is what we scrape |
| D3 | Capture positions, not PCS points | Positions are atomic data; scoring is computed downstream |
| D4 | Pure parser functions + separate HTTP fetcher | Testability, Cloudflare transport swappable |
| D5 | Validation module runs after every parse operation, before persistence | Catch silent breakage before bad data enters the database |
| D6 | Fixture files captured manually from browser | Cloudflare blocks automated capture; fixtures are stable test data |
