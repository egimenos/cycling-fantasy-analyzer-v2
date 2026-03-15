---
work_package_id: WP07
title: Team Optimizer
lane: "doing"
dependencies: [WP06]
base_branch: 001-cycling-fantasy-team-optimizer-WP06
base_commit: eaafe057ccfc2a14bc494b3c478856334f84f8b6
created_at: '2026-03-15T23:27:54.207288+00:00'
subtasks:
- T033
- T034
- T035
- T036
- T037
phase: Phase 4 - Optimizer
assignee: ''
agent: "claude-opus"
shell_pid: "58363"
review_status: ''
reviewed_by: ''
history:
- timestamp: '2026-03-14T23:51:57Z'
  lane: planned
  agent: system
  shell_pid: ''
  action: Prompt generated via /spec-kitty.tasks
requirement_refs:
- FR-005
- FR-007
- FR-008
- FR-010
- FR-012
---

# WP07 — Team Optimizer

## Review Feedback

_No review feedback yet._

---

## Objectives

1. Implement a 0/1 Knapsack dynamic programming algorithm that selects the optimal team of exactly N riders within a budget constraint, maximizing total projected points.
2. Support must-include and must-exclude constraints that allow users to lock or ban specific riders before optimization.
3. Generate distinct alternative team selections so users can compare near-optimal options.
4. Expose the optimizer through a POST /api/optimize endpoint matching the API contract.
5. Achieve 100% unit test coverage on all optimization and constraint logic as mandated by the constitution.

---

## Context

The optimizer is the core value proposition of this application. After the analyze step (WP06) produces scored riders with prices, the optimizer finds the mathematically best team of 9 riders within the user's budget. This is a classic 0/1 Knapsack problem extended with a cardinality constraint (exactly 9 riders) and user-defined lock/exclude constraints.

**Key references:**
- `plan.md` — Phase 4 optimizer design and algorithmic approach
- `spec.md` — Optimizer requirements, constraint handling, alternative teams
- `contracts/api.md` — POST /api/optimize request/response shapes
- `.kittify/memory/constitution.md` — 100% coverage on scoring/optimization, no framework deps in domain

**CRITICAL:** The knapsack algorithm and all constraint logic must be pure domain functions with zero NestJS or infrastructure dependencies. The constitution mandates 100% test coverage on all optimization logic. This is non-negotiable.

---

## Subtasks

### T033: Knapsack DP Algorithm

**File:** `apps/api/src/domain/optimizer/knapsack.service.ts`

**Purpose:** Pure function implementing a 0/1 Knapsack with dual constraints: exactly `teamSize` riders and total cost within `budget`.

**Step-by-step instructions:**

1. Define input and output types:
   ```typescript
   interface ScoredRider {
     id: string;
     name: string;
     priceHillios: number;
     totalProjectedPts: number;
     scoreBreakdown: RiderScore;
   }

   interface TeamSelection {
     riders: ScoredRider[];
     totalCostHillios: number;
     totalProjectedPts: number;
     budgetRemaining: number;
     scoreBreakdown: Record<string, number>;
   }
   ```

2. Implement `findOptimalTeam(riders: ScoredRider[], budget: number, teamSize: number): TeamSelection`:
   - Validate inputs: riders.length >= teamSize, budget > 0, teamSize > 0
   - If fewer riders than teamSize: throw `InsufficientRidersError`
   - Discretize budget if needed (prices are in integer hillios, so budget is already discrete)

3. DP table construction:
   - Create 3D array: `dp[i][b][k]` where:
     - `i` = rider index (0 to riders.length)
     - `b` = remaining budget (0 to budget)
     - `k` = remaining slots (0 to teamSize)
   - `dp[i][b][k]` stores the maximum achievable points considering riders 0..i-1, with budget b and k slots remaining
   - Base case: `dp[*][*][0] = 0` (no more slots to fill)
   - Transition: for each rider i with price p and score s:
     - Skip: `dp[i+1][b][k] = dp[i][b][k]`
     - Include (if b >= p and k > 0): `dp[i+1][b-p][k-1] = max(dp[i+1][b-p][k-1], dp[i][b][k] + s)`
   - Note: to manage memory for large budgets, consider using a rolling 2D array (only keep current and previous rider index layers)

4. Backtracking to reconstruct the team:
   - Starting from `dp[n][budget][teamSize]`, trace back through the table
   - At each rider index, check if the rider was included by comparing `dp[i][b][k]` vs `dp[i-1][b][k]`
   - Collect included riders into the result array

5. Build and return the `TeamSelection`:
   - Sum `totalCostHillios` from selected riders
   - Sum `totalProjectedPts` from selected riders
   - Compute `budgetRemaining = budget - totalCostHillios`
   - Aggregate `scoreBreakdown` by summing each category across selected riders

6. Memory optimization (important for large inputs):
   - If budget values are large (e.g., 2000+ hillios), the 3D table can be enormous
   - Use space-optimized DP: only keep two layers (current and previous rider)
   - For backtracking with space optimization, use a separate decision tracking array or re-run forward pass
   - Alternative: if rider count is small (<50), the full 3D table fits in memory

**Validation criteria:**
- Given 10 riders with known prices and scores, returns the mathematically optimal 9
- Total cost never exceeds budget
- Exactly teamSize riders are selected
- If multiple teams tie on score, any valid optimal team is acceptable
- Performance: 50 riders, budget 2000, teamSize 9 completes in under 1 second

**Edge cases to test:**
- All riders cost 1, budget is teamSize — must pick top teamSize by score
- One rider costs the entire budget — cannot be selected if teamSize > 1
- All riders have identical scores — any valid team within budget is correct
- Budget exactly equals the cost of the optimal team — zero remaining budget

---

### T034: Must-Include / Must-Exclude Constraints

**File:** `apps/api/src/domain/optimizer/constraints.service.ts`

**Step-by-step instructions:**

1. Implement `applyConstraints(riders: ScoredRider[], mustInclude: string[], mustExclude: string[]): ConstraintResult`:
   ```typescript
   interface ConstraintResult {
     filteredRiders: ScoredRider[];
     lockedRiders: ScoredRider[];
     adjustedBudget: number;
     adjustedTeamSize: number;
   }
   ```

2. Processing logic:
   - Step 1: Remove all riders whose `id` is in `mustExclude` from the pool
   - Step 2: Extract riders whose `id` is in `mustInclude` from the pool into `lockedRiders`
   - Step 3: Compute `adjustedBudget = originalBudget - sum(lockedRiders.map(r => r.priceHillios))`
   - Step 4: Compute `adjustedTeamSize = originalTeamSize - lockedRiders.length`
   - Step 5: `filteredRiders` = remaining riders (neither excluded nor locked)

3. Validation and error cases:
   - If a rider ID is in both mustInclude and mustExclude: throw `ConflictingConstraintsError`
   - If mustInclude rider ID not found in riders array: throw `RiderNotFoundError` with the missing ID
   - If `adjustedBudget <= 0`: throw `BudgetExceededByLockedRidersError`
   - If `filteredRiders.length < adjustedTeamSize`: throw `InsufficientRidersError` with details
   - If `adjustedTeamSize <= 0`: the locked riders ARE the team — return early with them as the result

4. Error types: define custom error classes in `apps/api/src/domain/optimizer/errors.ts`:
   ```typescript
   class ConflictingConstraintsError extends Error { ... }
   class RiderNotFoundError extends Error { ... }
   class BudgetExceededByLockedRidersError extends Error { ... }
   class InsufficientRidersError extends Error { ... }
   ```

**Validation criteria:**
- mustExclude removes riders from the pool entirely
- mustInclude riders are always in the final team
- Budget is correctly reduced by locked rider costs
- Team size is correctly reduced by locked rider count
- All error conditions throw the correct custom error type

**Edge cases to test:**
- Empty mustInclude and mustExclude — returns original riders unchanged
- mustInclude all riders up to teamSize — no DP needed, return locked riders
- mustExclude all but fewer than teamSize riders — throws InsufficientRidersError
- mustInclude a rider that costs more than the entire budget — throws BudgetExceededError
- Duplicate IDs in mustInclude — deduplicate, process once

---

### T035: Alternative Team Generation

**File:** `apps/api/src/domain/optimizer/alternative-teams.service.ts`

**Step-by-step instructions:**

1. Implement `findAlternativeTeams(riders: ScoredRider[], budget: number, teamSize: number, optimalTeam: TeamSelection, count: number): TeamSelection[]`:

2. Algorithm:
   - For each rider `r` in `optimalTeam.riders`:
     - Create a filtered pool excluding `r`
     - Run `findOptimalTeam(filteredPool, budget, teamSize)`
     - Store the resulting TeamSelection
   - This produces up to `teamSize` candidate alternatives (one per excluded optimal rider)

3. Deduplication:
   - For each candidate team, create a canonical key: sort rider IDs alphabetically, join with ","
   - Compare against the optimal team's canonical key — skip if identical
   - Compare against previously added alternatives — skip duplicates
   - Use a Set<string> to track seen canonical keys

4. Sorting and limiting:
   - Sort remaining alternatives by `totalProjectedPts` descending
   - Return top `count` alternatives (default 4)

5. Handle edge case where no alternatives can be generated:
   - If rider pool is exactly teamSize, no alternatives exist — return empty array
   - If all alternatives are identical to optimal (unlikely but possible) — return empty array

**Validation criteria:**
- Alternative teams are distinct from the optimal team
- Alternative teams are distinct from each other
- Alternatives are sorted by score descending
- At most `count` alternatives are returned
- Each alternative respects the budget constraint

**Edge cases to test:**
- Exactly 9 riders in pool with teamSize 9 — no alternatives possible, return []
- 10 riders in pool — exactly 1 possible alternative
- All alternatives happen to be the same team — return just 1 after dedup
- count = 0 — return empty array

---

### T036: Optimize Use Case + Endpoint

**Use case file:** `apps/api/src/application/optimize/optimize-team.use-case.ts`
**Controller file:** `apps/api/src/presentation/optimize.controller.ts`

**Step-by-step instructions:**

1. Implement the use case:
   ```typescript
   @Injectable()
   class OptimizeTeamUseCase {
     execute(input: OptimizeInput): OptimizeResponse {
       // Step 1: Apply constraints
       const { filteredRiders, lockedRiders, adjustedBudget, adjustedTeamSize } =
         applyConstraints(input.riders, input.mustInclude, input.mustExclude);

       // Step 2: Run knapsack on filtered pool
       const dpResult = findOptimalTeam(filteredRiders, adjustedBudget, adjustedTeamSize);

       // Step 3: Merge locked riders into optimal team
       const optimalTeam = mergeLockedRiders(dpResult, lockedRiders, input.budget);

       // Step 4: Generate alternatives (using full pool minus excludes)
       const alternatives = findAlternativeTeams(
         [...filteredRiders, ...lockedRiders],
         input.budget, TEAM_SIZE, optimalTeam, 4
       );

       return { optimalTeam, alternativeTeams: alternatives };
     }
   }
   ```

2. Helper: `mergeLockedRiders(dpResult, lockedRiders, originalBudget)`:
   - Combine `lockedRiders` and `dpResult.riders` into one array
   - Recalculate totals against original budget (not adjusted)
   - Rebuild scoreBreakdown aggregation

3. Implement the controller:
   ```typescript
   @Controller('api')
   export class OptimizeController {
     constructor(private readonly optimizeUseCase: OptimizeTeamUseCase) {}

     @Post('optimize')
     optimize(@Body() dto: OptimizeRequestDto): OptimizeResponse {
       return this.optimizeUseCase.execute(dto);
     }
   }
   ```

4. Request DTO validation:
   - `riders`: array, non-empty, each element must have id, name, priceHillios, totalProjectedPts
   - `budget`: number, > 0
   - `mustInclude`: string array (can be empty)
   - `mustExclude`: string array (can be empty)

5. Error mapping in controller:
   - `InsufficientRidersError` -> 422
   - `BudgetExceededByLockedRidersError` -> 400
   - `ConflictingConstraintsError` -> 400
   - Validation errors -> 400
   - Unknown errors -> 500

**Validation criteria:**
- POST /api/optimize with valid input returns OptimizeResponse shape
- Locked riders always appear in optimalTeam
- Excluded riders never appear in any team
- Budget is never exceeded
- Response matches contracts/api.md

---

### T037: 100% Coverage Unit Tests

**Directory:** `apps/api/test/domain/optimizer/`

**Step-by-step instructions:**

1. Create `knapsack.service.spec.ts`:
   - Test: 10 riders, budget 2000, teamSize 9 — returns optimal 9 riders
   - Test: budget constraint is tight — total cost never exceeds budget
   - Test: all riders same price — picks top 9 by score
   - Test: one rider has extremely high score but costs too much — not selected if it breaks budget
   - Test: exactly 9 riders available — returns all 9 if within budget
   - Test: fewer than 9 riders — throws InsufficientRidersError
   - Test: budget 0 — throws error
   - Test: teamSize 0 — returns empty team (edge case)
   - Test: riders with 0 score — valid, just lowest priority
   - Test: performance with 50 riders — completes within 1 second

2. Create `constraints.service.spec.ts`:
   - Test: empty constraints — pass through unchanged
   - Test: mustInclude 2 riders — those riders in lockedRiders, budget/teamSize adjusted
   - Test: mustExclude 3 riders — those riders removed from filteredRiders
   - Test: mustInclude + mustExclude combined — both applied correctly
   - Test: conflicting rider ID in both — throws ConflictingConstraintsError
   - Test: mustInclude non-existent rider — throws RiderNotFoundError
   - Test: locked riders exceed budget — throws BudgetExceededError
   - Test: insufficient riders after constraints — throws InsufficientRidersError

3. Create `alternative-teams.service.spec.ts`:
   - Test: generates alternatives distinct from optimal
   - Test: alternatives are distinct from each other
   - Test: sorted by totalProjectedPts descending
   - Test: respects count limit
   - Test: exactly teamSize riders — returns empty array
   - Test: 10 riders — at most 1 alternative

4. Use test utility to generate rider fixtures:
   ```typescript
   function createRider(overrides: Partial<ScoredRider>): ScoredRider {
     return {
       id: randomUUID(),
       name: 'Test Rider',
       priceHillios: 100,
       totalProjectedPts: 50,
       scoreBreakdown: { gcPts: 10, stagePts: 10, mountainPts: 10, sprintPts: 10, dailyProjectedPts: 10, totalProjectedPts: 50 },
       ...overrides,
     };
   }
   ```

**Validation criteria:**
- `pnpm test -- --coverage` shows 100% line, branch, and function coverage for all files in `domain/optimizer/`
- No tests are skipped or pending
- Tests run in under 10 seconds total

---

## Test Strategy

**Unit tests (100% coverage required):**

All domain optimizer files must have 100% line, branch, and function coverage. This is a constitution requirement for scoring and optimization logic.

- `apps/api/test/domain/optimizer/knapsack.service.spec.ts` — algorithm correctness, edge cases, performance
- `apps/api/test/domain/optimizer/constraints.service.spec.ts` — all constraint combinations and error paths
- `apps/api/test/domain/optimizer/alternative-teams.service.spec.ts` — deduplication, sorting, count limiting
- `apps/api/test/domain/optimizer/errors.spec.ts` — custom error classes instantiate correctly

**Integration tests:**

- `apps/api/test/application/optimize/optimize-team.use-case.spec.ts` — use case orchestration with real domain services (no mocks for domain, mock for any I/O)
- `apps/api/test/presentation/optimize.controller.spec.ts` — HTTP-level tests via supertest

**Verification command:**
```bash
cd apps/api && pnpm test -- --coverage --collectCoverageFrom='src/domain/optimizer/**/*.ts'
```
Coverage must show 100% across all metrics.

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| DP table memory overflow for large budgets | Medium | High | Use space-optimized rolling DP; profile memory usage; set max budget limit |
| DP algorithm incorrect (off-by-one, wrong backtracking) | Medium | Critical | 100% coverage tests with mathematically verified expected outputs; compare against brute-force for small inputs |
| Alternative generation too slow (re-runs DP teamSize times) | Low | Medium | teamSize is 9, so max 9 DP runs; each is fast for <50 riders; add timeout guard |
| Floating point issues in score comparison | Low | Medium | Use integer arithmetic where possible; document rounding approach |

---

## Review Guidance

When reviewing this WP, verify the following:

1. **Algorithm correctness**: Manually trace the DP for a small input (5 riders, teamSize 3) and verify the result matches. Compare against brute-force enumeration.
2. **100% coverage**: Run `pnpm test -- --coverage` and verify all optimizer files show 100/100/100 on lines/branches/functions. No exceptions.
3. **Pure domain logic**: Verify zero imports from NestJS, Drizzle, or any infrastructure package in the `domain/optimizer/` directory. Only standard library imports allowed.
4. **Error handling**: Each custom error class is used, caught, and mapped correctly in the controller layer.
5. **Memory profile**: For the largest expected input (50 riders, budget 2500, teamSize 9), measure peak memory and execution time.
6. **Type safety**: No `any`, no `as` casts in optimizer code. All types flow correctly through the chain.

---

## Activity Log

| Timestamp | Action | Agent | Details |
|-----------|--------|-------|---------|
| 2026-03-14T23:51:57Z | Created | system | Prompt generated via /spec-kitty.tasks |
- 2026-03-15T23:27:54Z – claude-opus – shell_pid=45512 – lane=doing – Assigned agent via workflow command
- 2026-03-15T23:39:15Z – claude-opus – shell_pid=45512 – lane=for_review – Ready for review: 153 tests passing, 100% line coverage on optimizer domain
- 2026-03-15T23:39:47Z – claude-opus – shell_pid=58363 – lane=doing – Started review via workflow command
