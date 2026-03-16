# ADR: Scraper Auto-Health System

**Status:** Accepted
**Date:** 2026-03-15

## Context

Scrapers can break silently when target sites change their HTML structure. Without monitoring, stale or incorrect data could persist in the database for weeks before anyone notices, leading to incorrect scoring and bad team recommendations.

## Decision

We implemented an automatic health check system that validates scraper output against expected schemas. Each scrape job records its health status (healthy, degraded, failing) based on validation results. When a strategy's health degrades, the system logs warnings and can switch to fallback strategies.

## Consequences

### Positive

- Self-healing: the system detects and responds to scraper failures automatically
- Early detection: health status degrades before data quality drops below usable thresholds
- Reduced manual monitoring: operators only need to intervene when all strategies are failing

### Negative

- Health check logic adds complexity to the scraping pipeline
- False positives are possible if validation rules are too strict
- Health status is internal — end users see no indication of data freshness

### Neutral

- Health status is stored per scrape job in the database, providing an audit trail
- The three-state model (healthy/degraded/failing) was chosen over binary (pass/fail) to allow gradual degradation
