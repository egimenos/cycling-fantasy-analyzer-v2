# Retraining Runbook — Source-by-Source ML Pipeline

> Guide to retrain the ML model after new race results.

**Last updated**: 2026-03-29
**Model version**: Source-by-source v1 (features 012 + 013)

## Prerequisites

- PostgreSQL running with `cycling_analyzer` database
- Docker Compose (ML service runs in container)
- Database populated with race results (via `make seed` or incremental scraping)

## When to Retrain

- After scraping new race results (weekly during racing season)
- After modifying features, Glicko parameters, or model architecture
- After a full database reseed

## Standard Retraining (one command)

```bash
# 1. Ensure DB has latest results
make seed                    # full reseed
# or
make scrape RACE=tour-de-france YEAR=2026 TYPE=grand_tour  # single race

# 2. Retrain everything
make retrain

# 3. Restart ML service to load new models
make ml-restart
```

`make retrain` runs the full pipeline automatically:

1. Computes Glicko-2 ratings from all race results (~1-2 min)
2. Builds the feature cache — 115 features per rider x race (~5-10 min)
3. Builds stage targets (type-split pts per stage)
4. Builds stage features (type-specific 12m/6m features)
5. Builds classification history features
6. Trains all 9 sub-models + generates metadata.json
7. Writes model_version.txt (triggers hot-reload)

**Total duration**: ~10-15 minutes.

## Verify After Retraining

```bash
cd ml && python -m src.benchmark_integrated
```

**Expected metrics** (source-by-source v1):

| Metric       | GT Expected | Acceptable Range |
| ------------ | ----------- | ---------------- |
| rho total    | 0.571       | > 0.50           |
| Team Capture | 59.4%       | > 50%            |

If metrics drop significantly, investigate which source degraded by checking
per-source rho in the benchmark output.

## Expected Artifacts (in `ml/models/`)

After `make retrain`, these files should exist:

- `gc_gate.joblib`
- `stage_flat.joblib`, `stage_hilly.joblib`, `stage_mountain.joblib`
- `stage_itt_gate.joblib`, `stage_itt_magnitude.joblib`
- `mtn_final_gate.joblib`, `mtn_pass_capture.joblib`
- `spr_inter_capture.joblib`
- `metadata.json` (feature lists, thresholds, heuristic weights)
- `model_version.txt`

## Running Individual Steps (advanced)

If you need to run a specific step in isolation (e.g., debugging):

```bash
make glicko                                             # Glicko-2 only
cd ml && python -m src.cache_features                   # Feature cache only
cd ml && python -m src.stage_targets                    # Stage targets only
cd ml && python -m src.stage_features                   # Stage features only
cd ml && python -m src.classification_history_features  # Classification features only
cd ml && python -m src.train_sources                    # Train sub-models only
```

Note: these have dependencies — e.g., train_sources requires cache + stage
targets + stage features to exist. Use `make retrain` unless you know what
you're doing.

## Troubleshooting

| Issue                        | Cause                                      | Fix                                                                               |
| ---------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------- |
| Glicko ratings look wrong    | New race type or slug not in prestige dict | Check `RACE_PRESTIGE` in glicko2.py                                               |
| Cache build fails            | Missing startlist data for a year          | `make seed` now fetches startlists automatically; check `startlist_entries` table |
| Stage targets row count off  | Unclassifiable stages (parcours_type=NULL) | Normal — ~2% dropped, check EDA                                                   |
| Team capture drops below 40% | Prices may be incorrect or missing         | Check `rider_prices` table for the test races                                     |
| rho drops on specific source | Check if that source's features changed    | Run per-source benchmark to isolate                                               |

## Notes

- Supply estimation for mountain_pass and sprint_inter uses historical same-race
  averages. No pre-race scraping of climb inventories is needed.
- GT completion rate for sprint_final heuristic is computed from stage result
  history, not from a separate table.
- Hot-reload: after `make retrain`, the ML service detects the new
  model_version.txt on the next request — no restart strictly required,
  but `make ml-restart` guarantees immediate reload.
