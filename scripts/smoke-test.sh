#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cleanup() {
  echo ""
  echo "Stopping services..."
  docker compose -f "$PROJECT_ROOT/docker-compose.yml" down 2>/dev/null || true
}
trap cleanup EXIT

echo "=== Cycling Fantasy Optimizer — Smoke Test ==="
echo ""

# Step 1: Start PostgreSQL
echo "[1/5] Starting PostgreSQL..."
docker compose -f "$PROJECT_ROOT/docker-compose.yml" up -d --wait
echo "  PostgreSQL is up."

# Step 2: Run migrations
echo "[2/5] Running database migrations..."
cd "$PROJECT_ROOT"
pnpm --filter @cycling-analyzer/api db:migrate
echo "  Migrations complete."

# Step 3: Build API
echo "[3/5] Building API..."
pnpm --filter @cycling-analyzer/api build
echo "  Build complete."

# Step 4: Test analyze endpoint (requires API to be running)
echo "[4/5] Starting API and testing POST /api/analyze..."
PORT=3001 pnpm --filter @cycling-analyzer/api start &
API_PID=$!

# Wait for API to be ready
for i in $(seq 1 30); do
  if curl -sf http://localhost:3001/api/health > /dev/null 2>&1; then
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "  FAIL: API did not start within 30 seconds"
    kill "$API_PID" 2>/dev/null || true
    exit 1
  fi
  sleep 1
done

ANALYZE_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3001/api/analyze \
  -H "Content-Type: application/json" \
  -d @"$SCRIPT_DIR/fixtures/sample-analyze-request.json")
ANALYZE_STATUS=$(echo "$ANALYZE_RESPONSE" | tail -1)
ANALYZE_BODY=$(echo "$ANALYZE_RESPONSE" | sed '$d')

if [ "$ANALYZE_STATUS" -ne 200 ] && [ "$ANALYZE_STATUS" -ne 201 ]; then
  echo "  FAIL: /api/analyze returned status $ANALYZE_STATUS"
  echo "  Body: $ANALYZE_BODY"
  kill "$API_PID" 2>/dev/null || true
  exit 1
fi
echo "  OK: /api/analyze returned $ANALYZE_STATUS"

MATCHED=$(echo "$ANALYZE_BODY" | jq '.totalMatched // 0')
echo "  Matched riders: $MATCHED"

# Step 5: Test optimize endpoint
echo "[5/5] Testing POST /api/optimize..."
OPTIMIZE_REQUEST=$(echo "$ANALYZE_BODY" | jq '{
  riders: .riders,
  budget: 2000,
  mustInclude: [],
  mustExclude: []
}')

OPTIMIZE_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3001/api/optimize \
  -H "Content-Type: application/json" \
  -d "$OPTIMIZE_REQUEST")
OPTIMIZE_STATUS=$(echo "$OPTIMIZE_RESPONSE" | tail -1)
OPTIMIZE_BODY=$(echo "$OPTIMIZE_RESPONSE" | sed '$d')

if [ "$OPTIMIZE_STATUS" -ne 200 ] && [ "$OPTIMIZE_STATUS" -ne 201 ]; then
  echo "  FAIL: /api/optimize returned status $OPTIMIZE_STATUS"
  echo "  Body: $OPTIMIZE_BODY"
  kill "$API_PID" 2>/dev/null || true
  exit 1
fi
echo "  OK: /api/optimize returned $OPTIMIZE_STATUS"

TEAM_SIZE=$(echo "$OPTIMIZE_BODY" | jq '.optimalTeam.riders | length')
TOTAL_COST=$(echo "$OPTIMIZE_BODY" | jq '.optimalTeam.totalCostHillios')
TOTAL_SCORE=$(echo "$OPTIMIZE_BODY" | jq '.optimalTeam.totalProjectedPts')
echo "  Team size: $TEAM_SIZE"
echo "  Total cost: ${TOTAL_COST}H"
echo "  Total score: $TOTAL_SCORE pts"

kill "$API_PID" 2>/dev/null || true

if [ "$TEAM_SIZE" -ne 9 ]; then
  echo "  FAIL: Expected 9 riders, got $TEAM_SIZE"
  exit 1
fi

echo ""
echo "=== ALL SMOKE TESTS PASSED ==="
