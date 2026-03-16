import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAnalyze } from '../hooks/use-analyze';
import { RaceType } from '@cycling-analyzer/shared-types';
import type { AnalyzeResponse } from '@cycling-analyzer/shared-types';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const sampleResponse: AnalyzeResponse = {
  riders: [],
  totalSubmitted: 1,
  totalMatched: 0,
  unmatchedCount: 1,
};

describe('useAnalyze', () => {
  it('starts with idle state', () => {
    const { result } = renderHook(() => useAnalyze());
    expect(result.current.state.status).toBe('idle');
  });

  it('sets loading during request', async () => {
    let resolvePromise: (v: unknown) => void;
    mockFetch.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePromise = resolve;
      }),
    );

    const { result } = renderHook(() => useAnalyze());

    act(() => {
      void result.current.analyze({
        riders: [{ name: 'Test', team: 'Team', price: 100 }],
        raceType: RaceType.GRAND_TOUR,
        budget: 2000,
      });
    });

    expect(result.current.state.status).toBe('loading');

    await act(async () => {
      resolvePromise!({
        ok: true,
        json: () => Promise.resolve(sampleResponse),
      });
    });

    expect(result.current.state.status).toBe('success');
  });

  it('sets data on success', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(sampleResponse),
    });

    const { result } = renderHook(() => useAnalyze());

    await act(async () => {
      await result.current.analyze({
        riders: [{ name: 'Test', team: 'Team', price: 100 }],
        raceType: RaceType.GRAND_TOUR,
        budget: 2000,
      });
    });

    expect(result.current.state.status).toBe('success');
    if (result.current.state.status === 'success') {
      expect(result.current.state.data).toEqual(sampleResponse);
    }
  });

  it('sets error on failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      statusText: 'Internal Server Error',
    });

    const { result } = renderHook(() => useAnalyze());

    await act(async () => {
      await result.current.analyze({
        riders: [{ name: 'Test', team: 'Team', price: 100 }],
        raceType: RaceType.GRAND_TOUR,
        budget: 2000,
      });
    });

    expect(result.current.state.status).toBe('error');
    if (result.current.state.status === 'error') {
      expect(result.current.state.error).toBeTruthy();
    }
  });

  it('resets state', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(sampleResponse),
    });

    const { result } = renderHook(() => useAnalyze());

    await act(async () => {
      await result.current.analyze({
        riders: [{ name: 'Test', team: 'Team', price: 100 }],
        raceType: RaceType.GRAND_TOUR,
        budget: 2000,
      });
    });

    expect(result.current.state.status).toBe('success');

    act(() => {
      result.current.reset();
    });

    expect(result.current.state.status).toBe('idle');
  });

  it('retries last request', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(sampleResponse),
    });

    const { result } = renderHook(() => useAnalyze());

    await act(async () => {
      await result.current.analyze({
        riders: [{ name: 'Test', team: 'Team', price: 100 }],
        raceType: RaceType.GRAND_TOUR,
        budget: 2000,
      });
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ ...sampleResponse, totalSubmitted: 2 }),
    });

    await act(async () => {
      result.current.retry();
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
