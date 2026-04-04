import { Inject, Injectable } from '@nestjs/common';
import { PriceListFetcherPort, PRICE_LIST_FETCHER_PORT } from './ports/price-list-fetcher.port';
import {
  PriceListParserPort,
  PRICE_LIST_PARSER_PORT,
  ParsedPriceEntry,
} from './ports/price-list-parser.port';
import { EmptyPriceListPageError } from '../../domain/analyze/errors';

export { ParsedPriceEntry };

@Injectable()
export class ImportPriceListUseCase {
  constructor(
    @Inject(PRICE_LIST_FETCHER_PORT)
    private readonly fetcher: PriceListFetcherPort,
    @Inject(PRICE_LIST_PARSER_PORT)
    private readonly parser: PriceListParserPort,
  ) {}

  async execute(url: string): Promise<{ riders: ParsedPriceEntry[] }> {
    const html = await this.fetcher.fetchPage(url);
    const riders = this.parser.parsePriceListPage(html);

    if (riders.length === 0) {
      throw new EmptyPriceListPageError(url);
    }

    return { riders };
  }
}
