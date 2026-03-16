# ADR: PostgreSQL as Single Data Store

**Status:** Accepted
**Date:** 2026-03-15

## Context

The application needs persistent storage for rider profiles, race results, scrape job history, and potentially cached scoring data. Options considered included PostgreSQL alone, PostgreSQL + Redis for caching, and SQLite for lighter deployments.

## Decision

We chose PostgreSQL as the single database for all data storage needs. No Redis cache layer, no SQLite, no separate caching infrastructure. All data — rider data, race results, scrape jobs, and computed scores — lives in PostgreSQL.

## Consequences

### Positive

- Single technology to manage: one backup strategy, one connection pool, one migration tool
- Strong JSON/JSONB support for flexible data like category scores and scrape metadata
- Battle-tested reliability with ACID guarantees for data consistency
- Simpler deployment: only one database service to provision and monitor

### Negative

- No in-memory cache for frequently accessed hot data (acceptable at current scale of ~5000 riders)
- All reads hit the database; no read-replica or cache-aside pattern

### Neutral

- Redis or similar can be added later if performance demands it — the repository port pattern makes this straightforward
- PostgreSQL 16 was chosen for its improved query planning and JSONB performance
