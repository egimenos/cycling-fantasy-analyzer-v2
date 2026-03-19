# Research: Scoring Benchmark Harness

**Feature**: 004-scoring-benchmark-harness
**Date**: 2026-03-19

## R1: PCS Startlist Page Structure

**Decision**: Parse startlists from `https://www.procyclingstats.com/race/{slug}/{year}/startlist`

**Rationale**: PCS startlist pages follow a consistent structure with rider entries in a results table. Each entry contains rider name, PCS slug (in the link href), team name, and bib number. The existing `parseResultsTable` utility can be adapted for startlists since the HTML structure is similar to results pages (table rows with rider links).

**Alternatives considered**:

- FirstCycling API: less complete startlist data, additional dependency
- Manual startlist input: defeats automation purpose

**Implementation notes**:

- Startlist URL pattern: `race/{slug}/{year}/startlist`
- Rider slug extracted from `<a href="/rider/{slug}">` links
- Team name from team column
- Bib number from first column (integer)
- Reuse existing `PcsClientAdapter` for HTTP requests with delay/retry

## R2: PCS Race Date Extraction

**Decision**: Extract race date from the race overview/results page HTML during scraping

**Rationale**: PCS race pages display the race date in a structured info container. For one-day races, this is a single date. For stage races, each stage page shows the stage date. The race overview page (`race/{slug}/{year}`) contains a date range in the infolist.

**Implementation notes**:

- One-day races (classics): single date from the race page header
- Stage races: each stage URL (`race/{slug}/{year}/stage-{n}`) contains the specific stage date
- GC/classification dates: use the last stage date (final day)
- Date format on PCS: typically `DD Month YYYY` or similar — parse with native `Date` or a lightweight parser
- Add `race-date.parser.ts` alongside existing parsers

**Alternatives considered**:

- Store only year (current approach): insufficient granularity for same-year cutoffs
- External calendar API: unnecessary complexity when PCS already provides dates

## R3: Spearman Rank Correlation Implementation

**Decision**: Implement as a pure TypeScript function — no external library needed

**Rationale**: Spearman's ρ formula is straightforward:

1. Rank both arrays (handle ties with average rank method)
2. Compute differences d_i = rank(predicted_i) - rank(actual_i)
3. ρ = 1 - (6 × Σd_i²) / (n × (n² - 1))

For tied ranks, use the correction formula:
ρ = (Σx² + Σy² - Σd²) / (2 × √(Σx² × Σy²))

Where Σx² and Σy² account for tie groups.

This is ~40 lines of code with no dependencies. External stats libraries (simple-statistics, mathjs) are overkill for a single formula.

**Alternatives considered**:

- `simple-statistics` npm package: adds dependency for one function
- `mathjs`: heavy dependency, overkill
- Kendall's τ: similar purpose but Spearman is more intuitive for ranking comparison

**Test strategy**: 100% coverage with known test vectors:

- Perfect correlation (ρ = 1.0): identical rankings
- Perfect inverse (ρ = -1.0): reversed rankings
- No correlation (ρ ≈ 0): shuffled rankings
- With ties: multiple riders same position
- Edge cases: n=1 (undefined), n=2 (±1 only), empty arrays

## R4: Interactive CLI Library

**Decision**: Use `@inquirer/prompts` (v7+)

**Rationale**: Modern, ESM-compatible, well-maintained successor to `inquirer`. Supports `select` (single choice from list), `checkbox` (multi-select), and `confirm` prompts — exactly what the benchmark CLI needs. Tree-shakeable (import individual prompts). Already compatible with nest-commander pattern (prompts run inside `CommandRunner.run()`).

**Alternatives considered**:

- `inquirer` (legacy): CJS-focused, monolithic import, being sunset
- `prompts`: smaller but less maintained, fewer prompt types
- `clack`: beautiful UI but less mature ecosystem
- No prompts (flags only): user explicitly requested interactive experience

**Integration pattern**: Prompts invoked inside the NestJS Commander `run()` method, after the command is resolved. Race list fetched from DB, presented via `select`/`checkbox` prompts.

## R5: Actual Score Computation Strategy

**Decision**: Reuse `computeRiderScore` with filtered single-race results

**Rationale**: When computing actual fantasy points for a rider in a specific race, we pass ONLY that race's results to the existing `computeRiderScore` function:

- `targetRaceType` = the benchmarked race's type
- `currentYear` = the race's year
- `maxSeasons` = 1 (only current year matters)

Effect on weights:

- Temporal decay: 1.0 (year offset = 0)
- Cross-type: 1.0 (result type = target type)
- Class weight: constant across all riders (same race)
- Profile weight: per-stage, applies equally to all riders

Since Spearman ρ only measures rank correlation, constant multipliers (classWeight) don't affect the ranking. The approach gives identical rankings to raw position points while maintaining API consistency.

**Alternatives considered**:

- New `computeActualScore` function: duplicates logic, drift risk
- Raw position points only: loses profile weight nuance, different API surface
- Strip all weights for actual: unnecessary since rankings are identical

**Verification**: Unit test that confirms ranking from `computeRiderScore(singleRaceResults)` matches ranking from raw position point sums.
