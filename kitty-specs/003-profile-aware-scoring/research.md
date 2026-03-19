# Research: Profile-Aware Scoring

**Feature**: 003-profile-aware-scoring
**Date**: 2026-03-19

## R1: Profile Weight Formula

### Decision: Normalized Proportional with Floor

**Formula for stage results:**

```
parcoursShare(Px) = targetRace.pxCount / targetRace.totalStages
maxParcoursShare  = max(parcoursShare(P1), ..., parcoursShare(P5))
normalizedWeight  = parcoursShare(Px) / maxParcoursShare
profileWeight     = max(FLOOR, normalizedWeight)
```

**Rationale**: This ensures the dominant terrain profile in the target race maps to weight 1.0 (no boost, no penalty), while underrepresented profiles scale down proportionally. The floor prevents total discarding of mismatched results.

**Example — Tour de France 2025** (hypothetical: 4 P1, 2 P2, 3 P3, 4 P4, 6 P5, 2 ITT):

- maxParcoursShare = P5: 6/21 = 0.286
- P5 weight = 0.286 / 0.286 = 1.0
- P4 weight = (4/21) / 0.286 = 0.667
- P1 weight = (4/21) / 0.286 = 0.667
- P2 weight = (2/21) / 0.286 = 0.333
- P3 weight = (3/21) / 0.286 = 0.500

A pure sprinter (all P1 results) gets 0.667× on their stage results, while a climber (all P5) gets 1.0×. For a flat race, the inverse applies.

**Alternatives considered**:

- Raw proportional (weight = share): All weights < 1.0, shrinks every score. Rejected — would require renormalization.
- Boost + floor (binary dominant/non-dominant): Less granular, loses the continuous signal. Rejected — the terrain distribution carries useful nuance.

## R2: ITT/TTT Handling

### Decision: Blended Weight for ITT Results

ITT stages have two attributes: a parcours type (P1-P5) AND an ITT flag. A mountain ITT is both P5 and ITT. To avoid double-counting while still rewarding TT capability:

**Formula for ITT results:**

```
ittShare = targetRace.ittCount / targetRace.totalStages
ittRelevance = ittShare / maxParcoursShare  // normalized same way
parcoursWeight = normalizedWeight from R1

// Blend: parcours type dominates, ITT adds secondary signal
profileWeight = max(FLOOR, parcoursWeight + ITT_BONUS_FACTOR × ittRelevance)
// Capped at 1.0 + ITT_BONUS_FACTOR to prevent runaway
```

For non-ITT results on non-ITT stages: no ITT factor applied.

**TTT** follows the same pattern using `tttShare`.

**Rationale**: A mountain ITT stage result (P5 + ITT) already gets the P5 weight from parcours. The ITT bonus adds marginal relevance when the target race has ITTs. A flat ITT (P1 + ITT) gets the P1 weight plus ITT relevance — rewarding TT specialists even when the parcours weight is lower.

**Alternatives considered**:

- Treat ITT as a 6th profile type: Creates two parallel systems (parcours + ITT), complicates the formula. Rejected.
- Ignore ITT flag entirely: Loses signal about TT capability. Rejected — ITTs are decisive in GC races.

## R3: Non-Stage Category Affinity

### Decision: Fixed Affinity Mapping

For Mountain and Sprint classifications (which don't carry individual parcoursType), use a fixed mapping to compute a synthetic profile weight:

```
Mountain classification → weighted average of P4 + P5 shares
  mountainAffinity = (parcoursShare(P4) + parcoursShare(P5)) / (2 × maxParcoursShare)
  mountainProfileWeight = max(FLOOR, mountainAffinity)

Sprint classification → weighted average of P1 + P2 shares
  sprintAffinity = (parcoursShare(P1) + parcoursShare(P2)) / (2 × maxParcoursShare)
  sprintProfileWeight = max(FLOOR, sprintAffinity)

GC classification (stage races) → always 1.0 (terrain-agnostic)
```

**Rationale**: Mountain classification performance correlates with climbing terrain; sprint points are earned on flat/rolling stages. GC is terrain-agnostic by nature.

**Alternatives considered**:

- Skip non-stage categories entirely: Loses useful signal from classification results. Rejected.
- Use the most dominant profile as proxy: Too coarse — a race with 4 P4 and 4 P5 should weight Mountain higher than a race with 4 P4 and 1 P5. Rejected.

## R4: Classic Races (One-Day)

### Decision: Single Profile Type = 100% Distribution

A one-day Classic has a single parcoursType on its GC row. The profile distribution is trivially 100% of that type.

```
For a P3 Classic:
  P3 share = 1.0, all others = 0.0
  maxParcoursShare = 1.0
  P3 results: weight = 1.0
  All other profiles: weight = FLOOR
```

**Rationale**: Classics don't have stage breakdowns. The race-level parcours type is the only signal available.

## R5: Configuration Values

### Decision: Extend scoring-weights.config.ts

New configuration constants:

```
PROFILE_WEIGHT_FLOOR = 0.25      // No result weighted below 25%
ITT_BONUS_FACTOR = 0.15          // Max additional weight for ITT relevance
CATEGORY_AFFINITY_MAP = {
  MOUNTAIN: [P4, P5],
  SPRINT: [P1, P2],
  GC: null,                      // neutral (1.0)
  STAGE: null                    // uses actual parcoursType from result
}
```

These values are initial estimates. Fine-tuning is expected via a future benchmarking feature.

## R6: Data Flow Architecture

### Decision: Frontend Passes ProfileSummary in AnalyzeRequest

```
Frontend (rider-input.tsx)
  → already has ProfileSummary from useRaceProfile hook
  → includes it in AnalyzeRequest as optional field

Backend (AnalyzePriceListUseCase)
  → receives ProfileSummary
  → converts to ProfileDistribution value object (normalized shares)
  → passes to ScoringService functions

ScoringService (pure domain)
  → computeStageScore() receives ProfileDistribution
  → computeCategoryScore() receives ProfileDistribution
  → applies profileMatchWeight as 4th multiplicative factor
```

**Rationale**: Keeps domain functions pure (no HTTP concerns). Frontend already has the data. No extra backend fetching needed.

## R7: Backward Compatibility

### Decision: Null ProfileDistribution = All Weights 1.0

When no `profileSummary` is provided in the request:

- `ProfileDistribution` is null/undefined
- All `computeProfileWeight()` calls return 1.0
- Scoring output is identical to the pre-feature algorithm

This is enforced by unit tests comparing output with and without profile.
