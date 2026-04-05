# Runbook: Production Operations

Practical reference for operating and troubleshooting the Cycling Analyzer in production. Deployed on Dokploy to a VPS.

**Last updated**: 2026-04-03

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

Scraping operations are CLI-only. No REST endpoints are exposed for scraping (security policy).

- Initial data population runs via the `seed-database` CLI command (see above)
- Production scraping should be scheduled via Dokploy scheduled tasks, not run ad-hoc
- Configure scheduled tasks in Dokploy > Project > Scheduled Tasks

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

---

## 4. Troubleshooting

### API won't start

1. Check startup logs for migration errors: `docker logs cycling-api --tail 50`
2. Verify `DATABASE_URL` is correct and PostgreSQL is reachable
3. Verify ML service is healthy (API requires it for all scoring — there is no fallback)
4. Check disk space: `df -h`
5. Check for missing required environment variables in Dokploy env settings

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

| Area               | Policy                                                             |
| ------------------ | ------------------------------------------------------------------ |
| SSH                | Key-only authentication, no root login                             |
| Firewall           | Only ports 22, 80, 443, 3000 (Dokploy dashboard) open              |
| Containers         | Run as non-root (UID 1001)                                         |
| Scraping endpoints | None exposed publicly — CLI/cron only                              |
| Database           | Not exposed publicly — accessible only via internal Docker network |
| Secrets            | Managed via Dokploy environment variables, not committed to repo   |
| OS updates         | Applied monthly on VPS                                             |

---

## 7. Scheduled Tasks Reference

| Task          | Frequency           | Command                          | Where                | Notes                              |
| ------------- | ------------------- | -------------------------------- | -------------------- | ---------------------------------- |
| ML retraining | Weekly (Sunday 3am) | `python -m src.training.retrain` | `cycling-ml-service` | Restart container after            |
| DB backup     | Daily               | Configured in Dokploy            | Dokploy DB service   | Verify S3 destination is valid     |
| OS updates    | Monthly             | `apt update && apt upgrade`      | VPS via SSH          | Schedule during low-traffic window |

---

## 8. Environment Variables Reference

### API (`cycling-api`)

| Variable                | Example                                   | Description                                                     |
| ----------------------- | ----------------------------------------- | --------------------------------------------------------------- |
| `DATABASE_URL`          | `postgresql://user:pass@host:5432/dbname` | PostgreSQL connection string (hostname from Dokploy DB service) |
| `PORT`                  | `3001`                                    | API listen port                                                 |
| `CORS_ORIGIN`           | `https://cycling.yourdomain.com`          | Allowed origin for web frontend                                 |
| `ML_SERVICE_URL`        | `http://ml-service:8000`                  | Internal ML service URL                                         |
| `PCS_REQUEST_DELAY_MS`  | `1500`                                    | Delay between PCS scraping requests (ms)                        |
| `FUZZY_MATCH_THRESHOLD` | `-10000`                                  | Rider name fuzzy matching threshold                             |

### Web (`cycling-web`)

| Variable       | Example                              | Description                                |
| -------------- | ------------------------------------ | ------------------------------------------ |
| `VITE_API_URL` | `https://api.cycling.yourdomain.com` | API URL for frontend (baked at build time) |

### ML Service (`cycling-ml-service`)

| Variable       | Example                                   | Description                              |
| -------------- | ----------------------------------------- | ---------------------------------------- |
| `DATABASE_URL` | `postgresql://user:pass@host:5432/dbname` | Same PostgreSQL connection string as API |

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
