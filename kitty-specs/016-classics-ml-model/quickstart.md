# Quickstart: Classics ML Model

**Feature**: 016-classics-ml-model

## Prerequisites

- Python 3.11 with dependencies from `ml/requirements.txt`
- PostgreSQL running with seeded `race_results` data (at least 2019-2025)
- Existing ML pipeline functional (`make retrain` works for stage races)

## Development Workflow

### 1. Run the baseline benchmark

```bash
cd ml
python src/benchmark_classics.py --mode rules-baseline
# Outputs: ml/logbook/classics_rules_baseline.json
```

### 2. Cache classic features

```bash
python src/cache_features_classics.py
# Outputs: ml/cache/classics_features_YYYY.parquet (one per year)
```

### 3. Train + benchmark a model variant

```bash
python src/benchmark_classics.py --mode ml --features core --model rf
# Outputs: ml/logbook/classics_rf_core_raw.json
```

### 4. Compare against baseline

```bash
python src/benchmark_classics.py --compare classics_rules_baseline.json classics_rf_core_raw.json
# Prints delta table: metric, baseline, candidate, delta, significant?
```

### 5. Ablation testing (add one feature at a time)

```bash
python src/benchmark_classics.py --mode ml --features core+type_affinity --model lgbm
python src/benchmark_classics.py --mode ml --features core+pipeline --model lgbm
# Compare each against the previous best
```

### 6. Production integration (after GO)

```bash
python src/train_classics.py --features best --model lgbm
# Saves model to ml/models/classics/
# predict_sources.py now delegates to predict_classics.py for classic races
```

## Key Files

| File                                | Purpose                   |
| ----------------------------------- | ------------------------- |
| `ml/src/classic_taxonomy.py`        | Classic type lookup table |
| `ml/src/features_classics.py`       | Feature extraction        |
| `ml/src/benchmark_classics.py`      | Benchmark runner          |
| `ml/src/train_classics.py`          | Model training            |
| `ml/src/predict_classics.py`        | Production prediction     |
| `ml/src/cache_features_classics.py` | Feature caching           |

## Metrics Reference

| Metric       | What it measures                              | K value     |
| ------------ | --------------------------------------------- | ----------- |
| Spearman rho | Rank correlation                              | N/A         |
| NDCG@10      | Ranking quality (top 10)                      | 10          |
| P@5          | Precision at top 5                            | 5           |
| P@10         | Precision at top 10                           | 10          |
| Capture rate | % of optimal team points captured             | top-15 team |
| Team overlap | % of riders in both predicted and actual team | top-15 team |
