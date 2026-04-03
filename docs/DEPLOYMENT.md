# Deployment Guide

Production deployment of the Cycling Fantasy Analyzer on a VPS managed by
[Dokploy](https://dokploy.com/) (self-hosted PaaS).

---

## 1. Architecture Overview

```
                 Internet
                    |
              [ Traefik ]   (Dokploy-managed reverse proxy)
               /        \
        api.domain    app.domain
             |              |
     +-------+------+  +---+--------+
     | cycling-api  |  | cycling-web|
     | NestJS :3001 |  | serve :3000|
     +------+-------+  +------------+
            |
     +------+------------+
     | cycling-ml-service |
     | FastAPI :8000      |
     | (internal only)    |
     +--------------------+
            |
     +------+------------+
     | PostgreSQL 16      |
     | Dokploy Database   |
     | (native service)   |
     +--------------------+
```

| Service       | Image base         | Port | Exposed?      |
| ------------- | ------------------ | ---- | ------------- |
| API           | node:20-alpine     | 3001 | Via Traefik   |
| Web           | node:20-alpine     | 3000 | Via Traefik   |
| ML Service    | python:3.12-slim   | 8000 | No (internal) |
| PostgreSQL 16 | postgres:16-alpine | 5432 | No (internal) |

All application containers run as non-root (`USER appuser`, UID 1001).
PostgreSQL runs as the Dokploy-managed native database service, outside of
the compose stack but on the same `dokploy-network`.

---

## 2. Decisions and Justification

### PostgreSQL as a native Dokploy Database service

Dokploy offers first-class database management (backups, credentials, restart)
when databases are created as **Database** resources rather than compose
services. This keeps the compose file focused on the three application
services and avoids managing PG data volumes ourselves.

### Single Docker Compose for all application services

API, Web, and ML Service are deployed together because they share a lifecycle
and the API depends on the ML Service being healthy before starting. A single
compose simplifies environment variable management and networking.

### Non-root execution

All three Dockerfiles create an `appuser` (UID 1001) and switch to it via
`USER appuser`. **Do not** add `user: '1000:1000'` in `docker-compose.prod.yml`
-- it would conflict with the Dockerfile-level user and could cause permission
errors. The Dockerfiles handle non-root execution; the compose file should not
override them.

### Observability (future)

The API entrypoint loads OpenTelemetry instrumentation at startup via
`node -r ./dist/infrastructure/observability/instrumentation.js`. This is
ready for connecting to a tracing backend (Jaeger, Grafana Tempo, etc.)
when needed.

### Dokploy MCP Server

For AI-assisted operations, the Dokploy MCP server can be added to Claude Code:

```bash
claude mcp add dokploy-mcp \
  --env DOKPLOY_URL=https://your-dokploy.com/api \
  --env DOKPLOY_API_KEY=your-token \
  -- npx -y @ahdev/dokploy-mcp
```

> Note: The package was migrated to the official `Dokploy/mcp` repo.

---

## 3. VPS Hardening

Before installing Dokploy, harden the VPS:

### SSH

```bash
# /etc/ssh/sshd_config
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
AllowUsers deploy
```

Restart SSH after changes: `sudo systemctl restart sshd`

### Firewall (ufw)

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp     # SSH
sudo ufw allow 80/tcp     # HTTP (Traefik)
sudo ufw allow 443/tcp    # HTTPS (Traefik)
sudo ufw enable
```

### fail2ban

```bash
sudo apt install fail2ban
sudo systemctl enable fail2ban
```

Default configuration protects SSH. Add custom jails for HTTP abuse if needed.

---

## 4. Domain and SSL

Dokploy uses Traefik as its reverse proxy. For each compose service that needs
external access (API, Web):

1. In Dokploy, go to the Compose service **Domains** tab.
2. Add the domain (e.g. `api.yourdomain.com`, `app.yourdomain.com`).
3. Set the HTTPS redirect and certificate type to **Let's Encrypt**.
4. Ensure DNS A records point to the VPS IP.

Traefik handles automatic certificate issuance and renewal.

**Important:** Domain changes for Compose services require a **full
redeployment** to take effect. Unlike Application-type services (which use
Traefik File Provider for hot-reload), Compose services regenerate their Traefik
labels on deploy.

---

## 5. Step-by-step Dokploy Setup

### 5.1 Install Dokploy

```bash
curl -sSL https://dokploy.com/install.sh | sh
```

Access the panel at `https://your-vps-ip:3000` and create the admin account.

### 5.2 Create a Project

Create a project (e.g. "Cycling Analyzer") in the Dokploy dashboard.

### 5.3 Create the PostgreSQL Database

1. In the project, click **Create Service** > **Database** > **PostgreSQL**.
2. Set the database name (`cycling_analyzer`), user, and password.
3. Note the internal connection string:
   `postgresql://<user>:<pass>@<container-name>:5432/cycling_analyzer`

The database container joins `dokploy-network` automatically, making it
reachable by the compose services.

### 5.4 Create the Docker Compose Service

1. In the same project, click **Create Service** > **Compose**.
2. Connect the GitHub repository and select the branch (`main`).
3. Set the Compose file path to `docker-compose.prod.yml`.
4. Set the **Compose Type** to `docker-compose` (not `stack`).

### 5.5 Environment Variables

In the Compose service **Environment** tab, set:

```env
DATABASE_URL=postgresql://<user>:<pass>@<pg-container>:5432/cycling_analyzer
PORT=3001
CORS_ORIGIN=https://app.yourdomain.com
ML_SERVICE_URL=http://cycling-ml-service:8000
PCS_REQUEST_DELAY_MS=1500
FUZZY_MATCH_THRESHOLD=-10000
VITE_API_URL=https://api.yourdomain.com
```

### 5.6 Domains

Add domains for the two externally-accessible services:

| Service | Container port | Domain               |
| ------- | -------------- | -------------------- |
| `api`   | 3001           | `api.yourdomain.com` |
| `web`   | 3000           | `app.yourdomain.com` |

The ML Service has no domain -- it is internal only.

### 5.7 Auto Deploy

If the GitHub repository is connected directly to Dokploy, enable **Auto
Deploy** from the **General** tab toggle. This triggers a deploy on every push
to the configured branch.

For repositories not directly connected, configure a webhook manually:
copy the Dokploy webhook URL from the service settings and add it to the
GitHub repo under **Settings > Webhooks**.

### 5.8 Notifications (optional)

Dokploy supports notifications via Slack, Discord, Telegram, and email.
Configure in **Settings > Notifications** to receive deploy status alerts.

---

## 6. docker-compose.prod.yml Reference

This is the production compose file at the repository root:

```yaml
services:
  api:
    build:
      context: .
      dockerfile: docker/Dockerfile.api
    container_name: cycling-api
    restart: unless-stopped
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - PORT=${PORT}
      - CORS_ORIGIN=${CORS_ORIGIN}
      - ML_SERVICE_URL=${ML_SERVICE_URL}
      - PCS_REQUEST_DELAY_MS=${PCS_REQUEST_DELAY_MS}
      - FUZZY_MATCH_THRESHOLD=${FUZZY_MATCH_THRESHOLD}
    depends_on:
      ml-service:
        condition: service_healthy
    healthcheck:
      test: ['CMD', 'wget', '-qO-', 'http://localhost:3001/health/readiness']
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 15s
    networks:
      - dokploy-network

  web:
    build:
      context: .
      dockerfile: docker/Dockerfile.web
      args:
        VITE_API_URL: ${VITE_API_URL}
    container_name: cycling-web
    restart: unless-stopped
    networks:
      - dokploy-network

  ml-service:
    build:
      context: .
      dockerfile: docker/Dockerfile.ml
    container_name: cycling-ml-service
    restart: unless-stopped
    environment:
      - DATABASE_URL=${DATABASE_URL}
    volumes:
      - ml-models:/app/models
      - ml-cache:/app/cache
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:8000/health']
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s
    networks:
      - dokploy-network

volumes:
  ml-models:
  ml-cache:

networks:
  dokploy-network:
    external: true
```

Key points:

- **No port exposure.** All traffic routes through Traefik via domain
  labels. No `ports:` mapping is needed or desired.
- **No `user:` override.** Each Dockerfile sets `USER appuser` (UID 1001).
  Adding a compose-level `user:` would conflict.
- **Named volumes** for ML models and cache. These persist across deploys.
  Dokploy re-clones the repository on each deploy, so repo-relative bind
  mounts (`./something:/app/something`) would lose data because the source
  directory is recreated. Named volumes are not affected.
- **`dokploy-network` is external.** This is the shared network Dokploy
  creates for all services, including the native PostgreSQL database.
- **API healthcheck uses `wget`**, not `curl`, because `curl` is not
  available in `node:20-alpine`. The ML Service uses `curl` because its
  base image (`python:3.12-slim`) installs it explicitly.
- **ML Service `start_period` is 30s** to accommodate model loading time.
- **API `depends_on` with `service_healthy`** ensures the ML Service is
  ready before the API starts.

---

## 7. Post-deploy Tasks

### 7.1 Migrations (automatic)

Migrations run **automatically** on every deploy. The API container uses
`docker/entrypoint.sh` as its entrypoint:

```sh
#!/bin/sh
set -e

echo "Running database migrations..."
node dist/infrastructure/database/run-migrations.js

echo "Starting API server..."
exec node -r ./dist/infrastructure/observability/instrumentation.js dist/main.js
```

This runs the drizzle-orm programmatic migrator (`run-migrations.js`) before
starting the server. It does **not** use `drizzle-kit` CLI or `pnpm` -- neither
is available in the production image (multi-stage build strips them out).

The `exec` ensures the Node process replaces the shell, receiving signals
correctly and preserving OTEL instrumentation.

### 7.2 Seed Database

For the initial deployment or after a database reset, seed the reference data:

```bash
docker exec cycling-api node dist/cli.js seed-database
```

This runs the NestJS CLI command that scrapes PCS data for configured races.
Do **not** use `pnpm seed` -- pnpm is not available in the production image.

### 7.3 ML Model Retraining

Trigger a full retrain (Glicko ratings + feature extraction + model training):

```bash
docker exec cycling-ml-service python -m src.training.retrain
```

This should be run weekly or after significant new race data is scraped.
Models are persisted in the `ml-models` named volume and survive redeploys.

### 7.4 Clear ML Prediction Cache

ML predictions are cached in the `ml_scores` PostgreSQL table. To force
re-prediction (e.g., after retraining), delete the cached rows.

Clear all cached predictions:

```bash
docker exec <postgres-container> psql -U <user> -d cycling_analyzer \
  -c "DELETE FROM ml_scores;"
```

Clear for a specific race and year:

```bash
docker exec <postgres-container> psql -U <user> -d cycling_analyzer \
  -c "DELETE FROM ml_scores WHERE race_slug = 'paris-nice' AND year = 2026;"
```

Replace `<postgres-container>` and `<user>` with the actual values from the
Dokploy database service.

Alternatively, use the Dokploy database service UI to run the SQL query
directly.

---

## 8. Service Summary Table

| Service    | Container            | Port | Healthcheck                | Volumes                 | Non-root        |
| ---------- | -------------------- | ---- | -------------------------- | ----------------------- | --------------- |
| API        | `cycling-api`        | 3001 | `wget` `/health/readiness` | None                    | Yes (UID 1001)  |
| Web        | `cycling-web`        | 3000 | None                       | None                    | Yes (UID 1001)  |
| ML Service | `cycling-ml-service` | 8000 | `curl` `/health`           | `ml-models`, `ml-cache` | Yes (UID 1001)  |
| PostgreSQL | (Dokploy-managed)    | 5432 | Dokploy-managed            | Dokploy-managed         | Default PG user |

---

## 9. Why Dokploy

| Criteria               | Dokploy          | Coolify   | CapRover     |
| ---------------------- | ---------------- | --------- | ------------ |
| Self-hosted            | Yes              | Yes       | Yes          |
| Docker Compose support | Native           | Limited   | No           |
| Database management    | Built-in         | Built-in  | Plugin-based |
| Let's Encrypt SSL      | Automatic        | Automatic | Automatic    |
| GitHub integration     | Direct + webhook | Direct    | Webhook only |
| Reverse proxy          | Traefik          | Traefik   | Nginx        |
| MCP server available   | Yes              | No        | No           |
| Lightweight            | Yes              | Heavier   | Yes          |

Dokploy was chosen for its native Docker Compose support (critical for a
multi-service stack), built-in database management with backup capabilities,
and the availability of an MCP server for AI-assisted operations.
