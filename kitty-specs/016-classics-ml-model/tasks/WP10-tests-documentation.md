---
work_package_id: WP10
title: Tests + Documentation
lane: planned
dependencies: [WP09]
subtasks:
  - T049
  - T050
  - T051
  - T052
  - T053
  - T054
phase: Phase 5 - Polish & Quality
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
  - FR-030
---

# Work Package Prompt: WP10 – Tests + Documentation

## IMPORTANT: Review Feedback Status

- **Has review feedback?**: Check the `review_status` field above.

---

## Review Feedback

_[Empty initially.]_

---

## Implementation Command

```bash
spec-kitty implement WP10 --base WP09
```

---

## Objectives & Success Criteria

- Comprehensive pytest coverage for classic taxonomy, features, and prediction pipeline
- Jest test for ml-scoring.adapter.ts classic handling
- Updated model-baseline.md documentation
- Architecture Decision Record for the classic ML decision

**Success**: All tests pass. `pytest ml/src/test_classics*.py` green. Jest adapter tests green. Documentation committed.

## Context & Constraints

- **Constitution**: pytest for ML pipeline (key paths), Jest for backend, 100% scoring logic coverage
- **Existing test patterns**: `ml/src/` has existing test files; `apps/api/src/infrastructure/ml/__tests__/` has adapter tests
- **Test data**: Use synthetic data or fixtures from known historical results

## Subtasks & Detailed Guidance

### Subtask T049 – pytest for classic_taxonomy.py

**Purpose**: Verify type lookups, pipeline groups, slug resolution, and edge cases.

**Steps**:

1. Create `ml/src/test_classic_taxonomy.py`:

   ```python
   from classic_taxonomy import (
       get_classic_types, is_monument, get_feeders_for_race,
       get_races_by_type, resolve_slug, get_all_types,
   )

   def test_monument_types():
       assert 'monument' in get_classic_types('ronde-van-vlaanderen')
       assert 'flemish' in get_classic_types('ronde-van-vlaanderen')
       assert 'cobbled' in get_classic_types('ronde-van-vlaanderen')

   def test_is_monument():
       assert is_monument('paris-roubaix')
       assert is_monument('milano-sanremo')
       assert not is_monument('strade-bianche')

   def test_unknown_slug():
       assert get_classic_types('unknown-race') == ['other']

   def test_slug_alias():
       # Sponsor name changes should resolve to canonical slug
       canonical = resolve_slug('e3-harelbeke')
       assert canonical == 'e3-saxo-classic'  # or whatever the canonical is

   def test_feeders_for_ronde():
       feeders = get_feeders_for_race('ronde-van-vlaanderen')
       assert 'omloop-het-nieuwsblad' in feeders
       assert 'e3-saxo-classic' in feeders
       assert 'ronde-van-vlaanderen' not in feeders  # Don't include self

   def test_feeders_for_liege():
       feeders = get_feeders_for_race('liege-bastogne-liege')
       assert 'amstel-gold-race' in feeders
       assert 'la-fleche-wallonne' in feeders

   def test_feeders_for_standalone():
       # Classics not in any pipeline group
       feeders = get_feeders_for_race('clasica-san-sebastian')
       assert feeders == []

   def test_races_by_type():
       flemish = get_races_by_type('flemish')
       assert 'ronde-van-vlaanderen' in flemish
       assert 'paris-roubaix' not in flemish

   def test_all_types():
       types = get_all_types()
       assert 'flemish' in types
       assert 'ardennes' in types
       assert 'monument' in types
   ```

**Files**: `ml/src/test_classic_taxonomy.py` (new, ~60 lines)
**Parallel?**: Yes.

---

### Subtask T050 – pytest for features_classics.py

**Purpose**: Verify feature extraction produces expected values for known riders and handles edge cases.

**Steps**:

1. Create `ml/src/test_features_classics.py`:

   ```python
   import pandas as pd
   import numpy as np
   from datetime import date
   from features_classics import compute_classic_features

   def _make_classic_result(rider_id, slug, year, position, race_date):
       """Helper to create a classic race result row."""
       return {
           'rider_id': rider_id, 'race_slug': slug, 'year': year,
           'position': position, 'race_date': pd.Timestamp(race_date),
           'race_type': 'classic', 'category': 'gc', 'dnf': False,
           'race_class': 'UWT', 'pts': GC_CLASSIC.get(position, 0.0),
       }

   def test_same_race_history():
       # Rider with 3 editions of Ronde
       results = pd.DataFrame([
           _make_classic_result('r1', 'ronde-van-vlaanderen', 2021, 3, '2021-04-04'),
           _make_classic_result('r1', 'ronde-van-vlaanderen', 2022, 1, '2022-04-03'),
           _make_classic_result('r1', 'ronde-van-vlaanderen', 2023, 5, '2023-04-02'),
       ])
       feats = compute_classic_features(
           rider_id='r1', race_slug='ronde-van-vlaanderen',
           race_date=date(2024, 4, 7),
           rider_history=results, all_classic_results=results,
       )
       assert feats['same_race_count'] == 3
       assert feats['same_race_best'] == 200.0  # Position 1 = 200 pts
       assert feats['has_same_race'] == 1

   def test_no_classic_history():
       # Rider with zero classic history
       feats = compute_classic_features(
           rider_id='r2', race_slug='paris-roubaix',
           race_date=date(2024, 4, 14),
           rider_history=pd.DataFrame(), all_classic_results=pd.DataFrame(),
       )
       assert feats['same_race_count'] == 0
       assert feats['has_same_race'] == 0
       assert feats['pts_classic_12m'] == 0.0

   def test_no_future_leakage():
       # Ensure results AFTER race_date are not included
       results = pd.DataFrame([
           _make_classic_result('r1', 'ronde-van-vlaanderen', 2023, 1, '2023-04-02'),
           _make_classic_result('r1', 'ronde-van-vlaanderen', 2024, 2, '2024-04-07'),
       ])
       feats = compute_classic_features(
           rider_id='r1', race_slug='ronde-van-vlaanderen',
           race_date=date(2024, 4, 7),  # Same day as 2024 race
           rider_history=results[results['race_date'] < pd.Timestamp('2024-04-07')],
           all_classic_results=results[results['race_date'] < pd.Timestamp('2024-04-07')],
       )
       assert feats['same_race_count'] == 1  # Only 2023 edition
       assert feats['same_race_best'] == 200.0  # 2023 win
   ```

**Files**: `ml/src/test_features_classics.py` (new, ~80 lines)
**Parallel?**: Yes.

---

### Subtask T051 – pytest for predict_classics.py

**Purpose**: Verify prediction pipeline loads model, extracts features, and returns correct format.

**Steps**:

1. Create `ml/src/test_predict_classics.py`:
   - Mock model loading (don't require actual trained model in tests)
   - Test response format (gc/stage/mountain/sprint structure)
   - Test sorting (highest predicted score first)
   - Test edge cases (empty rider list, model not found)

**Files**: `ml/src/test_predict_classics.py` (new, ~60 lines)
**Parallel?**: Yes.

---

### Subtask T052 – Jest for ml-scoring.adapter.ts classic handling

**Purpose**: Verify the NestJS adapter correctly handles classic race ML responses.

**Steps**:

1. In `apps/api/src/infrastructure/ml/__tests__/ml-scoring.adapter.spec.ts`:
   - Add test case for classic race type
   - Verify ML service is called (not skipped)
   - Verify response maps correctly (gc = predicted_score, others = 0)
   - Test fallback when ML service unavailable

**Files**: `apps/api/src/infrastructure/ml/__tests__/ml-scoring.adapter.spec.ts` (modify, ~30 lines added)
**Parallel?**: Yes.

---

### Subtask T053 – Update model-baseline.md

**Purpose**: Document the classic ML model in the canonical model documentation.

**Steps**:

1. Add section to `ml/docs/model-baseline.md`:

   ```markdown
   ## Classic Model

   **Status**: [Active / Research Only]
   **Architecture**: Single regression model predicting GC_CLASSIC points (0-200)
   **Model type**: [RF / LightGBM — from WP08 decision]
   **Features**: [Count] features across 3 tiers

   ### Benchmark Results

   | Metric       | Rules Baseline | ML Model | Delta  |
   | ------------ | -------------- | -------- | ------ |
   | Spearman rho | 0.XXX          | 0.XXX    | +0.XXX |
   | NDCG@10      | 0.XXX          | 0.XXX    | +0.XXX |
   | ...          | ...            | ...      | ...    |

   ### Feature Tiers

   - **Tier 1 (core)**: same-race history, classic points, rates, micro-form, team
   - **Tier 2 (domain)**: type affinity, pipeline, specialist ratio, monument gravity
   - **Tier 3 (experimental)**: [list accepted features]

   ### Per-Type Performance

   [Table from WP08 T042]

   ### Retraining

   - Included in weekly `make retrain`
   - Model artifacts: `ml/models/classics/`
   ```

**Files**: `ml/docs/model-baseline.md` (modify, ~40 lines added)
**Parallel?**: Yes.

---

### Subtask T054 – Create ADR for classic ML decision

**Purpose**: Document the architectural decision per constitution requirements.

**Steps**:

1. Create `docs/adr/2026-04-XX-classic-ml-model.md`:

   ```markdown
   # ADR: Classic Race ML Prediction Model

   **Date**: 2026-04-XX
   **Status**: Accepted

   ## Context

   The rules-based scoring for classics achieved rho~0.31. A first ML attempt
   (Feature 005) using stage-race features also achieved 0.31 — no improvement.

   ## Decision

   Build a completely independent ML pipeline with classic-specific features:

   - Decoupled from stage-race pipeline (separate files, zero coupling)
   - Single regression model (not 4-source decomposition)
   - Classic type taxonomy as code (hardcoded lookup table)
   - Systematic A/B benchmarking for every change

   ## Consequences

   - [Positive]: ML improves classic prediction by X% rho
   - [Positive]: Decoupled pipeline has zero risk to stage-race models
   - [Negative]: Additional model to maintain and retrain weekly
   - [Negative]: Increased ML service memory footprint (~5MB)
   ```

**Files**: `docs/adr/2026-04-XX-classic-ml-model.md` (new, ~30 lines)
**Parallel?**: Yes.

**Validation**:

- [ ] `pytest ml/src/test_classic_taxonomy.py` passes
- [ ] `pytest ml/src/test_features_classics.py` passes
- [ ] `pytest ml/src/test_predict_classics.py` passes
- [ ] Jest adapter tests pass
- [ ] model-baseline.md updated with classic model section
- [ ] ADR created with decision context, rationale, and consequences

---

## Risks & Mitigations

- **Risk**: Test fixtures don't match real data structure. **Mitigation**: Use minimal synthetic data matching actual race_results schema.
- **Risk**: Scoring logic tests may not reach 100% coverage. **Mitigation**: Focus on branch coverage for all position → points mappings and edge cases.

## Review Guidance

- Verify tests cover happy path + edge cases (no history, unknown slugs, empty DataFrames)
- Check no future data leakage in test assertions
- Confirm ADR follows existing format in `docs/adr/`
- Verify model-baseline.md updates are consistent with WP08 decision document

## Activity Log

- 2026-04-02T16:48:30Z – system – lane=planned – Prompt created.
