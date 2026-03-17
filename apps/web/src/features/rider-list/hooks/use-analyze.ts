import { useState, useCallback } from 'react';
import type { AnalyzeRequest, AnalyzeResponse } from '@cycling-analyzer/shared-types';
import type { AsyncState } from '@/shared/lib/async-state';
import { analyzeRiders } from '@/shared/lib/api-client';

export function useAnalyze() {
  const [state, setState] = useState<AsyncState<AnalyzeResponse>>({ status: 'idle' });
  const [lastRequest, setLastRequest] = useState<AnalyzeRequest | null>(null);

  const analyze = useCallback(async (request: AnalyzeRequest) => {
    setState({ status: 'loading' });
    setLastRequest(request);
    const response = await analyzeRiders(request);
    if (response.status === 'success') {
      setState({ status: 'success', data: response.data });
    } else {
      setState({ status: 'error', error: response.error });
    }
  }, []);

  const retry = useCallback(() => {
    if (lastRequest) {
      void analyze(lastRequest);
    }
  }, [lastRequest, analyze]);

  const reset = useCallback(() => {
    setState({ status: 'idle' });
    setLastRequest(null);
  }, []);

  return { state, analyze, retry, reset };
}
