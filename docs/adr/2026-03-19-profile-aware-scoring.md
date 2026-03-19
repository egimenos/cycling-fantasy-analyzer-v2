# ADR: Profile-Aware Scoring

**Date**: 2026-03-19
**Status**: Accepted

## Context

The scoring algorithm computes rider scores using position-based points weighted by temporal decay, cross-type relevance, and race class prestige. However, it treats all stage results equally regardless of terrain — a flat sprint stage win counts the same as a mountain summit finish.

With the Stage Profile Enrichment feature (002) complete, every historical stage result carries a parcours type (P1 flat through P5 mountain summit finish) and ITT/TTT flags. The system can also fetch the profile distribution of any target race from PCS. This data enables terrain-aware scoring.

## Decision

Add a **profile match weight** as a 4th multiplicative factor in the scoring formula:

```
points × temporalWeight × crossTypeWeight × raceClassWeight × profileWeight
```

### Profile Weight Formula

**Normalized proportional with floor**:

```
parcoursShare(Px) = targetRace.pxCount / targetRace.totalStages
maxParcoursShare  = max(parcoursShare(P1), ..., parcoursShare(P5))
profileWeight     = max(FLOOR, parcoursShare(Px) / maxParcoursShare)
```

- The dominant terrain profile in the target race maps to weight 1.0 (no penalty).
- Underrepresented profiles scale down proportionally.
- Floor of 0.25 prevents discarding any result entirely.

### ITT Handling

ITT results receive an additive bonus on top of their parcours weight:

```
ittRelevance = ittShare / maxParcoursShare
profileWeight = max(FLOOR, parcoursWeight + ITT_BONUS_FACTOR × ittRelevance)
```

Where `ITT_BONUS_FACTOR = 0.15`. This avoids double-counting while rewarding TT capability when the target race has ITT stages.

### Non-Stage Category Affinity

Classification results without individual parcours types use fixed affinity mappings:

- **Mountain classification** → weighted average of P4 + P5 shares
- **Sprint classification** → weighted average of P1 + P2 shares
- **GC classification** → neutral weight (1.0), as GC spans all terrain

### Backward Compatibility

When no profile distribution is provided (user has not entered a PCS URL), all profile weights default to 1.0. Scoring output is identical to the pre-feature algorithm.

### Configuration

Initial values defined in `scoring-weights.config.ts`:

- `PROFILE_WEIGHT_FLOOR = 0.25`
- `ITT_BONUS_FACTOR = 0.15`
- `CATEGORY_AFFINITY_MAP`: Mountain → [P4, P5], Sprint → [P1, P2], GC → null, Stage → null

These are initial estimates. Fine-tuning is expected via a future scoring benchmarking feature.

## Alternatives Considered

1. **Raw proportional** (weight = share directly): All weights would be < 1.0, shrinking every score. Rejected — requires renormalization of the entire scoring output.

2. **Binary boost/floor** (dominant profiles get boost, others get floor): Too coarse — loses the continuous terrain signal. A race with 6 mountain stages and 4 flat stages should differentiate between P1 and P2 results, not just "mountain vs not mountain".

3. **ITT as 6th profile type**: Creates two parallel weighting systems (parcours + ITT). Rejected for unnecessary complexity; the additive bonus approach is simpler and sufficient.

4. **Machine-learned weights**: Deferred — requires a scoring benchmarking/evaluation system first, which is planned as a separate feature.

## Consequences

- Scoring is now terrain-aware. Riders are better matched to target race terrain profiles.
- A sprinter's historical results on flat stages carry more weight when analyzing a flat race, and less weight for a mountain-heavy Grand Tour.
- Configuration values are initial estimates subject to iterative tuning.
- All scoring logic maintains 100% test coverage as required by the project constitution.
- The feature is fully backward compatible — existing API consumers are unaffected.
