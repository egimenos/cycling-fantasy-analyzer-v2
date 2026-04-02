---
work_package_id: WP04
title: Core ML Model + A/B Benchmark
lane: 'done'
dependencies:
  - WP01
  - WP03
base_branch: 016-classics-ml-model-WP04-merge-base
base_commit: 9b3790219fd73a0affe1895a26750a36bcd39e7a
created_at: '2026-04-02T19:25:11.606014+00:00'
subtasks:
  - T017
  - T018
  - T019
  - T020
  - T021
phase: Phase 3 - Model Training & Evaluation
assignee: ''
agent: ''
shell_pid: '99586'
review_status: 'approved'
reviewed_by: 'egimenos'
history:
  - timestamp: '2026-04-02T16:48:30Z'
    lane: planned
    agent: system
    shell_pid: ''
    action: Prompt generated via /spec-kitty.tasks
requirement_refs:
  - FR-023
  - FR-024
  - FR-025
---

# Work Package Prompt: WP04 – Core ML Model + A/B Benchmark

## IMPORTANT: Review Feedback Status

- **Has review feedback?**: Check the `review_status` field above.

---

## Review Feedback

_[Empty initially.]_

---

## Implementation Command

```bash
spec-kitty implement WP04 --base WP03
```

---

## Objectives & Success Criteria

- Create `ml/src/train_classics.py` for training classic ML models
- Extend `benchmark_classics.py` to evaluate ML models (not just rules-based)
- Implement A/B comparison report with significance testing
- Run 6 initial experiments: RF × {raw, sqrt, log1p} + LightGBM × {raw, sqrt, log1p}
- Produce logbook entries for all experiments

**Success**: A comparison table showing all 6 metrics (rho, NDCG@10, P@5, P@10, capture, overlap) for baseline vs each ML variant, with deltas and significance flags.

## Context & Constraints

- **Plan**: AD-2 (single regression model, not 4-source), AD-5 (benchmark-first)
- **Research**: R7 (model architecture — single regression predicting GC_CLASSIC points)
- **Baseline**: WP01 logbook entry (`ml/logbook/classics_rules_baseline.json`)
- **Features**: WP03 cached parquets (`ml/cache/classics_features_YYYY.parquet`)
- **Existing patterns**: `ml/src/benchmark_canonical.py` model training loop, `ml/src/logbook.py`

## Subtasks & Detailed Guidance

### Subtask T017 – Create train_classics.py

**Purpose**: Training script that loads cached features, trains a model, and saves model artifacts.

**Steps**:

1. Create `ml/src/train_classics.py`
2. Implement model training:

   ```python
   RF_PARAMS = {
       'n_estimators': 500, 'max_depth': 14, 'min_samples_leaf': 5,
       'random_state': 42, 'n_jobs': -1,
   }
   LGB_PARAMS = {
       'n_estimators': 256, 'max_depth': 8, 'learning_rate': 0.02,
       'num_leaves': 71, 'subsample': 0.957, 'colsample_bytree': 0.535,
       'random_state': 42, 'verbose': -1,
   }

   TRANSFORMS = {
       'raw': (lambda y: y, lambda y: y),
       'sqrt': (lambda y: np.sqrt(np.maximum(y, 0)), lambda y: np.square(y)),
       'log1p': (lambda y: np.log1p(y), lambda y: np.expm1(y)),
   }

   def train_classic_model(
       train_df: pd.DataFrame,
       feature_cols: list[str],
       model_type: str = 'rf',
       transform: str = 'raw',
   ) -> tuple[Any, dict]:
       """Train a classic prediction model. Returns (model, metadata)."""
       params = RF_PARAMS if model_type == 'rf' else LGB_PARAMS
       train_fn, inverse_fn = TRANSFORMS[transform]

       X = train_df[feature_cols].fillna(0).values if model_type == 'rf' \
           else train_df[feature_cols].values
       y = train_fn(train_df['actual_pts'].values)

       model = make_model(model_type, params)
       model.fit(X, y)

       metadata = {
           'model_type': model_type,
           'params': params,
           'transform': transform,
           'feature_cols': feature_cols,
           'n_train': len(train_df),
       }
       return model, metadata
   ```

3. Add model saving/loading:
   ```python
   def save_model(model, metadata, path='ml/models/classics/'):
       os.makedirs(path, exist_ok=True)
       joblib.dump(model, f'{path}/model.joblib')
       with open(f'{path}/metadata.json', 'w') as f:
           json.dump(metadata, f, indent=2)
   ```
4. Add CLI for standalone training (optional, mainly used via benchmark)

**Files**: `ml/src/train_classics.py` (new, ~100 lines)

---

### Subtask T018 – Add ML evaluation mode to benchmark_classics.py

**Purpose**: Extend the benchmark to train and evaluate ML models within each CV fold.

**Steps**:

1. Add to `benchmark_classics.py`:

   ```python
   def evaluate_ml_fold(fold_num, train_df, test_df, feature_cols, model_type, transform):
       """Train model on train_df, predict on test_df, compute per-race metrics."""
       model, meta = train_classic_model(train_df, feature_cols, model_type, transform)

       train_fn, inverse_fn = TRANSFORMS[transform]
       X_test = test_df[feature_cols].fillna(0).values if model_type == 'rf' \
                else test_df[feature_cols].values
       raw_preds = model.predict(X_test)
       preds = inverse_fn(raw_preds)
       preds = np.maximum(preds, 0)  # Clamp negative predictions

       test_df = test_df.copy()
       test_df['predicted'] = preds

       # Per-race metrics
       race_results = []
       for (slug, year), group in test_df.groupby(['race_slug', 'year']):
           if len(group) < 3:
               continue
           metrics = compute_race_metrics(
               group['predicted'].values,
               group['actual_pts'].values,
           )
           if np.isnan(metrics['rho']):
               continue
           race_results.append({
               'race_slug': slug, 'year': year,
               'n_riders': len(group),
               'metrics': metrics,
           })
       return race_results, model, meta
   ```

2. Integrate into `run_benchmark()` with `--mode ml` flag
3. Load cached features from `ml/cache/classics_features_YYYY.parquet`

**Files**: `ml/src/benchmark_classics.py` (modify, ~80 lines added)

---

### Subtask T019 – Implement A/B comparison report

**Purpose**: Compare ML model metrics against the rules-based baseline with significance testing.

**Steps**:

1. Create comparison function:

   ```python
   def compare_experiments(baseline_path: str, candidate_path: str):
       """Load two logbook entries and print comparison table."""
       baseline = load_logbook_entry(baseline_path)
       candidate = load_logbook_entry(candidate_path)

       print(f"\nA/B Comparison: {baseline_path} vs {candidate_path}")
       print("=" * 70)

       metrics = ['rho_mean', 'ndcg10_mean', 'p5_mean', 'p10_mean',
                   'team_capture_mean', 'team_overlap_mean']
       labels = ['Spearman rho', 'NDCG@10', 'P@5', 'P@10',
                  'Capture @15', 'Overlap @15']

       for metric, label in zip(metrics, labels):
           b_val = baseline['aggregate']['classic'][metric]
           c_val = candidate['aggregate']['classic'][metric]
           delta = c_val - b_val if (b_val and c_val) else None

           # Significance: check if CIs don't overlap
           b_ci = baseline['aggregate']['classic'].get(f'{metric.replace("_mean","")}_ci', [None,None])
           c_ci = candidate['aggregate']['classic'].get(f'{metric.replace("_mean","")}_ci', [None,None])
           sig = '***' if (b_ci[1] and c_ci[0] and c_ci[0] > b_ci[1]) else ''

           print(f"  {label:<15} Base={b_val:.4f}  ML={c_val:.4f}  "
                 f"Δ={delta:+.4f}  {sig}")
   ```

2. Add `--compare` CLI flag to benchmark_classics.py
3. Also generate feature importance output (top 10 features by RF/LightGBM importance)

**Files**: `ml/src/benchmark_classics.py` (~50 lines)

---

### Subtask T020 – Run initial experiments

**Purpose**: Execute the 6 baseline ML experiments (2 models × 3 transforms) and log results.

**Steps**:

1. Run experiments sequentially:
   ```bash
   python src/benchmark_classics.py --mode ml --model rf --transform raw --label classics_rf_raw
   python src/benchmark_classics.py --mode ml --model rf --transform sqrt --label classics_rf_sqrt
   python src/benchmark_classics.py --mode ml --model rf --transform log1p --label classics_rf_log1p
   python src/benchmark_classics.py --mode ml --model lgbm --transform raw --label classics_lgbm_raw
   python src/benchmark_classics.py --mode ml --model lgbm --transform sqrt --label classics_lgbm_sqrt
   python src/benchmark_classics.py --mode ml --model lgbm --transform log1p --label classics_lgbm_log1p
   ```
2. Run comparisons:
   ```bash
   python src/benchmark_classics.py --compare classics_rules_baseline.json classics_rf_raw.json
   # ... repeat for each variant
   ```
3. Document which variant performs best

**Files**: Results in `ml/logbook/classics_*.json`

---

### Subtask T021 – Document results in logbook

**Purpose**: Create a summary document of all initial experiment results.

**Steps**:

1. After running all 6 experiments, create summary table:
   ```
   | Variant         | rho    | NDCG@10 | P@5   | P@10  | Capture | Overlap |
   |-----------------|--------|---------|-------|-------|---------|---------|
   | Rules baseline  | 0.XXX  | 0.XXX   | 0.XXX | 0.XXX | 0.XXX   | 0.XXX   |
   | RF raw          | 0.XXX  | 0.XXX   | 0.XXX | 0.XXX | 0.XXX   | 0.XXX   |
   | RF sqrt         | 0.XXX  | 0.XXX   | 0.XXX | 0.XXX | 0.XXX   | 0.XXX   |
   | ...             | ...    | ...     | ...   | ...   | ...     | ...     |
   ```
2. Identify best variant and compute delta vs baseline
3. Note: even if no variant beats baseline, this is valuable — it sets the stage for domain features

**Files**: Console output + logbook JSONs

**Validation**:

- [ ] All 6 ML experiments produce valid logbook entries
- [ ] Each logbook has per-race breakdown across 3 folds
- [ ] Comparison report shows delta for all 6 metrics
- [ ] Feature importance is logged for each model
- [ ] Best variant is identified with significance assessment

---

## Risks & Mitigations

- **Risk**: Tier 1 features alone may not beat baseline. **Mitigation**: Expected — Tier 1 is the foundation; Tier 2/3 features (WP05-WP07) are where domain insights kick in.
- **Risk**: LightGBM with NaN handling may perform differently than RF with fillna(0). **Mitigation**: Test both; document which handles sparsity better.
- **Risk**: Overfitting on small dataset. **Mitigation**: CV folds prevent this; check per-fold consistency.

## Review Guidance

- Verify train/test split is time-based (no future data leakage)
- Check that inverse transform is applied correctly (predictions should be in 0-200 scale)
- Confirm negative predictions are clamped to 0
- Verify logbook JSON matches expected schema
- Check that comparison uses the same race set for baseline and ML

## Activity Log

- 2026-04-02T16:48:30Z – system – lane=planned – Prompt created.
- 2026-04-02T19:34:19Z – unknown – shell_pid=99586 – lane=done – ML benchmark complete. 6 experiments run. NDCG improves +10% but rho flat. Domain features (WP05-06) needed for rho lift. LightGBM sqrt best rho (0.3050).
