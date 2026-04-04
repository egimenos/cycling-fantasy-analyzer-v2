import { Injectable } from '@nestjs/common';
import type { PriceListFetcherPort } from '../../application/analyze/ports/price-list-fetcher.port';
import { PriceListFetchError } from '../../domain/analyze/errors';

@Injectable()
export class PriceListFetcherAdapter implements PriceListFetcherPort {
  async fetchPage(url: string): Promise<string> {
    // Dynamic import to avoid CJS/ESM issues with got-scraping
    const dynamicImport = new Function('specifier', 'return import(specifier)');
    const { gotScraping } = await dynamicImport('got-scraping');

    const response = await gotScraping({
      url,
      headerGeneratorOptions: {
        browsers: [{ name: 'chrome', minVersion: 100 }],
        locales: ['es-ES'],
        operatingSystems: ['windows'],
      },
      timeout: { request: 15000 },
    });

    if (response.statusCode !== 200) {
      throw new PriceListFetchError(url, response.statusCode);
    }

    return response.body;
  }
}
