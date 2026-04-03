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

- **Scraping operations are CLI/cron only** — never expose scraping behind REST endpoints.
- Never commit `.env`, `.env.local`, credentials, or API keys.
- Validate all external input at system boundaries (controllers, API endpoints).

## Observability

- Structured JSON logging: Pino (API), structlog (ML).
- Correlation IDs propagated via `x-correlation-id` header across services.
- OpenTelemetry auto-instrumentation in production builds.

## Git Discipline

- **Never commit directly to `main`.** Always create a feature branch and open a pull request. Branch naming: `feat/<short-description>`, `fix/<short-description>`, `refactor/<short-description>`, etc. Push the branch and create a PR via `gh pr create` before merging.
- Conventional commit messages enforced by commitlint.
- Never rewrite history on shared branches.
- Never commit agent directories (`.claude/`, `.codex/`, `.cursor/`).
- Keep commits atomic and meaningful.

## Language

- All code, comments, commit messages, and documentation must be in English.
