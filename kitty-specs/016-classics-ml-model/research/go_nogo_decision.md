# GO/NO-GO Decision: Classics ML Model

**Date**: 2026-04-02
**Decision**: **GO** (with caveats)

## Metrics Comparison

| Metric | Rules Baseline | ML Best (LightGBM sqrt all_tier3) | Delta | Significant? |
|--------|:---:|:---:|:---:|:---:|
| Spearman rho | 0.3124 | **0.3130** | **+0.0006** | No (within CI) |
| NDCG@10 | 0.4079 | **0.4422** | **+0.0343** | Yes (+8.4%) |
| P@5 | 0.3180 | 0.3209 | +0.0029 | No |
| P@10 | 0.3644 | **0.3760** | **+0.0116** | Yes (+3.2%) |
| Capture @15 | 0.2574 | N/A | — | — |
| Overlap @15 | 0.1834 | N/A | — | — |

## Best Model Configurations

| Config | rho | NDCG@10 | P@5 | P@10 |
|--------|:---:|:---:|:---:|:---:|
| LightGBM sqrt all_tier3 | **0.3130** | 0.4422 | 0.3209 | **0.3760** |
| LightGBM sqrt all+glicko | 0.3115 | 0.4444 | **0.3432** | 0.3721 |
| RF sqrt all_tier3 | 0.3083 | **0.4519** | 0.3434 | 0.3674 |
| LightGBM raw all_tier3 | 0.3108 | 0.4476 | 0.3235 | 0.3749 |

**Selected model**: LightGBM sqrt all_tier3 (best rho + good P@10)

## Feature Ablation Summary

### Features with positive marginal impact (KEEP):
- **classic_glicko_mu/rd** (+0.006 rho): Biggest single improvement
- **type_affinity_{type}** (+4% NDCG): Classic-type specialization signal
- **specialist_ratio** (+4% P@5): Distinguishes classic specialists
- **pipeline_feeder_pts** (+0.0017 rho): Spring campaign momentum
- **age_type_delta** (+0.0025 rho): Type-specific aging curve

### Features with marginal/neutral impact (KEEP for combined benefit):
- **monument_podium_count**: Small rho lift
- **calendar_distance**: Small rho lift
- **win_style**: Marginal NDCG improvement
- **parcours_affinity**: Marginal

### Features to drop:
- **same_race_consistency**: Zero signal (noise)
- **team_classic_commitment**: Data not available (always NaN)

## GO Rationale

1. **NDCG@10 improves by +8.4%** — the ML model ranks TOP riders significantly better than rules-based. For a fantasy game where you pick a team of top riders, this is the metric that matters most.

2. **P@10 improves by +3.2%** — the model correctly identifies more of the actual top-10 finishers.

3. **Rho matches baseline** (0.3130 vs 0.3124) — the overall ranking correlation is equivalent. ML doesn't lose ground on the global metric while gaining substantially on top-rider metrics.

4. **Consistent across CV folds** — improvements are present in all 3 folds (2023, 2024, 2025), not driven by a single outlier year.

5. **Zero risk to stage-race models** — fully decoupled pipeline.

## Caveats

1. **Rho improvement is not statistically significant** — 0.3130 vs 0.3124 is within noise. The GO is driven by NDCG/P@10 improvements, not rho.

2. **Feature extraction is slower** (~80s per year) — acceptable for weekly retraining but not for real-time.

3. **Capture rate not computed** — fantasy price data for classics is sparse. Need to verify capture rate improvement in production.

## Next Steps

- **WP09**: Integrate into production (predict_sources.py, app.py, adapter.ts)
- **WP10**: Tests, documentation, ADR
- Save final model to `ml/models/classics/`
