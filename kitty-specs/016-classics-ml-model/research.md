# Research: Classics ML Model

**Feature**: 016-classics-ml-model
**Date**: 2026-04-02

## R1: Why the First ML Attempt Failed

**Decision**: Build a completely independent pipeline with classic-specific features

**Rationale**: The first attempt (Feature 005, March 2026) achieved rho=0.31 — identical to the rules-based baseline. It failed because:

1. **Generic features**: Used the same 43 features designed for stage races (pts_gc_12m, pts_stage_12m, etc.) that don't capture classic-specific dynamics
2. **No classic-type differentiation**: Treated all classics as one category, ignoring that Flemish, Ardennes, and Italian classics are fundamentally different prediction domains
3. **No same-race specialization**: While `same_race_best/mean` existed, they were a small fraction of 43 features — the model couldn't rely on them
4. **Contaminated training signal**: GC category mixed stage race GC standings with classic final results, confusing the model about what "GC quality" means

**Alternatives considered**:

- Extending existing pipeline with classic-type flag → rejected (couples to stage race model, limits experimentation)
- Fine-tuning stage race model on classics → rejected (fundamentally different prediction domain)

---

## R2: Available Data for Classics

**Decision**: Use `race_results` table filtered to `race_type='classic'`, `category='gc'`

**Rationale**: The database already contains comprehensive classic race data:

- **Table**: `race_results` with columns: rider_id, race_slug, race_name, race_type, race_class, year, category, position, dnf, race_date, parcours_type, is_itt, profile_score
- **Rider info**: birth_date, current_team via `riders` table join
- **Classification**: `race_type='classic'` assigned automatically for one-day races (PCS class starting with `1.`)
- **Points target**: `GC_CLASSIC = {1:200, 2:125, 3:100, 4:80, 5:60, 6:50, 7:45, 8:40, 9:35, 10:30}`
- **Data depth**: Races from 2019-2025 (~15-20 UWT classics per year = ~100+ race instances)

**Key data columns for classic features**:

- `race_slug` → same-race history (critical for classics)
- `race_class` → prestige weighting (UWT > Pro > .1)
- `parcours_type` → profile matching (p1-p5)
- `race_date` → temporal windowing and seasonal position
- `position` → points calculation via GC_CLASSIC table

---

## R3: Classic Type Taxonomy

**Decision**: Hardcoded lookup table mapping race_slug → list of classic types

**Rationale**: The set of UWT classics + monuments is small (~15-20 races) and stable year-to-year. A lookup table is simpler and more reliable than trying to derive types from parcours data.

**Proposed taxonomy** (a race can belong to multiple types):

| Race Slug               | Name                  | Types                             |
| ----------------------- | --------------------- | --------------------------------- |
| milano-sanremo          | Milano-Sanremo        | monument, sprint_classic, italian |
| ronde-van-vlaanderen    | Ronde van Vlaanderen  | monument, flemish, cobbled        |
| paris-roubaix           | Paris-Roubaix         | monument, cobbled                 |
| liege-bastogne-liege    | Liège-Bastogne-Liège  | monument, ardennes                |
| il-lombardia            | Il Lombardia          | monument, italian, hilly          |
| strade-bianche          | Strade Bianche        | italian, hilly                    |
| e3-saxo-classic         | E3 Saxo Classic       | flemish, cobbled                  |
| gent-wevelgem           | Gent-Wevelgem         | flemish, sprint_classic           |
| dwars-door-vlaanderen   | Dwars door Vlaanderen | flemish, cobbled                  |
| amstel-gold-race        | Amstel Gold Race      | ardennes                          |
| la-fleche-wallsatisfied | Flèche Wallonne       | ardennes, puncheur                |
| clasica-san-sebastian   | Clásica San Sebastián | hilly                             |
| omloop-het-nieuwsblad   | Omloop Het Nieuwsblad | flemish, cobbled                  |
| kuurne-brussel-kuurne   | Kuurne-Brussel-Kuurne | flemish, sprint_classic           |
| gp-quebec               | GP Québec             | hilly                             |
| gp-montreal             | GP Montréal           | hilly                             |
| world-championship      | World Championship RR | special                           |

**Note**: Exact slugs must be verified against the database. The World Championship gets type `special` because its course changes annually, limiting same-race history value.

**Types defined**:

- `flemish`: Belgian spring races on Flemish bergs/cobbles — strong specialist group (VdP, Van Aert, Pedersen)
- `cobbled`: Heavy cobblestone sectors — Roubaix specialist profile (power, bike handling)
- `ardennes`: Walloon/Dutch spring classics with short steep climbs — puncher profile (Pogačar, Evenepoel)
- `puncheur`: Subset of ardennes with ultra-steep finishes (Mur de Huy)
- `italian`: Italian/gravel races — mixed terrain specialists
- `sprint_classic`: Classics often decided by reduced bunch sprint (MSR, Gent-Wevelgem)
- `hilly`: General hilly one-day races
- `monument`: The 5 monuments — carries prestige signal
- `special`: World Championship (course changes annually)

---

## R4: Benchmark Protocol for Classics

**Decision**: Reuse expanding-window CV (3 folds) with adapted metrics

**Rationale**: The existing benchmark infrastructure (benchmark_v8.py metrics + logbook) is battle-tested and enables direct comparison with stage race models. Classics-specific adaptations:

- **Folds**: Same as stage races: Fold 1 (train ≤2022, test 2023), Fold 2 (≤2023, test 2024), Fold 3 (≤2024, test 2025)
- **Metrics**: Spearman rho, NDCG@10 (not @20, fewer scorers), P@5, P@10, capture rate (top-15), team overlap (top-15)
- **K values reduced**: Classics have ~10 scoring positions (vs 20+ in stage races), so P@5 and P@10 are more meaningful than P@15/P@20
- **Per-race breakdown**: Essential because classic types have very different predictability (Flemish might be easier than sprint classics)
- **Bootstrap CI**: 95% confidence intervals on all aggregated metrics (reuse `bootstrap_ci()` from benchmark_v8.py)
- **Logbook**: Same JSON structure with `"classic"` as the race_type key

**Volume check**: ~15-20 classics per test year → 3 folds → ~50-60 test races total. Sufficient for meaningful metrics but smaller than stage races (~45+ per fold).

---

## R5: Feature Engineering Strategy

**Decision**: Build features in three tiers — core (mandatory), domain (high-signal hypotheses), experimental (brainstormed ideas to A/B test)

**Rationale**: Systematic feature addition with ablation testing prevents overfitting and identifies which domain insights actually improve prediction.

### Tier 1: Core Features (baseline ML model)

These are adapted from existing features or trivially extractable:

| Feature                   | Source                          | Adaptation                                  |
| ------------------------- | ------------------------------- | ------------------------------------------- |
| same_race_best/mean/count | Existing (features.py L265-282) | Already computed, key signal                |
| pts_classic_12m/6m/3m     | New                             | Points from classics only (not stage races) |
| classic_top10_rate        | New                             | % of classic starts finishing top 10        |
| classic_win_rate          | New                             | % of classic starts winning                 |
| age                       | Existing                        | Direct reuse                                |
| days_since_last_race      | Existing                        | Direct reuse                                |
| pts_30d, pts_14d          | Existing                        | Direct reuse (general micro-form)           |
| team_rank, is_leader      | Existing                        | Direct reuse                                |
| prestige_pts_12m          | Existing                        | Direct reuse                                |

### Tier 2: Domain Features (classic-specific hypotheses)

Based on confirmed domain insights:

| Feature                        | Signal Hypothesis                                                 |
| ------------------------------ | ----------------------------------------------------------------- |
| classic*type_affinity*{type}   | Performance in same TYPE of classic transfers (e.g., all Flemish) |
| classic*type_top10_rate*{type} | Top-10 rate within specific classic type                          |
| pipeline_feeder_pts            | Points from feeder classics earlier in the campaign               |
| pipeline_trend                 | Slope of form across the spring campaign sequence                 |
| specialist_ratio               | % of total points from classics (specialist vs generalist)        |
| same_race_consistency          | Std dev of finishes in same classic (lower = more predictable)    |
| monument_podium_count          | Career monument podiums (Bayesian "gravity" prior)                |

### Tier 3: Experimental Features (A/B test individually)

From brainstorming — each tested in isolation to measure marginal impact:

| Feature                 | Hypothesis                                    | Risk                                        |
| ----------------------- | --------------------------------------------- | ------------------------------------------- |
| classic_glicko_mu/rd    | Elo-like rating from classic results only     | May overfit with sparse data                |
| type_specific_glicko    | Separate Glicko per classic type              | Even sparser, possibly too noisy            |
| cobble_affinity         | Performance specifically on cobbled races     | May duplicate classic_type features         |
| long_distance_affinity  | Performance in 250km+ races (MSR-specific)    | Very few qualifying races                   |
| team_classic_commitment | # of strong riders team sends to this classic | Hard to quantify "strong"                   |
| head_to_head_record     | Pairwise win rate vs other startlist riders   | Combinatorial explosion, sparse             |
| fantasy_price_prior     | GMV price as a feature (crowd wisdom)         | Circular if price derived from same signals |
| cross_discipline_cx     | CX racing history                             | Likely not in database                      |

---

## R6: Production Integration Points

**Decision**: Minimal-touch integration — add classic path to existing entry points

**Rationale**: The existing architecture already has clear extension points. Integration requires changes in 3 files:

1. **`ml/src/predict_sources.py` (line 135)**: Replace `return []` with delegation to `predict_classics.py`
2. **`ml/src/app.py` (line 378)**: Remove the 404 HTTPException for classics, call prediction
3. **`apps/api/src/infrastructure/ml/ml-scoring.adapter.ts`**: Ensure classic race type is sent to ML service and response is handled

The classic prediction pipeline returns a single score (not 4-source breakdown) since classics only have GC scoring. The API response format remains the same but with `mountain: 0, sprint: 0, stage: 0` and all value in the `gc` source.

**Alternatives considered**:

- New API endpoint for classics → rejected (unnecessary complexity, existing endpoint can handle it)
- Return 4-source breakdown for classics → rejected (classics don't have mountain/sprint/stage categories)

---

## R7: Model Architecture

**Decision**: Single regression model predicting total classic points (not 4-source decomposition)

**Rationale**: Classics only score GC points (position-based, top 10). There's no stage/mountain/sprint breakdown. A single model predicting `GC_CLASSIC` points is the natural architecture:

- **Input**: Classic-specific features for each rider in the startlist
- **Output**: Predicted total points (0-200 scale, matching GC_CLASSIC table)
- **Models to try**: Random Forest (baseline), LightGBM (likely better with sparse features)
- **Target transforms**: raw, sqrt, log1p (same as stage race benchmark)
- **No gate classifier needed**: Unlike stage races where a GC gate filters contenders, classics have a simpler scoring structure (top 10 score, rest get 0)

**Alternative considered**:

- Binary classifier (will rider finish top 10?) + regression (if yes, what position?) → possibly worth testing but starts with the simpler single-model approach
