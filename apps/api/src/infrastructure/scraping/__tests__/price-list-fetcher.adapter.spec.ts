import { PriceListFetcherAdapter, HttpResponse } from '../price-list-fetcher.adapter';
import { PriceListFetchError } from '../../../domain/analyze/errors';

describe('PriceListFetcherAdapter', () => {
  let mockFetch: jest.Mock<Promise<HttpResponse>, [string]>;
  let adapter: PriceListFetcherAdapter;
  const url = 'https://grandesminivueltas.com/index.php/2026/05/07/giro-de-italia-2026/';

  beforeEach(() => {
    mockFetch = jest.fn<Promise<HttpResponse>, [string]>();
    adapter = new PriceListFetcherAdapter(mockFetch);
  });

  it('returns HTML body on 200', async () => {
    mockFetch.mockResolvedValue({ statusCode: 200, body: '<html>ok</html>' });

    await expect(adapter.fetchPage(url)).resolves.toBe('<html>ok</html>');
    expect(mockFetch).toHaveBeenCalledWith(url);
  });

  it('throws PriceListFetchError on 403', async () => {
    mockFetch.mockResolvedValue({ statusCode: 403, body: '' });

    await expect(adapter.fetchPage(url)).rejects.toBeInstanceOf(PriceListFetchError);
    await expect(adapter.fetchPage(url)).rejects.toThrow(/HTTP 403/);
  });

  it('throws PriceListFetchError on 5xx', async () => {
    mockFetch.mockResolvedValue({ statusCode: 502, body: '' });

    await expect(adapter.fetchPage(url)).rejects.toThrow(/HTTP 502/);
  });

  it('propagates network errors from the underlying fetch', async () => {
    mockFetch.mockRejectedValue(new Error('ETIMEDOUT'));

    await expect(adapter.fetchPage(url)).rejects.toThrow('ETIMEDOUT');
  });
});
