---
work_package_id: WP06
title: Domain Features — Pipeline & Consistency
lane: planned
dependencies:
  - WP02
subtasks:
  - T028
  - T029
  - T030
  - T031
  - T032
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
  - FR-009
  - FR-011
---

# Work Package Prompt: WP06 – Domain Features — Pipeline & Consistency

## IMPORTANT: Review Feedback Status

- **Has review feedback?**: Check the `review_status` field above.

---

## Review Feedback

_[Empty initially.]_

---

## Implementation Command

```bash
spec-kitty implement WP06 --base WP04
```

---

## Objectives & Success Criteria

- Add Tier 2 pipeline features: feeder points, campaign trend
- Add same-race consistency feature
- Ablation test each feature independently
- Document which pipeline/consistency features provide positive marginal impact

**Success**: Pipeline features capture seasonal form progression (rider improving through Flemish campaign → higher predicted score for Ronde). Ablation shows at least one feature improves metrics.

## Context & Constraints

- **Research**: R5 (Tier 2 — pipeline features)
- **Taxonomy**: `PIPELINE_GROUPS` from `classic_taxonomy.py` (WP02)
- **Key domain insight**: Riders build form through "feeder" classics toward target monuments (e.g., Omloop → E3 → Ronde)
- **Pipeline**: WP05 and WP06 can run in parallel (independent Tier 2 feature groups)

## Subtasks & Detailed Guidance

### Subtask T028 – Implement pipeline_feeder_pts

**Purpose**: How well did the rider perform in feeder classics earlier in the current campaign? A rider who won E3 and placed 3rd at Gent-Wevelgem is building momentum toward Ronde.

**Steps**:

1. Add to `features_classics.py`:
   ```python
   def _compute_pipeline_features(rider_id, race_slug, race_date, classic_results):
       """Compute pipeline features: feeder points and form trend."""
       feats = {}
       slug = resolve_slug(race_slug)
       feeders = get_feeders_for_race(slug)

       if not feeders:
           feats['pipeline_feeder_pts'] = np.nan
           feats['pipeline_trend'] = np.nan
           return feats

       # Get rider's results in feeder races in the SAME SEASON
       year = race_date.year
       feeder_results = classic_results[
           (classic_results['rider_id'] == rider_id) &
           (classic_results['race_slug'].isin(feeders)) &
           (classic_results['year'] == year) &
           (classic_results['race_date'] < race_date)
       ]

       if len(feeder_results) == 0:
           feats['pipeline_feeder_pts'] = 0.0
           feats['pipeline_trend'] = np.nan
           return feats

       feats['pipeline_feeder_pts'] = float(feeder_results['pts'].sum())
       # ... trend computed in T029
       return feats
   ```

**Files**: `ml/src/features_classics.py` (~30 lines)
**Parallel?**: Yes.

**Notes**: Only count feeder results from the SAME season (year) and BEFORE the target race date. A great result in last year's Gent-Wevelgem is captured by same_race_history, not pipeline.

---

### Subtask T029 – Implement pipeline_trend

**Purpose**: Is the rider's form improving or declining through the campaign? A positive slope means building toward peak.

**Steps**:

1. Add trend computation to pipeline features:
   ```python
   # Continuation from T028's _compute_pipeline_features:
   if len(feeder_results) >= 3:
       # Sort by race_date, compute linear regression slope of points
       sorted_results = feeder_results.sort_values('race_date')
       y_vals = sorted_results['pts'].values
       x_vals = np.arange(len(y_vals))

       # Simple linear regression slope
       if np.std(y_vals) > 0:
           slope = np.polyfit(x_vals, y_vals, 1)[0]
           feats['pipeline_trend'] = float(slope)
       else:
           feats['pipeline_trend'] = 0.0
   elif len(feeder_results) == 2:
       # Two points: simple difference
       sorted_results = feeder_results.sort_values('race_date')
       feats['pipeline_trend'] = float(
           sorted_results['pts'].iloc[-1] - sorted_results['pts'].iloc[0]
       )
   else:
       feats['pipeline_trend'] = np.nan  # Single feeder result, no trend
   ```

**Files**: `ml/src/features_classics.py` (~20 lines, within same function as T028)
**Parallel?**: Yes (same function as T028).

**Notes**: Require ≥2 feeder results for trend. With 2 results, use simple difference. With 3+, use slope. Positive slope = building form (good signal).

---

### Subtask T030 – Implement same_race_consistency

**Purpose**: How consistent is the rider in this specific classic? Low variance = predictable performer. High variance = unpredictable.

**Steps**:

1. Add to `features_classics.py`:
   ```python
   def _compute_same_race_consistency(rider_id, race_slug, race_date, classic_results):
       """Std dev of positions across editions of the same classic."""
       slug = resolve_slug(race_slug)
       same_race = classic_results[
           (classic_results['rider_id'] == rider_id) &
           (classic_results['race_slug'] == slug) &
           (classic_results['race_date'] < race_date)
       ]

       if len(same_race) >= 2:
           positions = same_race.groupby('year')['position'].min().values
           return float(np.std(positions))
       return np.nan
   ```
2. Lower std = more consistent = more predictable → model can learn this relationship

**Files**: `ml/src/features_classics.py` (~15 lines)
**Parallel?**: Yes.

**Notes**: Use min position per year (best result in that edition). A rider with positions [3, 5, 2, 4] has low std (~1.3) — very consistent. One with [1, 50, 3, 80] has high std (~38) — erratic.

---

### Subtask T031 – Update cache for Tier 2 features

**Purpose**: Rebuild the feature cache to include all Tier 2 features alongside Tier 1.

**Steps**:

1. Update `cache_features_classics.py`:
   - Add Tier 2 feature columns to the schema
   - Update `compute_classic_features()` to call `_compute_type_affinity()`, `_compute_pipeline_features()`, `_compute_same_race_consistency()`, etc.
   - Rebuild cache: `python src/cache_features_classics.py --rebuild`
2. Validate: new parquets have Tier 1 + Tier 2 columns
3. Log cache statistics: rows per year, NaN rates per feature

**Files**: `ml/src/cache_features_classics.py` (modify, ~20 lines)

---

### Subtask T032 – Run ablation for pipeline features

**Purpose**: Measure marginal impact of pipeline and consistency features.

**Steps**:

1. Run experiments:
   ```bash
   python src/benchmark_classics.py --mode ml --features tier1+pipeline --model lgbm --label classics_ablation_pipeline
   python src/benchmark_classics.py --mode ml --features tier1+consistency --model lgbm --label classics_ablation_consistency
   python src/benchmark_classics.py --mode ml --features tier1+pipeline+consistency --model lgbm --label classics_ablation_pipeline_consistency
   ```
2. Compare each against WP04 best model
3. Also compare against WP05 results to see cumulative Tier 2 impact

**Files**: Results in `ml/logbook/classics_ablation_*.json`

**Validation**:

- [ ] Pipeline features are populated for races within campaign sequences
- [ ] Pipeline features are NaN for races without feeders (e.g., standalone classics)
- [ ] Consistency feature uses position std dev across editions
- [ ] Ablation comparison reports show delta for each feature group
- [ ] Combined Tier 2 (all type + pipeline + consistency) tested against Tier 1 only

---

## Risks & Mitigations

- **Risk**: Pipeline features only apply to ~60% of classics (those in campaign sequences). **Mitigation**: NaN handling lets model ignore pipeline for standalone classics; they still benefit from other features.
- **Risk**: Trend with few data points is noisy. **Mitigation**: Require ≥2 feeder results; NaN otherwise.
- **Risk**: Consistency may be low-signal (just reflects rider quality). **Mitigation**: Ablation will reveal — drop if no marginal value.

## Review Guidance

- Verify pipeline feeders are correctly looked up from taxonomy
- Check feeder results are from SAME season, BEFORE target race date
- Confirm trend slope computation is correct (positive = improving)
- Verify consistency uses position (not points) for std dev
- Check cache includes both Tier 1 and Tier 2 features

## Activity Log

- 2026-04-02T16:48:30Z – system – lane=planned – Prompt created.
