---
work_package_id: WP02
title: Python ML Core — Feature Extraction + Training
lane: 'done'
dependencies: [WP01]
base_branch: 006-ml-scoring-stage-races-WP01
base_commit: d63f593170b6f92614f7477b4c87f1086768c386
created_at: '2026-03-20T16:49:36.675277+00:00'
subtasks:
  - T008
  - T009
  - T010
  - T011
  - T012
  - T013
phase: Phase 1 - ML Pipeline
assignee: ''
agent: 'claude-opus'
shell_pid: '71937'
review_status: 'approved'
reviewed_by: 'egimenos'
history:
  - timestamp: '2026-03-20T16:27:36Z'
    lane: planned
    agent: system
    shell_pid: ''
    action: Prompt generated via /spec-kitty.tasks
requirement_refs:
  - FR-001
  - FR-002
  - FR-004
  - FR-011
---

# Work Package Prompt: WP02 – Python ML Core — Feature Extraction + Training

## ⚠️ IMPORTANT: Review Feedback Status

**Read this first if you are implementing this task!**

- **Has review feedback?**: Check the `review_status` field above.
- **Mark as acknowledged**: Update `review_status: acknowledged` when you begin addressing feedback.

---

## Review Feedback

_[Empty initially.]_

---

## Implementation Command

```bash
spec-kitty implement WP02 --base WP01
```

---

## Objectives & Success Criteria

- `ml/src/features.py` extracts exactly 36 features matching research_v3.py `FEATURE_COLS`
- `ml/src/train.py` trains Random Forest models per race type (mini_tour, grand_tour)
- `make retrain` runs end-to-end: load data → extract features → train → save models + version file
- Model files saved to `ml/models/model_mini_tour.joblib`, `model_grand_tour.joblib`
- `ml/models/model_version.txt` contains timestamp-based version identifier

## Context & Constraints

- **Source code reference**: `ml/src/research_v3.py` contains the validated 36-feature extraction logic. Refactor into clean modules — do NOT import from research_v3.py directly.
- **Feature parity is CRITICAL**: The 36 features must match `FEATURE_COLS` from research_v3.py exactly. Any mismatch will produce a model that doesn't match research rho values.
- **Training uses ALL data**: Unlike research (which used 2023-2024 train / 2025 test), production training uses all available data. No train/test split.
- **RF hyperparameters**: `n_estimators=500, max_depth=14, min_samples_leaf=5, random_state=42, n_jobs=-1`
- **DB connection**: `DATABASE_URL` env var, default `postgresql://cycling:cycling@localhost:5432/cycling_analyzer`

## Subtasks & Detailed Guidance

### Subtask T011 – Position-points helpers

- **Purpose**: Shared utility mapping (category, position, race_type) → points. Used by both feature extraction and potentially validation.
- **Steps**:
  1. Create `ml/src/points.py` (or include at top of features.py)
  2. Port the position-points tables from research_v3.py lines 24-51:
     - `STAGE_POINTS`, `GC_CLASSIC`, `GC_MINI_TOUR`, `GC_GRAND_TOUR`, `FINAL_CLASS_MINI`, `FINAL_CLASS_GT`
  3. Port `get_points(category, position, race_type)` function exactly as in research
  4. This function is called during feature extraction to compute `pts` column
- **Files**: `ml/src/points.py` (new, ~50 lines)
- **Parallel?**: Yes — can be done independently

### Subtask T012 – Data loading module

- **Purpose**: Reusable DB queries for loading results, startlists, and riders into pandas DataFrames.
- **Steps**:
  1. Create `ml/src/data.py`
  2. Implement `load_data(db_url: str) -> tuple[pd.DataFrame, pd.DataFrame]`:
     - Query `race_results` joined with `riders` (same SQL as research_v3.py `load_data()` lines 57-87)
     - Query `startlist_entries`
     - Pre-compute `pts` column using `get_points()`
     - Return `(results_df, startlists_df)`
  3. Implement `load_startlist_for_race(db_url, race_slug, year) -> pd.DataFrame`:
     - Query startlist entries for a specific race (used by predict.py in WP03)
  4. Implement `get_race_info(db_url, race_slug, year) -> dict`:
     - Return race_type, race_date for a specific race
- **Files**: `ml/src/data.py` (new, ~80 lines)
- **Parallel?**: Yes — can be done independently
- **Notes**: Use `psycopg2.connect(db_url)` and `pd.read_sql()` as in research

### Subtask T008 – Create features.py — 36-feature extraction

- **Purpose**: SINGLE SOURCE OF TRUTH for the 36-feature set. Refactored from research_v3.py `extract_all_features()`.
- **Steps**:
  1. Create `ml/src/features.py`
  2. Define `FEATURE_COLS` list — MUST match research_v3.py lines 317-334 exactly:
     ```python
     FEATURE_COLS = [
         # V2 features
         'pts_gc_12m', 'pts_stage_12m', 'pts_mountain_12m', 'pts_sprint_12m',
         'pts_total_12m', 'pts_total_6m', 'pts_total_3m',
         'pts_same_type_12m', 'race_count_12m', 'race_count_6m',
         'top10_rate', 'top5_rate', 'win_rate', 'podium_rate',
         'best_race_pts_12m', 'median_race_pts_12m',
         'days_since_last', 'same_race_best', 'same_race_mean', 'same_race_editions',
         'pts_total_alltime', 'race_type_enc', 'pts_trend_3m',
         'stage_pts_12m', 'gc_pts_same_type',
         # V3 NEW: Micro-form
         'pts_30d', 'pts_14d', 'race_count_30d',
         'last_race_pts', 'last_3_mean_pts', 'last_3_max_pts',
         # V3 NEW: Age
         'age', 'is_young', 'is_veteran', 'pts_per_career_year',
         # V3 NEW: Team leader
         'team_rank', 'is_leader', 'team_size', 'pct_of_team', 'team_total_pts',
     ]
     ```
  3. Implement `extract_features_for_race(results_df, startlists_df, race_slug, race_year, race_type, race_date) -> pd.DataFrame`:
     - Extract features for all riders on the startlist for ONE race
     - Return DataFrame with columns: FEATURE_COLS + ['rider_id', 'race_slug', 'race_year', 'race_type']
     - Logic directly from research_v3.py `extract_all_features()` lines 92-312, but for a SINGLE race instead of looping all races
  4. Implement `extract_all_training_features(results_df, startlists_df) -> pd.DataFrame`:
     - Loop over all races with startlists (same as research), compute features + actual_pts target
     - Used for training. Returns DataFrame with FEATURE_COLS + metadata + 'actual_pts'
  5. **CRITICAL**: Verify `len(FEATURE_COLS) == 36` and all names match research

- **Files**: `ml/src/features.py` (new, ~300 lines)
- **Notes**: The key refactoring is splitting research's all-race loop into: (a) per-race extraction for on-demand prediction, (b) all-race extraction for training. Both share the same per-rider feature computation.

### Subtask T009 – Create train.py — RF model training

- **Purpose**: Train Random Forest models per race type and save to disk.
- **Steps**:
  1. Create `ml/src/train.py`
  2. Implement `train_models(dataset: pd.DataFrame, output_dir: str) -> dict`:
     - Filter dataset for `mini_tour` and `grand_tour` separately
     - For each type, train `RandomForestRegressor(n_estimators=500, max_depth=14, min_samples_leaf=5, random_state=42, n_jobs=-1)`
     - X = features[FEATURE_COLS].fillna(0), y = features['actual_pts']
     - Save model via `joblib.dump(model, f"{output_dir}/model_{race_type}.joblib")`
     - Return dict with metrics (training samples per type, feature count)
  3. Do NOT train a model for classics (research showed NO-GO)
- **Files**: `ml/src/train.py` (new, ~60 lines)
- **Notes**: Using ALL available data for training (not just 2023-2024). The model will be slightly different from research but trained on more data.

### Subtask T010 – Create retrain.py — CLI entrypoint

- **Purpose**: Orchestrate the full training pipeline. This is what `make retrain` calls.
- **Steps**:
  1. Create `ml/src/retrain.py`
  2. Implement `main()`:

     ```python
     def main():
         db_url = os.environ.get('DATABASE_URL', 'postgresql://cycling:cycling@localhost:5432/cycling_analyzer')
         model_dir = os.path.join(os.path.dirname(__file__), '..', 'models')

         print("[1/4] Loading data...")
         results_df, startlists_df = load_data(db_url)

         print("[2/4] Extracting training features...")
         dataset = extract_all_training_features(results_df, startlists_df)

         print("[3/4] Training models...")
         metrics = train_models(dataset, model_dir)

         print("[4/4] Writing model version...")
         version = datetime.utcnow().strftime('%Y%m%dT%H%M%S')
         with open(os.path.join(model_dir, 'model_version.txt'), 'w') as f:
             f.write(version)

         print(f"Done. Model version: {version}")
         for key, val in metrics.items():
             print(f"  {key}: {val}")
     ```

  3. Add `if __name__ == '__main__': main()` guard
  4. Ensure `make retrain` calls: `cd ml && source venv/bin/activate && python -m src.retrain`

- **Files**: `ml/src/retrain.py` (new, ~50 lines)

### Subtask T013 – Verify make retrain end-to-end

- **Purpose**: Validate the complete training pipeline against the real database.
- **Steps**:
  1. Ensure database is up and seeded: `make db-up && make seed` (if not already)
  2. Run `make retrain`
  3. Verify output files exist:
     - `ml/models/model_mini_tour.joblib` (should be ~5-10 MB)
     - `ml/models/model_grand_tour.joblib` (should be ~5-10 MB)
     - `ml/models/model_version.txt` (contains timestamp string)
  4. Verify training used correct data: output should show number of training samples
  5. Verify feature count: should report 36 features
- **Files**: No new files — validation step
- **Notes**: If training fails on insufficient data, check that seed has run and startlists exist

## Risks & Mitigations

- **Feature parity**: Most critical risk. If FEATURE_COLS doesn't match research, model quality degrades. Mitigation: assert `len(FEATURE_COLS) == 36` in code, compare names programmatically.
- **Memory usage**: All data loaded into pandas at once. 210K rows × ~20 columns ≈ 50 MB. Trivial for modern machines.
- **Training time**: ~5-10 minutes on production VPS. Acceptable for weekly batch.

## Review Guidance

- **CRITICAL**: Compare `FEATURE_COLS` in features.py with research_v3.py line-by-line. Any mismatch is a show-stopper.
- Verify `extract_features_for_race()` computes the same features as the per-rider loop in research_v3.py
- Verify model hyperparameters match research: `n_estimators=500, max_depth=14, min_samples_leaf=5`
- Verify `make retrain` produces model files and version file

## Activity Log

- 2026-03-20T16:27:36Z – system – lane=planned – Prompt created.
- 2026-03-20T16:49:37Z – claude-opus – shell_pid=71937 – lane=doing – Assigned agent via workflow command
- 2026-03-20T16:55:41Z – claude-opus – shell_pid=71937 – lane=for_review – All 6 subtasks complete
- 2026-03-20T16:58:30Z – claude-opus – shell_pid=71937 – lane=done – Review passed: 40 features match research_v3.py exactly. RF params correct. Training pipeline complete.
