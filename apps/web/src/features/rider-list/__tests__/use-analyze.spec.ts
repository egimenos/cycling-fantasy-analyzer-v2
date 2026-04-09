import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAnalyze } from '../hooks/use-analyze';
import { RaceType } from '@cycling-analyzer/shared-types';
import type { AnalyzeResponse } from '@cycling-analyzer/shared-types';

vi.mock('@/shared/lib/api-client', () => ({
  analyzeRidersStream: vi.fn(),
}));

import { analyzeRidersStream } from '@/shared/lib/api-client';

const mockStream = vi.mocked(analyzeRidersStream);

beforeEach(() => {
  vi.clearAllMocks();
});

const sampleResponse: AnalyzeResponse = {
  riders: [],
  totalSubmitted: 1,
  totalMatched: 0,
  unmatchedCount: 1,
};

const sampleRequest = {
  riders: [{ name: 'Test', team: 'Team', price: 100 }],
  raceType: RaceType.GRAND_TOUR,
  budget: 2000,
};

describe('useAnalyze', () => {
  it('starts with idle state', () => {
    const { result } = renderHook(() => useAnalyze());
    expect(result.current.state.status).toBe('idle');
  });

  it('sets loading during request with initial steps', async () => {
    let resolveStream: () => void;
    mockStream.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveStream = resolve;
        }),
    );

    const { result } = renderHook(() => useAnalyze());

    act(() => {
      void result.current.analyze(sampleRequest);
    });

    expect(result.current.state.status).toBe('loading');
    if (result.current.state.status === 'loading') {
      expect(result.current.state.steps).toHaveLength(6);
      expect(result.current.state.steps[0].status).toBe('pending');
    }

    await act(async () => {
      resolveStream!();
    });
  });

  it('transitions to success when result event received', async () => {
    mockStream.mockImplementationOnce(async (_req, callbacks) => {
      callbacks.onProgress({
        step: 'matching_riders',
        status: 'in_progress',
        stepIndex: 1,
        totalSteps: 6,
      });
      callbacks.onProgress({
        step: 'matching_riders',
        status: 'completed',
        stepIndex: 1,
        totalSteps: 6,
        elapsedMs: 100,
      });
      callbacks.onResult(sampleResponse);
    });

    const { result } = renderHook(() => useAnalyze());

    await act(async () => {
      await result.current.analyze(sampleRequest);
    });

    expect(result.current.state.status).toBe('success');
    if (result.current.state.status === 'success') {
      expect(result.current.state.data).toEqual(sampleResponse);
      expect(result.current.state.steps).toHaveLength(6);
    }
  });

  it('sets error on failure event', async () => {
    mockStream.mockImplementationOnce(async (_req, callbacks) => {
      callbacks.onProgress({
        step: 'matching_riders',
        status: 'completed',
        stepIndex: 1,
        totalSteps: 6,
        elapsedMs: 50,
      });
      callbacks.onError({ step: 'ml_predictions', message: 'ML service unavailable' });
    });

    const { result } = renderHook(() => useAnalyze());

    await act(async () => {
      await result.current.analyze(sampleRequest);
    });

    expect(result.current.state.status).toBe('error');
    if (result.current.state.status === 'error') {
      expect(result.current.state.error).toBe('ML service unavailable');
      expect(result.current.state.failedStep).toBe('ml_predictions');
    }
  });

  it('resets state', async () => {
    mockStream.mockImplementationOnce(async (_req, callbacks) => {
      callbacks.onResult(sampleResponse);
    });

    const { result } = renderHook(() => useAnalyze());

    await act(async () => {
      await result.current.analyze(sampleRequest);
    });

    expect(result.current.state.status).toBe('success');

    act(() => {
      result.current.reset();
    });

    expect(result.current.state.status).toBe('idle');
  });

  it('retries last request', async () => {
    mockStream.mockImplementation(async (_req, callbacks) => {
      callbacks.onResult(sampleResponse);
    });

    const { result } = renderHook(() => useAnalyze());

    await act(async () => {
      await result.current.analyze(sampleRequest);
    });

    await act(async () => {
      result.current.retry();
    });

    expect(mockStream).toHaveBeenCalledTimes(2);
  });
});
