# ADR: Classic Race ML Prediction Model

**Date**: 2026-04-02
**Status**: Accepted

## Context

The rules-based scoring system for one-day classic races achieved Spearman rho ~0.31. A first ML attempt (Feature 005, March 2026) using stage-race features achieved the same rho — no improvement. The stage-race model architecture (4-source decomposition) is fundamentally mismatched with classic races, which only have GC scoring.

## Decision

Build a completely independent ML pipeline for classics with:

- **Decoupled pipeline**: Separate files for feature extraction, prediction, benchmark, and training. Zero coupling with stage-race code.
- **Single regression model**: LightGBM predicting total GC_CLASSIC points (0-200), not the 4-source decomposition used for stage races.
- **Classic-specific features**: 51 features across 3 tiers — same-race history, type affinity, pipeline momentum, Glicko-2 from classics only, etc.
- **Classic type taxonomy**: Hardcoded lookup table classifying ~35 races by type (flemish, ardennes, cobbled, etc.) and seasonal pipeline groups.
- **Systematic A/B benchmarking**: Every feature addition tested via ablation against the same expanding-window CV protocol.

## Consequences

### Positive

- NDCG@10 improves by +8.4% (0.4079 → 0.4422) — ranks top riders significantly better for fantasy team selection
- P@10 improves by +3.2% — correctly identifies more top-10 finishers
- Rho equivalent to baseline (0.3130 vs 0.3124) — no regression on global ranking
- Zero risk to stage-race models — fully decoupled
- Weekly retraining integrated into `make retrain` pipeline

### Negative

- Additional model to maintain (~5MB model file, separate feature cache)
- Feature extraction slower for classics (~80s per year of data) — acceptable for weekly batch
- Rho improvement is not statistically significant — GO driven by NDCG/P@10, not rho

### Key Features (by impact)

1. **classic_glicko_mu**: Biggest single rho improvement (+0.006)
2. **type*affinity*{type}**: Biggest NDCG improvement (+4%)
3. **specialist_ratio**: Best P@5 improvement (+4%)
4. **pipeline_feeder_pts**: Seasonal campaign momentum signal
5. **prestige_pts_12m**: General rider quality (23% feature importance)
