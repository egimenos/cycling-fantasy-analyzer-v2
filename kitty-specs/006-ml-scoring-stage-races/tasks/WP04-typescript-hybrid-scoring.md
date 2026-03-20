---
work_package_id: WP04
title: TypeScript API — Hybrid Scoring Integration
lane: planned
dependencies:
  - WP01
  - WP03
subtasks:
  - T020
  - T021
  - T022
  - T023
  - T024
  - T025
  - T026
phase: Phase 3 - API Integration
assignee: ''
agent: ''
shell_pid: ''
review_status: ''
reviewed_by: ''
history:
  - timestamp: '2026-03-20T16:27:36Z'
    lane: planned
    agent: system
    shell_pid: ''
    action: Prompt generated via /spec-kitty.tasks
requirement_refs:
  - FR-003
  - FR-005
  - FR-006
  - FR-007
  - FR-008
  - FR-013
---

# Work Package Prompt: WP04 – TypeScript API — Hybrid Scoring Integration

## ⚠️ IMPORTANT: Review Feedback Status

- **Has review feedback?**: Check `review_status` field above.

---

## Review Feedback

_[Empty initially.]_

---

## Implementation Command

```bash
spec-kitty implement WP04 --base WP03
```

---

## Objectives & Success Criteria

- TypeScript API calls ML service for stage races and returns hybrid scores
- `AnalyzedRider` response includes `scoringMethod` and `mlPredictedScore` without breaking existing fields
- Cache flow works: first request → ML service call → cache write → second request → cache hit
- Graceful degradation: ML service down → rules-based only, no user-facing error
- Classic races remain rules-based only (ML service never called)

## Context & Constraints

- **DDD patterns**: New `MlScoringPort` (domain) + `MlScoringAdapter` (infrastructure). Follow existing port/adapter patterns.
- **Existing code**: Read `apps/api/src/application/analyze/analyze-price-list.use-case.ts` — this is the file you'll modify
- **Shared types**: `packages/shared-types/src/scoring.ts` defines `AnalyzedRider` — extend without breaking
- **ML_SERVICE_URL**: Environment variable, default `http://localhost:8000`
- **Constitution**: Domain layer must remain pure (no HTTP calls in domain). HTTP client is infrastructure.

## Subtasks & Detailed Guidance

### Subtask T020 – Create MlScoringPort (domain)

- **Purpose**: Abstract interface for ML prediction requests. Domain layer — no framework dependencies.
- **Steps**:
  1. Create `apps/api/src/domain/scoring/ml-scoring.port.ts`:

     ```typescript
     export const ML_SCORING_PORT = Symbol('MlScoringPort');

     export interface MlPrediction {
       readonly riderId: string;
       readonly predictedScore: number;
     }

     export interface MlScoringPort {
       predictRace(raceSlug: string, year: number): Promise<MlPrediction[] | null>;
       getModelVersion(): Promise<string | null>;
       isHealthy(): Promise<boolean>;
     }
     ```

  2. `predictRace` returns null if ML service is unavailable or race is not a stage race
  3. `getModelVersion` returns current model version for cache comparison
  4. `isHealthy` checks if ML service is running with loaded models

- **Files**: `apps/api/src/domain/scoring/ml-scoring.port.ts` (new, ~25 lines)
- **Parallel?**: Yes

### Subtask T021 – Create MlScoringAdapter (HTTP client)

- **Purpose**: Infrastructure adapter that calls the FastAPI ML service via HTTP.
- **Steps**:
  1. Create `apps/api/src/infrastructure/ml/ml-scoring.adapter.ts`
  2. Implement `MlScoringPort` interface:

     ```typescript
     @Injectable()
     export class MlScoringAdapter implements MlScoringPort {
       private readonly baseUrl: string;
       private readonly timeout = 5000; // 5 seconds

       constructor() {
         this.baseUrl = process.env.ML_SERVICE_URL ?? 'http://localhost:8000';
       }

       async predictRace(raceSlug: string, year: number): Promise<MlPrediction[] | null> {
         try {
           const response = await fetch(`${this.baseUrl}/predict`, {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ race_slug: raceSlug, year }),
             signal: AbortSignal.timeout(this.timeout),
           });
           if (!response.ok) return null;
           const data = await response.json();
           return data.predictions.map((p: any) => ({
             riderId: p.rider_id,
             predictedScore: p.predicted_score,
           }));
         } catch {
           return null; // ML service unavailable — fallback to rules
         }
       }

       async getModelVersion(): Promise<string | null> {
         try {
           const resp = await fetch(`${this.baseUrl}/health`, {
             signal: AbortSignal.timeout(2000),
           });
           const data = await resp.json();
           return data.model_version ?? null;
         } catch {
           return null;
         }
       }

       async isHealthy(): Promise<boolean> {
         try {
           const resp = await fetch(`${this.baseUrl}/health`, {
             signal: AbortSignal.timeout(2000),
           });
           const data = await resp.json();
           return data.status === 'healthy';
         } catch {
           return false;
         }
       }
     }
     ```

  3. Use native `fetch` (available in Node 18+). Check if the project uses `got` or another HTTP client — if so, use the same for consistency.
  4. All methods catch errors and return null/false — never throw

- **Files**: `apps/api/src/infrastructure/ml/ml-scoring.adapter.ts` (new, ~60 lines)
- **Parallel?**: Yes
- **Notes**: Check `apps/api/src/infrastructure/scraping/pcs-client.adapter.ts` for existing HTTP client patterns in this project

### Subtask T022 – Extend AnalyzedRider in shared-types

- **Purpose**: Add ML scoring fields to the API response type without breaking existing consumers.
- **Steps**:
  1. Edit `packages/shared-types/src/scoring.ts`
  2. Add to `AnalyzedRider` interface:
     ```typescript
     scoringMethod: 'rules' | 'hybrid';
     mlPredictedScore: number | null;
     ```
  3. Update the `ScoringMethod` type if needed (or create it)
  4. Verify: `make typecheck` passes — no downstream type errors
- **Files**: `packages/shared-types/src/scoring.ts` (modify)
- **Parallel?**: Yes
- **Notes**: All existing fields remain. New fields are additive. Frontend may need updates but that's a separate concern.

### Subtask T023 – Modify AnalyzePriceListUseCase for hybrid scoring

- **Purpose**: Core integration point. After computing rules-based scores, enrich with ML predictions for stage races.
- **Steps**:
  1. Edit `apps/api/src/application/analyze/analyze-price-list.use-case.ts`
  2. Inject `MlScoringPort` and `MlScoreRepositoryPort` via constructor:
     ```typescript
     constructor(
       // ... existing dependencies
       @Inject(ML_SCORING_PORT) private readonly mlScoring: MlScoringPort,
       @Inject(ML_SCORE_REPOSITORY_PORT) private readonly mlScoreRepo: MlScoreRepositoryPort,
     ) {}
     ```
  3. After existing scoring logic, add ML enrichment:

     ```typescript
     // After computing rules-based scores for each rider...
     let mlPredictions: Map<string, number> | null = null;

     if (raceType === RaceType.GRAND_TOUR || raceType === RaceType.MINI_TOUR) {
       // Check cache first
       const modelVersion = await this.mlScoring.getModelVersion();
       if (modelVersion) {
         const cached = await this.mlScoreRepo.findByRace(raceSlug, year, modelVersion);
         if (cached.length > 0) {
           mlPredictions = new Map(cached.map((s) => [s.riderId, s.predictedScore]));
         } else {
           // Cache miss — call ML service
           const predictions = await this.mlScoring.predictRace(raceSlug, year);
           if (predictions) {
             mlPredictions = new Map(predictions.map((p) => [p.riderId, p.predictedScore]));
           }
         }
       }
     }

     // Enrich each AnalyzedRider
     const enrichedRiders = analyzedRiders.map((rider) => ({
       ...rider,
       scoringMethod: mlPredictions ? ('hybrid' as const) : ('rules' as const),
       mlPredictedScore: mlPredictions?.get(rider.matchedRider?.id ?? '') ?? null,
     }));
     ```

  4. Return enrichedRiders instead of analyzedRiders
  5. **Critical**: Do NOT modify the rules-based scoring logic. Only ADD ml fields.

- **Files**: `apps/api/src/application/analyze/analyze-price-list.use-case.ts` (modify)
- **Notes**: The ML service handles cache writes internally. The TypeScript side only READS the cache. If cache is empty and ML service returns predictions, those are already cached by the ML service.

### Subtask T024 – Register MlScoringPort in DI

- **Purpose**: Wire up the port and adapter in NestJS dependency injection.
- **Steps**:
  1. Determine which module owns this registration. Options:
     - Add to `AnalyzeModule` (since the use case lives there)
     - Or create a new `MlModule` if cleaner separation is needed
  2. Register provider:
     ```typescript
     { provide: ML_SCORING_PORT, useClass: MlScoringAdapter }
     ```
  3. Ensure `ML_SCORE_REPOSITORY_PORT` is already available (registered in DatabaseModule from WP01)
  4. Import `DatabaseModule` if not already imported in the module that needs it
  5. Verify: `make build` succeeds, no circular dependencies
- **Files**: Module file (likely `apps/api/src/application/analyze/analyze.module.ts` or `app.module.ts`)

### Subtask T025 – Graceful degradation

- **Purpose**: ML service unavailability must never break the analysis flow.
- **Steps**:
  1. Verify that `MlScoringAdapter` methods return null/false on any error (timeout, connection refused, 500)
  2. In the use case, if `mlPredictions` is null → set `scoringMethod: 'rules'` and `mlPredictedScore: null`
  3. Add Logger.warn when ML service is unavailable:
     ```typescript
     if (!modelVersion) {
       this.logger.warn('ML service unavailable — falling back to rules-based scoring');
     }
     ```
  4. Test: stop ML service → analyze stage race → response should have `scoringMethod: 'rules'` with no errors
- **Files**: `apps/api/src/application/analyze/analyze-price-list.use-case.ts`

### Subtask T026 – Verify hybrid scoring end-to-end

- **Purpose**: Full integration test of the hybrid scoring flow.
- **Steps**:
  1. Start all services: `make db-up && make ml-up && make dev`
  2. Analyze a stage race (mini tour or grand tour) via API
  3. Verify response includes:
     - All existing fields (compositeScore, totalProjectedPts, categoryScores)
     - `scoringMethod: "hybrid"`
     - `mlPredictedScore` with a numeric value for each rider
  4. Analyze a classic race → verify `scoringMethod: "rules"` and `mlPredictedScore: null`
  5. Stop ML service → analyze stage race → verify `scoringMethod: "rules"` with no error
  6. Restart ML service → analyze same stage race → verify `scoringMethod: "hybrid"` (predictions served from cache)
- **Files**: No new files — validation step

## Risks & Mitigations

- **Breaking existing API responses**: `scoringMethod` and `mlPredictedScore` are new fields. Existing consumers ignore unknown fields (JSON is additive). But verify `make typecheck` passes.
- **Race condition**: Two concurrent requests for uncached race. Both call ML service. Both try to cache. The `ON CONFLICT DO NOTHING` in ml_scores handles this — second insert is silently ignored.
- **ML service timeout**: 5s timeout is generous. If feature extraction takes longer, the first prediction for a race with many riders might time out. Mitigation: increase timeout to 10s or optimize.

## Review Guidance

- **Critical**: Verify rules-based scoring is completely unchanged. `totalProjectedPts`, `categoryScores` must be identical with or without ML.
- Verify `scoringMethod` is "hybrid" for stage races with ML, "rules" for classics and fallback
- Verify graceful degradation: stop ML service → no errors in API response
- Verify DDD compliance: no HTTP calls in domain layer, only via infrastructure adapter

## Activity Log

- 2026-03-20T16:27:36Z – system – lane=planned – Prompt created.
