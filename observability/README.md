# Observability

Standalone Grafana Alloy collector that ships logs and traces from every container running on the VPS to **Grafana Cloud** (free tier). Deployed as its own Dokploy project so it serves cycling-analyzer and any future hobby project on the same host.

## Why Grafana Cloud instead of self-hosting

The VPS only has 4 GB of RAM and is already tight when the ML retraining job runs. Self-hosting Loki + Tempo + Grafana would push it over the edge. Grafana Cloud's free tier (50 GB logs/month, 50 GB traces/month, 14-day retention, no credit card, always free) gives us all of that without any memory cost on our VPS — only a tiny Alloy collector (~80 MB) runs locally.

## What gets collected

- **Logs**: stdout/stderr from every Docker container on the host, scraped via the Docker socket. Each log line is labeled with `container=<name>`, e.g. `{container="cycling-api"}`.
- **Traces**: OTLP traces from cycling services (`cycling-api` over HTTP on port 4318, `cycling-ml-service` over gRPC on port 4317). Both already emit traces with correlation IDs — Alloy just forwards them.

Metrics are not collected yet — see issue #26 follow-ups.

## One-time setup

### 1. Create a Grafana Cloud account

1. Go to <https://grafana.com/auth/sign-up> and create an account. No credit card required.
2. After the welcome flow you land in the Cloud Portal at `https://grafana.com/orgs/<your-org>/stacks`.

### 2. Find your endpoint URLs and instance IDs

Inside your stack:

- Click **"Send Logs"** on the Loki tile → copy the **URL** (e.g. `https://logs-prod-XXX.grafana.net`) and the **User** number.
- Click **"Send Traces"** on the Tempo tile → copy the **URL** but **strip the `https://` prefix and any trailing `/tempo` path**. Alloy uses gRPC for Tempo so the endpoint must be in the form `host:port`, e.g. `tempo-prod-10-prod-eu-west-2.grafana.net:443`. Also copy the **User** number (note: this is usually a different number than the Loki user).

### 3. Create a Cloud Access Policy token

1. Go to <https://grafana.com/orgs/your-org/access-policies>.
2. Click **"Create access policy"**.
3. Give it any name (e.g. `cycling-vps-alloy`), select your stack, and check the scopes:
   - `logs:write`
   - `traces:write`
4. Create the policy, then click **"Add token"**, give it a name, and copy the token (`glc_…`). You only see it once.

### 4. Deploy on Dokploy

1. In Dokploy, create a new **Project** called `observability`.
2. Inside the project, add a new **Compose** service.
3. Point it at this repo and set **Compose Path** to `observability/docker-compose.yml`.
4. In **Environment**, paste the values you collected (the keys must match `.env.example`):

   ```env
   GRAFANA_CLOUD_LOKI_URL=https://logs-prod-XXX.grafana.net
   GRAFANA_CLOUD_LOKI_USER=000000
   GRAFANA_CLOUD_TEMPO_URL=https://tempo-prod-XXX.grafana.net:443
   GRAFANA_CLOUD_TEMPO_USER=000000
   GRAFANA_CLOUD_TOKEN=glc_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

5. Hit **Deploy**. Wait until the container reports healthy.

### 5. Wire cycling services to Alloy

The cycling `docker-compose.prod.yml` already sets `OTEL_EXPORTER_OTLP_ENDPOINT` for `api` and `ml-service`. Both point to `alloy:4317` (gRPC) or `alloy:4318` (HTTP) over the shared `dokploy-network`. After deploying observability, redeploy cycling so the env vars take effect.

## Verifying it works

### Logs

In Grafana Cloud, open **Drilldown → Logs** and run:

```logql
{container="cycling-api"} | json
```

You should see Pino JSON logs flowing in real time. To filter by a specific request, query by correlation ID:

```logql
{container="cycling-api"} |= "abc-123-correlation-id"
```

### Traces

1. Hit any endpoint of the cycling API and capture the `x-correlation-id` header from the response (or pull it from the matching log line).
2. In Grafana Cloud, open **Drilldown → Traces** and search by that correlation ID. You should see a full trace spanning HTTP → DB queries → ML service call.

## Troubleshooting

### Alloy container restarts in a loop

Check `docker logs alloy` (or in Dokploy UI). The most common causes:

- **Bad env vars**: missing or wrong endpoint URL / user / token. Alloy fails fast with a clear error pointing at the offending variable.
- **Token without correct scopes**: the access policy must have `logs:write` AND `traces:write`. Recreate the token if scopes are wrong.

### No logs in Grafana Cloud

- Make sure Alloy actually sees the containers: `docker exec alloy curl -s http://localhost:12345/-/healthy` should return `Alloy is ready.`
- Check that the Docker socket is mounted: `docker exec alloy ls -la /var/run/docker.sock` should show the socket file.
- Inspect Alloy's own logs for `loki.write` errors.

### No traces in Grafana Cloud but logs work

- Verify cycling services have `OTEL_EXPORTER_OTLP_ENDPOINT` set (`docker inspect cycling-api | grep OTEL`).
- For the API (HTTP), endpoint should be `http://alloy:4318`. The instrumentation appends `/v1/traces` itself.
- For the ML service (gRPC), endpoint should be `http://alloy:4317`.
- Check Alloy logs for `otelcol.exporter.otlphttp` errors — usually a wrong Tempo URL or scope.

## Memory and disk footprint

- Alloy idles around 50–80 MB and peaks around 100–150 MB under typical scrape load. The Compose file caps it at 200 MB.
- The `alloy-data` volume holds positions and small WAL files, typically under 100 MB.
- All log/trace storage is in Grafana Cloud — nothing accumulates on the VPS disk.
