#!/usr/bin/env bash
# weekly-pipeline.sh — Automated seed + retrain + cache clear with Telegram notification.
# Designed to run as a Dokploy scheduled task every Monday at 04:00 UTC.
#
# Required env vars:
#   TELEGRAM_BOT_TOKEN  — Bot token from @BotFather
#   TELEGRAM_CHAT_ID    — Chat/group ID to send notifications to
#
# Optional env vars:
#   SEED_YEARS          — Number of years to seed (default: 1)
#   SKIP_AVATARS        — Set to "true" to skip avatar resolution (default: true)
#   DRY_RUN             — Set to "true" to skip execution and print commands

set -euo pipefail

# ── Configuration ─────────────────────────────────────────────
SEED_YEARS="${SEED_YEARS:-1}"
SKIP_AVATARS="${SKIP_AVATARS:-true}"
DRY_RUN="${DRY_RUN:-false}"

API_CONTAINER="cycling-api"
ML_CONTAINER="cycling-ml-service"

# ── Helpers ───────────────────────────────────────────────────

log() { echo "[$(date -u '+%Y-%m-%d %H:%M:%S UTC')] $*"; }

send_telegram() {
  local message="$1"
  if [ -z "${TELEGRAM_BOT_TOKEN:-}" ] || [ -z "${TELEGRAM_CHAT_ID:-}" ]; then
    log "WARN: Telegram credentials not set, skipping notification"
    return 0
  fi
  curl -sf -X POST \
    "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    -d chat_id="${TELEGRAM_CHAT_ID}" \
    -d parse_mode="Markdown" \
    -d text="${message}" > /dev/null 2>&1 || log "WARN: Failed to send Telegram notification"
}

format_duration() {
  local secs=$1
  local mins=$((secs / 60))
  local rem=$((secs % 60))
  if [ "$mins" -gt 0 ]; then
    echo "${mins}m ${rem}s"
  else
    echo "${rem}s"
  fi
}

# Extract a numeric value from structured log output: grep_field "Races scraped:" "$output"
grep_field() {
  echo "$2" | grep -oP "${1}\s+\K\d+" | head -1 || echo "0"
}

# ── Pre-flight checks ────────────────────────────────────────

log "Starting weekly pipeline"
log "Config: seed_years=${SEED_YEARS}, skip_avatars=${SKIP_AVATARS}"

if [ "$DRY_RUN" = "true" ]; then
  log "DRY RUN — commands will be printed but not executed"
fi

for container in "$API_CONTAINER" "$ML_CONTAINER"; do
  if ! docker inspect --format='{{.State.Running}}' "$container" 2>/dev/null | grep -q true; then
    log "ERROR: Container $container is not running"
    send_telegram "$(cat <<EOF
❌ *Weekly pipeline failed*
Container \`${container}\` is not running.
Pipeline aborted before any work was done.
EOF
)"
    exit 1
  fi
done

PIPELINE_START=$(date +%s)
FAILED_STEP=""
ERROR_MSG=""

# ── Step 1: Incremental seed ─────────────────────────────────
# Seed has 3 phases: race results → startlists → avatars

log "Step 1/4: Seeding database (last ${SEED_YEARS} year(s))..."
SEED_START=$(date +%s)

SEED_FLAGS="--years ${SEED_YEARS}"
if [ "$SKIP_AVATARS" = "true" ]; then
  SEED_FLAGS="${SEED_FLAGS} --skip-avatars"
fi

if [ "$DRY_RUN" = "true" ]; then
  log "  Would run: docker exec $API_CONTAINER node dist/cli.js seed-database $SEED_FLAGS"
  SEED_OUTPUT="DRY RUN"
  SEED_EXIT=0
else
  SEED_OUTPUT=$(docker exec "$API_CONTAINER" node dist/cli.js seed-database $SEED_FLAGS 2>&1) || true
  SEED_EXIT=${PIPESTATUS[0]:-$?}
fi

SEED_END=$(date +%s)
SEED_DURATION=$((SEED_END - SEED_START))

# Parse seed summary — race results
SEED_RACES=$(grep_field "Races scraped:" "$SEED_OUTPUT")
SEED_RECORDS=$(grep_field "Records added:" "$SEED_OUTPUT")
SEED_SKIPPED=$(grep_field "Skipped \(done\):" "$SEED_OUTPUT")
SEED_FUTURE=$(grep_field "Skipped \(future\):" "$SEED_OUTPUT")
SEED_WARNINGS=$(grep_field "Warnings:" "$SEED_OUTPUT")
SEED_FAILED=$(echo "$SEED_OUTPUT" | grep -P '^\s*Failed:' | head -1 | grep -oP '\d+' || echo "0")

# Parse seed summary — startlists
SL_FETCHED=$(grep_field "Fetched:" "$SEED_OUTPUT")
SL_CACHED=$(grep_field "Cached:" "$SEED_OUTPUT")
SL_EMPTY=$(grep_field "Empty:" "$SEED_OUTPUT")
SL_FAILED=$(echo "$SEED_OUTPUT" | grep -A1 'Startlists' | grep -oP 'Failed:\s+\K\d+' || echo "0")

# Parse seed summary — avatars
AV_RESOLVED=$(grep_field "Resolved:" "$SEED_OUTPUT")
AV_MISSING=$(grep_field "Missing:" "$SEED_OUTPUT")

log "  Seed completed in $(format_duration $SEED_DURATION): ${SEED_RACES} races scraped, ${SEED_RECORDS} records"

if [ "$SEED_EXIT" -ne 0 ]; then
  FAILED_STEP="seed"
  ERROR_MSG=$(echo "$SEED_OUTPUT" | tail -5)
fi

# ── Step 2: Retrain models ───────────────────────────────────
# Retrain pipeline: glicko → cache → targets → features → classification → stage models → classics

if [ -z "$FAILED_STEP" ]; then
  log "Step 2/4: Retraining ML models..."
  RETRAIN_START=$(date +%s)

  if [ "$DRY_RUN" = "true" ]; then
    log "  Would run: docker exec $ML_CONTAINER python -m src.training.retrain"
    RETRAIN_OUTPUT="DRY RUN"
    RETRAIN_EXIT=0
  else
    RETRAIN_OUTPUT=$(docker exec "$ML_CONTAINER" python -m src.training.retrain 2>&1) || true
    RETRAIN_EXIT=${PIPESTATUS[0]:-$?}
  fi

  RETRAIN_END=$(date +%s)
  RETRAIN_DURATION=$((RETRAIN_END - RETRAIN_START))

  # Parse retrain details
  MODEL_VERSION=$(echo "$RETRAIN_OUTPUT" | grep -oP 'Model version:\s+\K\S+' || echo "?")
  RETRAIN_ELAPSED=$(echo "$RETRAIN_OUTPUT" | grep -oP 'complete in \K\d+' || echo "?")

  # Cache status: "Cache valid, skipping rebuild" or ran full rebuild
  if echo "$RETRAIN_OUTPUT" | grep -q "Cache valid"; then
    CACHE_STATUS="valid (skipped rebuild)"
  else
    CACHE_STATUS="rebuilt"
  fi

  # Classic model status
  CLASSIC_STATUS=$(echo "$RETRAIN_OUTPUT" | grep -oP 'Classic model trained: .+' || echo "")
  if [ -z "$CLASSIC_STATUS" ]; then
    if echo "$RETRAIN_OUTPUT" | grep -q "Classic model training failed"; then
      CLASSIC_STATUS="failed"
    elif echo "$RETRAIN_OUTPUT" | grep -q "No classic"; then
      CLASSIC_STATUS="skipped (no data)"
    else
      CLASSIC_STATUS="unknown"
    fi
  fi

  log "  Retrain completed in $(format_duration $RETRAIN_DURATION): version ${MODEL_VERSION}"

  if [ "$RETRAIN_EXIT" -ne 0 ]; then
    FAILED_STEP="retrain"
    ERROR_MSG=$(echo "$RETRAIN_OUTPUT" | tail -5)
  fi
fi

# ── Step 3: Restart ML service (hot-reload models) ───────────

if [ -z "$FAILED_STEP" ]; then
  log "Step 3/4: Restarting ML service to reload models..."

  if [ "$DRY_RUN" = "true" ]; then
    log "  Would run: docker restart $ML_CONTAINER"
  else
    docker restart "$ML_CONTAINER" > /dev/null 2>&1

    # Wait for health check (up to 60s)
    HEALTH_RETRIES=12
    HEALTH_OK=false
    for i in $(seq 1 $HEALTH_RETRIES); do
      sleep 5
      if docker exec "$ML_CONTAINER" curl -sf http://localhost:8000/health > /dev/null 2>&1; then
        HEALTH_OK=true
        break
      fi
      log "  Waiting for ML service health check (attempt $i/$HEALTH_RETRIES)..."
    done

    if [ "$HEALTH_OK" = false ]; then
      FAILED_STEP="ml-restart"
      ERROR_MSG="ML service did not pass health check after restart (60s timeout)"
      log "  ERROR: $ERROR_MSG"
    else
      log "  ML service healthy"
    fi
  fi
fi

# ── Step 4: Clear prediction cache ───────────────────────────

CACHE_DELETED="?"
if [ -z "$FAILED_STEP" ]; then
  log "Step 4/4: Clearing ML prediction cache..."

  if [ "$DRY_RUN" = "true" ]; then
    log "  Would run: DELETE FROM ml_scores"
    CACHE_DELETED="0 (dry run)"
  else
    CACHE_CLEAR_OUTPUT=$(docker exec "$API_CONTAINER" node -e "
      const { Pool } = require('pg');
      const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      pool.query('DELETE FROM ml_scores')
        .then(r => { console.log('Deleted ' + r.rowCount + ' cached predictions'); process.exit(0); })
        .catch(e => { console.error(e.message); process.exit(1); });
    " 2>&1) || true
    CACHE_CLEAR_EXIT=${PIPESTATUS[0]:-$?}

    CACHE_DELETED=$(echo "$CACHE_CLEAR_OUTPUT" | grep -oP 'Deleted \K\d+' || echo "?")

    if [ "${CACHE_CLEAR_EXIT:-0}" -ne 0 ]; then
      log "  WARN: Cache clear failed (non-critical, stale predictions will be replaced)"
      CACHE_DELETED="failed (non-critical)"
    else
      log "  Prediction cache cleared: ${CACHE_DELETED} entries deleted"
    fi
  fi
fi

# ── Summary & Notification ───────────────────────────────────

PIPELINE_END=$(date +%s)
PIPELINE_DURATION=$((PIPELINE_END - PIPELINE_START))

if [ -z "$FAILED_STEP" ]; then
  log "Pipeline completed successfully in $(format_duration $PIPELINE_DURATION)"

  # Build startlist line
  SL_TOTAL=$((SL_FETCHED + SL_CACHED + SL_EMPTY + SL_FAILED))
  SL_LINE="Startlists: ${SL_FETCHED} fetched, ${SL_CACHED} cached, ${SL_EMPTY} empty"
  if [ "$SL_FAILED" -gt 0 ]; then
    SL_LINE="${SL_LINE}, ${SL_FAILED} failed"
  fi

  # Build avatar line
  if [ "$SKIP_AVATARS" = "true" ]; then
    AV_LINE="Avatars: skipped"
  else
    AV_LINE="Avatars: ${AV_RESOLVED} resolved, ${AV_MISSING} missing"
  fi

  # Build warnings line
  WARN_LINE=""
  if [ "$SEED_WARNINGS" -gt 0 ] || [ "$SEED_FAILED" -gt 0 ]; then
    WARN_LINE="
⚠️ Warnings: ${SEED_WARNINGS}, failures: ${SEED_FAILED}"
  fi

  MESSAGE=$(cat <<EOF
✅ *Weekly pipeline completed*

📊 *Seed* ($(format_duration $SEED_DURATION))
Results: ${SEED_RACES} scraped, ${SEED_RECORDS} records, ${SEED_SKIPPED} skipped, ${SEED_FUTURE} future
${SL_LINE}
${AV_LINE}${WARN_LINE}

🤖 *Retrain* ($(format_duration $RETRAIN_DURATION))
Cache: ${CACHE_STATUS}
Classic: ${CLASSIC_STATUS}
Version: \`${MODEL_VERSION}\`

🗑 *Cache clear*: ${CACHE_DELETED} predictions purged

⏱ *Total*: $(format_duration $PIPELINE_DURATION)
EOF
)

  send_telegram "$MESSAGE"
else
  log "Pipeline FAILED at step: ${FAILED_STEP}"

  # Build partial status per step
  SEED_STATUS="not started"
  RETRAIN_STATUS="not started"
  RESTART_STATUS="not started"

  if [ "$FAILED_STEP" = "seed" ]; then
    SEED_STATUS="FAILED after $(format_duration $SEED_DURATION)"
  else
    SEED_STATUS="${SEED_RACES} races, ${SEED_RECORDS} records ($(format_duration $SEED_DURATION))"
    if [ "$FAILED_STEP" = "retrain" ]; then
      RETRAIN_STATUS="FAILED after $(format_duration $RETRAIN_DURATION)"
    else
      RETRAIN_STATUS="version ${MODEL_VERSION} ($(format_duration $RETRAIN_DURATION))"
      if [ "$FAILED_STEP" = "ml-restart" ]; then
        RESTART_STATUS="FAILED — health check timeout"
      fi
    fi
  fi

  # Sanitize error message for Telegram (escape markdown special chars, limit length)
  CLEAN_ERROR=$(echo "$ERROR_MSG" | head -3 | sed 's/[_*`\[]/\\&/g')

  MESSAGE=$(cat <<EOF
❌ *Weekly pipeline failed at: ${FAILED_STEP}*

Seed: ${SEED_STATUS}
Retrain: ${RETRAIN_STATUS}
ML restart: ${RESTART_STATUS}

\`\`\`
${CLEAN_ERROR}
\`\`\`
⏱ Duration: $(format_duration $PIPELINE_DURATION)
EOF
)

  send_telegram "$MESSAGE"
  exit 1
fi
