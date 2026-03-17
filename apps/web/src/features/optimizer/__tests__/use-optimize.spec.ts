import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOptimize } from '../hooks/use-optimize';
import type { OptimizeResponse, AnalyzedRider } from '@cycling-analyzer/shared-types';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const sampleRider: AnalyzedRider = {
  rawName: 'Pogačar',
  rawTeam: 'UAE',
  priceHillios: 100,
  matchedRider: null,
  matchConfidence: 0,
  unmatched: false,
  compositeScore: 50,
  pointsPerHillio: 0.5,
  totalProjectedPts: 50,
  categoryScores: { gc: 20, stage: 10, mountain: 10, sprint: 5 },
  seasonsUsed: 2,
};

const sampleResponse: OptimizeResponse = {
  optimalTeam: {
    riders: [sampleRider],
    totalCostHillios: 100,
    totalProjectedPts: 50,
    budgetRemaining: 1900,
    scoreBreakdown: { gc: 20, stage: 10, mountain: 10, sprint: 5 },
  },
  alternativeTeams: [],
};

describe('useOptimize', () => {
  it('starts with idle state', () => {
    const { result } = renderHook(() => useOptimize());
    expect(result.current.state.status).toBe('idle');
  });

  it('transitions to loading then success', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(sampleResponse),
    });

    const { result } = renderHook(() => useOptimize());

    await act(async () => {
      await result.current.optimize({
        riders: [sampleRider],
        budget: 2000,
        mustInclude: [],
        mustExclude: [],
      });
    });

    expect(result.current.state.status).toBe('success');
    if (result.current.state.status === 'success') {
      expect(result.current.state.data.optimalTeam.totalProjectedPts).toBe(50);
    }
  });

  it('sets error on failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      statusText: 'Bad Request',
    });

    const { result } = renderHook(() => useOptimize());

    await act(async () => {
      await result.current.optimize({
        riders: [sampleRider],
        budget: 2000,
        mustInclude: [],
        mustExclude: [],
      });
    });

    expect(result.current.state.status).toBe('error');
  });

  it('resets state', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(sampleResponse),
    });

    const { result } = renderHook(() => useOptimize());

    await act(async () => {
      await result.current.optimize({
        riders: [sampleRider],
        budget: 2000,
        mustInclude: [],
        mustExclude: [],
      });
    });

    expect(result.current.state.status).toBe('success');

    act(() => {
      result.current.reset();
    });

    expect(result.current.state.status).toBe('idle');
  });
});
