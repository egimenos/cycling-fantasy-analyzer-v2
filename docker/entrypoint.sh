#!/bin/sh
set -e

echo "Running database migrations..."
node dist/infrastructure/database/run-migrations.js

echo "Starting API server..."
exec node -r ./dist/infrastructure/observability/instrumentation.js dist/main.js
