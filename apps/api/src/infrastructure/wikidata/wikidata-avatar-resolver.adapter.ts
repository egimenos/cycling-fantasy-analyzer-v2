import { Injectable, Logger } from '@nestjs/common';
import {
  AvatarResolverPort,
  AvatarResult,
  RiderIdentifier,
} from '../../domain/rider/avatar-resolver.port';

const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php';
const BATCH_SIZE = 50; // Wikipedia API limit per request
const BATCH_DELAY_MS = 1000;
const THUMBNAIL_SIZE = 200;
const USER_AGENT =
  'CyclingFantasyAnalyzer/1.0 (https://github.com/egimenos/cycling-fantasy-analyzer-v2)';

interface WikipediaPage {
  pageid?: number;
  ns: number;
  title: string;
  thumbnail?: { source: string; width: number; height: number };
  missing?: string;
}

interface WikipediaResponse {
  query?: {
    normalized?: { from: string; to: string }[];
    pages: Record<string, WikipediaPage>;
  };
}

@Injectable()
export class WikidataAvatarResolverAdapter implements AvatarResolverPort {
  private readonly logger = new Logger(WikidataAvatarResolverAdapter.name);

  async resolveAvatars(riders: RiderIdentifier[]): Promise<AvatarResult[]> {
    if (riders.length === 0) return [];

    const results: AvatarResult[] = [];
    const batches = this.chunk(riders, BATCH_SIZE);

    for (let i = 0; i < batches.length; i++) {
      if (i > 0) await this.delay(BATCH_DELAY_MS);

      try {
        const batchResults = await this.queryBatch(batches[i]);
        results.push(...batchResults);
        this.logger.log(
          `Batch ${i + 1}/${batches.length}: resolved ${batchResults.length}/${batches[i].length} avatars`,
        );
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Batch ${i + 1}/${batches.length} failed: ${msg}`);
      }
    }

    return results;
  }

  private async queryBatch(riders: RiderIdentifier[]): Promise<AvatarResult[]> {
    // Build a map from Wikipedia title -> pcsSlug for reverse lookup
    const titleToSlug = new Map<string, string>();
    const titles: string[] = [];

    for (const rider of riders) {
      const wikiTitle = this.nameToWikiTitle(rider.fullName);
      titleToSlug.set(wikiTitle.toLowerCase(), rider.pcsSlug);
      titles.push(wikiTitle);
    }

    const params = new URLSearchParams({
      action: 'query',
      titles: titles.join('|'),
      prop: 'pageimages',
      pithumbsize: String(THUMBNAIL_SIZE),
      format: 'json',
    });

    const response = await fetch(`${WIKIPEDIA_API}?${params.toString()}`, {
      headers: { 'User-Agent': USER_AGENT },
    });

    if (!response.ok) {
      throw new Error(`Wikipedia API returned ${response.status}: ${response.statusText}`);
    }

    const data: WikipediaResponse = await response.json();
    if (!data.query?.pages) return [];

    // Build a normalized title map to handle Wikipedia's title normalization
    const normalizedMap = new Map<string, string>();
    if (data.query.normalized) {
      for (const { from, to } of data.query.normalized) {
        normalizedMap.set(to.toLowerCase(), from);
      }
    }

    const results: AvatarResult[] = [];

    for (const page of Object.values(data.query.pages)) {
      if (!page.thumbnail?.source || page.missing !== undefined) continue;

      // Skip URLs that exceed the DB column length (512 chars)
      if (page.thumbnail.source.length > 512) continue;

      // Resolve the original title we sent (may differ from page.title due to normalization)
      const originalTitle = normalizedMap.get(page.title.toLowerCase()) ?? page.title;
      const pcsSlug = titleToSlug.get(originalTitle.toLowerCase());

      if (pcsSlug) {
        results.push({ pcsSlug, avatarUrl: page.thumbnail.source });
      }
    }

    return results;
  }

  /**
   * Convert a rider's full name (PCS "Lastname Firstname" format) to a
   * Wikipedia page title ("Firstname Lastname").
   *
   * Handles patronymic prefixes: "van Aert Wout" → "Wout van Aert",
   * "van der Poel Mathieu" → "Mathieu van der Poel".
   */
  private nameToWikiTitle(fullName: string): string {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length <= 1) return fullName.trim().replace(/\s+/g, '_');

    // Find where the lowercase patronymic prefix ends and the capitalized
    // surname begins. E.g. ["van", "der", "Poel", "Mathieu"] — the surname
    // starts at "Poel" (index 2), and "Mathieu" is the first name.
    const PREFIXES = new Set(['van', 'de', 'den', 'der', 'di', 'da', 'dos', 'del', 'la', 'le']);

    let surnameStart = 0;
    while (surnameStart < parts.length - 1 && PREFIXES.has(parts[surnameStart].toLowerCase())) {
      surnameStart++;
    }

    // Everything except the last token is the surname group; the last token
    // is the first name (PCS convention: "Surname Firstname").
    const firstName = parts[parts.length - 1];
    const surname = parts.slice(0, parts.length - 1).join(' ');

    return `${firstName} ${surname}`.replace(/\s+/g, '_');
  }

  private chunk<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
