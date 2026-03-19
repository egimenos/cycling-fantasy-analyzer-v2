# Feature Specification: Profile-Aware Scoring

**Feature Branch**: `003-profile-aware-scoring`
**Created**: 2026-03-19
**Status**: Draft
**Mission**: software-dev

## Overview

The current scoring algorithm computes rider scores using position-based points weighted by temporal decay, cross-type relevance, and race class prestige. However, it treats all stage results equally regardless of terrain — a flat sprint stage win counts the same as a mountain summit finish.

With the Stage Profile Enrichment feature (002) now complete, every historical stage result carries a parcours type (P1-P5) and ITT/TTT flags, and the system can fetch the profile distribution of any target race from PCS. This feature leverages that data to add a **profile match weight** to the scoring algorithm: when scoring a rider for a specific target race, historical results on stages whose terrain profile matches the target race's dominant profiles carry more weight.

**Depends on**: Feature 002 (Stage Profile Enrichment) — completed.

---

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Profile-Weighted Stage Scoring (Priority: P1)

When the user submits a rider list for analysis against a target race, the scoring algorithm uses the target race's profile distribution to weight each rider's historical stage results. A rider with strong results on mountain summit finishes (P5) scores higher when the target race has many P5 stages than when it is predominantly flat. The profile weight is an additional multiplicative factor alongside the existing temporal decay, cross-type weight, and race class prestige.

**Why this priority**: This is the core value proposition — making the scoring algorithm terrain-aware. Without this, profile data is captured but unused.

**Independent Test**: Score a known climber (e.g., Tadej Pogacar) against a mountain-heavy Grand Tour (e.g., Tour de France 2025) and against a flat Classic. Verify that their stage score component is meaningfully higher for the mountain race than for the flat race. Conversely, verify that a known sprinter scores higher for the flat race.

**Acceptance Scenarios**:

1. **Given** a target race with a known profile distribution (e.g., 8 P5 stages out of 21), **When** the system scores a rider's historical stage results, **Then** results on P5 stages receive a higher profile match weight than results on P1 stages.
2. **Given** a target race that is predominantly flat (majority P1/P2), **When** the system scores riders, **Then** riders with strong flat-stage results rank higher in the stage score component than riders whose results are concentrated on mountain stages.
3. **Given** a rider with historical results that have null parcoursType, **When** the system applies profile weighting, **Then** those results receive a neutral weight of 1.0 (no boost, no penalty).
4. **Given** no target race profile is available (user has not provided a PCS URL), **When** the system scores riders, **Then** the scoring algorithm behaves identically to the current algorithm (all profile weights default to 1.0).

---

### User Story 2 - ITT/TTT Profile Matching (Priority: P2)

When the target race includes Individual Time Trial (ITT) or Team Time Trial (TTT) stages, historical ITT/TTT results receive a boost proportional to the number of TT stages in the target race. This ensures that TT specialists are valued appropriately when the target race has significant TT content.

**Why this priority**: ITT stages often produce large time gaps and are decisive for GC. Missing this signal would leave a significant gap in the profile-aware scoring.

**Independent Test**: Score a known TT specialist against a race with 2 ITT stages vs a race with 0 ITT stages. Verify their ITT-related results receive a boost only when the target race has ITT stages.

**Acceptance Scenarios**:

1. **Given** a target race with 2 ITT stages out of 21, **When** the system scores a rider's historical ITT results, **Then** those results receive a profile weight proportional to the ITT share of the target race.
2. **Given** a target race with no ITT stages, **When** the system scores a rider's historical ITT results, **Then** those results receive a reduced profile weight (below 1.0), reflecting lower relevance.
3. **Given** a historical result flagged as TTT, **When** the system applies profile weighting, **Then** TTT results are treated with the same profile matching logic as ITT results using the TTT count from the target race.

---

### User Story 3 - Non-Stage Category Profile Inference (Priority: P3)

For non-stage result categories in stage races (Mountain classification, Sprint classification), the system infers a profile affinity: Mountain classification results are associated with climbing profiles (P4/P5), and Sprint classification results are associated with flat profiles (P1/P2). GC classification results in stage races receive a neutral profile weight since GC performance spans all terrain types.

**Why this priority**: While stage results are the primary beneficiary of profile weighting, ignoring classification results entirely would miss useful signal. A rider who consistently wins Mountain classifications has strong climbing affinity.

**Independent Test**: Score a rider who has Mountain classification wins but few individual stage wins against a mountain-heavy race. Verify their Mountain classification score component is boosted compared to scoring against a flat race.

**Acceptance Scenarios**:

1. **Given** a target race with many P4/P5 stages, **When** the system scores a rider's Mountain classification results, **Then** those results receive a boosted profile weight reflecting the race's climbing demand.
2. **Given** a target race with many P1/P2 stages, **When** the system scores a rider's Sprint classification results, **Then** those results receive a boosted profile weight reflecting the race's sprint opportunities.
3. **Given** a rider's GC classification results in stage races, **When** the system applies profile weighting, **Then** GC results always receive a neutral weight of 1.0 regardless of the target race profile.

---

### Edge Cases

- When a target race has no stages with profile data (all unknown), all profile weights default to 1.0 and scoring behaves as before.
- When a rider has results exclusively on profiles not present in the target race (e.g., only P1 results for a pure mountain race), those results receive a reduced weight but are not zeroed out — there is always a floor weight to avoid discarding legitimate results entirely.
- When the target race is a one-day Classic (no stage breakdown), the single race-level parcours type determines the profile distribution (100% that type).
- When a stage is both an ITT and a mountain stage (e.g., mountain ITT with P5), both the parcours type weight and the ITT weight apply. The system must not double-count by treating these as independent boosts — the parcours type takes precedence, with the ITT flag providing additional signal.

---

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The scoring algorithm MUST accept the target race's profile distribution as an input when computing rider scores. When no profile distribution is provided, all profile weights MUST default to 1.0 (backward compatible).
- **FR-002**: The scoring algorithm MUST compute a profile match weight for each historical stage result based on how well the result's parcours type matches the target race's profile distribution.
- **FR-003**: The profile match weight MUST be a multiplicative factor applied alongside the existing temporal decay, cross-type weight, and race class prestige weight in the scoring formula.
- **FR-004**: The profile distribution MUST be derived from the target race's `profileSummary` (P1-P5 counts, ITT/TTT counts) already available from the `/api/race-profile` endpoint.
- **FR-005**: Historical results with null parcoursType MUST receive a neutral profile weight of 1.0.
- **FR-006**: The profile weight MUST have a configurable floor value (minimum weight) to prevent any result from being entirely discarded due to profile mismatch.
- **FR-007**: ITT and TTT results MUST be weighted based on the proportion of ITT/TTT stages in the target race.
- **FR-008**: Mountain classification results MUST be associated with climbing profiles (P4/P5) for profile weighting purposes.
- **FR-009**: Sprint classification results MUST be associated with flat profiles (P1/P2) for profile weighting purposes.
- **FR-010**: GC classification results in stage races MUST receive a neutral profile weight of 1.0 regardless of target race profile.
- **FR-011**: The profile weighting configuration (weights per profile type, floor value) MUST be defined alongside the existing scoring weights configuration, following the same pattern.
- **FR-012**: The frontend MUST pass the target race's profile distribution to the scoring endpoint when available, so the backend can apply profile-aware scoring.

### Key Entities

- **ProfileDistribution**: A normalized representation of the target race's terrain composition. Contains the proportion (0.0-1.0) of each parcours type (P1-P5), ITT, and TTT relative to the total number of stages. Derived from the existing `profileSummary`.
- **ProfileMatchWeight**: A multiplicative factor (with a configurable floor) applied to each historical result based on how well its parcours type aligns with the target race's profile distribution. Part of the scoring weights configuration.

---

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: When scoring riders against a mountain-heavy race (>40% P4/P5 stages), riders with a majority of historical results on P4/P5 stages rank higher in the stage score component than riders with equal total stage points but concentrated on P1 stages.
- **SC-002**: When scoring riders against a flat race (>50% P1/P2 stages), the opposite ranking shift occurs — flat-stage specialists rank higher.
- **SC-003**: When no target race profile is provided, scoring results are identical to the current algorithm output (zero regression).
- **SC-004**: The profile weight floor ensures that no rider's historical result contributes less than the configured minimum weight (e.g., 0.2) regardless of profile mismatch.
- **SC-005**: Scoring computation time remains under 500ms per rider pool (no significant performance regression from adding profile weighting).

---

## Assumptions

- The profile distribution of the target race is available via the existing `/api/race-profile` endpoint and `profileSummary` response. No new scraping or data capture is needed.
- All historical stage results in the database already have parcoursType populated (confirmed by user — feature 002 backfilled all data).
- The profile weight is a simple proportional factor based on profile distribution shares, not a machine-learned model. Fine-tuning the exact weight values is expected to happen iteratively (potentially aided by a future benchmarking feature).
- One-day Classics have a single parcours type that represents 100% of the race profile. The profile match weight for a Classic is binary: match or floor.
- The existing scoring weights configuration pattern (`scoring-weights.config.ts`) is extended with profile-related weights. No new configuration infrastructure is needed.

---

## Clarifications

### Session 2026-03-19

- Q: Should profile weighting be a new multiplicative factor or replace an existing one? → A: New multiplicative factor alongside temporal, cross-type, and race class weights.
- Q: What happens when there's no target race profile? → A: All profile weights default to 1.0. Scoring is identical to the current algorithm.
- Q: Are historical results already backfilled with profile data? → A: Yes, feature 002 backfilled all existing data.
- Q: Should the benchmarking/evaluation system be part of this feature? → A: No. Systematic scoring evaluation is a separate feature to be specified independently.
- Q: How should Mountain/Sprint classifications be handled? → A: Infer profile affinity — Mountain → P4/P5, Sprint → P1/P2, GC → neutral (1.0).
