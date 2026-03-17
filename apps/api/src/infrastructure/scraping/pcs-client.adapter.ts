import { Injectable, Logger } from '@nestjs/common';
import { PcsScraperPort } from '../../application/scraping/ports/pcs-scraper.port';

export interface HttpResponse {
  statusCode: number;
  body: string;
}

export type HttpFetchFn = (url: string) => Promise<HttpResponse>;

async function defaultFetch(url: string): Promise<HttpResponse> {
  const { gotScraping } = await import('got-scraping');
  const response = await gotScraping({
    url,
    headerGeneratorOptions: {
      browsers: [{ name: 'chrome', minVersion: 100 }],
      locales: ['en-US'],
      operatingSystems: ['windows'],
    },
    timeout: { request: 30000 },
  });
  return { statusCode: response.statusCode, body: response.body };
}

@Injectable()
export class PcsClientAdapter implements PcsScraperPort {
  private readonly logger = new Logger(PcsClientAdapter.name);
  private readonly baseUrl = 'https://www.procyclingstats.com/';
  private readonly requestDelayMs: number;
  private readonly maxRetries: number;
  private readonly httpFetch: HttpFetchFn;
  private lastRequestAt = 0;

  constructor(httpFetch?: HttpFetchFn) {
    this.requestDelayMs = parseInt(process.env.PCS_REQUEST_DELAY_MS ?? '1500', 10);
    this.maxRetries = parseInt(process.env.PCS_MAX_RETRIES ?? '3', 10);
    this.httpFetch = httpFetch ?? defaultFetch;
  }

  async fetchPage(path: string): Promise<string> {
    await this.throttle();
    return this.fetchWithRetry(path, 0);
  }

  private async fetchWithRetry(path: string, attempt: number): Promise<string> {
    try {
      const url = `${this.baseUrl}${path}`;
      this.logger.debug(`Fetching ${url} (attempt ${attempt + 1})`);

      const response = await this.httpFetch(url);
      const statusCode = response.statusCode;

      if (statusCode === 200) {
        return response.body;
      }

      if (statusCode === 429 && attempt < this.maxRetries) {
        const backoffMs = Math.pow(2, attempt + 1) * 1000;
        this.logger.warn(`Rate limited (429) on ${path}, retrying in ${backoffMs}ms`);
        await this.delay(backoffMs);
        return this.fetchWithRetry(path, attempt + 1);
      }

      if (statusCode >= 500 && attempt === 0) {
        this.logger.warn(`Server error (${statusCode}) on ${path}, retrying once`);
        await this.delay(5000);
        return this.fetchWithRetry(path, attempt + 1);
      }

      if (statusCode === 403) {
        throw new Error(
          `Cloudflare blocked request to ${path} (HTTP 403). ` +
            'got-scraping TLS impersonation may need updating, or consider Playwright fallback.',
        );
      }

      throw new Error(`HTTP ${statusCode} fetching ${path}`);
    } catch (error: unknown) {
      if (error instanceof Error && error.message.startsWith('HTTP ')) {
        throw error;
      }
      if (error instanceof Error && error.message.startsWith('Cloudflare')) {
        throw error;
      }

      const isNetworkError =
        error instanceof Error && /ECONNRESET|ETIMEDOUT|ENOTFOUND|ECONNREFUSED/.test(error.message);

      if (isNetworkError && attempt === 0) {
        this.logger.warn(`Network error on ${path}, retrying once: ${(error as Error).message}`);
        await this.delay(3000);
        return this.fetchWithRetry(path, attempt + 1);
      }

      throw error;
    }
  }

  private async throttle(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestAt;
    if (elapsed < this.requestDelayMs) {
      await this.delay(this.requestDelayMs - elapsed);
    }
    this.lastRequestAt = Date.now();
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
