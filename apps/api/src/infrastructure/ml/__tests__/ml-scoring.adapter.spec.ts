import { MlScoringAdapter } from '../ml-scoring.adapter';

// Save original fetch and restore after tests
const originalFetch = global.fetch;

describe('MlScoringAdapter', () => {
  let adapter: MlScoringAdapter;
  let mockFetch: jest.Mock;

  beforeEach(() => {
    mockFetch = jest.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
    process.env.ML_SERVICE_URL = 'http://ml-test:8000';
    adapter = new MlScoringAdapter();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.ML_SERVICE_URL;
  });

  describe('predictRace', () => {
    it('should return predictions on 200 response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          predictions: [
            { rider_id: 'r1', predicted_score: 85.0 },
            { rider_id: 'r2', predicted_score: 72.5 },
          ],
        }),
      });

      const result = await adapter.predictRace('tour-de-france', 2026);

      expect(result).toEqual([
        { riderId: 'r1', predictedScore: 85.0 },
        { riderId: 'r2', predictedScore: 72.5 },
      ]);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://ml-test:8000/predict',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ race_slug: 'tour-de-france', year: 2026 }),
        }),
      );
    });

    it('should return null on non-ok response (e.g. 503)', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
      });

      const result = await adapter.predictRace('tour-de-france', 2026);
      expect(result).toBeNull();
    });

    it('should return null on timeout error', async () => {
      mockFetch.mockRejectedValue(new DOMException('signal timed out', 'TimeoutError'));

      const result = await adapter.predictRace('tour-de-france', 2026);
      expect(result).toBeNull();
    });

    it('should return null on connection refused', async () => {
      mockFetch.mockRejectedValue(new TypeError('fetch failed'));

      const result = await adapter.predictRace('tour-de-france', 2026);
      expect(result).toBeNull();
    });
  });

  describe('getModelVersion', () => {
    it('should return version string on healthy response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'healthy',
          model_version: '20260320T120000',
          models_loaded: ['mini_tour', 'grand_tour'],
        }),
      });

      const version = await adapter.getModelVersion();
      expect(version).toBe('20260320T120000');
    });

    it('should return null when model_version is missing', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'no_model' }),
      });

      const version = await adapter.getModelVersion();
      expect(version).toBeNull();
    });

    it('should return null on fetch failure', async () => {
      mockFetch.mockRejectedValue(new TypeError('fetch failed'));

      const version = await adapter.getModelVersion();
      expect(version).toBeNull();
    });
  });

  describe('isHealthy', () => {
    it('should return true when status is healthy', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'healthy',
          model_version: '20260320T120000',
        }),
      });

      const healthy = await adapter.isHealthy();
      expect(healthy).toBe(true);
    });

    it('should return false when status is no_model', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'no_model' }),
      });

      const healthy = await adapter.isHealthy();
      expect(healthy).toBe(false);
    });

    it('should return false on fetch failure', async () => {
      mockFetch.mockRejectedValue(new TypeError('fetch failed'));

      const healthy = await adapter.isHealthy();
      expect(healthy).toBe(false);
    });
  });
});
