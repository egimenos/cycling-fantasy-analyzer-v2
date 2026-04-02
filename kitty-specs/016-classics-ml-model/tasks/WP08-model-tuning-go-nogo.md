---
work_package_id: WP08
title: Model Tuning + GO/NO-GO Decision
lane: 'done'
dependencies: [WP05, WP06, WP07]
subtasks:
  - T039
  - T040
  - T041
  - T042
  - T043
phase: Phase 3 - Model Training & Evaluation
assignee: ''
agent: ''
shell_pid: ''
review_status: 'approved'
reviewed_by: 'egimenos'
history:
  - timestamp: '2026-04-02T16:48:30Z'
    lane: planned
    agent: system
    shell_pid: ''
    action: Prompt generated via /spec-kitty.tasks
requirement_refs:
  - FR-026
---

# Work Package Prompt: WP08 – Model Tuning + GO/NO-GO Decision

## IMPORTANT: Review Feedback Status

- **Has review feedback?**: Check the `review_status` field above.

---

## Review Feedback

_[Empty initially.]_

---

## Implementation Command

```bash
spec-kitty implement WP08 --base WP07
```

---

## Objectives & Success Criteria

- Optimize the best model with hyperparameter tuning
- Select the final feature set based on cumulative ablation results
- Run the definitive benchmark with all metrics and full per-race detail
- Analyze which classic types benefit most from ML
- Make the formal GO/NO-GO decision with documented evidence

**Success**: A comprehensive decision document with metrics comparison, per-type analysis, and a clear GO or NO-GO recommendation. If GO: ready for WP09 integration. If NO-GO: feature closes with valuable research findings.

## Context & Constraints

- **Spec**: SC-001 through SC-006 (success criteria)
- **Ablation results**: From WP05, WP06, WP07 logbooks
- **GO threshold**: Any statistically significant improvement over baseline rho (~0.31) across CV folds
- **Partial GO possible**: ML may work for some classic types but not others → valid outcome

## Subtasks & Detailed Guidance

### Subtask T039 – Hyperparameter grid search

**Purpose**: Find the best hyperparameters for the selected model type on the final feature set.

**Steps**:

1. Define broader search grid:
   ```python
   RF_GRID = {
       'n_estimators': [300, 500, 800],
       'max_depth': [8, 12, 16, None],
       'min_samples_leaf': [3, 5, 10, 20],
   }
   LGB_GRID = {
       'n_estimators': [128, 256, 512],
       'max_depth': [6, 8, 12],
       'learning_rate': [0.01, 0.02, 0.05],
       'num_leaves': [31, 63, 127],
       'subsample': [0.8, 0.9, 1.0],
   }
   ```
2. Use cross-validation within the training data (inner CV) for hyperparameter selection
3. Evaluate best config on the held-out test folds (outer CV) for final metrics
4. Log top 5 configurations with metrics

**Files**: `ml/src/benchmark_classics.py` or `ml/src/train_classics.py` (~60 lines)

**Notes**: Don't overfit hyperparameters to the small dataset. If many configs perform similarly, prefer simpler models (fewer estimators, more regularization).

---

### Subtask T040 – Final feature set selection

**Purpose**: Combine all ablation results into a single "best" feature set.

**Steps**:

1. Review all ablation logbooks from WP05, WP06, WP07
2. Create cumulative feature set:

   ```python
   # Start with Tier 1 (always included)
   final_features = list(TIER1_FEATURE_COLS)

   # Add Tier 2 features that showed positive marginal impact
   # (from WP05/WP06 ablation)
   if type_affinity_improved:
       final_features += TYPE_AFFINITY_COLS
   if pipeline_improved:
       final_features += PIPELINE_COLS
   # ... etc

   # Add Tier 3 features that showed positive marginal impact
   # (from WP07 ablation)
   for feat, verdict in tier3_results.items():
       if verdict == 'KEEP':
           final_features.append(feat)
   ```

3. Run one experiment with ALL selected features combined:
   ```bash
   python src/benchmark_classics.py --mode ml --features final --model lgbm --label classics_final_combined
   ```
4. Verify combined model ≥ best individual feature additions (no destructive interference)

**Files**: Feature set definitions in `benchmark_classics.py` (~20 lines)

---

### Subtask T041 – Final benchmark run

**Purpose**: The definitive run with best hyperparameters and best feature set.

**Steps**:

1. Run with best config:
   ```bash
   python src/benchmark_classics.py --mode ml --features final --model [best] --transform [best] --label classics_FINAL
   ```
2. Output full logbook with:
   - Per-fold aggregate metrics
   - Per-race breakdown (every classic, every fold)
   - Per-rider predictions for every race
   - Feature importance rankings
   - Bootstrap 95% CIs for all aggregate metrics
3. Compare against baseline:
   ```bash
   python src/benchmark_classics.py --compare classics_rules_baseline.json classics_FINAL.json
   ```

**Files**: `ml/logbook/classics_FINAL.json`

---

### Subtask T042 – Per-classic-type analysis

**Purpose**: Which types of classics benefit most from ML? Maybe Flemish classics are predictable but sprint classics are not.

**Steps**:

1. Group final benchmark races by classic type:

   ```python
   from classic_taxonomy import get_classic_types

   for race in final_results['races']:
       types = get_classic_types(race['race_slug'])
       for t in types:
           type_metrics[t].append(race['metrics'])

   # Compute per-type averages
   for ctype, metrics_list in type_metrics.items():
       avg_rho = np.mean([m['rho'] for m in metrics_list])
       # ... same for other metrics
       print(f"  {ctype}: rho={avg_rho:.4f} ({len(metrics_list)} races)")
   ```

2. Compare ML vs baseline per type:
   ```
   Per-Type ML vs Baseline
   ═══════════════════════
   Type         N races  Base rho  ML rho    Δrho    Verdict
   flemish      15       0.XXX     0.XXX     +0.XXX  GO
   ardennes     10       0.XXX     0.XXX     +0.XXX  GO
   cobbled      10       0.XXX     0.XXX     +0.XXX  GO
   sprint       8        0.XXX     0.XXX     -0.XXX  NO-GO
   italian      6        0.XXX     0.XXX     +0.XXX  GO
   ```
3. Identify partial deployment strategy if some types are GO and others not

**Files**: Analysis script or section in `benchmark_classics.py` (~40 lines)

---

### Subtask T043 – Document GO/NO-GO decision

**Purpose**: The formal decision document with all evidence.

**Steps**:

1. Create decision report in `kitty-specs/016-classics-ml-model/research/go_nogo_decision.md`:

   ```markdown
   # GO/NO-GO Decision: Classics ML Model

   **Date**: YYYY-MM-DD
   **Decision**: [GO / PARTIAL-GO / NO-GO]

   ## Metrics Comparison

   | Metric       | Baseline | ML (final) | Delta  | Significant? |
   | ------------ | -------- | ---------- | ------ | ------------ |
   | Spearman rho | 0.XXX    | 0.XXX      | +0.XXX | Yes/No       |
   | ...          | ...      | ...        | ...    | ...          |

   ## Per-Type Analysis

   [Table from T042]

   ## Feature Impact Summary

   [Which features helped, which didn't]

   ## Recommendation

   [Clear statement: deploy ML for which types, keep rules-based for which]

   ## Next Steps

   - If GO: Proceed to WP09 (production integration)
   - If NO-GO: Close feature, document learnings for future reference
   ```

2. If GO: save the final trained model to `ml/models/classics/`
3. If PARTIAL-GO: document which types use ML and which stay rules-based

**Files**: `kitty-specs/016-classics-ml-model/research/go_nogo_decision.md` (new)

**Validation**:

- [ ] Decision document includes all 6 metrics with deltas and significance
- [ ] Per-classic-type analysis is complete
- [ ] Feature ablation summary included
- [ ] Clear, actionable recommendation
- [ ] If GO: trained model saved to ml/models/classics/
- [ ] If GO: model metadata includes feature list, hyperparameters, benchmark results

---

## Risks & Mitigations

- **Risk**: Overall NO-GO but some types are GO. **Mitigation**: Partial deployment is a valid and valuable outcome.
- **Risk**: Improvement is statistically insignificant. **Mitigation**: Use bootstrap CI overlap test; be honest about results.
- **Risk**: Best model overfits to specific years/races. **Mitigation**: Check consistency across all 3 CV folds; flag if fold variance is high.

## Review Guidance

- Verify final feature set is the documented combination of ablation winners
- Check hyperparameter search didn't overfit (inner CV used properly)
- Confirm per-type analysis covers all classic types with sufficient race counts
- Verify decision document is honest and well-evidenced (no cherry-picking)
- If GO: verify saved model can be loaded and produces valid predictions

## Activity Log

- 2026-04-02T16:48:30Z – system – lane=planned – Prompt created.
- 2026-04-02T21:45:34Z – unknown – lane=done – GO decision. NDCG +8.4%, P@10 +3.2%, rho equivalent. LightGBM sqrt 51 features. Model saved. Proceed to WP09 integration.
