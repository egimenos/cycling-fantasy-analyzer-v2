# Cycling Fantasy Team Optimizer

Data-driven team selection tool for [Grandes miniVueltas](https://grandesminivueltas.com/) fantasy cycling. Scrapes rider race results from ProCyclingStats, scores them using configurable temporal-decay weights, fuzzy-matches against price lists, and optimizes 9-rider teams via knapsack DP — all within a budget constraint.

## Prerequisites

- **Node.js** 20+
- **pnpm** 8+ (via `corepack enable`)
- **Docker** (PostgreSQL + ML service)

## Quick Start

```bash
# 1. Install dependencies
corepack enable
make install

# 2. Environment configuration
cp .env.example .env
# For personal overrides, create .env.local (gitignored)

# 3. Start PostgreSQL and run migrations
make db-up
make db-migrate

# 4. Seed the database with race data from PCS
make seed          # last 3 years, WT + ProSeries (~90 races/year)
make seed-full     # last 5 years (more history, slower)

# 5. Start all services in development mode
make dev
```

The web frontend runs at `http://localhost:3000` and the API at `http://localhost:3001`.

## Environment Variables

The API uses `@nestjs/config` to load env files with this priority:

1. **`.env.local`** — personal overrides, gitignored
2. **`.env`** — local defaults, gitignored (copy from `.env.example`)

Both are optional. If neither exists, built-in defaults apply.

| Variable                      | Default                                                        | Description                                      |
| ----------------------------- | -------------------------------------------------------------- | ------------------------------------------------ |
| `DATABASE_URL`                | `postgresql://cycling:cycling@localhost:5432/cycling_analyzer` | PostgreSQL connection string                     |
| `PORT`                        | `3001`                                                         | API server port                                  |
| `CORS_ORIGIN`                 | `http://localhost:3000`                                        | Allowed CORS origin for the frontend             |
| `PCS_REQUEST_DELAY_MS`        | `1500`                                                         | Delay between PCS scrape requests                |
| `FUZZY_MATCH_THRESHOLD`       | `-10000`                                                       | Minimum score for fuzzy rider name matching      |
| `ML_SERVICE_URL`              | `http://localhost:8000`                                        | ML scoring microservice URL                      |
| `VITE_API_URL`                | `http://localhost:3001`                                        | API URL for the frontend (build-time)            |
| `LOG_LEVEL`                   | `info` (prod) / `debug` (dev)                                  | Log level for API and ML service                 |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | _(disabled)_                                                   | OTLP collector URL — enables distributed tracing |

> **Note:** If you have a `DATABASE_URL` already exported in your shell (e.g. from another project), it will take precedence over `.env` files. Use `.env.local` or `unset DATABASE_URL` to fix this.

## Development Workflow

A `Makefile` provides shortcuts for all common operations. Run `make help` to see all available commands.

### Project

| Command        | Description                              |
| -------------- | ---------------------------------------- |
| `make install` | Install all dependencies                 |
| `make dev`     | Start all services (DB + ML + API + Web) |
| `make build`   | Build all packages and apps              |
| `make test`    | Run unit tests across all packages       |
| `make lint`    | Run ESLint across all packages           |

### E2E Tests (Playwright)

```bash
cd apps/web
pnpm test:e2e                                    # Run all e2e tests
pnpm exec playwright test specs/setup.spec.ts    # Run a specific spec
pnpm exec playwright test --headed               # Run in headed mode (see browser)
pnpm exec playwright test --ui                   # Open Playwright UI
```

**Prerequisites**: Docker running (DB + ML service), dev server auto-starts via config.

**Structure**: `tests/e2e/pages/` (Page Objects), `tests/e2e/specs/` (test files), `tests/e2e/fixtures/` (data + Playwright fixtures), `tests/e2e/helpers/` (utilities).

| Command          | Description                     |
| ---------------- | ------------------------------- |
| `make typecheck` | TypeScript type check (no emit) |

### Database

| Command            | Description                                    |
| ------------------ | ---------------------------------------------- |
| `make db-up`       | Start PostgreSQL container                     |
| `make db-down`     | Stop PostgreSQL container                      |
| `make db-migrate`  | Apply Drizzle migrations                       |
| `make db-generate` | Generate Drizzle migration from schema         |
| `make db-push`     | Push schema directly to DB (no migration file) |
| `make db-studio`   | Open Drizzle Studio (database GUI)             |
| `make db-psql`     | Open psql shell to local DB                    |

### Scraping & Seeding

| Command                                           | Description                                  |
| ------------------------------------------------- | -------------------------------------------- |
| `make seed`                                       | Seed database (last 3 years, WT + ProSeries) |
| `make seed-full`                                  | Seed database (last 5 years)                 |
| `make scrape RACE=<slug> YEAR=<year> TYPE=<type>` | Scrape a single race                         |

The seed command discovers races from PCS calendar pages, deduplicates, and skips already-scraped races. Safe to re-run. The `TYPE` parameter accepts `classic`, `grand_tour`, or `mini_tour`.

### ML Service

| Command               | Description                                     |
| --------------------- | ----------------------------------------------- |
| `make retrain`        | Train all ML models (stage races + classics)    |
| `make ml-up`          | Start ML scoring service (FastAPI on port 8000) |
| `make ml-down`        | Stop ML scoring service                         |
| `make ml-logs`        | Tail ML service logs                            |
| `make ml-restart`     | Restart ML service (picks up new models)        |
| `make clear-ml-cache` | Clear cached ML predictions (all or per-race)   |

```bash
# Clear all cached predictions
make clear-ml-cache

# Clear cache for a specific race
make clear-ml-cache RACE=paris-nice YEAR=2026
```

### Scoring Benchmark

The benchmark compares predicted rider scores against actual race outcomes using Spearman rank correlation (ρ):

```bash
make benchmark           # single race (interactive)
make benchmark-suite     # multiple races with aggregate ρ
```

| ρ Range   | Interpretation                           |
| --------- | ---------------------------------------- |
| 0.8 – 1.0 | Excellent prediction quality             |
| 0.6 – 0.8 | Good — algorithm captures major patterns |
| 0.4 – 0.6 | Moderate — room for weight tuning        |
| < 0.4     | Weak — algorithm needs rethinking        |

**Tuning workflow**: Change a weight in `scoring-weights.config.ts` → re-run `make benchmark-suite` → see if ρ goes up or down.

## ML Scoring (Optional)

The project includes a Python ML microservice that improves scoring accuracy using Random Forest and LightGBM models. Stage races (mini tours and grand tours) use a 4-source decomposition model (GC, stage, mountain, sprint). Classics use an independent LightGBM model with 51 domain-specific features (type affinity, same-race history, Glicko-2 ratings, seasonal pipeline momentum). When available, scoring uses a hybrid approach (ML + rules-based).

**ML scoring is optional.** The API falls back to rules-based scoring when the ML service is unavailable.

### Setup

```bash
# 1. Train models (requires seeded database)
make retrain

# 2. Start the ML service
make ml-up

# 3. Verify it is running
curl http://localhost:8000/health
# → {"status":"healthy","model_version":"...","models_loaded":[...]}
```

### Retraining

Models should be retrained weekly to incorporate newly scraped race data. The service hot-reloads new models automatically (checks `model_version.txt` on each request).

```bash
# Example cron (Sundays 3am)
0 3 * * 0 cd /path/to/project && make retrain
```

### Cache

ML predictions are cached in the `ml_scores` database table. The cache auto-invalidates when:

- **Model retrained** — new model version, old predictions ignored
- **Startlist changed** — ML service detects rider set mismatch

For manual invalidation, use `make clear-ml-cache`.

## Project Structure

```
cycling-analyzer-v2/
├── apps/
│   ├── api/            # NestJS backend (DDD/Hexagonal architecture)
│   │   ├── src/
│   │   │   ├── domain/          # Entities, value objects, ports
│   │   │   ├── application/     # Use cases (analyze, optimize, scraping)
│   │   │   ├── infrastructure/  # DB adapters, scraping, matching, ML client
│   │   │   └── presentation/    # Controllers, CLI commands
│   │   └── drizzle/             # Migrations
│   └── web/            # React frontend (Vite + TanStack Router)
│       └── src/
│           ├── features/        # rider-list, optimizer, team-builder
│           ├── shared/          # UI primitives, utilities, API client
│           └── routes/          # TanStack Router pages
├── ml/                 # Python ML scoring microservice
│   ├── src/
│   │   ├── api/            # FastAPI service, logging, telemetry
│   │   ├── prediction/     # Inference (stage races + classics)
│   │   ├── features/       # Feature extraction + caching
│   │   ├── domain/         # Scoring tables, Glicko-2, classic taxonomy
│   │   ├── data/           # Database access
│   │   └── training/       # Retraining pipeline
│   ├── benchmarks/     # Evaluation harness (not in Docker)
│   ├── tests/          # pytest test suite
│   └── models/         # Trained model files (gitignored)
├── packages/
│   ├── shared-types/   # DTOs, enums shared between API and web
│   └── eslint-config/  # Shared ESLint configuration
├── docker/             # Dockerfiles (API, web, ML)
├── docs/
│   ├── adr/            # Architecture Decision Records
│   └── runbook-dev.md  # Development runbook
└── scripts/            # Smoke tests and utilities
```

## Observability

Both the API and ML service emit structured JSON logs with correlation IDs that link requests across services.

- **Structured logging**: Pino (API) and structlog (ML) — JSON in production, human-readable in development
- **Correlation IDs**: Auto-generated per request, propagated via `x-correlation-id` header from API to ML service, included in error responses
- **Distributed tracing**: OpenTelemetry with auto-instrumentation (HTTP, Express, pg, FastAPI, psycopg2). Console exporter by default — set `OTEL_EXPORTER_OTLP_ENDPOINT` to send traces to Jaeger, Grafana Tempo, or any OTLP-compatible backend
- **Global error handling**: All unhandled exceptions are caught, logged with stack traces, and returned as structured JSON with `correlationId` for user-reportable error tracking

OTel tracing is active in production builds (`pnpm start` / Docker). In dev mode (`pnpm dev`), structured logging and correlation IDs work without tracing overhead.

## Architecture

- **Backend**: DDD/Hexagonal with domain-driven scoring, repository ports, and adapter-based persistence (Drizzle ORM + PostgreSQL)
- **Frontend**: React 19, TanStack Router, Tailwind CSS v4, shadcn/ui
- **ML**: Python FastAPI microservice with scikit-learn RF + LightGBM models (stage races + classics)
- **Monorepo**: Turborepo with pnpm workspaces

See [`docs/adr/`](docs/adr/) for detailed architecture decision records.

## Docker

Dockerfiles in `docker/` support containerized builds for API, web, and ML:

```bash
docker build -f docker/Dockerfile.api -t cycling-api .
docker build -f docker/Dockerfile.web -t cycling-web --build-arg VITE_API_URL=http://api:3001 .
```

The root `docker-compose.yml` provides PostgreSQL and the ML service for local development. Production deployment uses [Dokploy](https://dokploy.com/) to a VPS with the ML service as an internal Docker sidecar.

## WSL / Windows Notes

If you're developing on WSL with `core.autocrlf=true`, husky hooks may break because shell scripts get CRLF line endings. The `.gitattributes` file enforces LF for `.husky/*` files to prevent this. If hooks fail with `EACCES` or `Illegal option`, check for CRLF: `xxd .husky/pre-commit`.

## License

Private — not for redistribution.
