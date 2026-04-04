---
work_package_id: WP02
title: Backend GMV Infrastructure
lane: planned
dependencies: [WP01]
subtasks:
- T006
- T007
- T008
phase: Phase 0 - Foundation
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
- FR-005
- FR-010
- FR-011
---

# Work Package Prompt: WP02 – Backend GMV Infrastructure

## Implement Command

```bash
spec-kitty implement WP02 --base WP01
```

## Objectives & Success Criteria

- `GmvClientAdapter` successfully fetches posts from the GMV WordPress REST API, filtering by categories 23+21 and excluding non-price-list posts.
- `GmvPostCacheService` caches posts in-memory with configurable TTL (default 4 hours) and refreshes transparently on expiry.
- `GmvModule` wires port to adapter and exports the port symbol.
- Unit tests cover adapter fetch logic, cache TTL behavior, and title filtering.
- `make lint` and `make test` pass.

## Context & Constraints

- **Plan**: `kitty-specs/018-race-selector-auto-import/plan.md`
- **Research**: `kitty-specs/018-race-selector-auto-import/research.md` (R3: Cache approach, R6: WP API categories)
- **Domain types from WP01**: `GmvClientPort` in `apps/api/src/domain/gmv/gmv-client.port.ts`, `GmvPost` in `apps/api/src/domain/gmv/gmv-post.ts`
- **Existing adapter pattern**: Follow `apps/api/src/infrastructure/ml/ml-scoring.adapter.ts` — uses native `fetch()`, graceful error handling, `@Injectable()`.
- **Module pattern**: Follow `apps/api/src/infrastructure/ml/ml.module.ts` — `provide: PORT, useClass: ADAPTER`, exports port symbol.
- **GMV WP API endpoint**: `https://grandesminivueltas.com/wp-json/wp/v2/posts?categories=23,21&per_page=100&_fields=id,title,link,date`
- **Post title format**: `title.rendered` contains the HTML-decoded title (e.g., "Volta a Catalunya 2026").
- **Posts to exclude**: Titles containing "Equipos y elecciones" or "Calendario".

## Subtasks & Detailed Guidance

### Subtask T006 – Create GmvClientAdapter

- **Purpose**: Infrastructure adapter that fetches men's race price list posts from the GMV WordPress REST API.
- **Files**: `apps/api/src/infrastructure/gmv/gmv-client.adapter.ts` (new file, new directory)
- **Steps**:
  1. Create directory `apps/api/src/infrastructure/gmv/`.
  2. Create `gmv-client.adapter.ts`:
     ```typescript
     import { Injectable, Logger } from '@nestjs/common';
     import { GmvClientPort } from '../../domain/gmv/gmv-client.port';
     import { GmvPost } from '../../domain/gmv/gmv-post';

     const GMV_WP_API_URL =
       'https://grandesminivueltas.com/wp-json/wp/v2/posts';
     const GMV_CATEGORIES = '23,21'; // masculinas-carreras + grandes-vueltas-carreras
     const EXCLUDED_TITLE_PATTERNS = ['Equipos y elecciones', 'Calendario'];

     @Injectable()
     export class GmvClientAdapter {
       private readonly logger = new Logger(GmvClientAdapter.name);

       async fetchPostsFromApi(): Promise<GmvPost[]> {
         try {
           const url = `${GMV_WP_API_URL}?categories=${GMV_CATEGORIES}&per_page=100&_fields=id,title,link,date`;
           this.logger.debug(`Fetching GMV posts: ${url}`);

           const response = await fetch(url, {
             signal: AbortSignal.timeout(10_000),
           });

           if (!response.ok) {
             this.logger.error(`GMV API returned ${response.status}`);
             return [];
           }

           const rawPosts = (await response.json()) as Array<{
             id: number;
             title: { rendered: string };
             link: string;
             date: string;
           }>;

           const posts = rawPosts
             .filter((p) => !EXCLUDED_TITLE_PATTERNS.some((pattern) =>
               p.title.rendered.includes(pattern)))
             .map((p) => ({
               id: p.id,
               title: this.decodeHtmlEntities(p.title.rendered),
               url: p.link,
               date: p.date,
             }));

           this.logger.debug(`Fetched ${posts.length} GMV price list posts`);
           return posts;
         } catch (error) {
           this.logger.warn(`GMV API unavailable: ${(error as Error).message}`);
           return [];
         }
       }

       private decodeHtmlEntities(text: string): string {
         return text
           .replace(/&#8211;/g, '–')
           .replace(/&#8212;/g, '—')
           .replace(/&#038;/g, '&')
           .replace(/&amp;/g, '&');
       }
     }
     ```
  3. Key decisions:
     - **Graceful degradation**: Returns empty array on error (same pattern as `MlScoringAdapter`).
     - **Timeout**: 10 seconds — GMV is an external WordPress site.
     - **HTML entity decoding**: WP API returns `title.rendered` which may contain HTML entities.
     - **No auth needed**: GMV WP API is public.
- **Parallel?**: No — T007 and T008 depend on this being available.
- **Notes**: The `_fields=id,title,link,date` parameter minimizes payload. WordPress returns post content by default which we don't need.

### Subtask T007 – Create GmvPostCacheService

- **Purpose**: In-memory cache that **implements `GmvClientPort`**. The use case injects the port and gets cached posts — clean DDD boundary. Wraps the raw `GmvClientAdapter` internally.
- **Files**: `apps/api/src/infrastructure/gmv/gmv-post-cache.service.ts` (new file)
- **Steps**:
  1. Create `gmv-post-cache.service.ts`:
     ```typescript
     import { Injectable, Logger } from '@nestjs/common';
     import { GmvPost } from '../../domain/gmv/gmv-post';
     import { GmvClientPort } from '../../domain/gmv/gmv-client.port';
     import { GmvClientAdapter } from './gmv-client.adapter';

     const DEFAULT_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

     @Injectable()
     export class GmvPostCacheService implements GmvClientPort {
       private readonly logger = new Logger(GmvPostCacheService.name);
       private cache: GmvPost[] = [];
       private lastFetchedAt = 0;
       private readonly ttlMs: number;

       constructor(private readonly adapter: GmvClientAdapter) {
         this.ttlMs = parseInt(process.env.GMV_CACHE_TTL_MS ?? String(DEFAULT_TTL_MS), 10);
       }

       async getPosts(): Promise<GmvPost[]> {
         const now = Date.now();
         if (now - this.lastFetchedAt < this.ttlMs && this.cache.length > 0) {
           this.logger.debug(`GMV cache hit (${this.cache.length} posts)`);
           return this.cache;
         }

         this.logger.debug('GMV cache miss — refreshing');
         this.cache = await this.adapter.fetchPostsFromApi();
         this.lastFetchedAt = Date.now();
         return this.cache;
       }

       invalidate(): void {
         this.cache = [];
         this.lastFetchedAt = 0;
       }
     }
     ```
  2. Key decisions:
     - **Implements `GmvClientPort`**: This is the class bound to `GMV_CLIENT_PORT`. The use case injects the port and never knows about caching — clean DDD.
     - **Wraps `GmvClientAdapter`**: Injects the raw adapter (internal infra detail), delegates fetch to it.
     - **Singleton scope**: NestJS services are singletons by default — no extra config needed.
     - **TTL configurable**: Via `GMV_CACHE_TTL_MS` env var (useful for testing with short TTL).
     - **`invalidate()`**: Useful for testing and future admin endpoints.
- **Parallel?**: No — depends on T006 being in place.
- **Notes**: The cache holds the filtered, decoded posts. No need to re-filter on cache hits.

### Subtask T008 – Create GmvModule

- **Purpose**: NestJS module that wires the GMV port to its adapter and provides the cache service.
- **Files**: `apps/api/src/infrastructure/gmv/gmv.module.ts` (new file)
- **Steps**:
  1. Create `gmv.module.ts`:
     ```typescript
     import { Module } from '@nestjs/common';
     import { GMV_CLIENT_PORT } from '../../domain/gmv/gmv-client.port';
     import { GmvClientAdapter } from './gmv-client.adapter';
     import { GmvPostCacheService } from './gmv-post-cache.service';

     @Module({
       providers: [
         GmvClientAdapter,
         {
           provide: GMV_CLIENT_PORT,
           useClass: GmvPostCacheService,
         },
       ],
       exports: [GMV_CLIENT_PORT],
     })
     export class GmvModule {}
     ```
  2. Key decisions:
     - **`GMV_CLIENT_PORT` → `GmvPostCacheService`**: The port is bound to the cached version. Consumers get caching transparently.
     - **`GmvClientAdapter` as plain provider**: Injected internally by `GmvPostCacheService`, not exported.
     - **Only exports the port symbol**: Clean boundary — consumers depend on the port, not infrastructure classes.
  3. Pattern follows `MlModule` — simple, exports port symbol.
- **Parallel?**: No — this is the final wiring step.
- **Notes**: This module will be imported by `AnalyzeModule` in WP03. Only the port is exported — the use case injects `GMV_CLIENT_PORT` and gets the cached implementation.

## Risks & Mitigations

- **GMV API downtime**: Adapter returns empty array; downstream use case treats this as "no match" → manual fallback.
- **WP API rate limiting**: 4h TTL means max ~6 requests/day. Very conservative.
- **Post title format changes**: Title filtering is loose (substring match). If GMV changes post naming convention significantly, the filter may need updating — but this is a rare event.

## Review Guidance

- Verify `GmvClientAdapter` handles network errors gracefully (no unhandled promise rejections).
- Verify cache TTL behavior: first request fetches, subsequent requests within TTL return cached data.
- Verify excluded title patterns work correctly (check "Equipos y elecciones" and "Calendario").
- Verify module exports match what WP03 will need to import.
- Run `make lint` and `make test`.

## Activity Log

- 2026-04-04T21:24:32Z – system – lane=planned – Prompt created.
