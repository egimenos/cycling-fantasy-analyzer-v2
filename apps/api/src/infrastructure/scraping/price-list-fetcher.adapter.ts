import { Injectable, Optional } from '@nestjs/common';
import type { PriceListFetcherPort } from '../../application/analyze/ports/price-list-fetcher.port';
import { PriceListFetchError } from '../../domain/analyze/errors';

export interface HttpResponse {
  statusCode: number;
  body: string;
}

export type HttpFetchFn = (url: string) => Promise<HttpResponse>;

// GMV (Hostinger hcdn) rejects got-scraping's synthetic Chrome fingerprint intermittently
// (HTTP 403). Native fetch with a real Chrome UA passes reliably. Do not switch back.
const CHROME_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

const REQUEST_TIMEOUT_MS = 15_000;

async function defaultFetch(url: string): Promise<HttpResponse> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': CHROME_USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  return { statusCode: response.status, body: await response.text() };
}

@Injectable()
export class PriceListFetcherAdapter implements PriceListFetcherPort {
  private readonly httpFetch: HttpFetchFn;

  constructor(@Optional() httpFetch?: HttpFetchFn) {
    this.httpFetch = httpFetch ?? defaultFetch;
  }

  async fetchPage(url: string): Promise<string> {
    const response = await this.httpFetch(url);
    if (response.statusCode !== 200) {
      throw new PriceListFetchError(url, response.statusCode);
    }
    return response.body;
  }
}
