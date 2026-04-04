import { Inject, Injectable, Logger } from '@nestjs/common';
import { GmvClientPort, GMV_CLIENT_PORT } from '../../domain/gmv/gmv-client.port';
import { ImportPriceListUseCase } from './import-price-list.use-case';
import { fuzzyMatchGmvPost } from './fuzzy-match-gmv';
import type { GmvMatchResponse } from '@cycling-analyzer/shared-types';

const NO_MATCH: GmvMatchResponse = {
  matched: false,
  postTitle: null,
  postUrl: null,
  confidence: null,
  riders: null,
};

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
      return NO_MATCH;
    }

    const match = fuzzyMatchGmvPost(raceSlug, raceName, year, posts);

    if (!match) {
      this.logger.debug(`No GMV match for ${raceName} ${year}`);
      return NO_MATCH;
    }

    this.logger.log(
      `GMV match: "${match.post.title}" (confidence: ${match.confidence.toFixed(2)})`,
    );

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
