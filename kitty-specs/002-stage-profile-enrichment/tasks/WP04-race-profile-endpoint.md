---
work_package_id: WP04
title: Race Profile Use Case & API Endpoint
lane: planned
dependencies:
  - WP02
base_branch: main
subtasks:
  - T017
  - T018
  - T019
  - T020
  - T021
  - T022
history:
  - timestamp: '2026-03-19T11:19:08Z'
    lane: planned
    agent: system
    shell_pid: ''
    action: Prompt generated via /spec-kitty.tasks
depends_on: [WP02, WP03]
estimated_prompt_size: ~450 lines
priority: P1
requirement_refs:
  - FR-006
  - FR-007
  - FR-008
  - FR-009
type: feature
---

# Work Package Prompt: WP04 – Race Profile Use Case & API Endpoint

## Objectives & Success Criteria

- Add `RaceProfileResponse`, `StageInfo`, `ProfileSummary` types to shared-types
- Create `FetchRaceProfileUseCase` that orchestrates profile fetch from a PCS URL
- Implement race type auto-detection and classic fallback to previous year
- Create `GET /api/race-profile?url=<pcs-url>` endpoint
- Tests pass for use case and controller
- `pnpm build` succeeds

## Context & Constraints

- **Spec**: `kitty-specs/002-stage-profile-enrichment/spec.md` — FR-006, FR-007, FR-007b, FR-008, FR-009
- **Contracts**: `kitty-specs/002-stage-profile-enrichment/contracts/api.md` — endpoint definition
- **Constitution**: DDD/Hexagonal — use case in application layer, controller in presentation layer, PCS client accessed via port
- **Existing patterns**: See `trigger-scrape.use-case.ts` for PCS client injection pattern. See `analyze.controller.ts` for REST endpoint pattern.
- **PCS client**: `PcsScraperPort` with `fetchPage(path: string): Promise<string>` — already handles throttling and retries.

**Implementation command**: `spec-kitty implement WP04 --base WP03` (or `--base WP02` if WP03 was merged first)

## Subtasks & Detailed Guidance

### Subtask T017 – Add shared types for race profile

- **Purpose**: Define response types shared between frontend and backend.
- **Files**: `packages/shared-types/src/api.ts`, `packages/shared-types/src/index.ts`
- **Steps**:
  1. Add to `packages/shared-types/src/api.ts`:

     ```typescript
     import { ParcoursType, RaceType } from './enums';

     export interface StageInfo {
       stageNumber: number;
       parcoursType: ParcoursType | null;
       isItt: boolean;
       isTtt: boolean;
       distanceKm: number | null;
       departure: string | null;
       arrival: string | null;
     }

     export interface ProfileSummary {
       p1Count: number;
       p2Count: number;
       p3Count: number;
       p4Count: number;
       p5Count: number;
       ittCount: number;
       tttCount: number;
       unknownCount: number;
     }

     export interface RaceProfileResponse {
       raceSlug: string;
       raceName: string;
       raceType: RaceType;
       year: number;
       totalStages: number;
       stages: StageInfo[];
       profileSummary: ProfileSummary;
     }
     ```

  2. Ensure exports in `index.ts`.

- **Parallel?**: Yes — can be done alongside T018-T020.

### Subtask T018 – Create FetchRaceProfileUseCase

- **Purpose**: Application-layer orchestration that fetches a race's profile distribution from PCS.
- **Files**: `apps/api/src/application/analyze/fetch-race-profile.use-case.ts` (NEW)
- **Steps**:
  1. Create the use case:

     ```typescript
     @Injectable()
     export class FetchRaceProfileUseCase {
       constructor(
         @Inject(PCS_SCRAPER_PORT)
         private readonly pcsClient: PcsScraperPort,
       ) {}

       async execute(pcsUrl: string): Promise<RaceProfileResponse> {
         const { raceSlug, year } = this.parseUrl(pcsUrl);
         const raceName = this.slugToName(raceSlug);

         // Try to fetch overview page first (works for stage races)
         const overviewHtml = await this.pcsClient.fetchPage(`race/${raceSlug}/${year}`);
         const stages = parseRaceOverview(overviewHtml);

         if (stages.length > 0) {
           // Stage race — determine if GT or mini-tour
           const raceType = this.detectStageRaceType(raceSlug);
           return this.buildResponse(raceSlug, raceName, raceType, year, stages);
         }

         // No stages → classic (one-day race)
         return this.fetchClassicProfile(raceSlug, year, raceName);
       }
     }
     ```

  2. Helper methods:
     - `parseUrl(url)`: Extract `raceSlug` and `year` from URL pattern `https://www.procyclingstats.com/race/{slug}/{year}`
     - `slugToName(slug)`: Convert slug to human-readable name (e.g., `tour-de-france` → `Tour De France`)
     - `detectStageRaceType(slug)`: Known GTs → `GRAND_TOUR`, else → `MINI_TOUR`
     - `buildResponse(...)`: Map `ParsedStageInfo[]` to `RaceProfileResponse` with computed `ProfileSummary`
     - `buildProfileSummary(stages)`: Count p1-p5, ITT, TTT, unknown occurrences

- **Notes**: Use the existing `PCS_SCRAPER_PORT` injection token. Follow the same DI pattern as `TriggerScrapeUseCase`.

### Subtask T019 – Implement classic fallback logic

- **Purpose**: Handle classics and future classics whose result page may not exist yet.
- **Files**: Same use case file from T018
- **Steps**:
  1. Add `fetchClassicProfile()` method:

     ```typescript
     private async fetchClassicProfile(
       raceSlug: string,
       year: number,
       raceName: string,
     ): Promise<RaceProfileResponse> {
       // Try current year result page
       try {
         const html = await this.pcsClient.fetchPage(`race/${raceSlug}/${year}/result`);
         const profile = extractProfile(html);
         if (profile.parcoursType) {
           return this.buildClassicResponse(raceSlug, raceName, year, profile);
         }
       } catch (error) {
         // Page doesn't exist — try fallback
       }

       // Try previous year as fallback (FR-007b)
       try {
         const html = await this.pcsClient.fetchPage(`race/${raceSlug}/${year - 1}/result`);
         const profile = extractProfile(html);
         if (profile.parcoursType) {
           return this.buildClassicResponse(raceSlug, raceName, year, profile);
         }
       } catch (error) {
         // Previous year also failed
       }

       // No profile data available
       throw new NotFoundException(
         `Could not determine profile for ${raceSlug} ${year} or ${year - 1}`,
       );
     }
     ```

  2. `buildClassicResponse()`: Create a `RaceProfileResponse` with `totalStages: 0`, empty `stages` array, and `profileSummary` with only the race-level parcours type counted.

- **Notes**: The fallback tries `year - 1` only. No deeper recursion needed.

### Subtask T020 – Create race-profile.controller.ts

- **Purpose**: REST controller exposing the race profile endpoint.
- **Files**: `apps/api/src/presentation/race-profile.controller.ts` (NEW)
- **Steps**:
  1. Create the controller:

     ```typescript
     @Controller('api')
     export class RaceProfileController {
       constructor(private readonly fetchRaceProfile: FetchRaceProfileUseCase) {}

       @Get('race-profile')
       async getRaceProfile(@Query('url') url: string): Promise<RaceProfileResponse> {
         if (!url || !url.includes('procyclingstats.com/race/')) {
           throw new BadRequestException('Invalid PCS race URL');
         }
         return this.fetchRaceProfile.execute(url);
       }
     }
     ```

  2. Error handling:
     - `400`: Missing or malformed URL
     - `404`: Race not found on PCS (from use case NotFoundException)
     - `502`: PCS unreachable (from PCS client errors — let NestJS exception filter handle)

### Subtask T021 – Register in NestJS module

- **Purpose**: Wire up the new controller and use case in the NestJS dependency injection container.
- **Files**: The appropriate NestJS module file (likely `apps/api/src/app.module.ts` or a feature-specific module)
- **Steps**:
  1. Add `RaceProfileController` to the module's `controllers` array.
  2. Add `FetchRaceProfileUseCase` to the module's `providers` array.
  3. Ensure `PCS_SCRAPER_PORT` is available (already provided by existing scraping module).
- **Notes**: Follow the existing module registration pattern.

### Subtask T022 – Write tests

- **Purpose**: Verify use case orchestration and controller HTTP behavior.
- **Files**: `apps/api/src/application/analyze/__tests__/fetch-race-profile.use-case.spec.ts`, `apps/api/src/presentation/__tests__/race-profile.controller.spec.ts`
- **Steps**:
  1. **Use case tests** (mock PCS client):
     - Stage race URL → returns profile with stages and summary
     - Classic URL → returns classic profile
     - Future classic → falls back to previous year
     - Invalid URL → throws BadRequestException
  2. **Controller tests**:
     - Valid URL returns 200 with profile data
     - Missing URL parameter returns 400
     - Non-PCS URL returns 400

## Risks & Mitigations

- Race type auto-detection for stage races (GT vs mini-tour) requires a known GT list. Mitigation: reuse existing `RACE_CATALOG` or a simple slug list.
- Classic fallback may fail if both current and previous year pages don't exist. Mitigation: throw clear 404 error.

## Review Guidance

- Verify URL parsing handles all PCS URL formats (with/without trailing slash, with/without `https://`).
- Verify classic fallback tries exactly one previous year.
- Verify profile summary counts match the stages array.
- Verify error responses follow existing API error patterns.

## Activity Log

- 2026-03-19T11:19:08Z – system – lane=planned – Prompt created.
