# ADR: Two Scraper Strategies Behind a Port Interface

**Status:** Accepted
**Date:** 2026-03-15

## Context

The application scrapes rider and race result data from ProCyclingStats (PCS). PCS may change their HTML structure, block requests, or experience downtime. A single scraper implementation creates a fragile dependency on the exact structure of one website.

## Decision

We implemented scraping behind a port interface (`ScraperPort`) with support for multiple strategy implementations. The primary strategy uses Cheerio for HTML parsing. Strategies are registered with the infrastructure layer and selected based on health status. Scraping is restricted to CLI commands and scheduled cron jobs — no REST endpoints trigger scrapes.

## Consequences

### Positive

- Resilient to site structure changes: if one strategy breaks, others can take over
- Easy to add new scraper implementations without modifying existing code
- Port interface makes scraping fully testable with stub implementations
- CLI-only execution prevents abuse via public API endpoints

### Negative

- Maintenance burden: each strategy must be kept in sync with the data model
- Potential data inconsistency between strategies if they parse different fields

### Neutral

- Only one scraper needs to work at any given time
- Rate limiting (`PCS_REQUEST_DELAY_MS`) is applied at the infrastructure level, not per-strategy
