---
work_package_id: WP07
title: Experimental Features — Tier 3
lane: planned
dependencies: [WP05, WP06]
subtasks:
  - T033
  - T034
  - T035
  - T036
  - T037
  - T037a
  - T037b
  - T038
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
  - FR-012
  - FR-013
  - FR-014
  - FR-015
  - FR-016
  - FR-017
  - FR-018
  - FR-019
  - FR-020
  - FR-021
  - FR-022
---

# Work Package Prompt: WP07 – Experimental Features — Tier 3

## IMPORTANT: Review Feedback Status

- **Has review feedback?**: Check the `review_status` field above.

---

## Review Feedback

_[Empty initially.]_

---

## Implementation Command

```bash
spec-kitty implement WP07 --base WP06
```

---

## Objectives & Success Criteria

- Implement 5 experimental features from the brainstorming list
- A/B test each feature independently against the best Tier 1+2 model
- Document marginal impact of each — accept only features with positive, consistent impact
- Skip features that require unavailable data (e.g., CX data)

**Success**: At least 1-2 experimental features provide measurable marginal improvement. Features that don't help are documented and excluded from the final model.

## Context & Constraints

- **Research**: R5 (Tier 3 experimental table)
- **Spec**: FR-012 through FR-022
- **Existing Glicko**: `ml/src/glicko.py` has Glicko-2 implementation to adapt
- **Risk**: Experimental features are higher-risk hypotheses — some will fail, which is expected and valuable
- **Key principle**: Each feature tested independently to isolate marginal impact

## Subtasks & Detailed Guidance

### Subtask T033 – Implement classic_glicko_mu/rd

**Purpose**: Compute Glicko-2 skill ratings from classic results only. Unlike general Glicko (which mixes all race types), this captures "classic-specific skill level."

**Steps**:

1. Adapt existing `ml/src/glicko.py` pattern:

   ```python
   def compute_classic_glicko(classic_results: pd.DataFrame, race_date) -> dict[str, dict]:
       """Compute Glicko-2 ratings from classic race history only.

       Returns: {rider_id: {'mu': float, 'rd': float}}
       """
       # Filter to classic results before race_date
       # Process each classic as a "round" in Glicko-2
       # A classic result = pairwise comparisons between all finishers
       # Winner > 2nd > 3rd > ... (ordinal)
       # Use position-based outcomes: rider at pos i beats rider at pos j if i < j

       # Implementation approach:
       # 1. Sort classics chronologically
       # 2. For each classic, update ratings based on finish positions
       # 3. Return final mu (skill) and rd (uncertainty)
   ```

2. Key decisions:
   - Initial mu: 1500 (Glicko default)
   - Initial rd: 350 (high uncertainty)
   - Tau: 0.5 (volatility parameter — same as existing)
   - Process each classic as one "rating period"
3. Add `classic_glicko_mu` and `classic_glicko_rd` to feature vector

**Files**: `ml/src/features_classics.py` (~60 lines)
**Parallel?**: Yes.

**Notes**: Glicko-2 from classics only will have fewer data points per rider than the general Glicko. RD will be higher (more uncertain), which is itself informative — high RD means "we don't know how good this rider is at classics."

---

### Subtask T034 – Implement type-specific Glicko

**Purpose**: Separate Glicko-2 ratings per classic type (Flemish Glicko, Ardennes Glicko). Even more specific than overall classic Glicko.

**Steps**:

1. Extend classic Glicko to compute per-type:

   ```python
   def compute_type_glicko(classic_results, race_date) -> dict[str, dict]:
       """Compute per-type Glicko ratings.

       Returns: {rider_id: {
           'flemish_glicko_mu': float, 'flemish_glicko_rd': float,
           'ardennes_glicko_mu': float, 'ardennes_glicko_rd': float,
           ...
       }}
       """
       type_ratings = {}
       for ctype in ['flemish', 'ardennes', 'cobbled', 'italian']:
           type_races = get_races_by_type(ctype)
           type_results = classic_results[
               classic_results['race_slug'].isin(type_races)
           ]
           if len(type_results) == 0:
               continue
           ratings = compute_classic_glicko(type_results, race_date)
           for rid, rating in ratings.items():
               if rid not in type_ratings:
                   type_ratings[rid] = {}
               type_ratings[rid][f'{ctype}_glicko_mu'] = rating['mu']
               type_ratings[rid][f'{ctype}_glicko_rd'] = rating['rd']
       return type_ratings
   ```

2. Only compute for types with sufficient data (flemish, ardennes, cobbled, italian)
3. Skip puncheur, sprint_classic, hilly (too few races for stable ratings)

**Files**: `ml/src/features_classics.py` (~30 lines)
**Parallel?**: Yes.

**Notes**: Very sparse — a rider may have only 2-3 Flemish classic starts. RD will be very high. This feature may not converge well — that's what ablation will tell us.

---

### Subtask T035 – Implement age × classic-type interaction

**Purpose**: Classic specialists peak at different ages depending on type. Power-based Flemish riders peak early (~27-28), tactical Ardennes punchers peak later (~29-31).

**Steps**:

1. Define estimated peak ages per type:
   ```python
   TYPE_PEAK_AGE = {
       'flemish': 28, 'cobbled': 28, 'ardennes': 30,
       'puncheur': 30, 'italian': 29, 'sprint_classic': 27,
       'hilly': 29, 'monument': 29, 'special': 29,
   }
   ```
2. Compute interaction feature:
   ```python
   def _compute_age_type_interaction(age, race_slug):
       """Distance from type-specific peak age. Negative = pre-peak, positive = post-peak."""
       types = get_classic_types(race_slug)
       if not types or age is None or np.isnan(age):
           return np.nan
       # Use the primary type (first in list, usually most specific)
       primary_type = types[0] if types[0] != 'monument' else types[1] if len(types) > 1 else types[0]
       peak = TYPE_PEAK_AGE.get(primary_type, 29)
       return age - peak
   ```
3. Feature: `age_type_delta` — negative means young (pre-peak), positive means declining

**Files**: `ml/src/features_classics.py` (~20 lines)
**Parallel?**: Yes.

**Notes**: The peak ages are estimates that can be refined. The key insight is that a 25-year-old at a Flemish classic is closer to peak than a 25-year-old at an Ardennes classic.

---

### Subtask T036 – Implement team_classic_commitment

**Purpose**: Some teams stack for specific classics (Quick-Step dominates Ronde, UAE for Strade Bianche). The number of strong riders on the team signals tactical advantage.

**Steps**:

1. Compute from startlist data:

   ```python
   def _compute_team_commitment(rider_id, race_slug, year, startlist_df):
       """Count high-quality teammates in this classic's startlist."""
       if startlist_df is None or len(startlist_df) == 0:
           return {'team_classic_commitment': np.nan}

       rider_team = startlist_df.loc[
           startlist_df['rider_id'] == rider_id, 'team'
       ].iloc[0] if rider_id in startlist_df['rider_id'].values else None

       if rider_team is None:
           return {'team_classic_commitment': np.nan}

       teammates = startlist_df[
           (startlist_df['team'] == rider_team) &
           (startlist_df['rider_id'] != rider_id)
       ]
       # Count teammates with classic points in last 12m > threshold
       # (using cached features or a pre-computed ranking)
       return {'team_classic_commitment': len(teammates)}
   ```

2. Simple version: count of teammates in the startlist
3. Enhanced version (if data available): count of teammates with classic_top10_rate > 0

**Files**: `ml/src/features_classics.py` (~25 lines)
**Parallel?**: Yes.

**Notes**: Startlist data may not always be available during feature caching (it's a prediction-time feature). For training, use actual race participants as a proxy.

---

### Subtask T037 – Implement calendar_distance features

**Purpose**: When was the rider's last classic? Last race of any type? Captures freshness and rest patterns.

**Steps**:

1. Add to feature computation:

   ```python
   def _compute_calendar_distance(rider_id, race_date, rider_history, classic_results):
       """Calendar distance features — days since last classic and last race."""
       feats = {}

       # Days since last classic
       rider_classics = classic_results[
           (classic_results['rider_id'] == rider_id) &
           (classic_results['race_date'] < race_date)
       ]
       if len(rider_classics) > 0:
           last_classic_date = rider_classics['race_date'].max()
           feats['days_since_last_classic'] = (race_date - last_classic_date).days
       else:
           feats['days_since_last_classic'] = np.nan

       # Days since last race (any type) — already in Tier 1 as days_since_last
       # This is redundant, so skip or rename

       # Classics in last 30 days (racing load)
       d30_classics = rider_classics[rider_classics['race_date'] >= race_date - timedelta(days=30)]
       feats['classics_count_30d'] = len(d30_classics.groupby(['race_slug', 'year']))

       return feats
   ```

**Files**: `ml/src/features_classics.py` (~20 lines)
**Parallel?**: Yes.

---

### Subtask T037a – Implement parcours micro-affinity (FR-013)

**Purpose**: Beyond the race-slug-based type affinity (WP05), capture affinity to specific parcours characteristics: cobblestone performance, puncheur-climb performance, and long-distance (250km+) endurance.

**Steps**:

1. Compute cobble affinity from results in cobbled-type races:
   ```python
   def _compute_parcours_affinity(rider_id, classic_results, race_date):
       cobbled_races = get_races_by_type('cobbled')
       cobbled_results = classic_results[
           (classic_results['rider_id'] == rider_id) &
           (classic_results['race_slug'].isin(cobbled_races)) &
           (classic_results['race_date'] < race_date)
       ]
       feats['cobble_affinity'] = float(cobbled_results['pts'].sum()) if len(cobbled_results) > 0 else 0.0

       # Puncheur affinity (short steep climbs — Ardennes + puncheur types)
       punch_races = get_races_by_type('puncheur') + get_races_by_type('ardennes')
       # ... similar pattern

       # Long-distance: MSR is 300km, use sprint_classic type as proxy
       long_races = get_races_by_type('sprint_classic')  # MSR, Gent-Wevelgem
       # ... similar pattern
       return feats
   ```
2. Note: This partially overlaps with type_affinity (WP05) but uses different grouping (parcours-based vs geography-based). Ablation will reveal if it adds marginal value.

**Files**: `ml/src/features_classics.py` (~25 lines)
**Parallel?**: Yes.

---

### Subtask T037b – Implement win style features (FR-018)

**Purpose**: Solo breakaway wins vs reduced group sprint finishes in past classics. A rider who wins solo has different characteristics from one who wins from a sprint.

**Steps**:

1. Approximate win style from margin of victory (position gap):
   ```python
   def _compute_win_style(rider_id, classic_results, race_date):
       """Approximate win style from historical classic results."""
       rider_wins = classic_results[
           (classic_results['rider_id'] == rider_id) &
           (classic_results['position'] == 1) &
           (classic_results['race_date'] < race_date)
       ]
       feats = {}
       feats['classic_wins_total'] = len(rider_wins)
       # Ratio of wins vs starts (winner mentality)
       all_starts = classic_results[
           (classic_results['rider_id'] == rider_id) &
           (classic_results['race_date'] < race_date)
       ]
       n_starts = all_starts.groupby(['race_slug', 'year']).ngroups
       feats['classic_win_pct'] = len(rider_wins) / n_starts if n_starts > 0 else 0.0
       return feats
   ```
2. Note: True solo-vs-sprint distinction is not available in `race_results` data (no time gaps). Use win count and win percentage as proxies.

**Files**: `ml/src/features_classics.py` (~20 lines)
**Parallel?**: Yes.

**Notes**: FR-021 (fantasy price as prior) and FR-022 (head-to-head record) are **explicitly deferred** — price data creates circularity risk, and head-to-head has combinatorial explosion. Both may be revisited in a future iteration if the core model proves viable.

---

### Subtask T038 – A/B test each experimental feature

**Purpose**: Run ablation for each Tier 3 feature independently to determine which ones provide marginal value.

**Steps**:

1. Update cache with Tier 3 features
2. Define feature sets:
   ```python
   FEATURE_SETS.update({
       'best_t2+classic_glicko': BEST_TIER2_COLS + ['classic_glicko_mu', 'classic_glicko_rd'],
       'best_t2+type_glicko': BEST_TIER2_COLS + TYPE_GLICKO_COLS,
       'best_t2+age_type': BEST_TIER2_COLS + ['age_type_delta'],
       'best_t2+team_commit': BEST_TIER2_COLS + ['team_classic_commitment'],
       'best_t2+calendar': BEST_TIER2_COLS + ['days_since_last_classic', 'classics_count_30d'],
       'best_t2+parcours': BEST_TIER2_COLS + ['cobble_affinity', 'punch_affinity', 'long_distance_affinity'],
       'best_t2+win_style': BEST_TIER2_COLS + ['classic_wins_total', 'classic_win_pct'],
   })
   ```
3. Run each experiment and compare against best Tier 2 model
4. Create summary report:
   ```
   Experimental Feature Ablation Results
   ═══════════════════════════════════════
   Feature              Δrho     Δndcg   ΔP@5    Verdict
   classic_glicko      +0.0XX   +0.0XX  +0.0XX  KEEP/DROP
   type_glicko         -0.0XX   -0.0XX  -0.0XX  DROP
   age_type_delta      +0.0XX   +0.0XX  +0.0XX  KEEP
   team_commitment     +0.0XX   -0.0XX  +0.0XX  MIXED
   calendar_distance   +0.0XX   +0.0XX  +0.0XX  KEEP
   ```

**Files**: Results in `ml/logbook/classics_experimental_*.json`

**Validation**:

- [ ] Each experimental feature can be independently enabled/disabled
- [ ] Ablation results clearly show marginal impact of each feature
- [ ] Features that don't improve metrics are documented and excluded
- [ ] Summary report created with clear KEEP/DROP verdicts

---

## Risks & Mitigations

- **Risk**: All Tier 3 features may fail. **Mitigation**: Expected outcome — the value is in systematically ruling them out. Tier 1+2 may already be sufficient.
- **Risk**: Type-specific Glicko too sparse to converge. **Mitigation**: Fall back to overall classic Glicko; skip type-specific if RD > threshold.
- **Risk**: CX data not available. **Mitigation**: Skip FR-019 (cross-discipline signal); note as "data not available" in report.
- **Risk**: Team commitment hard to compute from cached data. **Mitigation**: Use simple teammate count as proxy; enhanced version is a stretch goal.

## Review Guidance

- Verify Glicko implementation correctly adapts from existing `glicko.py`
- Check that type-specific Glicko handles sparse data gracefully
- Confirm age × type peak ages are reasonable cycling domain estimates
- Verify each ablation is truly independent (additive to best Tier 2, not cumulative)
- Check summary report has clear, actionable verdicts

## Activity Log

- 2026-04-02T16:48:30Z – system – lane=planned – Prompt created.
