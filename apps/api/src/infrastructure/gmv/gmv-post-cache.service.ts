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
