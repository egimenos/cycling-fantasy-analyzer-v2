# Quickstart: Breakout Potential Index (015)

## What This Feature Does

Adds a Breakout Potential Index (BPI) to the rider analysis flow. Each matched rider gets:

- A **BPI score** (0-100) indicating breakout likelihood
- An **upside P80** optimistic points estimate
- **Breakout flags** (EMERGING_TALENT, HOT_STREAK, DEEP_VALUE, etc.)
- A **signal breakdown** showing how the score was computed

## Prerequisites

No new dependencies or migrations needed. The `birth_date` column already exists in the `riders` table.

## Key Files to Understand

| File                                                              | Why                                                 |
| ----------------------------------------------------------------- | --------------------------------------------------- |
| `apps/api/src/application/analyze/analyze-price-list.use-case.ts` | Where BPI computation is called (step 5.5, post-ML) |
| `apps/api/src/domain/breakout/breakout.service.ts`                | The pure BPI computation function (NEW)             |
| `packages/shared-types/src/api.ts`                                | BreakoutResult type definition (NEW)                |
| `apps/web/src/features/rider-list/components/rider-table.tsx`     | BPI column, filters, tabbed expandable              |

## How BPI Works

```
For each matched rider:
  1. Compute 5 signals from existing data:
     - Trajectory (0-25): career slope × age factor
     - Recency (0-25): current season vs historical average
     - Ceiling (0-20): peak season vs prediction (age-gated)
     - Route Fit (0-15): rider profile × race profile
     - Variance (0-15): season-to-season CoV
  2. Sum signals → BPI index (0-100)
  3. Compute upside P80 (bootstrap if ≥3 seasons, heuristic if <3)
  4. Evaluate flag conditions → flags array
  5. Attach { index, upsideP80, flags, signals } to AnalyzedRider.breakout
```

## Testing

```bash
# Backend BPI unit tests (must be 100% coverage)
cd apps/api && npx jest --testPathPattern=breakout

# Frontend component tests
cd apps/web && npx vitest run --reporter=verbose
```

## Verification

1. Run `make dev`
2. Upload a price list via the web UI
3. Verify the BPI column appears with color coding (green/amber/gray)
4. Click a rider row → verify tabs (Performance | Breakout)
5. Click "Breakout" filter → only BPI ≥50 riders shown
6. Click "Value Picks" filter → BPI ≥50 AND price ≤125
