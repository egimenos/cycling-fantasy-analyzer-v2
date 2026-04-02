---
work_package_id: WP03
title: Core Feature Extraction — Tier 1
lane: planned
dependencies: [WP02]
subtasks:
  - T011
  - T012
  - T013
  - T014
  - T015
  - T016
phase: Phase 2 - Feature Engineering
assignee: ''
agent: ''
shell_pid: ''
review_status: ''
reviewed_by: ''
history:
  - timestamp: '2026-04-02T16:48:30Z'
    lane: planned
    agent: system
    shell_pid: ''
    action: Prompt generated via /spec-kitty.tasks
requirement_refs:
  - FR-007
  - FR-010
  - FR-011
---

# Work Package Prompt: WP03 – Core Feature Extraction — Tier 1

## IMPORTANT: Review Feedback Status

- **Has review feedback?**: Check the `review_status` field above.

---

## Review Feedback

_[Empty initially.]_

---

## Implementation Command

```bash
spec-kitty implement WP03 --base WP02
```

---

## Objectives & Success Criteria

- Create `ml/src/features_classics.py` with Tier 1 feature extraction for classic races
- Tier 1 features: same-race history (best, mean, count), classic points (12m/6m/3m), classic rates (top10, win), general features (age, micro-form, team)
- Create `ml/src/cache_features_classics.py` for parquet caching per year
- Features extractable for both training (batch) and prediction (single race)

**Success**: Cached parquet files for 2019-2025 with ~15-20 feature columns per rider-race row. Spot-checking a known rider (e.g., Van der Poel for Ronde) shows high same_race values and classic_top10_rate.

## Context & Constraints

- **Data model**: `kitty-specs/016-classics-ml-model/data-model.md` — Classic Feature Vector (Tier 1)
- **Research**: R5 (feature strategy, Tier 1 table)
- **Existing pattern**: `ml/src/features.py` — follow same data flow pattern (SQL → pandas → per-rider computation)
- **Data source**: `race_results` table filtered to `race_type='classic'`, `category='gc'`
- **Points**: `GC_CLASSIC = {1:200, 2:125, 3:100, 4:80, 5:60, 6:50, 7:45, 8:40, 9:35, 10:30}`
- **DECOUPLED**: New files only, do not modify existing `features.py`

## Subtasks & Detailed Guidance

### Subtask T011 – Create features_classics.py skeleton and data loading

**Purpose**: Set up the feature extraction file with data loading and the main computation function signature.

**Steps**:

1. Create `ml/src/features_classics.py`
2. Import data loading from `ml/src/data.py` (reuse connection pattern)
3. Import `GC_CLASSIC` from `points.py`
4. Import `classic_taxonomy` helpers (get_classic_types, resolve_slug)
5. Define the main function signature:
   ```python
   def compute_classic_features(
       rider_id: str,
       race_slug: str,
       race_date: date,
       rider_history: pd.DataFrame,  # All historical results before race_date
       all_classic_results: pd.DataFrame,  # All classic results (for same-race lookup)
       team_info: dict | None = None,
   ) -> dict:
       """Compute Tier 1 features for a rider in a classic race."""
       feats = {}
       race_slug = resolve_slug(race_slug)
       # ... feature computation calls ...
       return feats
   ```
6. Define `TIER1_FEATURE_COLS` list for schema validation
7. Add data loading function:
   ```python
   def load_classic_history(conn) -> pd.DataFrame:
       """Load all classic race results with computed points."""
       # Similar to T003 query but for feature extraction
   ```

**Files**: `ml/src/features_classics.py` (new, ~60 lines for skeleton)

---

### Subtask T012 – Implement same-race history features

**Purpose**: Capture a rider's track record in this specific classic. This is the #1 hypothesis for why classics are different — past performance in the SAME race is highly predictive.

**Steps**:

1. Add to `compute_classic_features()`:

   ```python
   # Same-race history: how has this rider done in this specific classic before?
   same_race = all_classic_results[
       (all_classic_results['rider_id'] == rider_id) &
       (all_classic_results['race_slug'] == race_slug) &
       (all_classic_results['race_date'] < race_date)
   ]

   if len(same_race) > 0:
       sr_pts = same_race.groupby('year')['pts'].sum()
       feats['same_race_best'] = float(sr_pts.max())
       feats['same_race_mean'] = float(sr_pts.mean())
       feats['same_race_count'] = len(sr_pts)
       feats['has_same_race'] = 1

       # Best position ever in this classic
       feats['same_race_best_pos'] = int(same_race['position'].min())

       # Most recent edition result
       most_recent = same_race.sort_values('race_date').iloc[-1]
       feats['same_race_last_pts'] = float(GC_CLASSIC.get(most_recent['position'], 0))
       feats['same_race_last_pos'] = int(most_recent['position'])
   else:
       feats['same_race_best'] = 0.0
       feats['same_race_mean'] = 0.0
       feats['same_race_count'] = 0
       feats['has_same_race'] = 0
       feats['same_race_best_pos'] = np.nan
       feats['same_race_last_pts'] = 0.0
       feats['same_race_last_pos'] = np.nan
   ```

**Files**: `ml/src/features_classics.py` (~35 lines)
**Parallel?**: Yes — independent feature group.

**Notes**: `same_race_best_pos` and `same_race_last_pos` use raw position (lower = better). The model can learn that position 1 → 200 pts, position 50 → 0 pts.

---

### Subtask T013 – Implement classic points aggregation features

**Purpose**: Capture overall classic racing form across time windows — total points, rates, and success metrics specific to classics.

**Steps**:

1. Filter rider's history to classics only:
   ```python
   classic_hist = rider_history[rider_history['race_type'] == 'classic']
   ```
2. Compute time-windowed features:
   ```python
   for window_name, days in [('12m', 365), ('6m', 180), ('3m', 90)]:
       window_df = classic_hist[classic_hist['race_date'] >= race_date - timedelta(days=days)]
       feats[f'pts_classic_{window_name}'] = float(window_df['pts'].sum())
   ```
3. Compute rate features over 24 months:
   ```python
   classic_24m = classic_hist[classic_hist['race_date'] >= race_date - timedelta(days=730)]
   n_classic_starts = len(classic_24m.groupby(['race_slug', 'year']))
   if n_classic_starts > 0:
       top10_finishes = classic_24m[classic_24m['position'] <= 10]
       n_top10 = len(top10_finishes.groupby(['race_slug', 'year']))
       feats['classic_top10_rate'] = n_top10 / n_classic_starts

       wins = classic_24m[classic_24m['position'] == 1]
       n_wins = len(wins.groupby(['race_slug', 'year']))
       feats['classic_win_rate'] = n_wins / n_classic_starts
   else:
       feats['classic_top10_rate'] = 0.0
       feats['classic_win_rate'] = 0.0
   ```

**Files**: `ml/src/features_classics.py` (~40 lines)
**Parallel?**: Yes — independent feature group.

**Notes**: Use 24-month window for rates (more stable with sparse data). Use 12m/6m/3m for raw points (captures recency).

---

### Subtask T014 – Implement reused general features

**Purpose**: Include general racing features that transfer across race types — age, micro-form, team info, prestige.

**Steps**:

1. Age:
   ```python
   if rider_history.iloc[0].get('birth_date'):
       feats['age'] = (race_date - rider_history.iloc[0]['birth_date']).days / 365.25
   else:
       feats['age'] = np.nan
   ```
2. General micro-form (ALL races, not just classics):
   ```python
   all_hist = rider_history  # All race types
   d30 = all_hist[all_hist['race_date'] >= race_date - timedelta(days=30)]
   d14 = all_hist[all_hist['race_date'] >= race_date - timedelta(days=14)]
   feats['pts_30d'] = float(d30['pts'].sum()) if len(d30) > 0 else 0.0
   feats['pts_14d'] = float(d14['pts'].sum()) if len(d14) > 0 else 0.0
   feats['days_since_last'] = (race_date - all_hist['race_date'].max()).days if len(all_hist) > 0 else np.nan
   ```
3. Team features (if team_info provided):
   ```python
   feats['team_rank'] = team_info.get('team_rank', np.nan) if team_info else np.nan
   feats['is_leader'] = team_info.get('is_leader', 0) if team_info else 0
   ```
4. Prestige (UWT points in 12m):
   ```python
   uwt_12m = rider_history[
       (rider_history['race_date'] >= race_date - timedelta(days=365)) &
       (rider_history['race_class'] == 'UWT')
   ]
   feats['prestige_pts_12m'] = float(uwt_12m['pts'].sum()) if len(uwt_12m) > 0 else 0.0
   ```

**Files**: `ml/src/features_classics.py` (~40 lines)
**Parallel?**: Yes — independent feature group.

**Notes**: General features use ALL race history (not just classics) to capture overall rider quality. A Grand Tour winner racing a classic still has high prestige.

---

### Subtask T015 – Create cache_features_classics.py

**Purpose**: Cache computed features to parquet files for fast benchmark iteration.

**Steps**:

1. Create `ml/src/cache_features_classics.py`
2. Follow same pattern as existing `ml/src/cache_features.py`:
   ```python
   def cache_classic_features(year: int, conn) -> str:
       """Extract and cache features for all classic races in a given year."""
       # Load all classic race results for this year
       # For each (rider, race) pair: compute features
       # Build DataFrame with identity + features + target
       # Save to ml/cache/classics_features_{year}.parquet

   def load_cached_classics(year: int) -> pd.DataFrame:
       """Load cached classic features for a year."""
       path = f'ml/cache/classics_features_{year}.parquet'
       return pd.read_parquet(path)

   def cache_all_years(conn):
       """Cache features for all available years."""
       for year in range(2019, 2026):
           cache_classic_features(year, conn)
   ```
3. Feature DataFrame schema:
   - Identity: `rider_id, race_slug, year, race_date, rider_name`
   - Tier 1 features: all columns from `TIER1_FEATURE_COLS`
   - Target: `actual_pts` (GC_CLASSIC points based on actual position)
4. Add schema hash for cache validation (detect when features change)

**Files**: `ml/src/cache_features_classics.py` (new, ~80 lines)

---

### Subtask T016 – Create batch training extraction function

**Purpose**: Provide a single entry point for extracting features across all riders and races for training.

**Steps**:

1. Add to `features_classics.py`:
   ```python
   def extract_all_classic_features(conn, year: int) -> pd.DataFrame:
       """Extract features for all riders in all classic races in a given year."""
       # Load all results up to this year
       all_results = load_all_results(conn)

       # Get classic races for this year
       year_classics = all_results[
           (all_results['year'] == year) &
           (all_results['race_type'] == 'classic') &
           (all_results['category'] == 'gc')
       ]

       rows = []
       for (race_slug, race_date), race_group in year_classics.groupby(['race_slug', 'race_date']):
           # Get historical results BEFORE this race date
           hist = all_results[all_results['race_date'] < race_date]
           classic_results = hist[
               (hist['race_type'] == 'classic') & (hist['category'] == 'gc')
           ]

           for _, rider in race_group.iterrows():
               rider_hist = hist[hist['rider_id'] == rider['rider_id']]
               feats = compute_classic_features(
                   rider_id=rider['rider_id'],
                   race_slug=race_slug,
                   race_date=race_date,
                   rider_history=rider_hist,
                   all_classic_results=classic_results,
               )
               feats['rider_id'] = rider['rider_id']
               feats['race_slug'] = race_slug
               feats['year'] = year
               feats['actual_pts'] = GC_CLASSIC.get(rider['position'], 0.0)
               feats['rider_name'] = rider.get('full_name', '')
               rows.append(feats)

       return pd.DataFrame(rows)
   ```
2. Add progress logging (race-by-race, total riders processed)
3. Handle edge cases: races with 0 riders after filtering, riders with no history at all

**Files**: `ml/src/features_classics.py` (~50 lines)

**Validation**:

- [ ] `cache_all_years()` produces parquet files for each year in `ml/cache/`
- [ ] Each parquet has expected columns (TIER1_FEATURE_COLS + identity + target)
- [ ] Spot-check Van der Poel for Ronde: high same_race values, high classic_top10_rate
- [ ] Spot-check a pure GC rider (e.g., Vingegaard) for Ronde: low/zero classic history features
- [ ] No NaN in same_race features for riders with has_same_race=1

---

## Risks & Mitigations

- **Risk**: Feature extraction is slow for large datasets. **Mitigation**: Vectorize where possible, cache per-year, log progress.
- **Risk**: Data leakage — using results from future races. **Mitigation**: Strict `race_date < race_date` filter on all historical queries.
- **Risk**: Points computation differs from actual game scoring. **Mitigation**: Use exact `GC_CLASSIC` table from `points.py`.

## Review Guidance

- Verify data leakage prevention: no future data in feature computation
- Check that classic-specific features only count classic results (not stage race GC)
- Confirm general features (pts_30d, etc.) use ALL race types (broader signal)
- Verify parquet schema matches TIER1_FEATURE_COLS
- Spot-check feature values for 2-3 known riders

## Activity Log

- 2026-04-02T16:48:30Z – system – lane=planned – Prompt created.
