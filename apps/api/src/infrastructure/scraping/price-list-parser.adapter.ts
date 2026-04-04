import { Injectable } from '@nestjs/common';
import type {
  PriceListParserPort,
  ParsedPriceEntry,
} from '../../application/analyze/ports/price-list-parser.port';
import { parsePriceListPage } from './parsers/price-list.parser';

@Injectable()
export class PriceListParserAdapter implements PriceListParserPort {
  parsePriceListPage(html: string): ParsedPriceEntry[] {
    return parsePriceListPage(html);
  }
}
