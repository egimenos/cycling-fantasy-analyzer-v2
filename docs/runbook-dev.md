# Runbook: Local Development Environment

Step-by-step guide to set up the dev environment, seed the database, and operate scraping.

## Prerequisites

| Tool    | Min Version | Notes                          |
| ------- | ----------- | ------------------------------ |
| Node.js | 20+         | LTS recommended                |
| pnpm    | 8+          | Activate via `corepack enable` |
| Docker  | 24+         | PostgreSQL only                |

---

## 1. Environment Setup

```bash
# Enable pnpm via corepack
corepack enable

# Install monorepo dependencies
pnpm install

# Copy environment variables (first time only)
cp .env.example .env
# For personal overrides without touching .env: create .env.local (gitignored)

# Start PostgreSQL
docker compose up -d

# Verify Postgres is healthy
docker compose ps
# Should show cycling-postgres with status "healthy"

# Run Drizzle migrations
pnpm --filter @cycling-analyzer/api db:migrate

# Build the API (required for CLI commands)
pnpm --filter @cycling-analyzer/api build
```

> **Tip:** If you already have a `DATABASE_URL` exported in your shell (from another project), it takes precedence over `.env`. Use `unset DATABASE_URL` or set your value in `.env.local`.

### Verify everything works

```bash
# Start in dev mode (API + Web with hot reload via Turborepo)
pnpm dev

# API:  http://localhost:3001
# Web:  http://localhost:3000
```

---

## 2. Initial Database Seed

The `seed-database` command auto-discovers races from the PCS (ProCyclingStats) calendar, scrapes them, and persists results + riders.

```bash
cd apps/api

# Default seed: last 3 years, WorldTour + ProSeries (~90 races/year)
node dist/cli.js seed-database

# WorldTour only (faster, ~40 races/year)
node dist/cli.js seed-database --circuit 1

# More history: last 5 years
node dist/cli.js seed-database --years 5

# Preview: see which races would be discovered without scraping
node dist/cli.js seed-database --dry-run
```

### What happens internally

1. Iterates year by year (e.g. 2024, 2025, 2026)
2. Fetches the PCS calendar for each circuit (WT=1, ProSeries=26)
3. Deduplicates races by slug
4. For each race, checks `scrape_jobs` — if a job with `status=success` exists, skips it
5. Scrapes the race (classic: 1 request; stage race: GC + classifications)
6. Batch-upserts riders and persists results in a transaction
7. Prints a final summary

### Estimated times

- ~1.5s delay between PCS requests (`PCS_REQUEST_DELAY_MS`)
- Classics: ~3s (1 page + throttle)
- Grand Tours: ~15-20s (multiple classifications)
- Full 3-year seed: ~30-45 min (first run)
- Re-runs: fast (skips everything already scraped)

### If something fails mid-seed

No worries. The seed is **idempotent**: just re-run it and it will skip all races already scraped successfully. Only failed or unprocessed races will be retried.

---

## 3. Incremental Scraping

### Re-run the seed (simplest approach)

After an initial seed, if time passes and new races appear (e.g. a new Giro edition), simply re-run:

```bash
cd apps/api
node dist/cli.js seed-database
```

It automatically skips everything with `status=success` and only processes what's new.

### Scrape a single race

To force-scrape a specific race:

```bash
cd apps/api
node dist/cli.js trigger-scrape -r tour-de-france -y 2026
node dist/cli.js trigger-scrape -r milano-sanremo -y 2026
node dist/cli.js trigger-scrape -r vuelta-a-espana -y 2025
```

The slug must match the PCS URL segment: `procyclingstats.com/race/<slug>`.

> **Note:** `trigger-scrape` does not check if the race was already scraped — it always runs. The seed command does check.

---

## 4. Data Inspection

### Drizzle Studio (database GUI)

```bash
pnpm --filter @cycling-analyzer/api db:studio
```

Opens a web interface to browse tables, run queries, etc.

### Quick queries with psql

```bash
# Connect to the Postgres container
docker exec -it cycling-postgres psql -U cycling -d cycling_analyzer

# Successfully scraped races
SELECT race_slug, year, records_upserted, completed_at
FROM scrape_jobs
WHERE status = 'success'
ORDER BY completed_at DESC
LIMIT 20;

# Total riders in DB
SELECT COUNT(*) FROM riders;

# Results per race
SELECT race_slug, year, COUNT(*) AS results
FROM race_results
GROUP BY race_slug, year
ORDER BY year DESC, race_slug;

# Failed jobs (for debugging)
SELECT race_slug, year, error_message, started_at
FROM scrape_jobs
WHERE status = 'failed'
ORDER BY started_at DESC;
```

---

## 5. Troubleshooting

### Postgres won't start

```bash
# Check container logs
docker compose logs postgres

# If port 5432 is already in use:
lsof -i :5432
# Stop the conflicting service, or change the port in docker-compose.yml and .env
```

### Error 403 (Cloudflare) while scraping

PCS has anti-bot protection. If you get a 403:

- Wait a few minutes and retry
- If it persists, PCS may have changed their headers — check `pcs-client.adapter.ts`

### Error 429 (Rate Limit)

The client already has automatic retry with exponential backoff for 429. If it happens frequently:

- Increase `PCS_REQUEST_DELAY_MS` in `.env` (e.g. `3000` for 3 seconds between requests)

### Stale build

If you change code and CLI commands don't reflect the changes:

```bash
pnpm --filter @cycling-analyzer/api build
```

CLI commands use `dist/cli.js` (compiled output), not TypeScript source directly.

---

## 6. Quick Reference

| Task               | Command                                                              |
| ------------------ | -------------------------------------------------------------------- |
| Start Postgres     | `docker compose up -d`                                               |
| Stop Postgres      | `docker compose down`                                                |
| Stop and wipe data | `docker compose down -v`                                             |
| Run migrations     | `pnpm --filter @cycling-analyzer/api db:migrate`                     |
| Build API          | `pnpm --filter @cycling-analyzer/api build`                          |
| Dev (API + Web)    | `pnpm dev`                                                           |
| Full seed          | `cd apps/api && node dist/cli.js seed-database`                      |
| Seed dry-run       | `cd apps/api && node dist/cli.js seed-database --dry-run`            |
| Single race scrape | `cd apps/api && node dist/cli.js trigger-scrape -r <slug> -y <year>` |
| DB GUI             | `pnpm --filter @cycling-analyzer/api db:studio`                      |
| Tests              | `pnpm test`                                                          |
| Lint               | `pnpm lint`                                                          |
