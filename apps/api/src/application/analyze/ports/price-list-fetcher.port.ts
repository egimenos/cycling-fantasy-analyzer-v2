export const PRICE_LIST_FETCHER_PORT = Symbol('PRICE_LIST_FETCHER_PORT');

export interface PriceListFetcherPort {
  fetchPage(url: string): Promise<string>;
}
