import { useState, useCallback } from 'react';
import type { AnalyzeRequest, AnalyzeResponse } from '@cycling-analyzer/shared-types';
import { analyzeRiders } from '@/shared/lib/api-client';

export function useAnalyze() {
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyze = useCallback(async (request: AnalyzeRequest) => {
    setIsLoading(true);
    setError(null);
    const response = await analyzeRiders(request);
    setIsLoading(false);
    if (response.status === 'success') {
      setResult(response.data);
    } else {
      setError(response.error);
    }
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { analyze, result, isLoading, error, reset };
}
