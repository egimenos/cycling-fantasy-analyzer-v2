import { Injectable, Logger } from '@nestjs/common';
import { AvatarResolverPort, AvatarResult } from '../../domain/rider/avatar-resolver.port';

const WIKIDATA_SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';
const BATCH_SIZE = 100;
const BATCH_DELAY_MS = 1000;
const THUMBNAIL_WIDTH = 200;
const USER_AGENT =
  'CyclingFantasyAnalyzer/1.0 (https://github.com/egimenos/cycling-fantasy-analyzer-v2)';

interface SparqlBinding {
  pcsId: { value: string };
  image: { value: string };
}

interface SparqlResponse {
  results: {
    bindings: SparqlBinding[];
  };
}

@Injectable()
export class WikidataAvatarResolverAdapter implements AvatarResolverPort {
  private readonly logger = new Logger(WikidataAvatarResolverAdapter.name);

  async resolveAvatars(pcsSlugs: string[]): Promise<AvatarResult[]> {
    if (pcsSlugs.length === 0) return [];

    const results: AvatarResult[] = [];
    const batches = this.chunk(pcsSlugs, BATCH_SIZE);

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

  private async queryBatch(pcsSlugs: string[]): Promise<AvatarResult[]> {
    const values = pcsSlugs.map((slug) => `"${slug}"`).join(' ');
    const sparql = `
      SELECT ?pcsId ?image WHERE {
        VALUES ?pcsId { ${values} }
        ?item wdt:P9509 ?pcsId .
        ?item wdt:P18 ?image .
      }
    `;

    const url = `${WIKIDATA_SPARQL_ENDPOINT}?query=${encodeURIComponent(sparql)}&format=json`;

    const response = await fetch(url, {
      headers: {
        Accept: 'application/sparql-results+json',
        'User-Agent': USER_AGENT,
      },
    });

    if (!response.ok) {
      throw new Error(`Wikidata SPARQL returned ${response.status}: ${response.statusText}`);
    }

    const data: SparqlResponse = await response.json();

    return data.results.bindings.map((binding) => ({
      pcsSlug: binding.pcsId.value,
      avatarUrl: this.toThumbnailUrl(binding.image.value),
    }));
  }

  /**
   * Convert a Wikimedia Commons file URL to a thumbnail URL.
   * Input:  http://commons.wikimedia.org/wiki/Special:FilePath/Tadej_Pogačar.jpg
   * Output: https://commons.wikimedia.org/wiki/Special:FilePath/Tadej_Pogačar.jpg?width=200
   */
  private toThumbnailUrl(commonsUrl: string): string {
    // Wikidata returns URLs starting with http:// — upgrade to https://
    const httpsUrl = commonsUrl.replace(/^http:\/\//, 'https://');

    // If it's already a Special:FilePath URL, just append width
    if (httpsUrl.includes('Special:FilePath')) {
      return `${httpsUrl}?width=${THUMBNAIL_WIDTH}`;
    }

    // Fallback: extract filename and build the URL manually
    const filename = decodeURIComponent(httpsUrl.split('/').pop() ?? '');
    if (!filename) return httpsUrl;

    return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}?width=${THUMBNAIL_WIDTH}`;
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
