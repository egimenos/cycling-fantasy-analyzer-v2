import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { GmvClientPort, GMV_CLIENT_PORT } from '../../domain/gmv/gmv-client.port';
import { ImportPriceListUseCase } from './import-price-list.use-case';
import { fuzzyMatchGmvPost } from '../../domain/gmv/fuzzy-match';
import type { GmvMatchResponse } from '@cycling-analyzer/shared-types';

const NO_MATCH: GmvMatchResponse = {
  matched: false,
  postTitle: null,
  postUrl: null,
  confidence: null,
  riders: null,
};

// Stable event names — DO NOT rename without updating Grafana dashboards / alerts.
const EVENT_NO_POSTS = 'gmv_posts_unavailable';
const EVENT_NO_MATCH = 'gmv_no_match';
const EVENT_MATCHED = 'gmv_matched';
const EVENT_IMPORT_FAILED = 'gmv_price_list_import_failed';

@Injectable()
export class GmvAutoImportUseCase {
  constructor(
    @Inject(GMV_CLIENT_PORT) private readonly gmvClient: GmvClientPort,
    private readonly importPriceList: ImportPriceListUseCase,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(GmvAutoImportUseCase.name);
  }

  async execute(raceSlug: string, raceName: string, year: number): Promise<GmvMatchResponse> {
    const posts = await this.gmvClient.getPosts();

    if (posts.length === 0) {
      this.logger.warn(
        { event: EVENT_NO_POSTS, raceSlug, raceName, year },
        'No GMV posts available (API down or cache empty)',
      );
      return NO_MATCH;
    }

    const match = fuzzyMatchGmvPost(raceSlug, raceName, year, posts);

    if (!match) {
      this.logger.debug(
        { event: EVENT_NO_MATCH, raceSlug, raceName, year },
        `No GMV match for ${raceName} ${year}`,
      );
      return NO_MATCH;
    }

    this.logger.info(
      {
        event: EVENT_MATCHED,
        raceSlug,
        raceName,
        year,
        postTitle: match.post.title,
        postUrl: match.post.url,
        confidence: match.confidence,
      },
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
      // Degraded response (riders=null) keeps the analyze flow alive, but the failure
      // MUST surface as a structured error log so Grafana alerts fire — otherwise the
      // 200 OK response hides a silent product breakage (no prices shown to the user).
      this.logger.error(
        {
          err: error,
          event: EVENT_IMPORT_FAILED,
          raceSlug,
          raceName,
          year,
          postTitle: match.post.title,
          postUrl: match.post.url,
        },
        'GMV price list import failed',
      );
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
