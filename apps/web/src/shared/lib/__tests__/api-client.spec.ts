import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { analyzeRiders, optimizeTeam } from '../api-client';
import { RaceType } from '@cycling-analyzer/shared-types';
import type { AnalyzeRequest, OptimizeRequest } from '@cycling-analyzer/shared-types';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const sampleAnalyzeRequest: AnalyzeRequest = {
  riders: [{ name: 'Pogačar', team: 'UAE', price: 700 }],
  raceType: RaceType.GRAND_TOUR,
  budget: 2000,
};

describe('analyzeRiders', () => {
  it('returns success with parsed data on 200', async () => {
    const responseData = {
      riders: [],
      totalSubmitted: 1,
      totalMatched: 0,
      unmatchedCount: 1,
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(responseData),
    });

    const result = await analyzeRiders(sampleAnalyzeRequest);

    expect(result).toEqual({ status: 'success', data: responseData });
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3001/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sampleAnalyzeRequest),
    });
  });

  it('returns error with server message on 400', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ message: 'Invalid request' }),
    });

    const result = await analyzeRiders(sampleAnalyzeRequest);

    expect(result).toEqual({ status: 'error', error: 'Invalid request' });
  });

  it('returns fallback error message on 500 with no body', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('no json')),
    });

    const result = await analyzeRiders(sampleAnalyzeRequest);

    expect(result).toEqual({
      status: 'error',
      error: 'Request failed with status 500',
    });
  });

  it('returns error on network failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

    const result = await analyzeRiders(sampleAnalyzeRequest);

    expect(result).toEqual({ status: 'error', error: 'Connection refused' });
  });

  it('returns error for non-Error throws', async () => {
    mockFetch.mockRejectedValueOnce('string error');

    const result = await analyzeRiders(sampleAnalyzeRequest);

    expect(result).toEqual({ status: 'error', error: 'Unknown network error' });
  });
});

describe('optimizeTeam', () => {
  it('returns success on valid response', async () => {
    const responseData = {
      optimalTeam: {
        riders: [],
        totalCostHillios: 0,
        totalProjectedPts: 0,
        budgetRemaining: 2000,
        scoreBreakdown: { gc: 0, stage: 0, mountain: 0, sprint: 0, final: 0 },
      },
      alternativeTeams: [],
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(responseData),
    });

    const request: OptimizeRequest = {
      riders: [],
      budget: 2000,
      mustInclude: [],
      mustExclude: [],
    };

    const result = await optimizeTeam(request);

    expect(result).toEqual({ status: 'success', data: responseData });
  });
});
