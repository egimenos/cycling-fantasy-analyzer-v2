# Cycling Fantasy Team Optimizer

Data-driven team selection tool for [Grandes miniVueltas](https://www.velogames.com/) fantasy cycling. Scrapes rider race results from ProCyclingStats, scores them using configurable temporal-decay weights, fuzzy-matches against price lists, and optimizes 9-rider teams via knapsack DP — all within a budget constraint.

## Prerequisites

- **Node.js** 20+
- **pnpm** 8+ (via `corepack enable`)
- **Docker** (for PostgreSQL in development)

## Quick Start

```bash
# 1. Install dependencies
corepack enable
pnpm install

# 2. Environment configuration
cp .env.example .env
# Edit .env if needed, or create .env.local for personal overrides

# 3. Start PostgreSQL
docker compose up -d

# 4. Run database migrations
pnpm --filter @cycling-analyzer/api db:migrate

# 5. Build the API (required for CLI commands)
pnpm --filter @cycling-analyzer/api build

# 6. Seed the database with race data from PCS
#    Defaults: last 3 years, WorldTour + ProSeries (~90 races/year)
cd apps/api && node dist/cli.js seed-database
#    Options: --years 5, --dry-run, --circuit 1 (WT only)

# 7. Start all services in development mode
cd ../.. && pnpm dev
```

The web frontend runs at `http://localhost:3000` and the API at `http://localhost:3001`.

## Environment Variables

The app uses `@nestjs/config` to load env files with this priority:

1. **`.env.local`** — personal overrides, gitignored
2. **`.env`** — local defaults, gitignored (copy from `.env.example`)

Both are optional. If neither exists, built-in defaults apply.

| Variable               | Default                                                        | Description                       |
| ---------------------- | -------------------------------------------------------------- | --------------------------------- |
| `DATABASE_URL`         | `postgresql://cycling:cycling@localhost:5432/cycling_analyzer` | PostgreSQL connection string      |
| `PORT`                 | `3001`                                                         | API server port                   |
| `VITE_API_URL`         | `http://localhost:3001`                                        | API URL for frontend              |
| `PCS_REQUEST_DELAY_MS` | `1500`                                                         | Delay between PCS scrape requests |

> **Note:** If you have a `DATABASE_URL` already exported in your shell (e.g. from another project), it will take precedence over `.env` files. Use `.env.local` or `unset DATABASE_URL` to fix this.

## Development Workflow

A `Makefile` provides shortcuts for all common operations. Run `make help` to see all available commands.

| Command                | Description                              |
| ---------------------- | ---------------------------------------- |
| `make install`         | Install all dependencies                 |
| `make dev`             | Start all apps in watch mode (Turborepo) |
| `make build`           | Build all packages and apps              |
| `make test`            | Run unit tests across all packages       |
| `make lint`            | Run ESLint across all packages           |
| `make typecheck`       | TypeScript type check (no emit)          |
| `make db-up`           | Start PostgreSQL container               |
| `make db-down`         | Stop PostgreSQL container                |
| `make db-migrate`      | Apply Drizzle migrations                 |
| `make db-generate`     | Generate Drizzle migration from schema   |
| `make db-studio`       | Open Drizzle Studio (database GUI)       |
| `make db-psql`         | Open psql shell to local DB              |
| `make seed`            | Re-seed database from PCS                |
| `make benchmark`       | Run single-race scoring benchmark        |
| `make benchmark-suite` | Run multi-race benchmark suite           |

### CLI Commands

The API includes CLI commands for scraping and benchmarking. These run via `ts-node` (no build required):

```bash
# Seed database — discover and scrape WT + ProSeries + Europe Tour .1 races
make seed

# Scrape a single race
make scrape RACE=milano-sanremo YEAR=2024 TYPE=classic
make scrape RACE=tour-de-france YEAR=2024 TYPE=grand_tour

# Run scoring benchmark (interactive race selection)
make benchmark           # single race
make benchmark-suite     # multiple races with aggregate Spearman ρ
```

The seed command discovers races dynamically from PCS calendar pages (WorldTour + ProSeries + Europe Tour .1), filters by allowed class, deduplicates, and skips races that have already been scraped successfully. Safe to re-run.

### Scoring Benchmark

The benchmark compares predicted rider scores (based on historical data) against actual race outcomes. It measures prediction quality using Spearman rank correlation (ρ):

| ρ Range   | Interpretation                           |
| --------- | ---------------------------------------- |
| 0.8 – 1.0 | Excellent prediction quality             |
| 0.6 – 0.8 | Good — algorithm captures major patterns |
| 0.4 – 0.6 | Moderate — room for weight tuning        |
| < 0.4     | Weak — algorithm needs rethinking        |

**Tuning workflow**: Change a weight in `scoring-weights.config.ts` → re-run `make benchmark-suite` → see if ρ goes up or down.

## Project Structure

```
cycling-analyzer-v2/
├── apps/
│   ├── api/          # NestJS backend (DDD/Hexagonal architecture)
│   │   ├── src/
│   │   │   ├── domain/          # Entities, value objects, ports
│   │   │   ├── application/     # Use cases (analyze, optimize, scraping)
│   │   │   ├── infrastructure/  # DB adapters, scraping, matching
│   │   │   └── presentation/    # Controllers, CLI commands
│   │   └── drizzle/             # Migrations
│   └── web/          # React frontend (Feature-Sliced Design)
│       └── src/
│           ├── features/        # rider-list, optimizer, team-builder
│           ├── shared/          # UI primitives, utilities, API client
│           └── routes/          # TanStack Router pages
├── packages/
│   └── shared-types/ # DTOs, enums shared between API and web
├── docker/           # Dockerfiles for containerized builds
├── docs/adr/         # Architecture Decision Records
└── scripts/          # Smoke tests and utilities
```

## Architecture

- **Backend**: DDD/Hexagonal with domain-driven scoring, repository ports, and adapter-based persistence (Drizzle ORM + PostgreSQL)
- **Frontend**: Feature-Sliced Design with React, TanStack Router, Tailwind CSS v4, and shadcn/ui
- **Monorepo**: Turborepo with pnpm workspaces for shared types

See [`docs/adr/`](docs/adr/) for detailed architecture decision records.

## Docker

Dockerfiles in `docker/` support containerized builds for both API and web:

```bash
docker build -f docker/Dockerfile.api -t cycling-api .
docker build -f docker/Dockerfile.web -t cycling-web --build-arg VITE_API_URL=http://api:3001 .
```

The root `docker-compose.yml` provides PostgreSQL for local development. Production deployment is handled separately via [Kamal](https://kamal-deploy.org/).

## WSL / Windows Notes

If you're developing on WSL with `core.autocrlf=true`, husky hooks may break because shell scripts get CRLF line endings. The `.gitattributes` file enforces LF for `.husky/*` files to prevent this. If hooks fail with `EACCES` or `Illegal option`, check for CRLF: `xxd .husky/pre-commit`.

## License

Private — not for redistribution.
