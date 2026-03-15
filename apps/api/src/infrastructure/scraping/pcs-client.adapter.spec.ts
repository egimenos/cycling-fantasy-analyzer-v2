import { PcsClientAdapter, HttpResponse } from './pcs-client.adapter';

describe('PcsClientAdapter', () => {
  let adapter: PcsClientAdapter;
  let mockFetch: jest.Mock<Promise<HttpResponse>, [string]>;

  beforeEach(() => {
    jest.useFakeTimers();
    process.env.PCS_REQUEST_DELAY_MS = '0';
    process.env.PCS_MAX_RETRIES = '3';
    mockFetch = jest.fn<Promise<HttpResponse>, [string]>();
    adapter = new PcsClientAdapter(mockFetch);
  });

  afterEach(() => {
    jest.useRealTimers();
    delete process.env.PCS_REQUEST_DELAY_MS;
    delete process.env.PCS_MAX_RETRIES;
  });

  it('should return HTML body on 200 response', async () => {
    mockFetch.mockResolvedValue({
      statusCode: 200,
      body: '<html>test</html>',
    });

    const result = await adapter.fetchPage('race/test/2024');
    expect(result).toBe('<html>test</html>');
  });

  it('should retry on 429 with exponential backoff', async () => {
    mockFetch
      .mockResolvedValueOnce({ statusCode: 429, body: '' })
      .mockResolvedValueOnce({ statusCode: 200, body: '<html>ok</html>' });

    const promise = adapter.fetchPage('race/test/2024');
    await jest.advanceTimersByTimeAsync(2000);

    const result = await promise;
    expect(result).toBe('<html>ok</html>');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('should throw after max retries on 429', async () => {
    mockFetch.mockResolvedValue({ statusCode: 429, body: '' });

    const promise = adapter.fetchPage('race/test/2024');
    const assertion = expect(promise).rejects.toThrow('HTTP 429');

    await jest.advanceTimersByTimeAsync(15000);

    await assertion;
    expect(mockFetch).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
  });

  it('should retry once on 5xx errors', async () => {
    mockFetch
      .mockResolvedValueOnce({ statusCode: 500, body: '' })
      .mockResolvedValueOnce({ statusCode: 200, body: '<html>ok</html>' });

    const promise = adapter.fetchPage('race/test/2024');
    await jest.advanceTimersByTimeAsync(5000);

    const result = await promise;
    expect(result).toBe('<html>ok</html>');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('should not retry on 4xx errors (except 429)', async () => {
    mockFetch.mockResolvedValue({ statusCode: 404, body: '' });

    await expect(adapter.fetchPage('race/test/2024')).rejects.toThrow('HTTP 404');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should throw descriptive error on 403 (Cloudflare)', async () => {
    mockFetch.mockResolvedValue({ statusCode: 403, body: '' });

    await expect(adapter.fetchPage('race/test/2024')).rejects.toThrow('Cloudflare');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should retry once on network errors', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce({ statusCode: 200, body: '<html>ok</html>' });

    const promise = adapter.fetchPage('race/test/2024');
    await jest.advanceTimersByTimeAsync(3000);

    const result = await promise;
    expect(result).toBe('<html>ok</html>');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('should enforce rate limiting between requests', async () => {
    jest.useRealTimers();
    process.env.PCS_REQUEST_DELAY_MS = '50';
    const limitedAdapter = new PcsClientAdapter(mockFetch);

    mockFetch.mockResolvedValue({
      statusCode: 200,
      body: '<html>ok</html>',
    });

    const start = Date.now();
    await limitedAdapter.fetchPage('race/test1/2024');
    await limitedAdapter.fetchPage('race/test2/2024');
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(40);
  });
});
