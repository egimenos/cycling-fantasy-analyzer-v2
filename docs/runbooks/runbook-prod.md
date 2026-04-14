# Runbook: Production Operations

Practical reference for operating and troubleshooting the Cycling Analyzer in production. Deployed on Dokploy to a VPS.

**Last updated**: 2026-04-09

---

## 1. Service Overview

| Service    | Container            | Port | Healthcheck                      | Domain                              |
| ---------- | -------------------- | ---- | -------------------------------- | ----------------------------------- |
| API        | `cycling-api`        | 3001 | `GET /health/readiness`          | `api.cycling.yourdomain.com`        |
| Web        | `cycling-web`        | 3000 | HTTP 200 on `/`                  | `cycling.yourdomain.com`            |
| ML Service | `cycling-ml-service` | 8000 | `GET /health`                    | Internal only (not publicly routed) |
| Database   | Dokploy DB service   | 5432 | Dokploy native health monitoring | Internal only                       |

- Reverse proxy: Traefik (managed by Dokploy), SSL via Let's Encrypt
- Network: all services on `dokploy-network`
- Containers run as non-root (UID 1001, `appuser`)
- Named volumes: `ml-models` (trained model artifacts), `ml-cache` (prediction cache)
- Migrations run automatically on every API deploy via the container entrypoint

---

## 2. Common Operations

### Deploying

Push to `main` triggers auto-deploy via Dokploy. For manual deploys:

1. Open the Dokploy dashboard
2. Navigate to the project > select the service
3. Click **Deploy** (or **Redeploy**)

Check deploy status and logs:

```bash
# Stream API logs
docker logs cycling-api --tail 100 -f

# Check all service statuses
docker ps --filter "name=cycling-"
```

### Database

**Connecting via psql:**

```bash
# From the VPS — use the hostname assigned by Dokploy
docker exec -it <dokploy-pg-container> psql -U <user> -d <dbname>
```

Alternatively, use the Dokploy UI database terminal (Project > Database > Terminal).

**Running migrations manually** (normally automatic on deploy):

```bash
docker exec cycling-api node dist/infrastructure/database/run-migrations.js
```

**Seeding:**

```bash
# Default seed (3 years)
docker exec cycling-api node dist/cli.js seed-database

# Full seed (5 years of history)
docker exec cycling-api node dist/cli.js seed-database --years 5
```

**Backups:**

- Dokploy provides automated database backups — configure destination (S3 or local) in Dokploy > Database > Backups
- Verify backup status: Dokploy dashboard > Database > Backups tab
- Check S3 destination: confirm bucket and credentials are valid in Dokploy backup settings
- Restore from backup: Dokploy UI > Database > Backups > select backup > Restore

### ML Service

**Retraining:**

The retraining pipeline runs inside the ML service container. It has two modes:

```bash
# Standard retrain (~5 min): reuses feature cache if valid, only re-trains models
docker exec cycling-ml-service python -m src.training.retrain

# Full retrain (~45 min): rebuilds feature cache from scratch
# Triggered automatically when cache is missing or schema hash changes
# To force: delete a cache file first
docker exec cycling-ml-service rm /app/cache/features_2024.parquet
docker exec cycling-ml-service python -m src.training.retrain
```

The pipeline steps are:

1. Load data from database
2. Compute Glicko-2 ratings (always runs, ~30s)
3. Build feature cache (skipped if valid, ~30 min if rebuilding)
4. Build stage targets
5. Build stage features
6. Build classification history features
7. Train 9 stage race sub-models
8. Train classics model (LightGBM)

Models are saved to the `ml-models` Docker volume and hot-reloaded by the ML service automatically (no restart needed). The service detects new `model_version.txt` on the next `/predict` request.

**Feature cache files** (in `ml-cache` volume) are critical for both training and supply estimation. They persist across redeploys. If missing, the ML service cannot estimate mountain/sprint point supply, resulting in near-zero mountain and sprint predictions.

**Checking model status:**

```bash
docker exec cycling-ml-service curl -s http://localhost:8000/health
# Expected: {"status": "healthy", "model_version": "...", "models_loaded": [...]}

# Verify cache files exist
docker exec cycling-ml-service ls -la /app/cache/features_*.parquet
```

**Clearing prediction cache:**

```bash
# Connect to DB and clear all cached predictions
DELETE FROM ml_scores;

# Clear cache for a specific race
DELETE FROM ml_scores WHERE race_slug = 'tour-de-france' AND year = 2026;
```

**When to retrain:**

| Scenario                              | Action                                                     |
| ------------------------------------- | ---------------------------------------------------------- |
| New races scraped (weekly)            | Standard retrain (~5 min)                                  |
| Feature columns changed (code change) | Full retrain (~45 min, auto-detected via schema hash)      |
| Fresh environment (first deploy)      | Full retrain (~45 min), or copy cache/models from local    |
| Model quality issues                  | Full retrain with `rm /app/cache/features_*.parquet` first |

### Scraping

The system has two distinct scraping modes. They have different security policies — do not conflate them.

**Bulk / historical scraping (CLI/cron only).** Seeding the database with years of historical results and the weekly retraining ingestion are CLI-only. They must never be triggered by a REST endpoint.

- Initial data population runs via the `seed-database` CLI command (see above)
- Production bulk scraping runs via Dokploy scheduled tasks (`./scripts/weekly-pipeline.sh`), not ad-hoc
- Configure scheduled tasks in Dokploy > Project > Scheduled Tasks

**On-demand per-race scraping (REST, allow-listed).** When a user selects the race they are about to analyze, the API fetches that single race's startlist, stage profile, and the GMV price list at request time. This is the core product flow and runs from public REST endpoints:

- `GET /api/race-profile` / `GET /api/race-profile-by-slug` — PCS stage profiles
- `GET /api/import-price-list` — GMV rider prices
- Startlist fetch inside `POST /api/analyze`

All three are restricted by hostname allow-list (`procyclingstats.com`, `grandesminivueltas.com`) to prevent SSRF. Substring checks on the URL are not acceptable — use `new URL(...).hostname`.

---

## 3. Monitoring

**Dokploy dashboard** provides per-service metrics: CPU, memory, disk, network.

**Viewing logs:**

```bash
# API logs
docker logs cycling-api --tail 100 -f

# ML service logs
docker logs cycling-ml-service --tail 100 -f

# Web logs
docker logs cycling-web --tail 100 -f
```

Alternatively, use the Dokploy UI log viewer (Project > Service > Logs).

**Log formats:**

- API: pino JSON structured logs
- ML service: structlog JSON structured logs

**Correlation IDs:** Requests are tagged with correlation IDs that propagate from API to ML service. Use the correlation ID to trace a request across both services.

### Centralized observability (Grafana Cloud via Alloy)

Logs and traces from every cycling container are also shipped to **Grafana Cloud** by a small Alloy collector running as a separate Dokploy project. Local `docker logs` still works as a quick check, but for cross-service searching and historical queries, use Grafana Cloud.

**Architecture:**

- The `observability` Dokploy project runs a single Grafana Alloy container on the shared `dokploy-network`.
- Alloy reads container stdout/stderr via the Docker socket and forwards everything to Grafana Cloud Loki, labeled by `container=<name>`.
- Cycling services (`api` and `ml-service`) export OTLP traces to Alloy. The API uses HTTP on port 4318, the ML service uses gRPC on port 4317. From Alloy, traces are forwarded to Grafana Cloud Tempo.
- Memory footprint on the VPS: ~80–150 MB for Alloy, capped at 200 MB. All storage lives in Grafana Cloud — nothing accumulates on local disk.

**Required env vars on the cycling Compose** (set in Dokploy under the cycling project):

```env
OTEL_EXPORTER_OTLP_ENDPOINT_API=http://alloy:4318
OTEL_EXPORTER_OTLP_ENDPOINT_ML=http://alloy:4317
```

If these are unset or empty, both services fall back to printing traces to stdout (the default before Alloy was deployed). This is the safe failure mode — cycling continues working even if observability is down.

**Setup and credentials:** see `observability/README.md` for the one-time Grafana Cloud sign-up, access policy creation, Dokploy project setup, and required env vars (`GRAFANA_CLOUD_LOKI_URL`, `GRAFANA_CLOUD_LOKI_USER`, `GRAFANA_CLOUD_TEMPO_URL`, `GRAFANA_CLOUD_TEMPO_USER`, `GRAFANA_CLOUD_TOKEN`).

**Searching logs by correlation ID:**

In Grafana Cloud, open **Drilldown → Logs** and run:

```logql
{container="cycling-api"} |= "<correlation-id>"
```

Or filter by service across both containers in one query:

```logql
{container=~"cycling-api|cycling-ml-service"} |= "<correlation-id>" | json
```

**Tracing a request end-to-end:**

1. Hit any API endpoint and grab the `x-correlation-id` from the response headers (or from the matching log line).
2. In Grafana Cloud, open **Drilldown → Traces** and search by the correlation ID.
3. You should see a trace spanning HTTP request → DB queries → ML service call.

**Common issues:**

- **No data in Grafana Cloud after deploy**: check the Alloy container is running (`docker logs alloy` in the observability project). Bad credentials produce a clear error at startup.
- **Logs flow but traces don't**: confirm `OTEL_EXPORTER_OTLP_ENDPOINT_API` / `OTEL_EXPORTER_OTLP_ENDPOINT_ML` are set on the cycling services and that `dokploy-network` resolves `alloy` (`docker exec cycling-api getent hosts alloy`). Also verify `GRAFANA_CLOUD_TEMPO_URL` is in `host:port` form with no `https://` prefix — Alloy uses gRPC for Tempo and a malformed URL will silently drop traces.
- **Alloy crash-loops**: missing or wrong Grafana Cloud env vars, or token without `logs:write` / `traces:write` scopes. Recreate the Cloud Access Policy token with the correct scopes.

---

## 4. Troubleshooting

### API won't start

1. Check startup logs for migration errors: `docker logs cycling-api --tail 50`
2. Verify `DATABASE_URL` is correct and PostgreSQL is reachable
3. Verify ML service is healthy (API requires it for all scoring — there is no fallback)
4. Check disk space: `df -h`
5. Check for missing required environment variables in Dokploy env settings
6. If logs show `CORS_ORIGIN must be set in production`, the fail-fast guard caught a missing env var. Add `CORS_ORIGIN` in Dokploy > Service > Environment with the web frontend URL (e.g. `https://cycling.yourdomain.com`) and redeploy.

### ML service unhealthy

1. Check if model files exist in the volume:

   ```bash
   docker exec cycling-ml-service ls -la /app/models/
   ```

2. Check startup logs for model loading errors: `docker logs cycling-ml-service --tail 50`
3. On first deploy, Docker populates named volumes from image content — models should be present
4. If models are missing after a volume was deleted: redeploy to repopulate from the image, then retrain

### Web shows "API unreachable"

1. `VITE_API_URL` is baked at build time. If the API domain changed, you must rebuild the web service
2. Check `CORS_ORIGIN` in API environment variables matches the web domain exactly
3. Verify Traefik routing: Dokploy > Service > Domains tab

### Database connection issues

1. Check the PostgreSQL container is running in Dokploy
2. Verify the hostname in `DATABASE_URL` matches the one assigned by Dokploy
3. Test connectivity through the API healthcheck:

   ```bash
   docker exec cycling-api wget -qO- http://localhost:3001/health/readiness
   ```

   The API healthcheck validates DB connectivity implicitly.

### Container keeps restarting

1. Check logs for the crash reason: `docker logs cycling-api --tail 50`
2. Common causes:
   - Missing environment variables
   - Database not reachable at startup
   - Migration failure on bad schema state
3. If a migration failed: inspect the SQL in `drizzle/migrations/`, fix the issue, rebuild and redeploy

### SSL certificate issues

- Let's Encrypt certificates are managed automatically by Traefik/Dokploy
- If renewal fails:
  1. Verify ports 80 and 443 are open on the VPS firewall
  2. Verify DNS records point to the VPS IP address
  3. Force renewal from Dokploy > Service > Domains settings

---

## 5. Rollback

- Dokploy keeps previous deployments. Use the Dokploy UI to rollback to a prior version
- **Bad migration applied**: write a new corrective migration, push to `main`, deploy. Drizzle migrations are forward-only — there is no automatic rollback mechanism
- **Bad code deployed**: rollback via Dokploy UI to the previous working deployment

---

## 6. Security Checklist

| Area               | Policy                                                                                                                                                                                                                                                                                         |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SSH                | Key-only authentication, no root login                                                                                                                                                                                                                                                         |
| Firewall           | Only ports 22, 80, 443, 3000 (Dokploy dashboard) open                                                                                                                                                                                                                                          |
| Containers         | Run as non-root (UID 1001)                                                                                                                                                                                                                                                                     |
| Bulk scraping      | CLI/cron only — no REST endpoint triggers batch scrapes                                                                                                                                                                                                                                        |
| On-demand scraping | REST endpoints restricted by hostname allow-list (PCS, GMV)                                                                                                                                                                                                                                    |
| Rate limiting      | Global 60/min per IP; 5/min on `/api/analyze`; 15/min on external-scrape routes (`/api/race-profile`, `/api/race-profile-by-slug`, `/api/import-price-list`, `/api/gmv-match`). Requires `trust proxy: 1` in `main.ts` so `req.ip` is the real client behind Traefik, not the proxy container. |
| HTTP headers       | `helmet()` with defaults — emits `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Strict-Transport-Security` (when forwarded as HTTPS), and removes `X-Powered-By`. JSON-only API, so CSP/frameguard are inert but harmless.                                                             |
| CORS               | `CORS_ORIGIN` is **required** when `NODE_ENV=production`. Missing value crashes the container at boot instead of silently serving with a useless localhost policy.                                                                                                                             |
| Database           | Not exposed publicly — accessible only via internal Docker network                                                                                                                                                                                                                             |
| Secrets            | Managed via Dokploy environment variables, not committed to repo                                                                                                                                                                                                                               |
| OS updates         | Applied monthly on VPS                                                                                                                                                                                                                                                                         |

---

## 7. Scheduled Tasks Reference

| Task            | Frequency        | Command / Config               | Where              | Notes                                 |
| --------------- | ---------------- | ------------------------------ | ------------------ | ------------------------------------- |
| Weekly pipeline | Monday 04:00 UTC | `./scripts/weekly-pipeline.sh` | VPS (Dokploy task) | Seed + retrain + cache clear + notify |
| DB backup       | Daily            | Configured in Dokploy          | Dokploy DB service | Verify S3 destination is valid        |
| OS updates      | Monthly          | `apt update && apt upgrade`    | VPS via SSH        | Schedule during low-traffic window    |

### Weekly Pipeline

The weekly pipeline (`scripts/weekly-pipeline.sh`) automates the full data refresh cycle:

1. **Seed database** — scrapes new race results, startlists (last 1 year by default)
2. **Retrain ML models** — Glicko-2, feature cache, 9 stage sub-models + classics model
3. **Restart ML service** — hot-reload new models, waits for health check
4. **Clear prediction cache** — deletes cached `ml_scores` so predictions use new models

**Telegram notifications** are sent after each run with a detailed breakdown of what happened.

#### Dokploy Configuration

1. Go to Dokploy dashboard > Project > Scheduled Tasks
2. Add a new task:
   - **Command**: `./scripts/weekly-pipeline.sh`
   - **Schedule**: `0 4 * * 1` (Monday 04:00 UTC)
3. Set environment variables in Dokploy:
   - `TELEGRAM_BOT_TOKEN` — from @BotFather
   - `TELEGRAM_CHAT_ID` — target chat/group ID

#### Manual Execution

```bash
# On the VPS, from the project directory:
./scripts/weekly-pipeline.sh

# Dry run (prints commands without executing):
DRY_RUN=true ./scripts/weekly-pipeline.sh

# Override seed years:
SEED_YEARS=3 ./scripts/weekly-pipeline.sh
```

#### Telegram Bot Setup

1. Message [@BotFather](https://t.me/BotFather) on Telegram → `/newbot`
2. Save the token as `TELEGRAM_BOT_TOKEN` in Dokploy env vars
3. Get your chat ID: message the bot, then fetch `https://api.telegram.org/bot<TOKEN>/getUpdates`
4. Save the chat ID as `TELEGRAM_CHAT_ID` in Dokploy env vars

#### Troubleshooting

| Issue                    | Check                                                         |
| ------------------------ | ------------------------------------------------------------- |
| No Telegram notification | Verify `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are set    |
| Seed fails               | Check API container logs: `docker logs cycling-api --tail 50` |
| Retrain fails            | Check ML logs: `docker logs cycling-ml-service --tail 50`     |
| ML health check timeout  | Check RAM usage (`free -h`), 4GB VPS may OOM during retrain   |
| Cache clear fails        | Non-critical — stale predictions are replaced on next query   |

---

## 8. Environment Variables Reference

### API (`cycling-api`)

| Variable                | Example                                   | Description                                                                                                                                            |
| ----------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`          | `postgresql://user:pass@host:5432/dbname` | PostgreSQL connection string (hostname from Dokploy DB service)                                                                                        |
| `PORT`                  | `3001`                                    | API listen port                                                                                                                                        |
| `CORS_ORIGIN`           | `https://cycling.yourdomain.com`          | **Required in production.** Allowed origin for web frontend. The API crashes on boot with a clear error if this is missing when `NODE_ENV=production`. |
| `ML_SERVICE_URL`        | `http://ml-service:8000`                  | Internal ML service URL                                                                                                                                |
| `PCS_REQUEST_DELAY_MS`  | `1500`                                    | Delay between PCS scraping requests (ms)                                                                                                               |
| `FUZZY_MATCH_THRESHOLD` | `-10000`                                  | Rider name fuzzy matching threshold                                                                                                                    |

### Web (`cycling-web`)

| Variable       | Example                              | Description                                |
| -------------- | ------------------------------------ | ------------------------------------------ |
| `VITE_API_URL` | `https://api.cycling.yourdomain.com` | API URL for frontend (baked at build time) |

### ML Service (`cycling-ml-service`)

| Variable       | Example                                   | Description                              |
| -------------- | ----------------------------------------- | ---------------------------------------- |
| `DATABASE_URL` | `postgresql://user:pass@host:5432/dbname` | Same PostgreSQL connection string as API |

### Weekly Pipeline (Dokploy scheduled task)

| Variable             | Example          | Description                            |
| -------------------- | ---------------- | -------------------------------------- |
| `TELEGRAM_BOT_TOKEN` | `123456:ABC-DEF` | Bot token from @BotFather              |
| `TELEGRAM_CHAT_ID`   | `-1001234567890` | Telegram chat/group ID for alerts      |
| `SEED_YEARS`         | `1`              | Years to seed (default: 1)             |
| `SKIP_AVATARS`       | `true`           | Skip avatar resolution (default: true) |

---

## 9. Useful Commands Quick Reference

| Task                        | Command                                                                       |
| --------------------------- | ----------------------------------------------------------------------------- |
| List running services       | `docker ps --filter "name=cycling-"`                                          |
| API logs (follow)           | `docker logs cycling-api --tail 100 -f`                                       |
| ML logs (follow)            | `docker logs cycling-ml-service --tail 100 -f`                                |
| Web logs (follow)           | `docker logs cycling-web --tail 100 -f`                                       |
| API healthcheck             | `docker exec cycling-api wget -qO- http://localhost:3001/health/readiness`    |
| ML healthcheck              | `docker exec cycling-ml-service curl -s http://localhost:8000/health`         |
| Run migrations manually     | `docker exec cycling-api node dist/infrastructure/database/run-migrations.js` |
| Seed database               | `docker exec cycling-api node dist/cli.js seed-database`                      |
| Seed database (5 years)     | `docker exec cycling-api node dist/cli.js seed-database --years 5`            |
| Retrain ML models           | `docker exec cycling-ml-service python -m src.training.retrain`               |
| Restart ML service          | `docker restart cycling-ml-service`                                           |
| Clear all ML cache          | `DELETE FROM ml_scores;` (via psql)                                           |
| Clear ML cache for one race | `DELETE FROM ml_scores WHERE race_slug = '<slug>' AND year = <year>;`         |
| Check model files           | `docker exec cycling-ml-service ls -la /app/models/`                          |
| Check disk space            | `df -h`                                                                       |
| Restart a container         | `docker restart <container-name>`                                             |
| Run weekly pipeline         | `./scripts/weekly-pipeline.sh`                                                |
| Run pipeline (dry run)      | `DRY_RUN=true ./scripts/weekly-pipeline.sh`                                   |
