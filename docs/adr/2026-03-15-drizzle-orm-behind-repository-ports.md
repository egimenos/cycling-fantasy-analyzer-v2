# ADR: Drizzle ORM Behind Repository Ports

**Status:** Accepted
**Date:** 2026-03-15

## Context

The project needs an ORM for PostgreSQL that supports TypeScript and integrates with the DDD/hexagonal architecture. The domain layer must remain independent of any persistence framework so that business logic is testable and portable.

Two main options were evaluated: Prisma (widely adopted, schema-first) and Drizzle (lightweight, TypeScript-first, SQL-like API).

## Decision

We chose Drizzle ORM but placed it exclusively behind repository port interfaces. The domain layer defines repository ports (e.g., `RiderRepositoryPort`), and Drizzle-based adapters in the infrastructure layer implement them. No Drizzle imports exist outside `src/infrastructure/database/`.

## Consequences

### Positive

- Type-safe queries with zero runtime overhead — Drizzle compiles to raw SQL
- Easy migration generation via `drizzle-kit generate`
- The domain layer is fully testable with in-memory fakes; no ORM mocking needed
- Swapping to another ORM or raw SQL only requires new adapter implementations

### Negative

- Extra abstraction layer adds repository boilerplate for each entity
- Developers must understand the port/adapter indirection to navigate the codebase

### Neutral

- Drizzle is newer than Prisma but has strong TypeScript integration and a growing community
- Migration files are plain SQL, making them easy to audit and version-control
