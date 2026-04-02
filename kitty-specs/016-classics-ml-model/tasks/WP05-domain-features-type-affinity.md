---
work_package_id: WP05
title: Domain Features — Type Affinity & Specialist Profile
lane: planned
dependencies:
  - WP02
subtasks:
  - T022
  - T023
  - T024
  - T025
  - T026
  - T027
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
  - FR-008
  - FR-010
  - FR-012
  - FR-026
---

# Work Package Prompt: WP05 – Domain Features — Type Affinity & Specialist Profile

## IMPORTANT: Review Feedback Status

- **Has review feedback?**: Check the `review_status` field above.

---

## Review Feedback

_[Empty initially.]_

---

## Implementation Command

```bash
spec-kitty implement WP05 --base WP04
```

---

## Objectives & Success Criteria

- Add Tier 2 features: classic type affinity (per type), type-specific top-10 rates, specialist ratio, monument podium count
- Ablation test each feature group independently against the best WP04 model
- Document which features provide positive marginal impact

**Success**: At least one Tier 2 feature group measurably improves rho or another metric over the Tier 1-only model. Ablation results logged in logbook.

## Context & Constraints

- **Data model**: Classic Feature Vector (Tier 2 — domain features)
- **Research**: R5 (Tier 2 table), R3 (taxonomy types)
- **Taxonomy**: `ml/src/classic_taxonomy.py` from WP02
- **Key domain insight**: Flemish classic specialists form a homogeneous group; same for Ardennes. Type affinity captures this.
- Types: flemish, cobbled, ardennes, puncheur, italian, sprint_classic, hilly (7 types × 2 features = 14 type-specific features)

## Subtasks & Detailed Guidance

### Subtask T022 – Implement classic_type_affinity features

**Purpose**: Capture how well a rider performs in each TYPE of classic. A strong Flemish rider should have high affinity_flemish.

**Steps**:

1. Add to `features_classics.py`:
   ```python
   def _compute_type_affinity(rider_id, classic_results, race_date):
       """Compute points from same-type classics in last 24 months."""
       feats = {}
       d730 = race_date - timedelta(days=730)
       rider_classics = classic_results[
           (classic_results['rider_id'] == rider_id) &
           (classic_results['race_date'] < race_date) &
           (classic_results['race_date'] >= d730)
       ]

       for ctype in get_all_types():
           type_races = get_races_by_type(ctype)
           type_results = rider_classics[rider_classics['race_slug'].isin(type_races)]
           feats[f'type_affinity_{ctype}'] = float(type_results['pts'].sum())

       return feats
   ```
2. Use `get_races_by_type()` from `classic_taxonomy.py`
3. Use 24-month window for more stable signal (classics are sparse)
4. Add to `TIER2_FEATURE_COLS` list

**Files**: `ml/src/features_classics.py` (~25 lines)
**Parallel?**: Yes.

---

### Subtask T023 – Implement classic_type_top10_rate features

**Purpose**: What fraction of starts in each classic type result in a top-10 finish? Captures consistent specialist performance.

**Steps**:

1. Add to `features_classics.py`:
   ```python
   def _compute_type_top10_rates(rider_id, classic_results, race_date):
       """Top-10 rate per classic type over career."""
       feats = {}
       rider_classics = classic_results[
           (classic_results['rider_id'] == rider_id) &
           (classic_results['race_date'] < race_date)
       ]

       for ctype in get_all_types():
           type_races = get_races_by_type(ctype)
           type_results = rider_classics[rider_classics['race_slug'].isin(type_races)]
           # Count distinct (race_slug, year) combos = number of starts
           starts = type_results.groupby(['race_slug', 'year']).ngroups
           if starts >= 2:  # Need at least 2 starts for meaningful rate
               top10 = type_results[type_results['position'] <= 10]
               top10_starts = top10.groupby(['race_slug', 'year']).ngroups
               feats[f'type_top10_rate_{ctype}'] = top10_starts / starts
           else:
               feats[f'type_top10_rate_{ctype}'] = np.nan

       return feats
   ```
2. Use career-length window (not time-limited) for rate stability
3. Minimum 2 starts required — else NaN (too sparse for a rate)

**Files**: `ml/src/features_classics.py` (~25 lines)
**Parallel?**: Yes.

---

### Subtask T024 – Implement specialist_ratio

**Purpose**: How much of a rider's total output comes from classics? Pure specialists (VdP, Alaphilippe) vs generalists (Pogačar, Evenepoel).

**Steps**:

1. Add to `features_classics.py`:
   ```python
   def _compute_specialist_ratio(rider_history, classic_results, rider_id, race_date):
       """Fraction of rider's points from classics over last 24m."""
       d730 = race_date - timedelta(days=730)
       all_recent = rider_history[
           (rider_history['rider_id'] == rider_id) &
           (rider_history['race_date'] < race_date) &
           (rider_history['race_date'] >= d730)
       ]
       classic_recent = classic_results[
           (classic_results['rider_id'] == rider_id) &
           (classic_results['race_date'] < race_date) &
           (classic_results['race_date'] >= d730)
       ]
       total_pts = all_recent['pts'].sum()
       classic_pts = classic_recent['pts'].sum()
       return classic_pts / total_pts if total_pts > 0 else 0.0
   ```

**Files**: `ml/src/features_classics.py` (~15 lines)
**Parallel?**: Yes.

**Notes**: Pogačar has low specialist_ratio (~0.1-0.2, mostly GT points). Van der Poel has high (~0.5+, many classic points). This distinguishes rider profiles.

---

### Subtask T025 – Implement monument_podium_count

**Purpose**: "Monument gravity" — career monument podiums as a Bayesian prior. Riders who've podiumed monuments tend to podium again.

**Steps**:

1. Add to `features_classics.py`:
   ```python
   def _compute_monument_gravity(rider_id, classic_results, race_date):
       """Count career monument podium finishes (top 3)."""
       monument_slugs = get_races_by_type('monument')
       monuments = classic_results[
           (classic_results['rider_id'] == rider_id) &
           (classic_results['race_slug'].isin(monument_slugs)) &
           (classic_results['race_date'] < race_date) &
           (classic_results['position'] <= 3)
       ]
       return monuments.groupby(['race_slug', 'year']).ngroups
   ```

**Files**: `ml/src/features_classics.py` (~10 lines)
**Parallel?**: Yes.

---

### Subtask T026 – Add ablation test support to benchmark

**Purpose**: Enable running the benchmark with different feature subsets to measure marginal impact.

**Steps**:

1. Add feature set definitions to `benchmark_classics.py`:
   ```python
   FEATURE_SETS = {
       'tier1': TIER1_FEATURE_COLS,
       'tier1+type_affinity': TIER1_FEATURE_COLS + TYPE_AFFINITY_COLS,
       'tier1+type_rates': TIER1_FEATURE_COLS + TYPE_TOP10_RATE_COLS,
       'tier1+specialist': TIER1_FEATURE_COLS + ['specialist_ratio'],
       'tier1+monument': TIER1_FEATURE_COLS + ['monument_podium_count'],
       'tier1+all_tier2': TIER1_FEATURE_COLS + TIER2_FEATURE_COLS,
   }
   ```
2. Add `--features` CLI flag to select feature set
3. Update logbook metadata to record which features were used

**Files**: `ml/src/benchmark_classics.py` (~30 lines)

---

### Subtask T027 – Run ablation for type affinity features

**Purpose**: Measure the marginal impact of each Tier 2 feature group.

**Steps**:

1. Re-cache features including Tier 2 columns
2. Run ablation experiments:
   ```bash
   python src/benchmark_classics.py --mode ml --features tier1+type_affinity --model lgbm --label classics_ablation_type_affinity
   python src/benchmark_classics.py --mode ml --features tier1+type_rates --model lgbm --label classics_ablation_type_rates
   python src/benchmark_classics.py --mode ml --features tier1+specialist --model lgbm --label classics_ablation_specialist
   python src/benchmark_classics.py --mode ml --features tier1+monument --model lgbm --label classics_ablation_monument
   python src/benchmark_classics.py --mode ml --features tier1+all_tier2 --model lgbm --label classics_ablation_all_tier2
   ```
3. Compare each against the best Tier 1-only model from WP04
4. Document which features have positive/negative/neutral marginal impact

**Files**: Results in `ml/logbook/classics_ablation_*.json`

**Validation**:

- [ ] Each ablation experiment produces valid logbook entry
- [ ] Comparison reports show delta for each feature group vs tier1-only
- [ ] At least one Tier 2 feature group improves metrics
- [ ] Feature importance from LightGBM shows which type_affinity features are most important

---

## Risks & Mitigations

- **Risk**: 14 type-specific features may overfit (more features than meaningful signal). **Mitigation**: Monitor per-fold consistency; consider PCA or feature selection if overfitting detected.
- **Risk**: Sparse type data (few races per type). **Mitigation**: Use 24m window for affinity, career for rates; NaN for types with <2 starts.
- **Risk**: Type categories may be too granular (cobbled ≈ flemish overlap). **Mitigation**: Ablation will reveal if categories are redundant — can merge later.

## Review Guidance

- Verify type lookups use canonical slugs (resolve aliases)
- Check that affinity features use strict temporal filtering (no future leakage)
- Confirm NaN handling for sparse types (RF fillna(0), LightGBM native NaN)
- Review ablation results for consistency across CV folds

## Activity Log

- 2026-04-02T16:48:30Z – system – lane=planned – Prompt created.
