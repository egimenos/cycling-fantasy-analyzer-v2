import { useState, useCallback } from 'react';
import type { OptimizeRequest, OptimizeResponse } from '@cycling-analyzer/shared-types';
import type { AsyncState } from '@/shared/lib/async-state';
import { optimizeTeam } from '@/shared/lib/api-client';

export function useOptimize() {
  const [state, setState] = useState<AsyncState<OptimizeResponse>>({ status: 'idle' });
  const [lastRequest, setLastRequest] = useState<OptimizeRequest | null>(null);

  const optimize = useCallback(async (request: OptimizeRequest) => {
    setState({ status: 'loading' });
    setLastRequest(request);
    const response = await optimizeTeam(request);
    if (response.status === 'success') {
      setState({ status: 'success', data: response.data });
    } else {
      setState({ status: 'error', error: response.error });
    }
  }, []);

  const retry = useCallback(() => {
    if (lastRequest) {
      void optimize(lastRequest);
    }
  }, [lastRequest, optimize]);

  const reset = useCallback(() => {
    setState({ status: 'idle' });
    setLastRequest(null);
  }, []);

  return { state, optimize, retry, reset };
}
