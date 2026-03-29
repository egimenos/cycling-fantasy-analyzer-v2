# 012 — Stage Source Research Summary

## Current Best Pipeline (frozen baseline, 2026-03-29)

```
Architecture:  type-split regression + gate
  flat:        Ridge + sqrt regression (direct)
  hilly:       Ridge + sqrt regression (direct) — weakest, see notes
  mountain:    Ridge + sqrt regression (direct)
  itt:         LogReg gate + Ridge magnitude

Weighting:   Config B (features only)
  Features:  strength scores use class weights (GT=1.0, UWT=0.7, Pro=0.4)
  Training:  uniform sample weights

Targets:     pts_per_stage_type, normalized by stages ridden (dnf==false)
Aggregation: pred_total = sum(pred_pts_per_type × n_type_stages_race)
```

## Key Metrics

| Type      | GT ρ_full | GT ρ_nz   | Mini ρ_full | Mini ρ_nz |
| --------- | --------- | --------- | ----------- | --------- |
| flat      | 0.489     | 0.472     | 0.441       | 0.457     |
| hilly     | 0.404     | 0.437     | 0.389       | 0.299     |
| mountain  | 0.590     | 0.560     | 0.436       | 0.362     |
| itt       | 0.609     | 0.507     | 0.552       | 0.469     |
| **TOTAL** | **0.601** | **0.562** | **0.525**   | **0.478** |

ITT gate: precision ~53-57%, recall ~59-70%.

## What Works

1. **Mountain is the strongest type**: Pogačar, Vingegaard, Evenepoel, Roglič
   consistently in top-3 predictions. GT ρ=0.59.

2. **Flat correctly identifies sprinters**: Philipsen, Pedersen, Milan, Groenewegen
   rise in flat-heavy races. GT ρ=0.49.

3. **ITT gate separates specialists**: Pogačar/Evenepoel #1-2 in TdF 2024/2025.
   Non-specialists correctly filtered.

4. **Route-conditioned aggregation works**: the same rider gets different
   predictions for Tour (flat-heavy) vs Vuelta (mountain-heavy).

5. **Ridge + sqrt sufficient**: RF/LGBM don't improve meaningfully.
   Signal is in type-specific features, not complex interactions.

## What Doesn't Work

1. **Hilly is structurally weak** (GT ρ=0.40, ρ_nz=0.44):
   - 5 of 9 GTs have only 1 hilly stage → target is a single-event outcome
   - Mixes archetypes: climbers (53%), sprinters (27%), puncheurs (14%)
   - Over-predicts GC riders who don't score (Pogačar TdF 2024: pred=14.4, actual=0)
   - Under-predicts explosive one-offs (Carapaz TdF 2024: pred=2.5, actual=40.0)
   - **Closed as modeling problem**: gate+magnitude, conditional, and soft gate
     all tested — none improves on baseline Ridge. The limit is informational
     (too few stages), not architectural. Keep Ridge, accept ρ~0.40 as ceiling.
     Treat hilly as useful but inherently noisy; do not over-interpret errors
     or optimize further. When n_hilly_stages ≤ 2, predictions are low-confidence.

2. **Emergents without history**: del Toro, Lipowitz, Steinhauser —
   same fundamental problem as GC.

3. **Breakout seasons**: Girmay TdF 2024 (pred=6.7, actual=19.4) — his flat
   dominance wasn't in the 12m history yet.

## Race-Class Weighting Ablation

2×2 design: strength features × class sample_weight. All 4 configs within
±0.006 on GT ρ_total. **Weighting is not a meaningful lever** for stage
prediction. Signal comes from type-specific features and route structure.

Frozen: Config B (features only, uniform sample weights).

## Features (40 type-specific + shared)

Per type × window (12m, 6m):

- `{type}_pts`: total stage pts from that type
- `{type}_strength`: class-weighted pts
- `{type}_top10_rate`: top-10 rate in that type
- `{type}_top10s`: count of top-10s
- `{type}_starts`: stages ridden of that type

Shared: `stage_mu`, `stage_rd`, `age`, profile specialization features.

## EDA Key Findings

- Zero rate (rider×race×type): flat 69.3%, hilly 79.9%, mountain 77.2%, itt 85.2%
- Only ITT crosses ≥85% threshold → gate architecture
- stages_ridden = dnf==false (clean binary, no edge cases)
- 97.6% parcours_type coverage, 0 TTTs, 32 unclassifiable stages (negligible)

## Secondary Sources (mountain + sprint) — frozen 2026-03-29

### Architecture

| Sub-model          | Architecture                        | GT ρ_full | GT ρ_nz   |
| ------------------ | ----------------------------------- | --------- | --------- |
| mountain_final     | LogReg gate + P(score) × avg_pts    | 0.186     | 0.400     |
| mountain_pass      | Ridge capture rate × supply         | 0.410     | 0.335     |
| sprint_final       | **Heuristic contender + soft rank** | **0.312** | **0.480** |
| sprint_inter + reg | Ridge capture rate × supply         | 0.229     | 0.187     |

### Sprint final heuristic (green jersey)

Heuristic contender score replaced LogReg gate (+0.091 GT ρ_full, +0.169 ρ_nz).
Combines three components weighted by route:

1. **Sprinter score**: flat_strength, flat_top10s, stage_wins_flat, flat_top10_rate
2. **All-round accumulator**: hilly_pts, pts_stage, pct_p3, stage_mu
3. **Survival bonus**: GT completion rate (0.5 default if no history)

Route modifier: `target_flat_pct` blends sprinter vs allround weight.
Soft rank mapping: top-ranked riders get points via decay table (not hard top-5).

### Mountain final: kept LogReg gate

Heuristic attempted but degraded ρ_nz (0.400 → 0.143). GC component overwhelms
KOM hunter signal. LogReg gate preserved for better within-scoreable ordering.
Would need separate GC-climber vs KOM-hunter scoring to improve — deferred.

### Key findings

- Classification history features (same_race_best, gt_top5_count) don't help.
  Redundant with existing pts/rate features.
- mountain_pass is the strongest secondary sub-model (GT ρ=0.41).
- Finals have ~60 GT scoreables total in training — sample-thin ceiling.
- Sprint final responds well to domain-structured heuristics; mountain doesn't (yet).

## Next Steps

1. **Integrate all sources**: GC + stage + mountain + sprint for total fantasy score
2. **Team selection under budget**: knapsack optimization with combined predictions
3. **Benchmark vs monolithic model**: compare source-by-source total vs single RF on actual_pts
