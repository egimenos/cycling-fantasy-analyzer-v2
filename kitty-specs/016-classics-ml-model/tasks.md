# Work Packages: Classics ML Model

**Inputs**: Design documents from `kitty-specs/016-classics-ml-model/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Organization**: 54 subtasks (`T001`–`T054`) rolled into 10 work packages (`WP01`–`WP10`). Each WP is independently deliverable. WP09–WP10 are conditional on GO decision from WP08.

---

## Work Package WP01: Rules-Based Baseline Benchmark (Priority: P1)

**Goal**: Establish the true rules-based baseline for classics with comprehensive multi-metric evaluation, per-race breakdowns, and confidence intervals.
**Independent Test**: Running `python src/benchmark_classics.py --mode rules-baseline` produces a logbook JSON with Spearman rho, NDCG@10, P@5, P@10, capture rate, and team overlap for all classic races across 3 CV folds.
**Prompt**: `tasks/WP01-rules-based-baseline-benchmark.md`

**Requirements Refs**: FR-001, FR-002, FR-003, FR-004, FR-005

### Included Subtasks

- [ ] T001 Create `ml/src/benchmark_classics.py` scaffold with fold definitions, imports, and CLI interface
- [ ] T002 Implement rules-based classic scoring function (position → GC_CLASSIC points)
- [ ] T003 Implement data loading for classic races from `race_results` table
- [ ] T004 Implement metric computation (rho, NDCG@10, P@5, P@10, capture rate, team overlap)
- [ ] T005 Implement per-race breakdown and cross-fold aggregation with bootstrap CI
- [ ] T006 Run baseline benchmark and save logbook entry to `ml/logbook/`

### Implementation Notes

- Reuse metric functions from `ml/src/benchmark_v8.py` (spearman_rho, ndcg_at_k, precision_at_k, bootstrap_ci)
- Filter `race_results` to `race_type='classic'` and `category='gc'`
- Use expanding-window CV: Fold 1 (≤2022→2023), Fold 2 (≤2023→2024), Fold 3 (≤2024→2025)
- K values adapted for classics: NDCG@10, P@5, P@10 (fewer scoring positions than stage races)
- Logbook JSON structure follows existing `ml/src/logbook.py` schema with `"classic"` as race_type key

### Parallel Opportunities

- T001-T003 (scaffold, scoring, data loading) can be developed in sequence as one unit
- T004-T005 depend on the scaffold but are independent of each other

### Dependencies

- None (starting package)

### Risks & Mitigations

- Fewer classic races per year (~15-20) means fewer data points per fold → compute per-race metrics to understand variance
- Fantasy price data may not be available for all classics → handle missing prices gracefully in capture rate calculation

---

## Work Package WP02: Classic Type Taxonomy (Priority: P1)

**Goal**: Create the static lookup table classifying each UWT classic/monument by type (Flemish, Ardennes, etc.) and define seasonal pipeline groups.
**Independent Test**: Importing `classic_taxonomy.py` and calling helper functions returns correct types and pipeline orderings for known races (e.g., Ronde = flemish+cobbled+monument, Flèche = ardennes+puncheur).
**Prompt**: `tasks/WP02-classic-type-taxonomy.md`

**Requirements Refs**: FR-006

### Included Subtasks

- [ ] T007 Create `ml/src/classic_taxonomy.py` with `CLASSIC_TYPES` dict mapping race_slug → metadata
- [ ] T008 Verify race slugs against database (run SQL query to get actual classic slugs)
- [ ] T009 Define `PIPELINE_GROUPS` with feeder ordering for Flemish and Ardennes campaigns
- [ ] T010 Add helper functions: `get_classic_types()`, `get_feeders_for_race()`, `is_monument()`, `get_all_types()`

### Implementation Notes

- Race slugs come from PCS scraping — verify against actual `race_results` table before hardcoding
- Types: flemish, cobbled, ardennes, puncheur, italian, sprint_classic, hilly, monument, special
- Pipeline groups define seasonal sequences: e.g., Flemish spring = Omloop → Kuurne → E3 → Gent-Wevelgem → Dwars → Ronde
- World Championship gets type `special` (course changes annually)

### Parallel Opportunities

- T007 and T009 can be developed together (same file, different dicts)
- T008 requires database access

### Dependencies

- None (independent of WP01, but must be done before WP03)

### Risks & Mitigations

- Race slugs may differ between years (sponsor name changes like "e3-saxo-classic" vs "e3-harelbeke") → verify with DB, add aliases if needed

---

## Work Package WP03: Core Feature Extraction — Tier 1 (Priority: P1)

**Goal**: Build the classic-specific feature extraction pipeline with Tier 1 features (same-race history, classic points, rates, micro-form, team) and a caching layer.
**Independent Test**: Extracting features for a known rider (e.g., Van der Poel) for Ronde van Vlaanderen produces non-null same-race history values and high classic_top10_rate.
**Prompt**: `tasks/WP03-core-feature-extraction.md`

**Requirements Refs**: FR-007, FR-010, FR-011

### Included Subtasks

- [ ] T011 Create `ml/src/features_classics.py` with `_compute_classic_features()` skeleton and data loading
- [ ] T012 [P] Implement same-race history features (same_race_best, same_race_mean, same_race_count, has_same_race)
- [ ] T013 [P] Implement classic points aggregation (pts_classic_12m/6m/3m, classic_top10_rate, classic_win_rate)
- [ ] T014 [P] Implement reused general features (age, days_since_last, pts_30d/14d, team_rank, is_leader, prestige_pts_12m)
- [ ] T015 Create `ml/src/cache_features_classics.py` for parquet caching per year
- [ ] T016 Create `extract_all_classic_features()` for batch training extraction

### Implementation Notes

- Follow same data loading pattern as `ml/src/features.py` (SQL query → pandas → per-rider computation)
- Filter to `race_type='classic'` and `category='gc'` for classic-specific features
- For general features (pts_30d, etc.), use ALL race history (not just classics)
- Cache schema: one parquet per year with identity columns (rider_id, race_slug, year) + feature columns + target (actual_pts)
- GC_CLASSIC points: {1:200, 2:125, 3:100, 4:80, 5:60, 6:50, 7:45, 8:40, 9:35, 10:30}

### Parallel Opportunities

- T012, T013, T014 are parallel (independent feature groups within the same function)

### Dependencies

- Depends on WP02 (needs classic_taxonomy.py for race_type filtering validation)

### Risks & Mitigations

- Riders with no classic history get all-zero features → ensure model handles this (RF/LightGBM handle zeros natively)
- Missing birth_date data → use NaN, handle in model (LightGBM handles NaN, RF uses fillna(0))

---

## Work Package WP04: Core ML Model + A/B Benchmark (Priority: P1) MVP

**Goal**: Train the first ML model on Tier 1 features and rigorously compare against rules-based baseline using the same benchmark protocol.
**Independent Test**: A comparison report shows delta for every metric (rho, NDCG, P@K, capture) between ML model and baseline, with statistical significance.
**Prompt**: `tasks/WP04-core-ml-model-ab-benchmark.md`

**Requirements Refs**: FR-023, FR-024, FR-025

### Included Subtasks

- [ ] T017 Create `ml/src/train_classics.py` (load cached features, train RF/LightGBM, save model artifacts)
- [ ] T018 Add ML evaluation mode to `benchmark_classics.py` (load trained model, predict, score)
- [ ] T019 Implement A/B comparison report (delta table, bootstrap significance testing)
- [ ] T020 Run experiments: RF + LightGBM × raw/sqrt/log1p transforms = 6 variants
- [ ] T021 Document results in experiment logbook (`ml/logbook/classics_*.json`)

### Implementation Notes

- Model saved to `ml/models/classics/` (new directory)
- Training uses cached parquet from WP03 (expanding-window splits)
- RF params: n_estimators=500, max_depth=14, min_samples_leaf=5 (start from stage race defaults)
- LightGBM params: n_estimators=256, max_depth=8, lr=0.02 (start from stage race defaults)
- Target transforms: raw (y as-is), sqrt (y'=√y), log1p (y'=log(1+y))
- Comparison significance: bootstrap 95% CI overlap test

### Parallel Opportunities

- T017 and T018 can be developed in parallel (train script vs benchmark extension)

### Dependencies

- Depends on WP01 (baseline to compare against), WP03 (cached features)

### Risks & Mitigations

- With ~15-20 classics per test fold, metrics have high variance → use bootstrap CI, don't overfit to specific races
- If no model beats baseline: this is a valid outcome — document and proceed to domain features (WP05-WP06)

---

## Work Package WP05: Domain Features — Type Affinity & Specialist Profile (Priority: P1)

**Goal**: Add Tier 2 features capturing classic-type specialization and rider profiles, then measure marginal impact via ablation.
**Independent Test**: A Flemish specialist (e.g., Van der Poel) has high classic_type_affinity_flemish and high specialist_ratio. Ablation shows type_affinity features improve rho.
**Prompt**: `tasks/WP05-domain-features-type-affinity.md`

**Requirements Refs**: FR-008, FR-010, FR-012, FR-026

### Included Subtasks

- [ ] T022 [P] Implement `classic_type_affinity_{type}` features (points from same-type classics in 24m)
- [ ] T023 [P] Implement `classic_type_top10_rate_{type}` features (top-10 rate within type)
- [ ] T024 [P] Implement `specialist_ratio` (classic pts / total pts over career)
- [ ] T025 [P] Implement `monument_podium_count` (career monument top-3 finishes)
- [ ] T026 Add ablation test support to benchmark (--features flag with additive feature sets)
- [ ] T027 Run ablation: each feature group independently, document marginal impact

### Implementation Notes

- Type affinity features depend on `classic_taxonomy.py` (WP02) for type lookups
- One affinity feature per type (flemish, cobbled, ardennes, puncheur, italian, sprint_classic, hilly) = 7 features
- One top10_rate per type = 7 features
- specialist_ratio = sum(classic_pts) / sum(all_pts) over 24 months
- monument_podium_count = count of position ≤ 3 in monument races across career
- Ablation: add each feature group to Tier 1 baseline, re-run benchmark, compare

### Parallel Opportunities

- T022, T023, T024, T025 are all parallel (independent feature implementations)
- T026-T027 must run after feature implementation

### Dependencies

- Depends on WP02 (taxonomy), WP03 (feature infrastructure), WP04 (ML benchmark to evaluate against)

### Risks & Mitigations

- Type-specific features may be sparse (few races per type) → use 24m window to increase sample
- Too many type features (14) relative to sample size → monitor for overfitting in CV

---

## Work Package WP06: Domain Features — Pipeline & Consistency (Priority: P1)

**Goal**: Add Tier 2 features capturing seasonal pipeline momentum and same-race consistency, then measure marginal impact.
**Independent Test**: A rider with results in E3 → Gent-Wevelgem → Dwars has non-null pipeline_feeder_pts for Ronde prediction. Ablation shows pipeline features improve metrics.
**Prompt**: `tasks/WP06-domain-features-pipeline-consistency.md`

**Requirements Refs**: FR-009, FR-011

### Included Subtasks

- [ ] T028 Implement `pipeline_feeder_pts` (points from feeder classics earlier in the current campaign)
- [ ] T029 Implement `pipeline_trend` (slope/gradient of form across campaign sequence)
- [ ] T030 Implement `same_race_consistency` (std dev of positions across editions of same classic)
- [ ] T031 Update `cache_features_classics.py` to include all Tier 2 features
- [ ] T032 Run ablation: each pipeline/consistency feature independently, document impact

### Implementation Notes

- Pipeline features use `PIPELINE_GROUPS` from `classic_taxonomy.py`
- `pipeline_feeder_pts`: sum points from all feeders that occur BEFORE the target race date in the same season
- `pipeline_trend`: linear regression slope of points across ordered feeder results (positive = building form)
- `same_race_consistency`: std dev of finish positions across all previous editions (lower = more consistent/predictable)
- For trend: if ≤2 data points, return NaN (not enough for slope)

### Parallel Opportunities

- T028, T029, T030 are parallel (independent feature implementations)

### Dependencies

- Depends on WP02 (pipeline groups), WP03 (feature infrastructure), WP04 (ML benchmark)

### Risks & Mitigations

- Pipeline features only meaningful for races within a campaign sequence → non-campaign classics get NaN (handled by model)
- Trend with few data points is unreliable → require ≥3 feeder results for slope, else NaN

---

## Work Package WP07: Experimental Features — Tier 3 (Priority: P1)

**Goal**: Implement and A/B test brainstormed experimental features to find additional signal beyond domain features.
**Independent Test**: Each experimental feature is independently tested: added to the best model from WP05/WP06, benchmarked, and compared with clear pass/fail on marginal improvement.
**Prompt**: `tasks/WP07-experimental-features-tier3.md`

**Requirements Refs**: FR-012, FR-013, FR-014, FR-015, FR-016, FR-017, FR-018, FR-019, FR-020, FR-021, FR-022

### Included Subtasks

- [ ] T033 [P] Implement `classic_glicko_mu/rd` (Glicko-2 rating from classic results only)
- [ ] T034 [P] Implement type-specific Glicko (per classic type: flemish_glicko, ardennes_glicko, etc.)
- [ ] T035 [P] Implement `age_x_type` interaction feature (age relative to type-specific peak)
- [ ] T036 [P] Implement `team_classic_commitment` (team strength in this specific classic)
- [ ] T037 [P] Implement `calendar_distance` features (days since last classic, days since last race)
- [ ] T038 A/B test each feature independently against best WP05/WP06 model, document marginal impact

### Implementation Notes

- Classic Glicko-2: adapt existing Glicko infrastructure from `ml/src/glicko.py` but compute ratings only from classic results
- Type-specific Glicko: separate rating systems per classic type — very sparse, may not converge
- Age × type: compute `age - type_peak_age` where type_peak_age is estimated from historical data (Flemish ~28, Ardennes ~30, etc.)
- Team commitment: count of top-100 world-ranking riders from same team in the startlist
- Calendar distance: `days_since_last_classic` (spring form freshness) and `days_since_last_race` (general freshness)
- Each feature tested independently: add to best model, re-run benchmark, keep only if positive impact

### Parallel Opportunities

- T033-T037 are all parallel (independent experimental features)
- T038 must run after all features are implemented

### Dependencies

- Depends on WP05, WP06 (best model to test against)

### Risks & Mitigations

- Type-specific Glicko may not converge with sparse data → fall back to overall classic Glicko if type-specific is too noisy
- Experimental features may not help → expected; the value is in knowing which ones don't work
- CX data (FR-019) likely not in database → skip if unavailable, note in research

---

## Work Package WP08: Model Tuning + GO/NO-GO Decision (Priority: P1)

**Goal**: Optimize the best model configuration and make the formal GO/NO-GO decision with a comprehensive metrics report.
**Independent Test**: A final benchmark report with all metrics, per-classic-type analysis, and a clear GO or NO-GO recommendation with supporting evidence.
**Prompt**: `tasks/WP08-model-tuning-go-nogo.md`

**Requirements Refs**: FR-026

### Included Subtasks

- [ ] T039 Hyperparameter grid search for RF + LightGBM with best feature set
- [ ] T040 Final feature set selection based on cumulative ablation results
- [ ] T041 Final benchmark run with best configuration (all folds, all metrics, full logbook)
- [ ] T042 Per-classic-type analysis (which types benefit most from ML? Which remain better rules-based?)
- [ ] T043 Document GO/NO-GO decision with complete metrics comparison report

### Implementation Notes

- Hyperparameter search: try broader ranges than defaults (depth, n_estimators, learning_rate, subsample)
- Final feature set: combine all positive-impact features from WP05-WP07 ablation
- Per-type analysis: group benchmark results by classic type (flemish, ardennes, etc.) to identify which subtypes benefit most
- Possible outcome: "GO for Flemish/Ardennes, NO-GO for sprint classics" → partial deployment is valid
- Decision document: include all metrics tables, comparison plots, per-race detail, and clear recommendation

### Parallel Opportunities

- T039 (hyperparameter search) and T040 (feature selection) can be explored together iteratively
- T041-T043 are sequential (run → analyze → document)

### Dependencies

- Depends on WP05, WP06, WP07 (all feature exploration complete)

### Risks & Mitigations

- Model may only improve for some classic types → document which types are GO and which remain rules-based
- Overfitting to limited test data → validate consistency across all 3 CV folds

---

## Work Package WP09: Production Integration (Priority: P2, conditional on GO)

**Goal**: Integrate the classic ML model into the production prediction pipeline so that classic race requests return ML-powered predictions.
**Independent Test**: A POST request to the ML service for a classic race returns per-rider predicted scores with `scoringMethod: "ml"` instead of a 404.
**Prompt**: `tasks/WP09-production-integration.md`

**Requirements Refs**: FR-027, FR-028, FR-029, FR-030

### Included Subtasks

- [ ] T044 Create `ml/src/predict_classics.py` (load model, extract features on-demand, predict for startlist)
- [ ] T045 Modify `ml/src/predict_sources.py` line 135 to delegate to `predict_classics` for classic races
- [ ] T046 Modify `ml/src/app.py` line 378 to remove 404 and call classic prediction endpoint
- [ ] T047 Modify `apps/api/src/infrastructure/ml/ml-scoring.adapter.ts` to handle classic response format
- [ ] T048 Add model versioning and hot-reload support for classic model

### Implementation Notes

- `predict_classics.py` returns a list of dicts: `[{rider_id, predicted_score, rider_name}]`
- Response maps to existing format: `gc` = predicted_score, `stage/mountain/sprint = 0` (classics only have GC scoring)
- `predict_sources.py` change: replace `return []` at line 135 with `return predict_classic_race(...)` delegation
- `app.py` change: remove HTTPException at line 378, add classic prediction route in the predict endpoint
- `ml-scoring.adapter.ts`: ensure classic race type sends request to ML service instead of skipping
- Model loaded from `ml/models/classics/` with metadata JSON (feature list, training date, etc.)

### Parallel Opportunities

- T044 (Python prediction) and T047 (TS adapter) can be developed in parallel
- T045-T046 (glue code) depend on T044

### Dependencies

- Depends on WP08 (GO decision and trained model)

### Risks & Mitigations

- Integration must not break existing stage-race predictions → only touch classic path, add integration test
- Model hot-reload must work for classics independently of stage models → separate model directory

---

## Work Package WP10: Tests + Documentation (Priority: P2)

**Goal**: Comprehensive tests for the classic pipeline and documentation of the model, including an Architecture Decision Record.
**Independent Test**: `pytest ml/src/test_classics*.py` passes, Jest adapter tests pass, model-baseline.md updated, ADR committed.
**Prompt**: `tasks/WP10-tests-documentation.md`

**Requirements Refs**: FR-030

### Included Subtasks

- [ ] T049 [P] pytest for `classic_taxonomy.py` (type lookups, pipeline groups, edge cases)
- [ ] T050 [P] pytest for `features_classics.py` (spot-check known riders, zero-history riders, NaN handling)
- [ ] T051 [P] pytest for `predict_classics.py` (prediction pipeline, model loading, output format)
- [ ] T052 [P] Jest for `ml-scoring.adapter.ts` classic handling (request/response format)
- [ ] T053 Update `ml/docs/model-baseline.md` with classic model documentation
- [ ] T054 Create ADR for the classic ML decision in `docs/adr/`

### Implementation Notes

- Tests should cover: happy path, edge cases (no history, new riders, unknown race slugs), data validation
- Spot-check test: verify known specialists have expected feature values (e.g., VdP high Flemish affinity)
- model-baseline.md: add section documenting classic model architecture, feature set, benchmark results, and deployment
- ADR format: `YYYY-MM-DD-classic-ml-model.md` with decision context, options considered, chosen approach, consequences

### Parallel Opportunities

- T049-T052 are all parallel (independent test files)
- T053-T054 are parallel (independent documentation)

### Dependencies

- Depends on WP09 (needs production code to test)

### Risks & Mitigations

- Test data fixtures needed → use synthetic data or known historical examples from the database
- Scoring logic tests must reach 100% coverage per constitution → ensure all branches covered

---

## Dependency & Execution Summary

```
WP01 (Baseline)  ────┐
                      │
WP02 (Taxonomy)  ────┤
                      ▼
              WP03 (Core Features)
                      │
                      ▼
              WP04 (Core ML + A/B) ── MVP checkpoint
                      │
            ┌─────────┤
            ▼         ▼
    WP05 (Type      WP06 (Pipeline
     Affinity)       Consistency)
            │         │
            └────┬────┘
                 ▼
        WP07 (Experimental)
                 │
                 ▼
        WP08 (Tuning + GO/NO-GO)
                 │
                 ▼ (if GO)
        WP09 (Integration)
                 │
                 ▼
        WP10 (Tests + Docs)
```

- **Parallelization**: WP01 and WP02 can run in parallel. WP05 and WP06 can run in parallel after WP04.
- **MVP Scope**: WP01 → WP02 → WP03 → WP04 gives the first ML model with A/B results. This is the minimum to determine if classic ML is viable.
- **Early exit**: If WP08 yields NO-GO, WP09-WP10 are skipped and the feature closes with documented research findings.

---

## Subtask Index (Reference)

| Subtask | Summary                                                    | WP   | Priority | Parallel? |
| ------- | ---------------------------------------------------------- | ---- | -------- | --------- |
| T001    | Create benchmark_classics.py scaffold                      | WP01 | P1       | No        |
| T002    | Rules-based classic scoring function                       | WP01 | P1       | No        |
| T003    | Data loading for classic races                             | WP01 | P1       | No        |
| T004    | Metric computation (rho, NDCG, P@K, capture, overlap)      | WP01 | P1       | No        |
| T005    | Per-race breakdown + cross-fold aggregation + bootstrap CI | WP01 | P1       | No        |
| T006    | Run baseline and save logbook entry                        | WP01 | P1       | No        |
| T007    | Create classic_taxonomy.py with CLASSIC_TYPES              | WP02 | P1       | No        |
| T008    | Verify race slugs against database                         | WP02 | P1       | No        |
| T009    | Define PIPELINE_GROUPS                                     | WP02 | P1       | No        |
| T010    | Add taxonomy helper functions                              | WP02 | P1       | No        |
| T011    | Create features_classics.py skeleton                       | WP03 | P1       | No        |
| T012    | Same-race history features                                 | WP03 | P1       | Yes       |
| T013    | Classic points aggregation features                        | WP03 | P1       | Yes       |
| T014    | Reused general features                                    | WP03 | P1       | Yes       |
| T015    | Create cache_features_classics.py                          | WP03 | P1       | No        |
| T016    | Batch training extraction function                         | WP03 | P1       | No        |
| T017    | Create train_classics.py                                   | WP04 | P1       | No        |
| T018    | Add ML evaluation mode to benchmark                        | WP04 | P1       | Yes       |
| T019    | A/B comparison report with significance                    | WP04 | P1       | No        |
| T020    | Run RF + LightGBM × 3 transforms                           | WP04 | P1       | No        |
| T021    | Document results in logbook                                | WP04 | P1       | No        |
| T022    | Classic type affinity features                             | WP05 | P1       | Yes       |
| T023    | Classic type top10 rate features                           | WP05 | P1       | Yes       |
| T024    | Specialist ratio feature                                   | WP05 | P1       | Yes       |
| T025    | Monument podium count feature                              | WP05 | P1       | Yes       |
| T026    | Ablation test support in benchmark                         | WP05 | P1       | No        |
| T027    | Run ablation for type affinity features                    | WP05 | P1       | No        |
| T028    | Pipeline feeder points feature                             | WP06 | P1       | Yes       |
| T029    | Pipeline trend feature                                     | WP06 | P1       | Yes       |
| T030    | Same-race consistency feature                              | WP06 | P1       | Yes       |
| T031    | Update cache for Tier 2 features                           | WP06 | P1       | No        |
| T032    | Run ablation for pipeline features                         | WP06 | P1       | No        |
| T033    | Classic Glicko-2 rating                                    | WP07 | P1       | Yes       |
| T034    | Type-specific Glicko                                       | WP07 | P1       | Yes       |
| T035    | Age × classic-type interaction                             | WP07 | P1       | Yes       |
| T036    | Team classic commitment feature                            | WP07 | P1       | Yes       |
| T037    | Calendar distance features                                 | WP07 | P1       | Yes       |
| T038    | A/B test each experimental feature                         | WP07 | P1       | No        |
| T039    | Hyperparameter grid search                                 | WP08 | P1       | No        |
| T040    | Final feature set selection                                | WP08 | P1       | No        |
| T041    | Final benchmark run                                        | WP08 | P1       | No        |
| T042    | Per-classic-type analysis                                  | WP08 | P1       | No        |
| T043    | Document GO/NO-GO decision                                 | WP08 | P1       | No        |
| T044    | Create predict_classics.py                                 | WP09 | P2       | No        |
| T045    | Modify predict_sources.py delegation                       | WP09 | P2       | No        |
| T046    | Modify app.py remove 404                                   | WP09 | P2       | No        |
| T047    | Modify ml-scoring.adapter.ts                               | WP09 | P2       | Yes       |
| T048    | Model versioning and hot-reload                            | WP09 | P2       | No        |
| T049    | pytest classic_taxonomy.py                                 | WP10 | P2       | Yes       |
| T050    | pytest features_classics.py                                | WP10 | P2       | Yes       |
| T051    | pytest predict_classics.py                                 | WP10 | P2       | Yes       |
| T052    | Jest ml-scoring.adapter.ts                                 | WP10 | P2       | Yes       |
| T053    | Update model-baseline.md                                   | WP10 | P2       | Yes       |
| T054    | Create ADR for classic ML                                  | WP10 | P2       | Yes       |
