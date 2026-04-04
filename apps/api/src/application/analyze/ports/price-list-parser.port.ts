export const PRICE_LIST_PARSER_PORT = Symbol('PRICE_LIST_PARSER_PORT');

export interface ParsedPriceEntry {
  readonly name: string;
  readonly team: string;
  readonly price: number;
}

export interface PriceListParserPort {
  parsePriceListPage(html: string): ParsedPriceEntry[];
}
