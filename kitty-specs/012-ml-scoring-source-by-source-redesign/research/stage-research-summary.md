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
   - Most GTs have 1-2 hilly stages → binary outcome, not continuous
   - Mixes archetypes: climbers (53%), sprinters (27%), puncheurs (14%)
   - Over-predicts GC riders who don't score (Pogačar TdF 2024: pred=14.4, actual=0)
   - Under-predicts explosive one-offs (Carapaz TdF 2024: pred=2.5, actual=40.0)

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

## Next Steps

1. **Hilly reformulation**: gate+magnitude or bucketed outcomes (win/podium/top10/none).
   Regression is wrong formulation when n_hilly_stages ≤ 2.
2. **Integrate with GC source**: combine stage + GC predictions for total fantasy score
3. **Mountain/Sprint secondary sources**: capture rate models
