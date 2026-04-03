#!/bin/sh
set -e

MAX_RETRIES=3
attempt=1

echo "Running database migrations..."
while [ "$attempt" -le "$MAX_RETRIES" ]; do
  if node dist/infrastructure/database/run-migrations.js; then
    break
  fi

  if [ "$attempt" -eq "$MAX_RETRIES" ]; then
    echo "Migration failed after $MAX_RETRIES attempts. Stopping container."
    exit 1
  fi

  echo "Migration attempt $attempt failed, retrying in 5s..."
  sleep 5
  attempt=$((attempt + 1))
done

echo "Starting API server..."
exec node -r ./dist/infrastructure/observability/instrumentation.js dist/main.js
