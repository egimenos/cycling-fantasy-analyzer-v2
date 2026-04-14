#!/usr/bin/env bash
# Replicate CI E2E environment locally without touching your real DB.
# Usage: ./scripts/e2e-ci-local.sh [playwright args...]
# Example: ./scripts/e2e-ci-local.sh -g "should analyze a valid price list"
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

CI_DB_PORT=5433
CI_DB_NAME=cycling_ci
CI_DB_USER=cycling
CI_DB_PASS=cycling
CI_DB_URL="postgresql://${CI_DB_USER}:${CI_DB_PASS}@localhost:${CI_DB_PORT}/${CI_DB_NAME}"
CI_API_PORT=3001
CI_ML_PORT=8000
CONTAINER_NAME="cycling-ci-postgres"

ML_PID=""
API_PID=""

cleanup() {
  echo "Cleaning up..."
  [ -n "$ML_PID" ] && kill "$ML_PID" 2>/dev/null || true
  [ -n "$API_PID" ] && kill "$API_PID" 2>/dev/null || true
  docker rm -f "$CONTAINER_NAME" 2>/dev/null || true
  echo "Restarting dev services..."
  docker compose -f "$ROOT/docker-compose.yml" start ml-service 2>/dev/null || true
}
trap cleanup EXIT

# 1. Start isolated postgres
echo "Starting isolated Postgres on port $CI_DB_PORT..."
docker rm -f "$CONTAINER_NAME" 2>/dev/null || true
docker run -d --name "$CONTAINER_NAME" \
  -e POSTGRES_USER=$CI_DB_USER \
  -e POSTGRES_PASSWORD=$CI_DB_PASS \
  -e POSTGRES_DB=$CI_DB_NAME \
  -p "${CI_DB_PORT}:5432" \
  postgres:16-alpine \
  > /dev/null

# Wait for postgres
echo "Waiting for Postgres..."
until docker exec "$CONTAINER_NAME" pg_isready -U $CI_DB_USER -d $CI_DB_NAME -q 2>/dev/null; do
  sleep 0.5
done

# 2. Migrate and seed
echo "Applying migrations..."
cd "$ROOT/apps/api"
DATABASE_URL="$CI_DB_URL" npx drizzle-kit migrate 2>&1 | tail -1
cd "$ROOT"

echo "Seeding test data..."
PGPASSWORD=$CI_DB_PASS psql -h localhost -p $CI_DB_PORT -U $CI_DB_USER -d $CI_DB_NAME \
  -f "$ROOT/apps/web/tests/e2e/fixtures/seed-ci.sql" -q

# 3. Kill existing services on the ports we need
echo "Stopping any existing API/ML on ports $CI_API_PORT/$CI_ML_PORT..."
lsof -ti :$CI_API_PORT | xargs kill -9 2>/dev/null || true
docker compose -f "$ROOT/docker-compose.yml" stop ml-service 2>/dev/null || true
lsof -ti :$CI_ML_PORT | xargs kill -9 2>/dev/null || true
sleep 1

# 4. Start ML mock
echo "Starting ML mock on port $CI_ML_PORT..."
ML_SERVICE_PORT=$CI_ML_PORT node "$ROOT/apps/web/tests/e2e/fixtures/ml-mock-server.mjs" &
ML_PID=$!
sleep 0.5

# 5. Start API
echo "Starting API on port $CI_API_PORT..."
DATABASE_URL="$CI_DB_URL" \
PORT=$CI_API_PORT \
NODE_ENV=test \
ML_SERVICE_URL="http://localhost:${CI_ML_PORT}" \
LOG_LEVEL=error \
SKIP_EXTERNAL=true \
THROTTLE_DISABLE=true \
  node "$ROOT/apps/api/dist/main.js" &
API_PID=$!

# Wait for API
echo "Waiting for API..."
npx wait-on "http://localhost:${CI_API_PORT}/health/liveness" --timeout 30000 2>/dev/null

# 6. Run Playwright (reuses existing Vite dev server on :3000)
echo "Running E2E tests..."
cd "$ROOT/apps/web"
CI=true pnpm exec playwright test "$@"
