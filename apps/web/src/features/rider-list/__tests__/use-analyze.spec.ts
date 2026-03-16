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
  it('starts with initial state', () => {
    const { result } = renderHook(() => useAnalyze());
    expect(result.current.result).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
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

    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      resolvePromise!({
        ok: true,
        json: () => Promise.resolve(sampleResponse),
      });
    });

    expect(result.current.isLoading).toBe(false);
  });

  it('sets result on success', async () => {
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

    expect(result.current.result).toEqual(sampleResponse);
    expect(result.current.error).toBeNull();
  });

  it('sets error on failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useAnalyze());

    await act(async () => {
      await result.current.analyze({
        riders: [{ name: 'Test', team: 'Team', price: 100 }],
        raceType: RaceType.GRAND_TOUR,
        budget: 2000,
      });
    });

    expect(result.current.error).toBe('Network error');
    expect(result.current.result).toBeNull();
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

    expect(result.current.result).not.toBeNull();

    act(() => {
      result.current.reset();
    });

    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
  });
});
