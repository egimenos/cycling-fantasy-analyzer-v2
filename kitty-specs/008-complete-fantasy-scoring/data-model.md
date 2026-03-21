# 008 — Complete Fantasy Scoring: Data Model

## Existing Entities

### race_results

Current categories: `stage`, `gc`, `mountain`, `sprint` — all final classifications.

- `rider_id` (UUID, FK → riders)
- `race_slug`, `race_name`, `race_type`, `race_class`
- `year`, `category`, `position`, `stage_number`
- `dnf` (boolean)
- `race_date`, `parcours_type`, `is_itt`, `is_ttt`, `profile_score`

### riders, startlist_entries, ml_scores

No changes needed for A0.

---

## Extended race_results Categories

The `category` field gains new values:

| New category value    | Description                           | PCS source           |
| --------------------- | ------------------------------------- | -------------------- |
| `gc_daily`            | GC standing after each stage (top 10) | Tab 1 hidden         |
| `mountain_pass`       | Individual mountain pass result       | Tab 3 headings       |
| `sprint_intermediate` | Intermediate sprint result            | Tab 2 headings       |
| `regularidad_daily`   | Daily points classification (top 3)   | Tab 2 "Today" column |

### New columns on race_results

| Field            | Type    | Description                                | Nullable |
| ---------------- | ------- | ------------------------------------------ | -------- |
| `climb_category` | varchar | For `mountain_pass`: HC, 1, 2, 3, 4        | Yes      |
| `climb_name`     | varchar | Pass name, e.g. "Col de Peyresourde"       | Yes      |
| `sprint_name`    | varchar | Sprint location, e.g. "Marignac"           | Yes      |
| `km_marker`      | float   | Distance in stage where pass/sprint occurs | Yes      |

**Alternative**: Separate `stage_classification_results` table. Decision deferred to planning.

---

## New Scoring Tables (points.py)

```python
GC_DAILY = {
    1: 15, 2: 10, 3: 8, 4: 7, 5: 6,
    6: 5, 7: 4, 8: 3, 9: 2, 10: 1,
}

MOUNTAIN_PASS_HC   = {1: 12, 2: 8, 3: 6, 4: 5, 5: 4, 6: 3, 7: 2, 8: 1}
MOUNTAIN_PASS_CAT1 = {1: 8, 2: 6, 3: 4, 4: 2, 5: 1}
MOUNTAIN_PASS_CAT2 = {1: 5, 2: 3, 3: 1}
MOUNTAIN_PASS_CAT3 = {1: 3, 2: 2}
MOUNTAIN_PASS_CAT4 = {1: 1}

SPRINT_INTERMEDIATE_SINGLE = {1: 6, 2: 4, 3: 2}
SPRINT_INTERMEDIATE_MULTI  = {1: 3, 2: 2, 3: 1}

REGULARIDAD_DAILY = {1: 6, 2: 4, 3: 2}

TTT_POINTS = {
    1: 20, 2: 15, 3: 11, 4: 9, 5: 7,
    6: 5, 7: 4, 8: 3, 9: 2, 10: 1,
}
```

---

## PCS Stage Page Structure

Each `/race/{slug}/{year}/stage-{N}` contains multiple `div.resTab`:

```
Tab 0 [visible] — Stage result
  → category: stage (already captured)

Tab 1 [hidden] — GC after stage
  → category: gc_daily, top 10 only

Tab 2 [hidden] — Points/Regularidad + intermediate sprints
  → Subtabs: headings like "Sprint | Marignac (37 km)"
  → category: sprint_intermediate (per heading)
  → category: regularidad_daily (top 3 from "Today" column)

Tab 3 [hidden] — KOM + individual mountain passes
  → Subtabs: headings like "KOM Sprint (HC) Plateau de Beille (197.7 km)"
  → Parse: category (HC/1/2/3/4), name, km from heading
  → category: mountain_pass (per pass)

Tab 4/5 [hidden] — Youth / Teams (skip)
```

---

## Data Flow

```
PCS stage page (1 request per stage — no extra HTTP calls)
    │
    ├── Tab 0 → race_results (category='stage')              [EXISTS]
    ├── Tab 1 → race_results (category='gc_daily')            [NEW]
    ├── Tab 2 → race_results (category='sprint_intermediate') [NEW]
    │         → race_results (category='regularidad_daily')   [NEW]
    ├── Tab 3 → race_results (category='mountain_pass')       [NEW]
    │
    ▼
points.py: get_points() extended with new tables
    │
    ▼
features.py: actual_pts includes ALL game scoring
    │
    ▼
train.py + retrain.py: ML on correct target
```

## Backfill Estimate

| Races                      | Avg stages | Pages | New rows | Scrape time |
| -------------------------- | ---------- | ----- | -------- | ----------- |
| 42 stage races (2022–2026) | ~12        | ~462  | ~35K     | ~12 min     |

---

## Future: ML Research Entities (A1–A6, deferred)

### ml_experiments (research-only, CSV or SQLite)

| Field         | Type     | Description              |
| ------------- | -------- | ------------------------ |
| experiment_id | string   | e.g. "A1_lgbm_trial_042" |
| axis          | string   | A1–A6                    |
| model_type    | string   | rf, lgbm, xgb, ensemble  |
| hyperparams   | JSON     | Full parameter dict      |
| race_type     | string   | mini_tour, grand_tour    |
| spearman_rho  | float    | Per-fold ρ               |
| timestamp     | datetime | When experiment ran      |
