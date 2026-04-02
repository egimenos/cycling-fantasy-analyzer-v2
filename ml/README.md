# ML Service

Fantasy cycling prediction service — FastAPI microservice with scikit-learn/LightGBM models.

## Package Structure

```
ml/
├── src/
│   ├── api/            FastAPI service, logging, telemetry
│   ├── prediction/     Inference logic (stage races + classics)
│   ├── features/       Feature extraction + caching
│   ├── domain/         Scoring tables, Glicko-2 ratings, classic taxonomy
│   ├── data/           Database access (PostgreSQL)
│   └── training/       Retraining pipeline
├── benchmarks/         Evaluation harness (not in Docker image)
├── tests/              pytest test suite
├── models/             Trained model artifacts (.joblib)
├── cache/              Feature cache (.parquet, gitignored)
└── docs/               Model documentation
```

## Quick Start

```bash
# Start the service (via Docker Compose from repo root)
make dev            # starts DB + ML service + API + Web

# Or run directly (requires local Python + PostgreSQL)
cd ml && uvicorn src.api.app:app --reload --port 8000
```

## Key Commands

```bash
# Retrain all models (stage races + classics, ~10 min)
make retrain

# Recompute Glicko-2 ratings only
make glicko

# Run tests
cd ml && python -m pytest tests/ -v

# Run canonical benchmark
cd ml && python -m benchmarks.canonical

# Run classics benchmark
cd ml && python -m benchmarks.classics --mode rules-baseline
```

## Models

- **Stage races**: 9 sub-models (GC gate, stage flat/hilly/mountain, ITT gate/magnitude, mountain final/pass, sprint)
- **Classics**: Single LightGBM regressor with 51 features (type affinity, same-race history, Glicko-2, pipeline momentum)

Models are stored in `ml/models/` and hot-reloaded when the version changes (no container restart needed).

## Entry Points

| Path | Purpose |
|------|---------|
| `src/api/app.py` | FastAPI service (`/predict`, `/health`) |
| `src/training/retrain.py` | Full retraining pipeline |
| `benchmarks/harness.py` | Core evaluation metrics |
| `benchmarks/canonical.py` | Canonical benchmark suite |
