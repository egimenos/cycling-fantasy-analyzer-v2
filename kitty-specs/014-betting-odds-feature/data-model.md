# Data Model: Betting Odds Feature

## Entities

### 1. betting_odds (new table)

Stores pre-race odds snapshots from Betfair Exchange (or backup sources).
One row per rider × race × market type.

| Column          | Type        | Description                                             |
| --------------- | ----------- | ------------------------------------------------------- |
| id              | uuid        | PK                                                      |
| rider_id        | uuid        | FK → riders.id                                          |
| race_slug       | text        | Race identifier (matches race_results)                  |
| year            | int         | Race year                                               |
| market_type     | text        | `gc_winner`, `points_class`, `gc_top10`, `stage_winner` |
| decimal_odds    | float       | Raw decimal odds from source (e.g. 3.50)                |
| implied_prob    | float       | 1 / decimal_odds (before normalization)                 |
| normalized_prob | float       | implied_prob / sum(all probs in same market)            |
| volume_matched  | float       | Betfair matched volume (£) — proxy for confidence       |
| source          | text        | `betfair_exchange`, `oddschecker`, etc.                 |
| scraped_at      | timestamptz | When the snapshot was taken                             |

**Unique constraint**: (rider_id, race_slug, year, market_type, source)

**Indexes**:

- (race_slug, year, market_type) — for bulk lookup at prediction time
- (rider_id) — for per-rider historical queries

### 2. betting_odds_markets (reference table)

Maps Betfair market IDs to our market types for each race edition.

| Column            | Type        | Description                              |
| ----------------- | ----------- | ---------------------------------------- |
| race_slug         | text        | Race identifier                          |
| year              | int         | Race year                                |
| market_type       | text        | Our canonical type                       |
| betfair_market_id | text        | Betfair's market ID (e.g. `1.231543034`) |
| discovered_at     | timestamptz | When we found this market                |

### 3. rider_name_mapping (lookup table)

Maps Betfair display names to our rider_id for fuzzy matching.

| Column       | Type    | Description                                  |
| ------------ | ------- | -------------------------------------------- |
| betfair_name | text    | Name as shown on Betfair (e.g. "T. Pogacar") |
| rider_id     | uuid    | FK → riders.id                               |
| confidence   | float   | Match confidence (1.0 = manual, 0.x = fuzzy) |
| verified     | boolean | Manually confirmed                           |

---

## Feature Integration

### New ML Features (added to feature extraction)

| Feature                 | Source                      | Description                                     |
| ----------------------- | --------------------------- | ----------------------------------------------- |
| `implied_gc_prob`       | betting_odds (gc_winner)    | Normalized probability of winning GC            |
| `implied_gc_top10_prob` | betting_odds (gc_top10)     | Normalized probability of top-10 GC             |
| `implied_sprint_prob`   | betting_odds (points_class) | Normalized probability of points classification |
| `odds_volume_gc`        | betting_odds                | Log-scaled matched volume (market confidence)   |

### How features enter the pipeline

```
app.py → extract_features_for_race()
       → _enrich_with_betting_odds(features_df, race_slug, year)
       → SELECT normalized_prob FROM betting_odds
          WHERE race_slug=X AND year=Y AND market_type=Z
       → LEFT JOIN on rider_id
       → fillna(0) for riders without odds / races without markets
```

### Which sub-models consume odds features

| Sub-model              | Feature                                | Rationale                           |
| ---------------------- | -------------------------------------- | ----------------------------------- |
| gc_gate                | implied_gc_prob, implied_gc_top10_prob | Direct signal for P(top-20)         |
| sprint_final heuristic | implied_sprint_prob                    | Market consensus on sprint strength |
| stage models           | (v2: implied_stage_prob)               | Not in v1                           |
| mountain models        | (v2: derived from gc_prob)             | Not in v1                           |

---

## Data Flow

```
                    ┌─────────────────┐
                    │  Betfair API     │
                    │  (event type 11) │
                    └────────┬────────┘
                             │ scrape 2-3 days pre-race
                             ▼
                    ┌─────────────────┐
                    │ scrape_odds.py  │
                    │ (new CLI script)│
                    └────────┬────────┘
                             │ normalize, fuzzy match rider names
                             ▼
                    ┌─────────────────┐
                    │  betting_odds   │
                    │  (PostgreSQL)   │
                    └────────┬────────┘
                             │ query at prediction time
                             ▼
                    ┌─────────────────┐
                    │ features_df     │
                    │ + implied_*_prob│
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ predict_sources │
                    │ (gc_gate, sprint│
                    │  heuristic)     │
                    └─────────────────┘
```

---

## Volume Estimates

| Race Type          | Races/Year | Riders/Race | Rows/Year                   |
| ------------------ | ---------- | ----------- | --------------------------- |
| Grand Tour         | 3          | ~170        | ~510 × 3 markets = ~1,530   |
| UWT Mini Tour (v2) | ~10        | ~120        | ~1,200 × 2 markets = ~2,400 |
| **Total v1**       | **3**      | **~170**    | **~1,530**                  |

Negligible storage. The entire feature adds <5KB/year to the database.
