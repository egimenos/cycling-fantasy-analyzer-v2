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

# Verify connection to local DB
python -c "import psycopg2; psycopg2.connect('postgresql://cycling:cycling@localhost:5432/cycling_analyzer'); print('OK')"
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
# Train RF models and generate predictions for all races with startlists
make retrain
# Output: ml/models/model_mini_tour.joblib, model_grand_tour.joblib
# Output: predictions written to ml_scores table
```

## Generate Predictions (on-demand)

```bash
# After scraping a new startlist
make scrape RACE=tour-de-suisse YEAR=2026 TYPE=mini_tour

# Generate predictions for that race
make predict RACE=tour-de-suisse YEAR=2026
```

## Validate

```bash
# Run benchmark suite — shows rules vs ML vs hybrid
make benchmark-suite

# Run TypeScript tests
make test

# Run Python tests
cd ml && python -m pytest tests/
```

## Development Workflow

1. Edit Python ML code in `ml/src/`
2. Run `make retrain` to test the full pipeline
3. Edit TypeScript integration in `apps/api/src/`
4. Run `make test` to verify API changes
5. Run `make benchmark-suite` to validate scoring quality
