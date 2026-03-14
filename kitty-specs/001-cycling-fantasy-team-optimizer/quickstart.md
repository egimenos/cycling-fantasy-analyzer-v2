# Quickstart: Cycling Fantasy Team Optimizer

## Prerequisites

- Node.js 20+
- Docker & Docker Compose
- pnpm (package manager)

## Setup

```bash
# Clone and install
git clone <repo-url>
cd cycling_analizer_v2
pnpm install

# Start PostgreSQL + services
docker compose up -d

# Run database migrations
pnpm --filter api db:migrate

# Start development servers (API + Web with hot reload)
pnpm dev
```

## Access

- **Web UI**: http://localhost:3000
- **API**: http://localhost:3001/api
- **PostgreSQL**: localhost:5432 (user: `cycling`, password: `cycling`, db: `cycling_analyzer`)

## First Use

1. Trigger an initial data scrape:
   ```bash
   curl -X POST http://localhost:3001/api/scraping/trigger \
     -H "Content-Type: application/json" \
     -d '{"raceSlug": "tour-de-france", "year": 2025}'
   ```

2. Open http://localhost:3000 and paste a rider price list from Grandes miniVueltas

3. View rider scores and get optimal team recommendations

## Common Commands

```bash
# Development
pnpm dev                    # Start all services with hot reload
pnpm build                  # Build all packages
pnpm lint                   # Run ESLint across monorepo
pnpm format                 # Run Prettier

# Testing
pnpm test                   # Run all unit tests
pnpm test:e2e               # Run Playwright E2E tests
pnpm --filter api test      # Backend tests only
pnpm --filter web test      # Frontend tests only

# Database
pnpm --filter api db:migrate    # Run migrations
pnpm --filter api db:generate   # Generate Drizzle migration from schema changes
pnpm --filter api db:studio     # Open Drizzle Studio (DB browser)

# Docker
docker compose up -d            # Start all services
docker compose down             # Stop all services
docker compose logs -f api      # Follow API logs
```

## Project Structure

```
apps/web/     → React + TanStack Start frontend
apps/api/     → NestJS backend (API + scraping + scoring)
packages/     → Shared types and config
docker/       → Docker Compose + Dockerfiles
docs/adr/     → Architectural Decision Records
```
