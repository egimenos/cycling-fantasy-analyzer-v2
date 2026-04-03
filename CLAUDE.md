# CLAUDE.md

@AGENTS.md

## Additional Claude Code Instructions

### Workflow

- Read existing code before modifying it. Understand patterns before adding new ones.
- Run `make lint` and `make test` after changes to verify nothing breaks.
- For schema changes: `make db-generate` to create migration, then `make db-migrate` to apply.
- For ML changes: `make retrain` then `make benchmark-suite` to validate impact. All model changes must be A/B tested with the same benchmark protocol before integration.
- After completing work, update any affected documentation (README, ADRs, runbooks).

### Architecture Enforcement

- API follows DDD/Hexagonal strictly. Domain must never import infrastructure or presentation.
- Domain ports (interfaces) live in `domain/`; adapters (implementations) live in `infrastructure/`.
- Use cases in `application/` orchestrate domain logic and infrastructure adapters.
- Controllers in `presentation/` are thin wrappers — no business logic.
- New database tables require a Drizzle schema file in `apps/api/src/infrastructure/database/schema/` and a generated migration.

### ML Service

- The ML service is an internal sidecar — not exposed externally.
- Stage race models: 9 sub-models (GC, stage profiles, ITT, mountains, sprint).
- Classics model: independent LightGBM pipeline with 51 features.
- ML scoring is optional — the API falls back to rules-based scoring when unavailable.
- Feature extraction caches parquet files in `ml/cache/` (gitignored).
- Models hot-reload via `model_version.txt` check on each request.

### Key Directories

- `docs/adr/` — Architecture Decision Records
- `docs/runbooks/` — Development and operations guides
- `kitty-specs/` — Feature specifications and work packages (Spec Kitty)
- `scripts/` — Smoke tests and utilities
