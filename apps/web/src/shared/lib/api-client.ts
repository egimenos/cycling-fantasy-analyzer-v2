import type {
  AnalyzeRequest,
  AnalyzeResponse,
  OptimizeRequest,
  OptimizeResponse,
  RaceProfileResponse,
  RaceListResponse,
  GmvMatchResponse,
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
      const raw = (errorBody as { message?: string | string[] }).message;
      const message = Array.isArray(raw)
        ? (raw[0] ?? 'Validation error')
        : (raw ?? `Request failed with status ${response.status}`);
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

async function apiGet<TRes>(path: string, signal?: AbortSignal): Promise<ApiResult<TRes>> {
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, { signal });

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
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { status: 'error', error: 'Request aborted' };
    }
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

export function fetchRaceProfile(
  url: string,
  signal?: AbortSignal,
): Promise<ApiResult<RaceProfileResponse>> {
  return apiGet<RaceProfileResponse>(`/api/race-profile?url=${encodeURIComponent(url)}`, signal);
}

export interface ImportedPriceEntry {
  name: string;
  team: string;
  price: number;
}

export function importPriceList(
  url: string,
  signal?: AbortSignal,
): Promise<ApiResult<{ riders: ImportedPriceEntry[] }>> {
  return apiGet<{ riders: ImportedPriceEntry[] }>(
    `/api/import-price-list?url=${encodeURIComponent(url)}`,
    signal,
  );
}

export function fetchRaces(
  params?: { minYear?: number; raceType?: string },
  signal?: AbortSignal,
): Promise<ApiResult<RaceListResponse>> {
  const searchParams = new URLSearchParams();
  if (params?.minYear) searchParams.set('minYear', String(params.minYear));
  if (params?.raceType) searchParams.set('raceType', params.raceType);
  const query = searchParams.toString();
  return apiGet<RaceListResponse>(`/api/races${query ? `?${query}` : ''}`, signal);
}

export function gmvMatch(
  raceSlug: string,
  raceName: string,
  year: number,
  signal?: AbortSignal,
): Promise<ApiResult<GmvMatchResponse>> {
  const params = new URLSearchParams({ raceSlug, raceName, year: String(year) });
  return apiGet<GmvMatchResponse>(`/api/gmv-match?${params}`, signal);
}

export function fetchRaceProfileBySlug(
  raceSlug: string,
  year: number,
  signal?: AbortSignal,
): Promise<ApiResult<RaceProfileResponse>> {
  const params = new URLSearchParams({ raceSlug, year: String(year) });
  return apiGet<RaceProfileResponse>(`/api/race-profile-by-slug?${params}`, signal);
}
