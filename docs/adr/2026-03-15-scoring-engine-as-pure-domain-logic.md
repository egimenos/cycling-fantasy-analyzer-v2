# ADR: Scoring Engine as Pure Domain Logic

**Status:** Accepted
**Date:** 2026-03-15

## Context

The scoring engine is the core business value of the application. It calculates rider scores using configurable weights across categories (GC, Stage, Mountain, Sprint, Final) with temporal decay based on season recency. This logic must be testable without infrastructure, auditable by domain experts, and modifiable without risking side effects.

## Decision

We implemented all scoring as pure functions in the domain layer (`src/domain/scoring/`) with zero framework dependencies. The scoring service accepts rider data and weight configuration as inputs and returns computed scores — no database calls, no HTTP requests, no NestJS decorators.

## Consequences

### Positive

- 100% unit testable without mocks — pass inputs, assert outputs
- Easy to reason about and audit: every scoring decision is traceable to a pure function
- Portable: the scoring logic can be extracted to a shared library or run client-side if needed
- Weight configurations are data, not code — can be loaded from config files or database

### Negative

- Cannot access the database directly from scoring functions; data must be pre-fetched by the application layer
- Adding real-time data feeds to scoring would require restructuring the data flow

### Neutral

- Follows the "functional core / imperative shell" pattern from Gary Bernhardt's architecture talks
- The temporal decay formula uses exponential decay (`base^age`) which is standard in sports analytics
