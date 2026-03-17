import type {
  AnalyzeRequest,
  AnalyzeResponse,
  OptimizeRequest,
  OptimizeResponse,
} from '@cycling-analyzer/shared-types';

export type ApiResult<T> = { status: 'success'; data: T } | { status: 'error'; error: string };

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

async function apiPost<TReq, TRes>(path: string, body: TReq): Promise<ApiResult<TRes>> {
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      const message =
        (errorBody as { message?: string }).message ??
        `Request failed with status ${response.status}`;
      return { status: 'error', error: message };
    }

    const data = (await response.json()) as TRes;
    return { status: 'success', data };
  } catch (err) {
    return {
      status: 'error',
      error: err instanceof Error ? err.message : 'Unknown network error',
    };
  }
}

export function analyzeRiders(request: AnalyzeRequest): Promise<ApiResult<AnalyzeResponse>> {
  return apiPost<AnalyzeRequest, AnalyzeResponse>('/api/analyze', request);
}

export function optimizeTeam(request: OptimizeRequest): Promise<ApiResult<OptimizeResponse>> {
  return apiPost<OptimizeRequest, OptimizeResponse>('/api/optimize', request);
}
