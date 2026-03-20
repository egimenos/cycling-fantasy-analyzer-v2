# Quickstart: ML Scoring for Stage Races

**Feature**: 006-ml-scoring-stage-races
**Date**: 2026-03-20

## Prerequisites

- Existing dev environment running (Node.js 20+, pnpm, PostgreSQL via docker-compose)
- Database seeded with race data (`make seed`)
- Python 3.12+ installed

## Python Setup (one-time)

```bash
# Create virtual environment
cd ml
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

## Database Migration

```bash
# Generate migration for new ml_scores table
make db-generate

# Apply migration
make db-migrate
```

## Train Model

```bash
# Train RF models (training only, no predictions)
make retrain
# Output: ml/models/model_mini_tour.joblib, model_grand_tour.joblib, model_version.txt
```

## Start ML Service

```bash
# Option 1: Docker (recommended, matches production)
make ml-up
# Starts FastAPI service on port 8000, model loaded into memory

# Option 2: Local dev (for debugging)
cd ml && source venv/bin/activate
uvicorn src.app:app --host 0.0.0.0 --port 8000 --reload

# Verify health
curl http://localhost:8000/health
# → {"status": "healthy", "model_version": "20260320T030000", "models_loaded": ["mini_tour", "grand_tour"]}
```

## Test End-to-End

```bash
# Start API (in another terminal)
make dev

# Analyze a stage race — triggers on-demand ML prediction
# (via frontend or API call)
# The API will call ML service → extract features → predict → cache → return hybrid scores

# Run benchmark suite — shows rules vs ML vs hybrid
make benchmark-suite
```

## Validate

```bash
# Run TypeScript tests
make test

# Run Python tests
cd ml && python -m pytest tests/

# Check ML service logs
make ml-logs
```

## Development Workflow

1. Edit Python ML code in `ml/src/`
2. Restart ML service to pick up changes: `make ml-restart` (or use `--reload` in dev)
3. Run `make retrain` if changing feature extraction or training logic
4. Edit TypeScript integration in `apps/api/src/`
5. Run `make test` to verify API changes
6. Run `make benchmark-suite` to validate scoring quality

## New Makefile Targets

```bash
make retrain          # Train ML models (Python CLI)
make ml-up            # Start ML service (docker-compose)
make ml-down          # Stop ML service
make ml-logs          # View ML service logs
make ml-restart       # Restart ML service (reload model)
make benchmark-suite  # Run benchmark with 3-column comparison
```
