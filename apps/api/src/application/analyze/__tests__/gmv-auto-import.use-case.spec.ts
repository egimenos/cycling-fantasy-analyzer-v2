import { PinoLogger } from 'nestjs-pino';
import { GmvAutoImportUseCase } from '../gmv-auto-import.use-case';
import { GmvClientPort } from '../../../domain/gmv/gmv-client.port';
import { ImportPriceListUseCase } from '../import-price-list.use-case';
import { PriceListFetchError } from '../../../domain/analyze/errors';

describe('GmvAutoImportUseCase', () => {
  let useCase: GmvAutoImportUseCase;
  let mockGmvClient: jest.Mocked<GmvClientPort>;
  let mockImportPriceList: jest.Mocked<Pick<ImportPriceListUseCase, 'execute'>>;
  let mockLogger: jest.Mocked<Pick<PinoLogger, 'setContext' | 'error' | 'warn' | 'info' | 'debug'>>;

  const matchingPost = {
    id: 11132,
    title: 'Giro de Italia 2026',
    url: 'https://grandesminivueltas.com/index.php/2026/05/07/giro-de-italia-2026/',
    date: '2026-05-07T01:36:38',
  };

  beforeEach(() => {
    mockGmvClient = { getPosts: jest.fn() };
    mockImportPriceList = { execute: jest.fn() };
    mockLogger = {
      setContext: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
    };
    useCase = new GmvAutoImportUseCase(
      mockGmvClient,
      mockImportPriceList as unknown as ImportPriceListUseCase,
      mockLogger as unknown as PinoLogger,
    );
  });

  it('returns NO_MATCH when GMV API has no posts', async () => {
    mockGmvClient.getPosts.mockResolvedValue([]);

    const result = await useCase.execute('giro-d-italia', "Giro d'Italia", 2026);

    expect(result).toEqual({
      matched: false,
      postTitle: null,
      postUrl: null,
      confidence: null,
      riders: null,
    });
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'gmv_posts_unavailable' }),
      expect.any(String),
    );
  });

  it('returns NO_MATCH when fuzzy match finds nothing', async () => {
    mockGmvClient.getPosts.mockResolvedValue([
      {
        id: 1,
        title: 'Vuelta al País Vasco 2026',
        url: 'https://example.com/x',
        date: '2026-04-01',
      },
    ]);

    const result = await useCase.execute('giro-d-italia', "Giro d'Italia", 2026);

    expect(result.matched).toBe(false);
    expect(mockImportPriceList.execute).not.toHaveBeenCalled();
  });

  it('returns matched riders on successful import', async () => {
    mockGmvClient.getPosts.mockResolvedValue([matchingPost]);
    mockImportPriceList.execute.mockResolvedValue({
      riders: [{ name: 'POGACAR Tadej', team: 'UAE Team Emirates (WT)', price: 350 }],
    });

    const result = await useCase.execute('giro-d-italia', 'Giro de Italia', 2026);

    expect(result.matched).toBe(true);
    expect(result.riders).toHaveLength(1);
    expect(result.postUrl).toBe(matchingPost.url);
  });

  it('logs a structured error and degrades to riders=null when import fails', async () => {
    mockGmvClient.getPosts.mockResolvedValue([matchingPost]);
    const fetchError = new PriceListFetchError(matchingPost.url, 403);
    mockImportPriceList.execute.mockRejectedValue(fetchError);

    const result = await useCase.execute('giro-d-italia', 'Giro de Italia', 2026);

    expect(result).toEqual({
      matched: true,
      postTitle: matchingPost.title,
      postUrl: matchingPost.url,
      confidence: expect.any(Number),
      riders: null,
    });

    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    const [logPayload, logMessage] = mockLogger.error.mock.calls[0];
    expect(logPayload).toMatchObject({
      err: fetchError,
      event: 'gmv_price_list_import_failed',
      raceSlug: 'giro-d-italia',
      raceName: 'Giro de Italia',
      year: 2026,
      postUrl: matchingPost.url,
      postTitle: matchingPost.title,
    });
    expect(logMessage).toBe('GMV price list import failed');
  });

  it('sets the logger context for log correlation', () => {
    expect(mockLogger.setContext).toHaveBeenCalledWith('GmvAutoImportUseCase');
  });
});
