# Quickstart: Profile-Aware Scoring

**Feature**: 003-profile-aware-scoring

## Prerequisites

- Feature 002 (Stage Profile Enrichment) completed and merged
- Database seeded with profile data on all race results
- Monorepo dependencies installed (`npm install` from root)

## Key Files to Modify

### Domain Layer (apps/api/src/domain/scoring/)

1. **scoring-weights.config.ts** — Add `PROFILE_WEIGHT_FLOOR`, `ITT_BONUS_FACTOR`, `CATEGORY_AFFINITY_MAP`
2. **scoring.service.ts** — Add `computeProfileWeight()`, update `computeStageScore()` and `computeCategoryScore()` signatures

### New Domain File

3. **apps/api/src/domain/scoring/profile-distribution.ts** — `ProfileDistribution` value object with `fromProfileSummary()` factory

### Application Layer

4. **apps/api/src/application/analyze/analyze-price-list.use-case.ts** — Convert `ProfileSummary` to `ProfileDistribution`, pass to scoring functions

### Shared Types

5. **packages/shared-types/src/api.ts** — Add `profileSummary?` to `AnalyzeRequest`

### Presentation Layer

6. **apps/api/src/presentation/analyze.controller.ts** — Update `AnalyzeRequestDto` validation for optional `profileSummary`

### Frontend

7. **apps/web/src/features/rider-list/components/rider-input.tsx** — Include `profileSummary` from `useRaceProfile` in analyze request
8. **apps/web/src/shared/lib/api-client.ts** — No change needed (already sends full request object)

### Tests (100% coverage required for scoring)

9. **apps/api/src/domain/scoring/scoring.service.spec.ts** — Tests for profile-weighted scoring
10. **apps/api/src/domain/scoring/profile-distribution.spec.ts** — Tests for value object
11. **apps/api/src/domain/scoring/scoring-weights.config.spec.ts** — Tests for new config accessors

## Build & Test

```bash
# From monorepo root
npm run build          # Verify TypeScript compilation
npm run test           # Run all unit tests
npm run test:e2e       # Run Playwright E2E tests
```

## Architecture Notes

- `ProfileDistribution` is a pure domain value object — no framework dependencies
- `computeProfileWeight()` is a pure function — no side effects, fully testable
- Profile weights are multiplicative: `points × temporal × crossType × raceClass × profileWeight`
- No database changes required
