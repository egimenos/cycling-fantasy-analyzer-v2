# 012 — GC Research Summary

## Current Best Pipeline (frozen baseline)

```
Glicko-2:    quality-weighted (pool=50, sample=25, gc_mu-weighted)
             + UCI prestige (TdF=2.6, Giro/Vuelta=2.2, UWT mini=1.0, Pro=0.4)
             + delta cap ±400 per race (prevents provisional explosions)

Gate:        LogisticRegression (C=0.1, balanced)
             Features: gc_mu, gc_mu_delta_12m, same_race_gc_best,
                       strongest_teammate_gap, age, gc_pts_same_type

Position:    Heuristic score (no regression)
             score = conservative_mu + min(recent_gc_form * 10, 100)
             where conservative_mu = gc_mu - 1.0 * gc_rd

Ranking:     Riders with P(top20) >= 0.40 ranked by score within each race
```

## Key Metrics

Average GC ρ (pred rank vs actual GC position, top-20 finishers): **0.422**

## What Works

1. **Top-tier hierarchy is correct**: Pogačar and Vingegaard consistently #1-2 in Tours.
   Jorgenson no longer above Pogačar. Pidcock no longer exploding to gc_mu=4494.

2. **Conservative mu handles uncertainty well**: Vingegaard (gc_rd=150+) stays in
   predictions but is penalized for inactivity. No hard RD filter needed.

3. **Form as capped tie-breaker**: helps emergents (Onley, Lipowitz, Skjelmose)
   without overriding structural hierarchy (Pogačar stays above Yates).

## What Doesn't Work Yet

1. **Emergents with no recent GC form**: del Toro (Giro 2025 pos 2, form=0.0),
   Riccitello, Caruso — genuinely unpredictable from available signal.

2. **Mid-tier ordering (ranks 8-20)**: too many riders with similar cons_mu
   (~2000-2200) to discriminate. This is where startlist-relative features
   might help in a future iteration.

3. **Targeted campaigns**: Thomas Geraint (targets Giro specifically) is
   structurally hard to predict from general GC form.

## Research Journey (13 experiments)

| Problem                                           | Fix                                              | Experiment |
| ------------------------------------------------- | ------------------------------------------------ | ---------- |
| LGBM overfits with 62 GT samples                  | → LogReg gate + Ridge position                   | 01-04      |
| same_race_best contaminated with stage/sprint pts | → same_race_gc_best (gc+gc_daily only)           | 04         |
| Position regressor overweights secondary features | → gc_mu only in position                         | 05-06      |
| Uniform Glicko inflates by beating 140 gregarios  | → Neighborhood K=15 comparisons                  | 06-07      |
| K=15 penalizes competing in strong fields         | → Quality-weighted sampling (pool=50, sample=25) | 10         |
| gc_rd as hard filter removes Vingegaard           | → Conservative mu (gc_mu - λ·gc_rd)              | 11         |
| Provisional riders explode (Pidcock 1500→4494)    | → Delta cap ±400 per race                        | 12         |
| Form as Ridge feature overrides hierarchy         | → Capped bonus: min(form\*10, 100)               | 13         |

## Glicko-2 Changes Made (in code)

1. **UCI-aligned prestige**: `GT_PRESTIGE` dict with slug-specific Tour=2.6, Giro/Vuelta=2.2
2. **Quality-weighted sampling**: `process_gc_race()` uses top-50 pool, samples 25 opponents weighted by gc_mu
3. **Delta cap**: `update_rating()` caps |Δmu| at 400 per race update

## Features Created

1. **gc_mu_delta_12m**: 12-month gc_mu trend (in `benchmark_v8_startlist.py`)
2. **same_race_gc_best**: best GC pts (gc+gc_daily only) in same race history (in `features.py`)
3. **recent_gc_form_score**: computed on-the-fly, not yet in cache. Position-based scoring of
   recent GC results: GT top-3=5pts, GT top-10=2pts, UWT mini top-3=3pts, UWT mini top-10=1pt,
   Pro mini top-5=0.5pts. Last 6m × 1.0, 6-12m × 0.5.

## Next Steps

1. **Persist recent_gc_form_score** in features.py and cache (currently computed on-the-fly)
2. **Integrate into benchmark_canonical.py** as the new GC ordinal approach
3. **Startlist-relative features** for mid-tier ordering (gc_mu_rank_in_startlist, gc_mu_gap_to_best)
4. **Move to Stage source** — apply similar methodology to stage scoring
5. **Discrete mapping + team selection** — translate to fantasy points and evaluate team capture
