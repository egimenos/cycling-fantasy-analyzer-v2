---
work_package_id: WP03
title: Backend Use Cases & Controller
lane: planned
dependencies:
- WP01
- WP02
subtasks:
- T009
- T010
- T011
- T012
- T013
- T014
- T015
phase: Phase 1 - Backend Logic
assignee: ''
agent: ''
shell_pid: ''
review_status: ''
reviewed_by: ''
history:
- timestamp: '2026-04-04T21:24:32Z'
  lane: planned
  agent: system
  shell_pid: ''
  action: Prompt generated via /spec-kitty.tasks
requirement_refs:
- FR-001
- FR-002
- FR-004
- FR-006
- FR-007
- FR-008
---

# Work Package Prompt: WP03 – Backend Use Cases & Controller

## Implement Command

```bash
spec-kitty implement WP03 --base WP02
```

## Objectives & Success Criteria

- `GET /api/races` returns distinct races from DB, filtered by year (≥2024 default) and optionally by race type.
- `GET /api/gmv-match?raceSlug=X&year=Y` fuzzy-matches a race against cached GMV posts and returns imported riders if matched.
- `GET /api/race-profile?raceSlug=X&year=Y` works alongside the existing URL-based endpoint.
- Fuzzy matching correctly handles cross-language race names via alias map.
- All use cases follow existing DDD patterns (Injectable, port injection, execute method).
- `make lint` and `make test` pass.

## Context & Constraints

- **Contracts**: `kitty-specs/018-race-selector-auto-import/contracts/get-races.md` and `contracts/gmv-auto-import.md`
- **Research**: `kitty-specs/018-race-selector-auto-import/research.md` (R2: Fuzzy matching, R4: Race catalog, R5: Profile extension, R7: Alias map)
- **Existing use case patterns**: `apps/api/src/application/analyze/fetch-race-profile.use-case.ts`, `import-price-list.use-case.ts`
- **Existing controller patterns**: `apps/api/src/presentation/race-profile.controller.ts`, `analyze.controller.ts`
- **Module wiring**: `apps/api/src/application/analyze/analyze.module.ts`
- **From WP01**: `RaceResultRepositoryPort` with filter support, shared DTOs
- **From WP02**: `GmvPostCacheService`, `GmvModule`

## Subtasks & Detailed Guidance

### Subtask T009 – Create ListRacesUseCase

- **Purpose**: Query the database for distinct races, optionally filtered by year and race type.
- **Files**: `apps/api/src/application/analyze/list-races.use-case.ts` (new file)
- **Steps**:
  1. Create the use case:
     ```typescript
     import { Inject, Injectable } from '@nestjs/common';
     import {
       RACE_RESULT_REPOSITORY_PORT,
       RaceResultRepositoryPort,
     } from '../../domain/race-result/race-result.repository.port';
     import { RaceType } from '@cycling-analyzer/shared-types';

     export interface ListRacesInput {
       minYear?: number;
       raceType?: RaceType;
     }

     @Injectable()
     export class ListRacesUseCase {
       constructor(
         @Inject(RACE_RESULT_REPOSITORY_PORT)
         private readonly raceResultRepo: RaceResultRepositoryPort,
       ) {}

       async execute(input: ListRacesInput = {}) {
         const minYear = input.minYear ?? 2024;
         return {
           races: await this.raceResultRepo.findDistinctRacesWithDate({
             minYear,
             raceType: input.raceType,
           }),
         };
       }
     }
     ```
  2. Default `minYear` to 2024 in the use case (not the controller) — this is a business rule.
- **Parallel?**: No — needed by T014 (controller).

### Subtask T010 – Create race name alias map

- **Purpose**: Handle cross-language race name mismatches between PCS slugs and GMV post titles (e.g., "ronde-van-vlaanderen" in PCS vs "Tour de Flandes" in GMV).
- **Files**: `apps/api/src/application/analyze/race-name-aliases.ts` (new file)
- **Steps**:
  1. Create the alias map:
     ```typescript
     /**
      * Maps PCS race slugs to alternative search terms for GMV fuzzy matching.
      * Only needed for races where the PCS slug language differs from the GMV post title language.
      */
     export const RACE_NAME_ALIASES: Record<string, string[]> = {
       'ronde-van-vlaanderen': ['Tour de Flandes', 'Flandes'],
       'giro-d-italia': ['Giro de Italia'],
       'vuelta-a-espana': ['La Vuelta', 'Vuelta a España'],
       'tour-de-france': ['Tour de Francia'],
       'liege-bastogne-liege': ['Lieja-Bastoña-Lieja', 'Lieja Bastona Lieja'],
       'il-lombardia': ['Lombardia', 'Il Lombardia'],
       'milano-sanremo': ['Milan-San Remo', 'Milan San Remo'],
       'paris-roubaix': ['Paris-Roubaix', 'Paris Roubaix'],
       'amstel-gold-race': ['Amstel Gold Race'],
       'la-fleche-wallonne': ['Flecha Valona', 'Fleche Wallonne'],
     };

     export function getSearchTerms(raceSlug: string, raceName: string): string[] {
       const aliases = RACE_NAME_ALIASES[raceSlug] ?? [];
       return [raceName, ...aliases];
     }
     ```
  2. The aliases are used by the fuzzy matching function — if direct name match fails, try each alias.
- **Parallel?**: Yes — pure data, no dependencies on other subtasks.
- **Notes**: This list will grow over time as new mismatches are discovered. Keep it alphabetically sorted for maintainability.

### Subtask T011 – Implement fuzzy matching utility

- **Purpose**: Match a race name against GMV post titles using normalized token overlap.
- **Files**: `apps/api/src/application/analyze/fuzzy-match-gmv.ts` (new file)
- **Steps**:
  1. Create the utility:
     ```typescript
     import { GmvPost } from '../../domain/gmv/gmv-post';
     import { getSearchTerms } from './race-name-aliases';

     const CONFIDENCE_THRESHOLD = 0.7;

     export interface GmvFuzzyMatchResult {
       post: GmvPost;
       confidence: number;
     }

     export function fuzzyMatchGmvPost(
       raceSlug: string,
       raceName: string,
       year: number,
       posts: GmvPost[],
     ): GmvFuzzyMatchResult | null {
       const searchTerms = getSearchTerms(raceSlug, raceName);
       let bestMatch: GmvFuzzyMatchResult | null = null;

       for (const term of searchTerms) {
         for (const post of posts) {
           const confidence = computeTokenOverlap(term, year, post.title);
           if (confidence >= CONFIDENCE_THRESHOLD && (!bestMatch || confidence > bestMatch.confidence)) {
             bestMatch = { post, confidence };
           }
         }
       }

       return bestMatch;
     }

     function computeTokenOverlap(searchTerm: string, year: number, postTitle: string): number {
       const searchTokens = tokenize(stripYear(searchTerm, year));
       const titleTokens = tokenize(stripYear(postTitle, year));

       if (searchTokens.length === 0 || titleTokens.length === 0) return 0;

       // Also strip "ME" suffix from GMV titles (men's edition marker)
       const cleanTitleTokens = titleTokens.filter((t) => t !== 'me');

       const matches = searchTokens.filter((t) => cleanTitleTokens.includes(t));
       return matches.length / searchTokens.length;
     }

     function tokenize(text: string): string[] {
       return normalize(text)
         .split(/\s+/)
         .filter((t) => t.length > 1); // drop single-char tokens like "a", "y", "e"
     }

     function normalize(text: string): string {
       return text
         .toLowerCase()
         .normalize('NFD')
         .replace(/[\u0300-\u036f]/g, '') // strip accents
         .replace(/[^a-z0-9\s]/g, ' ')   // replace non-alphanumeric with spaces
         .replace(/\s+/g, ' ')
         .trim();
     }

     function stripYear(text: string, year: number): string {
       return text.replace(String(year), '').trim();
     }
     ```
  2. Key design decisions:
     - **Token overlap**: Count how many search tokens appear in the title. Simple, effective for this use case.
     - **Year stripping**: "Volta a Catalunya 2026" and "Volta a Catalunya 2026" both become "volta catalunya" — year is matched separately.
     - **"ME" stripping**: GMV appends "ME" (Men's Edition) to some titles — strip it before matching.
     - **Accent normalization**: "Liège" → "liege", "España" → "espana".
     - **Threshold 0.7**: Requires 70%+ token overlap. Tested: "volta catalunya" vs "Volta a Catalunya" → 2/2 = 1.0 ✓; "tour france" vs "Tour de Francia" → "tour" matches, "france" ≠ "francia" → need alias.
- **Parallel?**: Yes — pure function, no infrastructure dependencies.
- **Notes**: Export as pure functions for easy unit testing.

### Subtask T012 – Create GmvAutoImportUseCase

- **Purpose**: Orchestrate the full GMV auto-import flow: get cached posts → fuzzy match → import price list.
- **Files**: `apps/api/src/application/analyze/gmv-auto-import.use-case.ts` (new file)
- **Steps**:
  1. Create the use case:
     ```typescript
     import { Inject, Injectable, Logger } from '@nestjs/common';
     import { GmvClientPort, GMV_CLIENT_PORT } from '../../domain/gmv/gmv-client.port';
     import { ImportPriceListUseCase } from './import-price-list.use-case';
     import { fuzzyMatchGmvPost } from './fuzzy-match-gmv';
     import { GmvMatchResponse } from '@cycling-analyzer/shared-types';

     @Injectable()
     export class GmvAutoImportUseCase {
       private readonly logger = new Logger(GmvAutoImportUseCase.name);

       constructor(
         @Inject(GMV_CLIENT_PORT) private readonly gmvClient: GmvClientPort,
         private readonly importPriceList: ImportPriceListUseCase,
       ) {}

       async execute(raceSlug: string, raceName: string, year: number): Promise<GmvMatchResponse> {
         const posts = await this.gmvClient.getPosts();

         if (posts.length === 0) {
           this.logger.warn('No GMV posts available (API down or cache empty)');
           return { matched: false, postTitle: null, postUrl: null, confidence: null, riders: null };
         }

         const match = fuzzyMatchGmvPost(raceSlug, raceName, year, posts);

         if (!match) {
           this.logger.debug(`No GMV match for ${raceName} ${year}`);
           return { matched: false, postTitle: null, postUrl: null, confidence: null, riders: null };
         }

         this.logger.log(`GMV match: "${match.post.title}" (confidence: ${match.confidence.toFixed(2)})`);

         try {
           const { riders } = await this.importPriceList.execute(match.post.url);
           return {
             matched: true,
             postTitle: match.post.title,
             postUrl: match.post.url,
             confidence: match.confidence,
             riders,
           };
         } catch (error) {
           this.logger.error(`Failed to import from ${match.post.url}: ${(error as Error).message}`);
           return {
             matched: true,
             postTitle: match.post.title,
             postUrl: match.post.url,
             confidence: match.confidence,
             riders: null,
           };
         }
       }
     }
     ```
  2. Key decisions:
     - **Reuses `ImportPriceListUseCase`**: The existing use case already handles fetching HTML and parsing price list tables. No duplication.
     - **Graceful on import failure**: If the match is found but the page can't be parsed, returns `matched: true` with `riders: null`. Frontend can offer manual retry.
     - **Injects `GMV_CLIENT_PORT`**: Clean DDD boundary — the use case depends on the port, not the infrastructure cache service. Caching is transparent (handled by the adapter behind the port).
- **Parallel?**: No — depends on T010 and T011 (alias map + fuzzy match).
- **Notes**: The `raceName` parameter comes from the database `race_results.race_name` column (already human-readable, e.g., "Volta a Catalunya").

### Subtask T013 – Extend FetchRaceProfileUseCase for slug+year

- **Purpose**: Allow fetching a race profile by slug+year directly, without requiring a full PCS URL.
- **Files**: `apps/api/src/application/analyze/fetch-race-profile.use-case.ts`
- **Steps**:
  1. Add a new method `executeBySlug()` alongside the existing `execute()`:
     ```typescript
     async executeBySlug(raceSlug: string, year: number): Promise<RaceProfileResponse> {
       const pcsUrl = `https://www.procyclingstats.com/race/${raceSlug}/${year}`;
       return this.execute(pcsUrl);
     }
     ```
  2. This is intentionally simple — it constructs the URL and delegates to the existing logic. No need to refactor the internals.
- **Parallel?**: No — depends on existing use case structure.
- **Notes**: Keep `execute(pcsUrl)` untouched for backward compatibility (manual fallback still uses it).

### Subtask T014 – Create RaceCatalogController

- **Purpose**: Expose the race catalog and GMV auto-import as REST endpoints.
- **Files**: `apps/api/src/presentation/race-catalog.controller.ts` (new file)
- **Steps**:
  1. Create the controller:
     ```typescript
     import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
     import { ListRacesUseCase } from '../application/analyze/list-races.use-case';
     import { GmvAutoImportUseCase } from '../application/analyze/gmv-auto-import.use-case';
     import { FetchRaceProfileUseCase } from '../application/analyze/fetch-race-profile.use-case';
     import { RaceType, RaceListResponse, GmvMatchResponse, RaceProfileResponse } from '@cycling-analyzer/shared-types';

     @Controller('api')
     export class RaceCatalogController {
       constructor(
         private readonly listRaces: ListRacesUseCase,
         private readonly gmvAutoImport: GmvAutoImportUseCase,
         private readonly fetchRaceProfile: FetchRaceProfileUseCase,
       ) {}

       @Get('races')
       async getRaces(
         @Query('minYear') minYear?: string,
         @Query('raceType') raceType?: string,
       ): Promise<RaceListResponse> {
         const parsedYear = minYear ? parseInt(minYear, 10) : undefined;
         if (parsedYear !== undefined && (isNaN(parsedYear) || parsedYear < 2000)) {
           throw new BadRequestException('Invalid minYear parameter');
         }

         const validRaceTypes: string[] = Object.values(RaceType);
         if (raceType && !validRaceTypes.includes(raceType)) {
           throw new BadRequestException(`Invalid raceType. Must be one of: ${validRaceTypes.join(', ')}`);
         }

         return this.listRaces.execute({
           minYear: parsedYear,
           raceType: raceType as RaceType | undefined,
         });
       }

       @Get('gmv-match')
       async getGmvMatch(
         @Query('raceSlug') raceSlug?: string,
         @Query('raceName') raceName?: string,
         @Query('year') year?: string,
       ): Promise<GmvMatchResponse> {
         if (!raceSlug || !year) {
           throw new BadRequestException('raceSlug and year are required');
         }

         const parsedYear = parseInt(year, 10);
         if (isNaN(parsedYear)) {
           throw new BadRequestException('Invalid year');
         }

         const name = raceName ?? this.slugToName(raceSlug);
         return this.gmvAutoImport.execute(raceSlug, name, parsedYear);
       }

       @Get('race-profile-by-slug')
       async getRaceProfileBySlug(
         @Query('raceSlug') raceSlug?: string,
         @Query('year') year?: string,
       ): Promise<RaceProfileResponse> {
         if (!raceSlug || !year) {
           throw new BadRequestException('raceSlug and year are required');
         }

         const parsedYear = parseInt(year, 10);
         if (isNaN(parsedYear)) {
           throw new BadRequestException('Invalid year');
         }

         return this.fetchRaceProfile.executeBySlug(raceSlug, parsedYear);
       }

       private slugToName(slug: string): string {
         return slug
           .split('-')
           .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
           .join(' ');
       }
     }
     ```
  2. Three endpoints:
     - `GET /api/races` → race catalog (FR-001, FR-002)
     - `GET /api/gmv-match` → GMV auto-import (FR-006, FR-007, FR-008)
     - `GET /api/race-profile-by-slug` → race profile by slug (FR-004)
  3. `raceName` in gmv-match is optional — if not provided, derives from slug (same helper as existing `FetchRaceProfileUseCase.slugToName()`).
- **Parallel?**: No — depends on T009, T012, T013.

### Subtask T015 – Update AnalyzeModule imports

- **Purpose**: Register new use cases and controller in the NestJS module, import GmvModule.
- **Files**: `apps/api/src/application/analyze/analyze.module.ts`
- **Steps**:
  1. Add `GmvModule` to imports.
  2. Add `RaceCatalogController` to controllers.
  3. Add `ListRacesUseCase` and `GmvAutoImportUseCase` to providers.
  4. Resulting module:
     ```typescript
     @Module({
       imports: [DatabaseModule, MatchingModule, MlModule, ScrapingModule, GmvModule],
       controllers: [AnalyzeController, RaceProfileController, RaceCatalogController],
       providers: [
         AnalyzePriceListUseCase,
         FetchRaceProfileUseCase,
         FetchStartlistUseCase,
         ImportPriceListUseCase,
         ListRacesUseCase,
         GmvAutoImportUseCase,
         ScoringService,
         // ... existing port mappings
       ],
     })
     export class AnalyzeModule {}
     ```
- **Parallel?**: No — final wiring step.
- **Notes**: Don't add new port mappings here — `GmvModule` handles its own port→adapter mapping.

## Risks & Mitigations

- **Fuzzy match false positives**: Alias map + 0.7 threshold should prevent most. Monitor logs for unexpected matches.
- **`ImportPriceListUseCase` failure**: Already has error handling (throws `EmptyPriceListPageError`). `GmvAutoImportUseCase` catches and returns `riders: null`.
- **Race name from DB may be inconsistent**: Different scrape runs may produce different `raceName` values. Using slug-based matching (via aliases) is more reliable.

## Review Guidance

- Verify all 3 endpoints work with `curl` or Postman.
- Verify fuzzy matching with known mismatches: "ronde-van-vlaanderen" → "Tour de Flandes ME 2026".
- Verify `slugToName()` produces readable names.
- Verify module wiring: no circular dependencies.
- Run `make lint` and `make test`.

## Activity Log

- 2026-04-04T21:24:32Z – system – lane=planned – Prompt created.
