# ADR: Source-by-Source ML Model Architecture

**Date**: 2026-03-29
**Status**: Accepted
**Supersedes**: 2026-03-20-ml-scoring-python-addition.md (extends, does not replace)

## Context

The ML scoring service used a monolithic Random Forest model that predicted a single `predicted_score` per rider per race. Feature 012 research demonstrated that decomposing predictions into 4 independent scoring sources (GC, stage, mountain, sprint) with specialized sub-models produces better results:

- GT ρ_total: 0.571 (source-by-source) — comparable to monolithic
- GT team capture: 59.4% with correct fantasy prices
- Per-source breakdown enables user understanding of WHY a rider scores

The decomposition also revealed that different sources require different model architectures: linear regression works for stage predictions, logistic gates for classifications, and domain heuristics for sprint final (green jersey) and GC position ranking.

## Decision

Replace the single Random Forest model with 9 sub-models organized by scoring source:

| Component | Architecture | Artifact |
|-----------|-------------|----------|
| GC gate | LogisticRegression | gc_gate.joblib |
| GC position | Heuristic | metadata.json |
| Stage flat/hilly/mountain | Ridge regression | stage_{type}.joblib |
| Stage ITT | Gate + magnitude | stage_itt_gate.joblib + stage_itt_magnitude.joblib |
| Mountain final | LogisticRegression gate | mtn_final_gate.joblib |
| Mountain pass | Ridge capture rate | mtn_pass_capture.joblib |
| Sprint final | Heuristic contender score | metadata.json |
| Sprint inter+reg | Ridge capture rate | spr_inter_capture.joblib |

The `/predict` endpoint response is extended with a `breakdown` field:
```json
{
  "predicted_score": 285.0,
  "breakdown": {"gc": 165, "stage": 80, "mountain": 12, "sprint": 28}
}
```

## Consequences

### Positive

- Per-source breakdown gives users insight into prediction composition
- Each source uses the architecture best suited to its data characteristics
- Route-conditioned predictions: same rider gets different scores for different race profiles
- Heuristic components (GC position, sprint final) encode domain knowledge that ML can't learn from thin samples

### Negative

- More model artifacts to manage (9 joblib files + metadata.json vs 2 joblib files)
- Retraining pipeline is more complex (6 cache-building steps + training vs 2 steps)
- Hot-reload must reload all artifacts atomically on version change

### Neutral

- Prediction latency roughly the same (Ridge/LogReg are fast; data loading dominates)
- Existing hot-reload mechanism (model_version.txt) still works

## Alternatives Rejected

1. **Keep RF monolithic**: Simpler, but cannot produce per-source breakdown. Users only see a single number with no explanation.
2. **Single multi-output model**: Cannot specialize architecture per source (e.g., heuristic for sprint final vs regression for stage).
3. **Neural network**: Insufficient training data for Grand Tours (~2000 rider×race observations). Linear models perform equally well.
