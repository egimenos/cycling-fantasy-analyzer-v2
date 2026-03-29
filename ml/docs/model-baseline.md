# ML Model Baseline — Source-by-Source v1

> Reference document for the frozen production model.
> Update this document whenever the model architecture, features, or metrics change.
> Linked from feature specs via kitty-specs for self-healing.

**Last updated**: 2026-03-29
**Feature**: 012 — ML scoring source-by-source redesign
**Status**: Research complete, pending production integration (feature 013)

## Architecture Overview

The model predicts fantasy points decomposed into 4 independent scoring sources.
Each source is predicted separately and summed for the total.

```
predicted_total = gc_source + stage_source + mountain_source + sprint_source
```

Output format:

```json
{
  "predicted_total": 285,
  "breakdown": {
    "gc": 165,
    "stage": 80,
    "mountain": 12,
    "sprint": 28
  }
}
```

## Sub-Models

### GC Source (gc + gc_daily)

| Component | Architecture                         | Details                                            |
| --------- | ------------------------------------ | -------------------------------------------------- |
| Gate      | LogisticRegression (C=0.1, balanced) | P(top-20 GC finish)                                |
| Position  | Heuristic ranking                    | score = conservative_mu + min(form×10, 100)        |
| GC points | Scoring table lookup                 | `GC_GRAND_TOUR[rank]` or `GC_MINI_TOUR[rank]`      |
| GC daily  | Heuristic                            | `estimate_gc_daily_pts(rank, n_stages, race_type)` |

**Gate threshold**: P(top-20) >= 0.40
**Position assignment**: riders above gate ranked by heuristic score, assigned positions 1..N

**Gate features** (5):

- `gc_mu` — Glicko-2 GC rating (quality-weighted, delta-capped)
- `gc_mu_delta_12m` — 12-month GC rating trend
- `same_race_gc_best` — best GC pts (gc+gc_daily) in same race historically
- `age` — rider age in years
- `gc_pts_same_type` — GC pts in same race type (GT or mini) in 12m

### Stage Source (flat + hilly + mountain + ITT)

Predicts points per stage type, multiplied by number of stages of that type.

```
stage_total = sum(pred_pts_per_type × n_type_stages_race) for each type
```

| Stage Type | Architecture      | Model                         | Transform |
| ---------- | ----------------- | ----------------------------- | --------- |
| flat       | Direct regression | Ridge (α=1.0)                 | sqrt      |
| hilly      | Direct regression | Ridge (α=1.0)                 | sqrt      |
| mountain   | Direct regression | Ridge (α=1.0)                 | sqrt      |
| itt        | Gate + magnitude  | LogReg gate + Ridge magnitude | sqrt      |

**Config**: B (strength features in feature set, uniform sample weights)

**Target**: `pts_per_stage_ridden` — fantasy stage points / stages of that type actually finished by the rider (dnf=false)

**Features per type model** (16 per type):

Shared (3):

- `stage_mu` — Glicko-2 stage rating (secondary signal)
- `stage_rd` — Glicko-2 stage rating deviation
- `age`

Type-specific (8, where `{t}` = flat/hilly/mountain/itt):

- `{t}_pts_12m` — total stage pts from that type in 12m
- `{t}_pts_6m` — same, 6m window
- `{t}_strength_12m` — class-weighted pts (GT=1.0, UWT=0.7, Pro=0.4)
- `{t}_strength_6m` — same, 6m window
- `{t}_top10_rate_12m` — top-10 rate in stages of that type
- `{t}_top10_rate_6m` — same, 6m window
- `{t}_top10s_12m` — count of top-10 finishes
- `{t}_starts_12m` — stages of that type ridden

Profile (5):

- `pct_pts_p1p2` — fraction of stage pts from flat stages
- `pct_pts_p4p5` — fraction from mountain stages
- `pct_pts_p3` — fraction from hilly stages
- `itt_top10_rate` — ITT top-10 rate
- `stage_wins_flat`, `stage_wins_mountain` — win counts by type

### Mountain Source (mountain_final + mountain_pass)

| Sub-model      | Architecture                     | Details                           |
| -------------- | -------------------------------- | --------------------------------- |
| mountain_final | LogReg gate + P(score) × avg_pts | avg_pts = 27.0 (GT) / 26.7 (mini) |
| mountain_pass  | Ridge capture rate × supply      | sqrt transform on capture rate    |

**mountain_final features** (15):
`gc_mu`, `gc_rd`, `stage_mu`, `pct_pts_p4p5`, `stage_wins_mountain`,
`mountain_pts_12m`, `mountain_pts_6m`, `mountain_strength_12m`,
`mountain_top10_rate_12m`, `mountain_top10s_12m`,
`gc_mu_delta_12m`, `pts_gc_12m`, `sr_gc_top10_rate`,
`target_mountain_pct`, `age`

**mountain_pass features** (13):
`pct_pts_p4p5`, `stage_wins_mountain`,
`mountain_pts_12m`, `mountain_pts_6m`, `mountain_strength_12m`,
`mountain_top10_rate_12m`, `mountain_top10s_12m`, `mountain_starts_12m`,
`stage_mu`, `gc_mu`, `pts_stage_12m`, `target_mountain_pct`, `age`

**Supply estimation**: `estimated_mtn_supply = mean(prior editions of same race)`. If no prior editions, supply = 0 (skip prediction).

### Sprint Source (sprint_final + sprint_inter + regularidad)

| Sub-model        | Architecture                    | Details                                         |
| ---------------- | ------------------------------- | ----------------------------------------------- |
| sprint_final     | Heuristic contender + soft rank | Sprinter/allround/survival/route weighted score |
| sprint_inter+reg | Ridge capture rate × supply     | sqrt transform on capture rate                  |

**sprint_final heuristic**:

```
sprinter_score = flat_strength_12m×0.3 + flat_top10s_12m×5 + stage_wins_flat×15 + flat_top10_rate_12m×50
allround_score = hilly_pts_12m×0.2 + pts_stage_12m×0.05 + pct_pts_p3×30 + stage_mu×0.005
route_weight   = target_flat_pct (clipped 0.2-0.8)
score = route_weight × sprinter + (1-route_weight) × allround
score *= (0.3 + 0.7 × gt_completion_rate)
```

Ranked per race, mapped to points via soft decay table (pos 1=50, 2=35, ..., 10=0.2).

**sprint_inter features** (14):
`pct_pts_p1p2`, `stage_wins_flat`,
`flat_pts_12m`, `flat_pts_6m`, `flat_strength_12m`,
`flat_top10_rate_12m`, `flat_top10s_12m`,
`hilly_pts_12m`, `hilly_top10_rate_12m`, `pct_pts_p3`,
`stage_mu`, `pts_stage_12m`, `target_flat_pct`, `age`

**Supply estimation**: `estimated_spr_supply = mean(prior editions of same race)`.

## Metrics

### Integrated (all sources combined)

| Metric       | Grand Tour | Mini Tour |
| ------------ | ---------- | --------- |
| ρ total      | 0.571      | 0.422     |
| Team Capture | 59.4%      | 44.6%     |
| Team Overlap | 24.7%      | 21.2%     |

### Per Source

| Source   | GT ρ  | Mini ρ |
| -------- | ----- | ------ |
| GC       | 0.571 | 0.319  |
| Stage    | 0.568 | 0.525  |
| Mountain | 0.406 | 0.158  |
| Sprint   | 0.229 | 0.193  |

### Per Stage Type

| Type     | GT ρ_full | GT ρ_nz | Mini ρ_full |
| -------- | --------- | ------- | ----------- |
| flat     | 0.489     | 0.472   | 0.441       |
| hilly    | 0.404     | 0.437   | 0.389       |
| mountain | 0.590     | 0.560   | 0.436       |
| itt      | 0.609     | 0.507   | 0.552       |

### Per Secondary Sub-model

| Sub-model        | GT ρ_full | GT ρ_nz |
| ---------------- | --------- | ------- |
| mountain_final   | 0.186     | 0.400   |
| mountain_pass    | 0.410     | 0.335   |
| sprint_final     | 0.312     | 0.480   |
| sprint_inter+reg | 0.229     | 0.187   |

## Known Limitations

1. **Emergent riders**: riders without GT/stage race history (del Toro, Lipowitz) are structurally unpredictable
2. **Hilly ceiling**: 5/9 GTs have only 1 hilly stage → ρ~0.40 is informational limit
3. **Mountain final sample-thin**: 60 GT scoreables total in training, ordinal classification not viable
4. **Abandonment unpredictable**: DNF events (Roglič/Ayuso Giro 2025) destroy predictions
5. **Sprint final dual archetype**: sprinters + GC accumulators score via different mechanisms
6. **Supply estimation**: uses historical average, GT error <7% but mini error can be 20%+
7. **Classics NO-GO**: model only works for stage races (grand_tour, mini_tour)

## Evaluation Methodology

- **3-fold expanding window**: train ≤2022/test 2023, train ≤2023/test 2024, train ≤2024/test 2025
- **Per-race Spearman ρ**: rank correlation between predicted and actual points per race
- **Team Capture**: knapsack-optimal team (9 riders, 2000 hillios budget) actual pts / true optimal pts
- **Per-type metrics**: ρ_full (all riders) and ρ_nonzero (only riders who scored)

## Data Dependencies

| Data                    | Source                                                         | Update frequency      |
| ----------------------- | -------------------------------------------------------------- | --------------------- |
| Race results            | PCS scraper → `race_results` table                             | After each race       |
| Startlists              | PCS scraper → `startlist_entries` table                        | Days before race      |
| Rider prices            | GMV scraper → `rider_prices` table                             | Days before race      |
| Glicko ratings          | `ml/src/glicko2.py` → `rider_ratings` table                    | Recomputed on retrain |
| Feature cache           | `ml/src/cache_features.py` → `ml/cache/`                       | Rebuilt on retrain    |
| Stage targets           | `ml/src/stage_targets.py` → `ml/cache/stage_targets.parquet`   | Rebuilt on retrain    |
| Stage features          | `ml/src/stage_features.py` → `ml/cache/stage_features.parquet` | Rebuilt on retrain    |
| Classification features | `ml/src/classification_history_features.py` → `ml/cache/`      | Rebuilt on retrain    |

## Glicko-2 Configuration

- Initial: mu=1500, rd=350, sigma=0.06
- Prestige: TdF=2.6, Giro/Vuelta=2.2, UWT mini=1.0, Pro=0.4
- Quality-weighted sampling: pool=50, sample=25, gc_mu-weighted
- Delta cap: ±400 per race update
- Separate tracks: GC ratings and Stage ratings
