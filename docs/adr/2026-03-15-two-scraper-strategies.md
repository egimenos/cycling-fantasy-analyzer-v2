# ADR: Two Scraper Strategies Behind a Port Interface

**Status:** Accepted
**Date:** 2026-03-15

## Context

The application scrapes rider and race result data from ProCyclingStats (PCS). PCS may change their HTML structure, block requests, or experience downtime. A single scraper implementation creates a fragile dependency on the exact structure of one website.

## Decision

We implemented scraping behind a port interface (`ScraperPort`) with support for multiple strategy implementations. The primary strategy uses Cheerio for HTML parsing. Strategies are registered with the infrastructure layer and selected based on health status.

Two scraping modes coexist with different exposure rules:

- **Bulk / historical scraping** (database seeding, weekly retraining ingestion) is restricted to CLI commands and scheduled cron jobs. No REST endpoint triggers a batch scrape.
- **On-demand per-race scraping** (startlist, stage profile, and price list for the single race the user is currently analyzing) is reached from public REST endpoints because it is the core product flow. These endpoints MUST enforce a hostname allow-list on any user-supplied URL (`procyclingstats.com`, `grandesminivueltas.com`) to prevent SSRF.

## Consequences

### Positive

- Resilient to site structure changes: if one strategy breaks, others can take over
- Easy to add new scraper implementations without modifying existing code
- Port interface makes scraping fully testable with stub implementations
- Bulk scraping is CLI-only, preventing abuse of expensive multi-race jobs via public API
- On-demand scraping is allow-listed at the hostname level, preventing SSRF into `dokploy-network`

### Negative

- Maintenance burden: each strategy must be kept in sync with the data model
- Potential data inconsistency between strategies if they parse different fields

### Neutral

- Only one scraper needs to work at any given time
- Rate limiting (`PCS_REQUEST_DELAY_MS`) is applied at the infrastructure level, not per-strategy
