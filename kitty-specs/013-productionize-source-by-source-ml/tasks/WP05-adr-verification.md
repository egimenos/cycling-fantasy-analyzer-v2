---
work_package_id: WP05
title: ADR & End-to-End Verification
lane: planned
dependencies: [WP04]
subtasks:
  - T020
  - T021
  - T022
phase: Phase 4 - Polish
assignee: ''
agent: ''
shell_pid: ''
review_status: ''
reviewed_by: ''
history:
  - timestamp: '2026-03-29T18:00:50Z'
    lane: planned
    agent: system
    shell_pid: ''
    action: Prompt generated via /spec-kitty.tasks
requirement_refs:
  - FR-007
  - FR-008
---

# Work Package Prompt: WP05 – ADR & End-to-End Verification

## Objectives & Success Criteria

- ADR documenting the switch from RF monolithic to source-by-source model
- model-baseline.md updated with production artifact paths
- Full pipeline verified: retrain → predict → API → frontend

## Context & Constraints

- **Constitution**: Scoring model changes require ADR in `docs/adr/`
- **ADR format**: `YYYY-MM-DD-title.md`
- **Model baseline**: `ml/docs/model-baseline.md`

**Implementation command**: `spec-kitty implement WP05 --base WP04`

## Subtasks & Detailed Guidance

### Subtask T020 – Write ADR for model architecture switch

**Purpose**: Document the decision to replace the RF monolithic model with source-by-source predictions. Required by project constitution.

**Steps**:

1. Create `docs/adr/2026-XX-XX-source-by-source-ml-model.md` with:
   - **Status**: Accepted
   - **Context**: The monolithic RF model predicted a single total score. Feature 012 research showed that decomposing into 4 sources (GC, stage, mountain, sprint) with specialized sub-models produces GT ρ=0.571 and team capture=59.4%. The breakdown also enables better user understanding of predictions.
   - **Decision**: Replace the single RF model with 9 sub-models (7 trained + 2 heuristic) organized by scoring source. Each source uses the architecture best suited to its data characteristics.
   - **Consequences**:
     - More model artifacts to manage (9 files + metadata.json vs 2 joblib files)
     - Retraining pipeline is more complex (6 cache-building steps + training)
     - Predictions include per-source breakdown (new capability)
     - Hot-reload must reload all artifacts atomically
   - **Alternatives rejected**:
     - Keep RF monolithic: poor interpretability, can't show breakdown
     - Single multi-output model: doesn't allow per-source architecture specialization
     - Neural network: insufficient training data for GTs (~2000 rider×race observations)

**Files**: `docs/adr/2026-XX-XX-source-by-source-ml-model.md` (new)
**Parallel**: Yes, can be done alongside T021.

### Subtask T021 – Update model-baseline.md

**Purpose**: Update the frozen baseline document with production-specific information.

**Steps**:

1. Update `ml/docs/model-baseline.md`:
   - Add section: "Production Artifacts" listing all joblib files and metadata.json
   - Update "Status" from "pending production integration" to "production (feature 013)"
   - Add "Deployment" section noting Docker sidecar setup
   - Verify all metrics are still accurate

**Files**: `ml/docs/model-baseline.md` (modify)
**Parallel**: Yes, alongside T020.

### Subtask T022 – End-to-end verification

**Purpose**: Verify the complete pipeline works from retraining to frontend display.

**Steps**:

1. Run `make retrain` — verify all artifacts produced
2. Run `make ml-restart` — verify ML service loads new models
3. POST to `/predict` with a known GT (e.g., Tour de France 2025):
   ```bash
   curl -X POST http://localhost:8000/predict \
     -H "Content-Type: application/json" \
     -d '{"race_slug": "tour-de-france", "year": 2025, "race_type": "grand_tour"}'
   ```
4. Verify response includes breakdown for each rider
5. Verify breakdown sums to predicted_score
6. Verify NestJS API returns breakdown when queried
7. Verify frontend displays ML breakdown for the GT
8. Verify a classic race still shows rules-based breakdown

**Files**: No new code — verification

## Risks & Mitigations

- None significant — documentation and verification work

## Review Guidance

- Verify ADR follows project convention (format, location)
- Verify model-baseline.md is accurate and complete
- Verify E2E test covers all 4 sources and both race types

## Activity Log

- 2026-03-29T18:00:50Z – system – lane=planned – Prompt created.
