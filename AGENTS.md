# Agent Guidelines

Rules for any AI agent working in this repository.

## Project Overview

ML-powered fantasy cycling team optimizer for [Grandes miniVueltas](https://grandesminivueltas.com/). Monorepo with three services: NestJS API, React frontend, Python ML microservice.

## Architecture

- **API** (`apps/api/`): NestJS 11, DDD/Hexagonal architecture. Layers: `domain/` (entities, value objects, ports), `application/` (use cases), `infrastructure/` (adapters: DB, scraping, ML client), `presentation/` (controllers, CLI).
- **Frontend** (`apps/web/`): React 19, Vite, TanStack Router, Tailwind CSS v4, shadcn/ui. Feature-based folder structure under `src/features/`.
- **ML Service** (`ml/`): Python FastAPI. 9 sub-models for stage races (GC, stages by profile, ITT, mountains, sprint) + 1 LightGBM model for classics (51 features).
- **Shared** (`packages/shared-types/`): TypeScript DTOs and enums used by API and frontend.
- **Database**: PostgreSQL 16 with Drizzle ORM. Migrations in `apps/api/drizzle/migrations/`.

## Code Conventions

### API (TypeScript/NestJS)

- Follow DDD/Hexagonal strictly: domain logic must never import from infrastructure or presentation.
- Domain ports define interfaces; infrastructure provides adapters.
- Use cases live in `application/` and orchestrate domain + infrastructure.
- Controllers are thin — delegate to use cases immediately.
- CLI commands use nest-commander in `presentation/cli/`.
- No `any` types — ESLint enforces `@typescript-eslint/no-explicit-any: error`.
- Conventional commits enforced by commitlint (feat:, fix:, chore:, docs:, refactor:, test:).

### Frontend (React)

- Feature-based organization: each feature in `src/features/<name>/`.
- Shared UI primitives in `src/shared/components/` (shadcn/ui pattern).
- TanStack Router for routing — routes auto-generated in `src/routes/`.
- Use Radix UI primitives for accessible components.

### ML Service (Python)

- Prediction logic in `ml/src/prediction/`, feature extraction in `ml/src/features/`.
- Domain knowledge (scoring tables, Glicko-2, classic taxonomy) in `ml/src/domain/`.
- Training pipelines in `ml/src/training/`.
- Structured logging with structlog; correlation IDs via asgi-correlation-id.
- Models saved as joblib in `ml/models/` (gitignored).
- **Data cache is a lazy in-memory snapshot.** `state.data_cache` (results_df + startlists_df) is loaded from the DB on the first `/predict` request and only invalidated on model hot-reload. The API scrapes fresh startlists into `startlist_entries` right before calling ML, so for the newly-requested race the `/predict` handler must query the DB on-demand via `load_startlist_for_race()` and merge the result into the cached DataFrame. Any new table that the API writes to between ML requests needs the same treatment — don't assume the cache is in sync with the DB.

## Dependencies & Commands

### Prerequisites

- Node.js 20+, pnpm 8+ (`corepack enable`), Docker, Python 3.11+

### Setup

```bash
corepack enable && make install
cp .env.example .env
make db-up && make db-migrate
make seed          # 3 years of race data
make dev           # starts all services
```

### Common Commands

| Command                | Description                                     |
| ---------------------- | ----------------------------------------------- |
| `make dev`             | Start all services (DB + ML + API + Web)        |
| `make build`           | Build all packages (turbo)                      |
| `make test`            | Run unit tests                                  |
| `make lint`            | ESLint across all packages                      |
| `make typecheck`       | TypeScript type check (no emit)                 |
| `make db-migrate`      | Apply Drizzle migrations                        |
| `make db-generate`     | Generate migration from schema changes          |
| `make db-push`         | Push schema directly (no migration file)        |
| `make retrain`         | Train all ML models (~10 min)                   |
| `make ml-up`           | Start ML service (FastAPI, port 8000)           |
| `make ml-restart`      | Restart ML service (hot-reload models)          |
| `make clear-ml-cache`  | Clear cached ML predictions                     |
| `make benchmark-suite` | Run multi-race benchmark with aggregate metrics |
| `make seed`            | Seed DB (3 years, WT + ProSeries)               |
| `make weekly-pipeline` | Run weekly seed + retrain + notify pipeline     |

### Testing

| Scope     | Framework  | Command                        |
| --------- | ---------- | ------------------------------ |
| API unit  | Jest 30    | `cd apps/api && npm test`      |
| Web unit  | Vitest     | `cd apps/web && npm test`      |
| Web e2e   | Playwright | `cd apps/web && pnpm test:e2e` |
| ML        | pytest     | `cd ml && pytest`              |
| Benchmark | custom     | `make benchmark-suite`         |

### Linting & Formatting

- ESLint + Prettier enforced via lint-staged on pre-commit (Husky).
- Prettier: single quotes, semicolons, trailing commas, 100 char width, 2-space indent.
- Python: follow existing style (no ruff/black configured — match surrounding code).

## Security Rules

- **Bulk / historical scraping is CLI/cron only.** Seeding the database with historical race results, weekly retraining ingestion, and any multi-race batch scrape must run from `presentation/cli/` or a Dokploy scheduled task — never behind a REST endpoint. These flows iterate over many races and would be trivially abusable if exposed publicly.
- **On-demand per-race scraping is allowed from REST endpoints**, because it is the core product flow: when the user picks the race they are about to analyze, the API fetches that race's startlist, stage profile, and the GMV price list at request time. Allowed endpoints today: `GET /api/race-profile`, `GET /api/race-profile-by-slug`, `GET /api/import-price-list`, and the startlist fetch inside `POST /api/analyze`.
- **Any REST endpoint that performs an outbound fetch from a user-supplied URL must enforce a hostname allow-list** (`grandesminivueltas.com` for price lists, `procyclingstats.com` for race/profile pages). Parse with `new URL(...)`, compare `.hostname`, and reject anything else with `BadRequestException` at the controller boundary. Never rely on substring checks like `url.includes('…')` — they are trivially bypassable (`http://169.254.169.254/?procyclingstats.com/race/x/2024`).
- Never commit `.env`, `.env.local`, credentials, or API keys.
- Validate all external input at system boundaries (controllers, API endpoints).

## Observability

- Structured JSON logging: Pino (API), structlog (ML).
- Correlation IDs propagated via `x-correlation-id` header across services.
- OpenTelemetry auto-instrumentation in production builds.

## Git Discipline

- **Never commit directly to `main`.** Always create a feature branch and open a pull request. Branch naming: `feat/<short-description>`, `fix/<short-description>`, `refactor/<short-description>`, etc. Push the branch and create a PR via `gh pr create` before merging.
- **Branch-first rule**: Before editing any tracked file, check `git branch --show-current`. If you are on `main`, create and switch to a new branch first (`git checkout -b <type>/<description>`). This applies at the start of every session — never assume a previous session left you on the right branch.
- Conventional commit messages enforced by commitlint.
- Never rewrite history on shared branches.
- Never commit agent directories (`.claude/`, `.codex/`, `.cursor/`).
- Keep commits atomic and meaningful.

## Self-Healing Documentation

When you encounter a gotcha, non-obvious behavior, implicit assumption, or any mistake that better documentation would have prevented, you must update the relevant documentation **before moving on**. This is not optional — undocumented pitfalls will bite the next agent (or the next session of yourself).

**Trigger**: You hit an unexpected error, misunderstand a convention, use a wrong flag, miss a required step, discover an undocumented dependency between components, or find that existing docs are stale or misleading.

**Action**: Identify where the lesson belongs and add it there:

| What you learned                                | Where to document it                 |
| ----------------------------------------------- | ------------------------------------ |
| Project convention or rule agents keep breaking | This file (`AGENTS.md`)              |
| Setup step, command quirk, or workflow gap      | `README.md` or `docs/runbooks/`      |
| Architectural constraint or rationale           | `docs/adr/` (new ADR if significant) |
| Non-obvious code behavior or coupling           | Inline code comment at the source    |
| Stale or incorrect existing documentation       | Fix it in place                      |

**Rules**:

- Document the **lesson**, not the story. Future readers need the rule, not a narrative of how you discovered it.
- Keep it concise — one or two sentences is usually enough.
- Place it next to related content so it is found in context, not buried in an appendix.
- If an existing doc already covers the topic but is incomplete or wrong, update it rather than adding a new one.

## Language

- All code, comments, commit messages, and documentation must be in English.
