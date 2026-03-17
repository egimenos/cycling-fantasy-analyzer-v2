# Cycling Fantasy Team Optimizer

Data-driven team selection tool for [Grandes miniVueltas](https://www.velogames.com/) fantasy cycling. Scrapes rider race results from ProCyclingStats, scores them using configurable temporal-decay weights, fuzzy-matches against price lists, and optimizes 9-rider teams via knapsack DP — all within a budget constraint.

## Prerequisites

- **Node.js** 20+
- **pnpm** 8+ (via `corepack enable`)
- **Docker** (for PostgreSQL in development)

## Quick Start

```bash
# Install dependencies
corepack enable
pnpm install

# Start PostgreSQL
docker compose up -d

# Run database migrations
pnpm --filter @cycling-analyzer/api db:migrate

# Start all services in development mode
pnpm dev
```

The web frontend runs at `http://localhost:3000` and the API at `http://localhost:3001`.

## Development Workflow

| Command                                          | Description                              |
| ------------------------------------------------ | ---------------------------------------- |
| `pnpm dev`                                       | Start all apps in watch mode (Turborepo) |
| `pnpm build`                                     | Build all packages and apps              |
| `pnpm test`                                      | Run unit tests across all packages       |
| `pnpm lint`                                      | Run ESLint across all packages           |
| `pnpm --filter @cycling-analyzer/api db:migrate` | Run Drizzle migrations                   |
| `pnpm --filter @cycling-analyzer/api db:studio`  | Open Drizzle Studio                      |
| `pnpm --filter @cycling-analyzer/api scrape`     | Trigger PCS data scrape (CLI)            |
| `pnpm --filter @cycling-analyzer/web test`       | Run frontend unit tests (Vitest)         |
| `pnpm --filter @cycling-analyzer/web test:e2e`   | Run Playwright E2E tests                 |

## Project Structure

```
cycling-analyzer-v2/
├── apps/
│   ├── api/          # NestJS backend (DDD/Hexagonal architecture)
│   │   ├── src/
│   │   │   ├── domain/          # Entities, value objects, ports
│   │   │   ├── application/     # Use cases (analyze, optimize)
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
# Build images
docker build -f docker/Dockerfile.api -t cycling-api .
docker build -f docker/Dockerfile.web -t cycling-web --build-arg VITE_API_URL=http://api:3001 .
```

The root `docker-compose.yml` provides PostgreSQL for local development. Production deployment is handled separately via [Kamal](https://kamal-deploy.org/).

## Environment Variables

Copy `.env.example` to `.env` and adjust as needed:

| Variable                | Default                                                        | Description                       |
| ----------------------- | -------------------------------------------------------------- | --------------------------------- |
| `DATABASE_URL`          | `postgresql://cycling:cycling@localhost:5432/cycling_analyzer` | PostgreSQL connection string      |
| `PORT`                  | `3001`                                                         | API server port                   |
| `VITE_API_URL`          | `http://localhost:3001`                                        | API URL for frontend              |
| `PCS_REQUEST_DELAY_MS`  | `1500`                                                         | Delay between PCS scrape requests |
| `FUZZY_MATCH_THRESHOLD` | `-10000`                                                       | fuzzysort match threshold         |

## License

Private — not for redistribution.
