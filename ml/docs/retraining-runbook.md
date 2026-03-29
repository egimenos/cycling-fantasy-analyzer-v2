# Retraining Runbook — Source-by-Source ML Pipeline

> Step-by-step guide to retrain the ML model from scratch.
> Follow this order exactly — later steps depend on earlier ones.

**Last updated**: 2026-03-29
**Model version**: Source-by-source v1 (feature 012)
**Status**: Manual process. Production automation pending (feature 013).

## Prerequisites

- PostgreSQL running with `cycling_analyzer` database
- Python 3.11+ with ml dependencies installed
- Database populated with race results (via `make seed` or incremental scraping)

## When to Retrain

- After scraping new race results (weekly during racing season)
- After modifying features, Glicko parameters, or model architecture
- After a full database reseed

## Step-by-Step Process

### Step 1: Ensure Database is Up to Date

Scrape any new race results that aren't in the database yet.

```bash
# Full reseed (only if starting from scratch):
make seed

# Or scrape a specific race:
make scrape RACE=tour-de-france YEAR=2026 TYPE=grand_tour
```

**Verify**: Check that the latest races have results:

```bash
python -c "
import psycopg2
conn = psycopg2.connect('postgresql://cycling:cycling@localhost:5432/cycling_analyzer')
cur = conn.cursor()
cur.execute(\"SELECT race_slug, year, COUNT(*) FROM race_results GROUP BY race_slug, year ORDER BY year DESC, race_slug LIMIT 10\")
for r in cur.fetchall(): print(f'  {r[0]:30s} {r[1]} ({r[2]} results)')
cur.close(); conn.close()
"
```

### Step 2: Recompute Glicko-2 Ratings

Glicko ratings are computed chronologically from all race results. Must be rerun
when new races are added.

```bash
cd ml && python -m src.glicko2
```

**What it does**: Processes all GC and stage results in date order, updates
`rider_ratings` table in PostgreSQL with gc_mu, gc_rd, stage_mu, stage_rd per
rider per race.

**Duration**: ~1-2 minutes for full history.

**Verify**: Check that top riders have reasonable ratings:

```bash
python -c "
import psycopg2
conn = psycopg2.connect('postgresql://cycling:cycling@localhost:5432/cycling_analyzer')
cur = conn.cursor()
cur.execute(\"SELECT r.full_name, rr.gc_mu, rr.stage_mu FROM rider_ratings rr JOIN riders r ON rr.rider_id = r.id ORDER BY rr.race_date DESC, rr.gc_mu DESC LIMIT 10\")
for r in cur.fetchall(): print(f'  {r[0]:25s} gc_mu={r[1]:.0f} stage_mu={r[2]:.0f}')
cur.close(); conn.close()
"
```

### Step 3: Rebuild Feature Cache

The feature cache contains per-rider, per-race features for all years with
startlist data (2022+).

```bash
cd ml && python -m src.cache_features
```

**What it does**: For each year, extracts 115 features per rider×race using
historical lookback. Saves to `ml/cache/features_{year}.parquet`.

**Duration**: ~5-10 minutes.

**Verify**:

```bash
cd ml && python -m src.cache_features --check
```

### Step 4: Build Stage Targets

Stage targets split fantasy points by stage type (flat/hilly/mountain/ITT).

```bash
cd ml && python -m src.stage_targets
```

**Output**: `ml/cache/stage_targets.parquet` (~30K rider×race rows)

### Step 5: Build Stage Features

Type-specific historical features per rider (12m/6m windows, class-weighted).

```bash
cd ml && python -m src.stage_features
```

**Output**: `ml/cache/stage_features.parquet` (40 features per rider×race)

### Step 6: Build Classification History Features

Historical mountain/sprint final classification positions per rider.

```bash
cd ml && python -m src.classification_history_features
```

**Output**: `ml/cache/classification_history_features.parquet` (8 features)

### Step 7: Verify Everything

Run the integrated benchmark to confirm metrics are in expected range:

```bash
cd ml && python -m src.benchmark_integrated
```

**Expected metrics** (source-by-source v1):

| Metric       | GT Expected | Acceptable Range |
| ------------ | ----------- | ---------------- |
| ρ total      | 0.571       | > 0.50           |
| Team Capture | 59.4%       | > 50%            |

If metrics drop significantly, investigate which source degraded.

## Quick Reference — All Commands in Order

```bash
# Option A: Run everything in one command
make retrain

# Option B: Run steps individually
# 1. Database
make seed                                          # or incremental scrape

# 2. Glicko ratings
cd ml && python -m src.glicko2

# 3. Feature cache
cd ml && python -m src.cache_features

# 4. Stage targets
cd ml && python -m src.stage_targets

# 5. Stage features
cd ml && python -m src.stage_features

# 6. Classification features
cd ml && python -m src.classification_history_features

# 7. Train source-by-source models
cd ml && python -m src.train_sources

# 8. Verify
cd ml && python -m src.benchmark_integrated
```

**Expected artifacts after step 7** (in `ml/models/`):
- `gc_gate.joblib`
- `stage_flat.joblib`, `stage_hilly.joblib`, `stage_mountain.joblib`
- `stage_itt_gate.joblib`, `stage_itt_magnitude.joblib`
- `mtn_final_gate.joblib`, `mtn_pass_capture.joblib`
- `spr_inter_capture.joblib`
- `metadata.json` (feature lists, thresholds, heuristic weights)
- `model_version.txt`

## Troubleshooting

| Issue                        | Cause                                      | Fix                                           |
| ---------------------------- | ------------------------------------------ | --------------------------------------------- |
| Glicko ratings look wrong    | New race type or slug not in prestige dict | Check `RACE_PRESTIGE` in glicko2.py           |
| Cache build fails            | Missing startlist data for a year          | Check `startlist_entries` table has data      |
| Stage targets row count off  | Unclassifiable stages (parcours_type=NULL) | Normal — ~2% dropped, check EDA               |
| Team capture drops below 40% | Prices may be incorrect or missing         | Check `rider_prices` table for the test races |
| ρ drops on specific source   | Check if that source's features changed    | Run per-source benchmark to isolate           |

## Notes

- The current pipeline does NOT produce deployable model artifacts (joblib/pickle).
  Models are trained inline during benchmark evaluation. Feature 013 will add
  model persistence for production serving.
- Supply estimation for mountain_pass and sprint_inter uses historical same-race
  averages. No pre-race scraping of climb inventories is needed.
- GT completion rate for sprint_final heuristic is computed from stage result
  history, not from a separate table.
