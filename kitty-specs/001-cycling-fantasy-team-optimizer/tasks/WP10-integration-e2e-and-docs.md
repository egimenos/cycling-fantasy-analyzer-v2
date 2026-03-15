---
work_package_id: WP10
title: Integration, E2E & Documentation
lane: planned
dependencies:
- WP04
- WP09
subtasks:
- T047
- T048
- T049
- T050
- T051
phase: Phase 6 - Polish
assignee: ''
agent: ''
shell_pid: ''
review_status: ''
reviewed_by: ''
history:
- timestamp: '2026-03-14T23:51:57Z'
  lane: planned
  agent: system
  shell_pid: ''
  action: Prompt generated via /spec-kitty.tasks
requirement_refs:
- FR-000
- FR-001
- FR-005
- FR-009
- FR-010
---

# WP10 — Integration, E2E & Documentation

## Review Feedback

_No review feedback yet._

---

## Objectives

1. Write comprehensive Playwright E2E tests that validate the complete user workflow from pasting a price list through optimization.
2. Create production-ready Docker configurations for the API, web frontend, and PostgreSQL database.
3. Produce a project README with quick start guide, development workflow, and architecture overview.
4. Document key architectural decisions in ADR format for future maintainability.
5. Execute a full smoke test to verify the system works end-to-end from a clean state.

---

## Context

This is the final work package that ties everything together. All backend features (scraping, scoring, matching, optimizing) and frontend features (rider list, optimizer, team builder) are complete. This WP ensures the system works as an integrated whole, can be deployed via Docker, and is well-documented for future development.

**Key references:**
- `plan.md` — Phase 6 polish and deployment requirements
- `spec.md` — E2E test scenarios, deployment requirements
- `contracts/api.md` — All API endpoint contracts for E2E validation
- `.kittify/memory/constitution.md` — Documentation standards, commit conventions

**Dependencies:** WP04 (scraping/seeding for test data), WP07 (optimizer API), WP09 (complete frontend). All features must be implemented before E2E tests can run against the full stack.

---

## Subtasks

### T047: Playwright E2E Tests

**Directory:** `apps/web/tests/e2e/`

**Step-by-step instructions:**

1. Install and configure Playwright:
   ```bash
   cd apps/web && pnpm add -D @playwright/test
   npx playwright install --with-deps chromium
   ```

2. Create `playwright.config.ts` in `apps/web/`:
   ```typescript
   import { defineConfig } from '@playwright/test';

   export default defineConfig({
     testDir: './tests/e2e',
     timeout: 60_000,
     retries: 1,
     use: {
       baseURL: 'http://localhost:3000',
       headless: true,
       screenshot: 'only-on-failure',
       trace: 'retain-on-failure',
     },
     webServer: [
       {
         command: 'docker compose -f docker/docker-compose.e2e.yml up -d',
         port: 3000,
         timeout: 120_000,
         reuseExistingServer: true,
       },
     ],
   });
   ```

3. Create test fixtures in `apps/web/tests/e2e/fixtures/`:
   - `valid-price-list.txt`: a known-good price list with 25+ riders that match the seeded DB data
   - `invalid-price-list.txt`: malformed text that should produce parse errors
   - `partial-match-list.txt`: mix of matchable and unmatchable riders
   - Seed data script: ensure the E2E database has known riders and race results pre-loaded (reference WP04 seed data)

4. Create `docker/docker-compose.e2e.yml`:
   - PostgreSQL with seeded test data (use a SQL dump or migration + seed script)
   - API service built and running
   - Web service built and running
   - Isolated network, ephemeral volumes (clean state for each test run)

5. Implement `apps/web/tests/e2e/full-workflow.spec.ts`:

   **Test 1: Analyze valid price list**
   ```typescript
   test('should analyze a valid price list and display rider table', async ({ page }) => {
     await page.goto('/');
     // Paste price list
     await page.getByRole('textbox', { name: /paste/i }).fill(validPriceList);
     // Select race type
     await page.getByRole('combobox', { name: /race type/i }).selectOption('grand_tour');
     // Set budget
     await page.getByRole('spinbutton', { name: /budget/i }).fill('2000');
     // Click analyze
     await page.getByRole('button', { name: /analyze/i }).click();
     // Wait for results
     await expect(page.getByText(/showing \d+ riders/i)).toBeVisible({ timeout: 30_000 });
     // Verify table has rows
     const rows = page.getByRole('row');
     await expect(rows).toHaveCount(/* header + data rows */);
     // Verify default sort is by score descending
     // (check first data row has highest score)
   });
   ```

   **Test 2: Optimize team**
   ```typescript
   test('should optimize and display team of 9 riders within budget', async ({ page }) => {
     // ... paste and analyze first (reuse helper)
     await page.getByRole('button', { name: /get optimal team/i }).click();
     await expect(page.getByText(/optimal team/i)).toBeVisible({ timeout: 30_000 });
     // Verify 9 riders in optimal team
     const teamRiders = page.locator('[data-testid="optimal-team-rider"]');
     await expect(teamRiders).toHaveCount(9);
     // Verify total cost <= budget
     const totalCostText = await page.getByTestId('total-cost').textContent();
     const totalCost = parseFloat(totalCostText?.replace(/[^0-9.]/g, '') ?? '0');
     expect(totalCost).toBeLessThanOrEqual(2000);
   });
   ```

   **Test 3: Lock riders and optimize**
   ```typescript
   test('should include locked riders in optimized team', async ({ page }) => {
     // ... paste and analyze first
     // Lock first two riders
     const lockButtons = page.getByTestId('lock-button');
     await lockButtons.nth(0).click();
     await lockButtons.nth(1).click();
     // Get names of locked riders
     const lockedName1 = await page.getByTestId('rider-name').nth(0).textContent();
     const lockedName2 = await page.getByTestId('rider-name').nth(1).textContent();
     // Optimize
     await page.getByRole('button', { name: /get optimal team/i }).click();
     await expect(page.getByText(/optimal team/i)).toBeVisible();
     // Verify locked riders are in the team
     const teamText = await page.getByTestId('optimal-team-card').textContent();
     expect(teamText).toContain(lockedName1);
     expect(teamText).toContain(lockedName2);
   });
   ```

   **Test 4: Manual team builder**
   ```typescript
   test('should allow manual team selection with budget tracking', async ({ page }) => {
     // ... paste and analyze first
     // Select 9 riders via checkboxes
     const checkboxes = page.getByRole('checkbox', { name: /select rider/i });
     for (let i = 0; i < 9; i++) {
       await checkboxes.nth(i).click();
     }
     // Verify budget counter updated
     await expect(page.getByTestId('budget-remaining')).toBeVisible();
     // Verify team complete indicator
     await expect(page.getByText(/team complete/i)).toBeVisible();
     // Verify projected score is shown
     await expect(page.getByTestId('total-projected-score')).toBeVisible();
   });
   ```

   **Test 5: Invalid input error handling**
   ```typescript
   test('should display error message for invalid price list', async ({ page }) => {
     await page.goto('/');
     await page.getByRole('textbox', { name: /paste/i }).fill('this is not a valid price list at all');
     await page.getByRole('spinbutton', { name: /budget/i }).fill('2000');
     await page.getByRole('button', { name: /analyze/i }).click();
     // Expect error message
     await expect(page.getByRole('alert')).toBeVisible({ timeout: 10_000 });
     await expect(page.getByRole('alert')).toContainText(/error|could not|invalid/i);
   });
   ```

6. Add helper functions for common setup:
   ```typescript
   async function analyzeValidPriceList(page: Page) {
     await page.goto('/');
     await page.getByRole('textbox', { name: /paste/i }).fill(validPriceList);
     await page.getByRole('combobox', { name: /race type/i }).selectOption('grand_tour');
     await page.getByRole('spinbutton', { name: /budget/i }).fill('2000');
     await page.getByRole('button', { name: /analyze/i }).click();
     await expect(page.getByText(/showing \d+ riders/i)).toBeVisible({ timeout: 30_000 });
   }
   ```

**Validation criteria:**
- All 5 tests pass against the Docker Compose E2E environment
- Tests run headlessly in CI
- Failure screenshots and traces are captured for debugging
- Tests complete within 3 minutes total
- Tests use seeded data (not live PCS scraping)

**Edge cases to test (optional, lower priority):**
- Browser back/forward navigation preserves state
- Refreshing the page clears analysis state (or restores from localStorage if implemented)
- Very long price list (200+ riders) does not timeout

---

### T048: Production Docker Configuration

**Files:**
- `docker/Dockerfile.api`
- `docker/Dockerfile.web`
- `docker/docker-compose.prod.yml`

**Step-by-step instructions:**

1. **`docker/Dockerfile.api`** — Multi-stage build for the NestJS API:
   ```dockerfile
   # Stage 1: Install dependencies
   FROM node:20-alpine AS deps
   WORKDIR /app
   RUN corepack enable && corepack prepare pnpm@latest --activate
   COPY pnpm-lock.yaml pnpm-workspace.yaml ./
   COPY apps/api/package.json apps/api/
   COPY packages/shared-types/package.json packages/shared-types/
   RUN pnpm install --frozen-lockfile --filter @cycling-analyzer/api...

   # Stage 2: Build
   FROM deps AS builder
   COPY apps/api/ apps/api/
   COPY packages/shared-types/ packages/shared-types/
   RUN pnpm --filter @cycling-analyzer/shared-types build
   RUN pnpm --filter @cycling-analyzer/api build

   # Stage 3: Production
   FROM node:20-alpine AS runner
   WORKDIR /app
   RUN addgroup -g 1001 -S appgroup && adduser -S appuser -u 1001 -G appgroup
   COPY --from=builder /app/apps/api/dist ./dist
   COPY --from=builder /app/apps/api/node_modules ./node_modules
   COPY --from=builder /app/apps/api/package.json ./
   USER appuser
   EXPOSE 3001
   ENV NODE_ENV=production
   CMD ["node", "dist/main.js"]
   ```

2. **`docker/Dockerfile.web`** — Multi-stage build for the React frontend:
   ```dockerfile
   # Stage 1: Install dependencies
   FROM node:20-alpine AS deps
   WORKDIR /app
   RUN corepack enable && corepack prepare pnpm@latest --activate
   COPY pnpm-lock.yaml pnpm-workspace.yaml ./
   COPY apps/web/package.json apps/web/
   COPY packages/shared-types/package.json packages/shared-types/
   RUN pnpm install --frozen-lockfile --filter @cycling-analyzer/web...

   # Stage 2: Build
   FROM deps AS builder
   COPY apps/web/ apps/web/
   COPY packages/shared-types/ packages/shared-types/
   ARG VITE_API_URL=http://localhost:3001
   ENV VITE_API_URL=$VITE_API_URL
   RUN pnpm --filter @cycling-analyzer/shared-types build
   RUN pnpm --filter @cycling-analyzer/web build

   # Stage 3: Production
   FROM node:20-alpine AS runner
   WORKDIR /app
   RUN addgroup -g 1001 -S appgroup && adduser -S appuser -u 1001 -G appgroup
   COPY --from=builder /app/apps/web/dist ./dist
   COPY --from=builder /app/apps/web/package.json ./
   USER appuser
   EXPOSE 3000
   ENV NODE_ENV=production
   CMD ["node", "dist/server.js"]
   ```

3. **`docker/docker-compose.prod.yml`**:
   ```yaml
   version: '3.8'
   services:
     postgres:
       image: postgres:16-alpine
       environment:
         POSTGRES_DB: cycling_analyzer
         POSTGRES_USER: cycling
         POSTGRES_PASSWORD: ${DB_PASSWORD:-changeme}
       volumes:
         - postgres_data:/var/lib/postgresql/data
       ports:
         - "5432:5432"
       healthcheck:
         test: ["CMD-SHELL", "pg_isready -U cycling -d cycling_analyzer"]
         interval: 10s
         timeout: 5s
         retries: 5
       restart: unless-stopped

     api:
       build:
         context: ..
         dockerfile: docker/Dockerfile.api
       environment:
         DATABASE_URL: postgresql://cycling:${DB_PASSWORD:-changeme}@postgres:5432/cycling_analyzer
         NODE_ENV: production
         FUZZY_MATCH_THRESHOLD: ${FUZZY_MATCH_THRESHOLD:--10000}
       ports:
         - "3001:3001"
       depends_on:
         postgres:
           condition: service_healthy
       healthcheck:
         test: ["CMD", "wget", "--spider", "-q", "http://localhost:3001/api/health"]
         interval: 30s
         timeout: 10s
         retries: 3
       restart: unless-stopped

     web:
       build:
         context: ..
         dockerfile: docker/Dockerfile.web
         args:
           VITE_API_URL: http://api:3001
       environment:
         NODE_ENV: production
       ports:
         - "3000:3000"
       depends_on:
         api:
           condition: service_healthy
       restart: unless-stopped

   volumes:
     postgres_data:
   ```

4. Create `.dockerignore` at project root:
   ```
   node_modules
   .git
   .env
   *.md
   dist
   coverage
   .turbo
   ```

**Validation criteria:**
- `docker compose -f docker/docker-compose.prod.yml build` completes without errors
- `docker compose -f docker/docker-compose.prod.yml up` starts all three services
- API health check passes at http://localhost:3001/api/health
- Web frontend loads at http://localhost:3000
- Frontend can communicate with API (CORS configured correctly)
- Images are reasonably sized (API < 200MB, Web < 150MB)

---

### T049: README.md

**File:** `README.md` (project root)

**Step-by-step instructions:**

1. Write the following sections:

   **Project Overview:**
   - One paragraph: what the project does (fantasy cycling team optimizer for Grandes miniVueltas)
   - Who it's for (fantasy cycling players who want data-driven team selection)
   - Core capabilities: scrapes race data, scores riders, fuzzy-matches price lists, optimizes teams via knapsack DP

   **Prerequisites:**
   - Node.js 20+
   - Docker and Docker Compose
   - pnpm 9+ (installed via corepack)
   - PostgreSQL 16+ (or use Docker)

   **Quick Start:**
   ```bash
   # Clone and install
   git clone <repo-url>
   cd cycling-analyzer-v2
   corepack enable
   pnpm install

   # Start database
   docker compose up -d postgres

   # Run migrations
   pnpm --filter @cycling-analyzer/api db:migrate

   # Start development servers
   pnpm dev
   ```

   **Development Workflow:**
   - `pnpm dev` — start all apps in development mode (Turborepo)
   - `pnpm build` — build all packages and apps
   - `pnpm test` — run all unit tests
   - `pnpm test:e2e` — run Playwright E2E tests
   - `pnpm lint` — run ESLint across all packages
   - `pnpm format` — run Prettier across all packages
   - `pnpm db:migrate` — run Drizzle migrations
   - `pnpm db:seed` — seed the database with sample data

   **Architecture Overview:**
   - Monorepo structure: apps/api (NestJS), apps/web (React + TanStack Start), packages/shared-types
   - Backend: DDD/hexagonal architecture with domain, application, infrastructure, and presentation layers
   - Frontend: Feature-Sliced Design with app, features, and shared layers
   - Link to `plan.md` for detailed architecture documentation

   **Production Deployment:**
   ```bash
   docker compose -f docker/docker-compose.prod.yml up -d
   ```

2. Keep it concise — under 150 lines. Link to other docs rather than duplicating content.

**Validation criteria:**
- README renders correctly on GitHub
- All commands in Quick Start actually work on a clean checkout
- Links to referenced documents are correct
- No broken markdown

---

### T050: Architecture Decision Records

**Directory:** `docs/adr/`

**Step-by-step instructions:**

Create 5 ADR files, each following this template:

```markdown
# ADR: [Title]

**Status:** Accepted
**Date:** 2026-03-15

## Context

[What is the issue we are addressing? What forces are at play?]

## Decision

[What is the change that we are proposing and/or doing?]

## Consequences

### Positive
- [Benefit 1]
- [Benefit 2]

### Negative
- [Tradeoff 1]
- [Tradeoff 2]

### Neutral
- [Observation]
```

1. **`2026-03-15-drizzle-orm-behind-repository-ports.md`**:
   - Context: Need an ORM for PostgreSQL that supports TypeScript and works well with DDD repository pattern
   - Decision: Use Drizzle ORM but keep it behind repository port interfaces so the domain layer never depends on it directly
   - Positive: Type-safe queries, easy migration generation, swappable persistence layer
   - Negative: Extra abstraction layer, repository boilerplate
   - Neutral: Drizzle is newer than Prisma but has strong TypeScript integration

2. **`2026-03-15-scoring-engine-as-pure-domain-logic.md`**:
   - Context: Scoring logic is the core business value and must be testable, auditable, and modifiable independently
   - Decision: Implement all scoring as pure functions in the domain layer with zero framework dependencies
   - Positive: 100% unit testable without mocks, easy to reason about, portable
   - Negative: Cannot access database or external services directly from scoring functions
   - Neutral: Follows functional core / imperative shell pattern

3. **`2026-03-15-two-scraper-strategies.md`**:
   - Context: ProCyclingStats may change HTML structure, block requests, or go down
   - Decision: Implement two scraper strategies (Cheerio HTML parser and fallback) behind a port interface with automatic health checking
   - Positive: Resilience against site changes, easy to add new scraper implementations
   - Negative: Maintenance burden of multiple scrapers, potential data inconsistency between strategies
   - Neutral: Only one scraper needs to work at any given time

4. **`2026-03-15-scraper-auto-health-system.md`**:
   - Context: Scrapers can break silently when target sites change their HTML structure
   - Decision: Implement an automatic health check system that validates scraper output against expected schemas and switches to fallback strategies when validation fails
   - Positive: Self-healing system, early detection of scraper failures, reduced manual monitoring
   - Negative: Health check adds complexity, false positives possible
   - Neutral: Health status is logged but not exposed to end users

5. **`2026-03-15-postgresql-everywhere.md`**:
   - Context: Need a database for rider data, race results, and potentially caching scraped data
   - Decision: Use PostgreSQL as the single database for all data storage needs (no Redis, no SQLite, no separate cache layer)
   - Positive: Single technology to manage, strong JSON support for flexible data, battle-tested reliability
   - Negative: No in-memory cache for hot data (acceptable at current scale)
   - Neutral: Can add Redis later if performance demands it

**Validation criteria:**
- Each ADR follows the Status/Context/Decision/Consequences template
- Consequences include both positive and negative tradeoffs (honest assessment)
- ADRs are written in past tense for decisions ("We decided" not "We will decide")
- Each ADR is self-contained and understandable without reading other documents

---

### T051: Final Smoke Test

**Files:**
- `scripts/smoke-test.sh`
- `docs/smoke-test-procedure.md` (optional, can be inline in script comments)

**Step-by-step instructions:**

1. Create `scripts/smoke-test.sh`:
   ```bash
   #!/usr/bin/env bash
   set -euo pipefail

   echo "=== Cycling Fantasy Optimizer — Smoke Test ==="
   echo ""

   # Step 1: Start Docker Compose
   echo "[1/6] Starting Docker Compose..."
   docker compose -f docker/docker-compose.prod.yml up -d --build --wait
   echo "  Services are up."

   # Step 2: Run migrations
   echo "[2/6] Running database migrations..."
   docker compose -f docker/docker-compose.prod.yml exec api node dist/migrate.js
   echo "  Migrations complete."

   # Step 3: Seed data (or trigger scrape)
   echo "[3/6] Seeding test data..."
   docker compose -f docker/docker-compose.prod.yml exec api node dist/seed.js
   echo "  Seed data loaded."

   # Step 4: Test analyze endpoint
   echo "[4/6] Testing POST /api/analyze..."
   ANALYZE_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3001/api/analyze \
     -H "Content-Type: application/json" \
     -d @scripts/fixtures/sample-price-list.json)
   ANALYZE_STATUS=$(echo "$ANALYZE_RESPONSE" | tail -1)
   ANALYZE_BODY=$(echo "$ANALYZE_RESPONSE" | head -n -1)

   if [ "$ANALYZE_STATUS" -ne 200 ]; then
     echo "  FAIL: /api/analyze returned status $ANALYZE_STATUS"
     echo "  Body: $ANALYZE_BODY"
     exit 1
   fi
   echo "  OK: /api/analyze returned 200"

   # Extract rider count
   RIDER_COUNT=$(echo "$ANALYZE_BODY" | jq '.totalMatched')
   echo "  Matched riders: $RIDER_COUNT"

   # Step 5: Test optimize endpoint
   echo "[5/6] Testing POST /api/optimize..."
   # Build optimize request from analyze response
   OPTIMIZE_REQUEST=$(echo "$ANALYZE_BODY" | jq '{
     riders: .riders,
     budget: 2000,
     mustInclude: [],
     mustExclude: []
   }')

   OPTIMIZE_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3001/api/optimize \
     -H "Content-Type: application/json" \
     -d "$OPTIMIZE_REQUEST")
   OPTIMIZE_STATUS=$(echo "$OPTIMIZE_RESPONSE" | tail -1)
   OPTIMIZE_BODY=$(echo "$OPTIMIZE_RESPONSE" | head -n -1)

   if [ "$OPTIMIZE_STATUS" -ne 200 ]; then
     echo "  FAIL: /api/optimize returned status $OPTIMIZE_STATUS"
     echo "  Body: $OPTIMIZE_BODY"
     exit 1
   fi
   echo "  OK: /api/optimize returned 200"

   # Verify team
   TEAM_SIZE=$(echo "$OPTIMIZE_BODY" | jq '.optimalTeam.riders | length')
   TOTAL_COST=$(echo "$OPTIMIZE_BODY" | jq '.optimalTeam.totalCostHillios')
   TOTAL_SCORE=$(echo "$OPTIMIZE_BODY" | jq '.optimalTeam.totalProjectedPts')
   echo "  Team size: $TEAM_SIZE"
   echo "  Total cost: ${TOTAL_COST}H"
   echo "  Total score: $TOTAL_SCORE pts"

   if [ "$TEAM_SIZE" -ne 9 ]; then
     echo "  FAIL: Expected 9 riders, got $TEAM_SIZE"
     exit 1
   fi

   # Step 6: Verify frontend loads
   echo "[6/6] Testing frontend..."
   FRONTEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000)
   if [ "$FRONTEND_STATUS" -ne 200 ]; then
     echo "  FAIL: Frontend returned status $FRONTEND_STATUS"
     exit 1
   fi
   echo "  OK: Frontend returned 200"

   echo ""
   echo "=== ALL SMOKE TESTS PASSED ==="
   echo ""

   # Cleanup
   echo "Stopping Docker Compose..."
   docker compose -f docker/docker-compose.prod.yml down
   echo "Done."
   ```

2. Create `scripts/fixtures/sample-price-list.json`:
   ```json
   {
     "rawText": "POGACAR Tadej\tUAE Team Emirates\t350\nVINGEGAARD Jonas\tVisma-Lease a Bike\t340\nEVENEPOEL Remco\tSoudal Quick-Step\t320\n...",
     "raceType": "grand_tour",
     "budget": 2000
   }
   ```
   (Include at least 15 riders in the fixture to ensure enough for a 9-rider team)

3. Make the script executable: `chmod +x scripts/smoke-test.sh`

**Validation criteria:**
- Script runs end-to-end without manual intervention
- All 6 steps pass (Docker up, migrate, seed, analyze, optimize, frontend)
- Optimal team has exactly 9 riders
- Total cost does not exceed budget
- Script cleans up Docker containers on completion
- Exit code is 0 on success, 1 on any failure

---

## Test Strategy

**E2E tests (Playwright):**
- 5 test scenarios covering the full user workflow
- Run against Docker Compose with seeded data
- Automated in CI pipeline
- Failure artifacts: screenshots and traces

**Smoke test:**
- Shell script for manual or CI execution
- Tests API endpoints directly with curl
- Validates system integration from database to frontend
- Run after every deployment

**Docker validation:**
- Build succeeds for all images
- Health checks pass for all services
- Services communicate correctly (web -> api -> postgres)
- Environment variables are properly passed

**Documentation validation:**
- README commands work on a clean checkout
- ADRs are complete and follow the template
- All internal links resolve to existing files

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| E2E tests are flaky due to timing issues | High | Medium | Use explicit waits with generous timeouts; retry once on failure; use seeded data not live APIs |
| Docker build takes too long in CI | Medium | Medium | Use multi-stage builds with layer caching; cache pnpm store; use BuildKit |
| Seeded data becomes stale or inconsistent with schema changes | Medium | High | Generate seed data from migrations; version seed fixtures alongside schema |
| Playwright browser installation fails in CI | Low | High | Pin Playwright version; cache browser binaries; use official Docker image for CI |
| Smoke test script assumes specific OS utilities (curl, jq) | Low | Low | Document prerequisites; use Docker-based runner if needed |

---

## Review Guidance

When reviewing this WP, verify the following:

1. **E2E test coverage**: Do the 5 tests cover all critical user paths? Are there any important flows missing (e.g., exclude a rider, change race type)?
2. **E2E test stability**: Run the tests 3 times in a row. Do they pass consistently? Are there timing-dependent assertions?
3. **Docker configuration**: Review Dockerfile layers for optimal caching. Verify non-root user is used. Check that no secrets are baked into images.
4. **Docker Compose health checks**: Verify all health checks actually validate service readiness (not just port availability).
5. **README accuracy**: Follow the Quick Start guide on a clean machine. Does every command work? Are prerequisites complete?
6. **ADR quality**: Are consequences honest about tradeoffs? Is the context sufficient for a new team member to understand the decision?
7. **Smoke test reliability**: Run the smoke test script. Does it clean up properly on failure (trap signals)? Does it provide clear error messages?
8. **Security**: No secrets in Docker images, no hardcoded credentials, `.env` files are in `.dockerignore` and `.gitignore`.

---

## Activity Log

| Timestamp | Action | Agent | Details |
|-----------|--------|-------|---------|
| 2026-03-14T23:51:57Z | Created | system | Prompt generated via /spec-kitty.tasks |
