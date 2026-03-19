import { useState, useEffect, useRef } from 'react';
import type { RaceProfileResponse } from '@cycling-analyzer/shared-types';
import type { AsyncState } from '@/shared/lib/async-state';
import { fetchRaceProfile } from '@/shared/lib/api-client';

const PCS_URL_PATTERN = 'procyclingstats.com/race/';
const DEBOUNCE_MS = 500;

function isValidPcsUrl(url: string): boolean {
  return url.includes(PCS_URL_PATTERN) && /\/\d{4}/.test(url);
}

export function useRaceProfile(raceUrl: string) {
  const [state, setState] = useState<AsyncState<RaceProfileResponse>>({ status: 'idle' });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!raceUrl || !isValidPcsUrl(raceUrl)) {
      setState({ status: 'idle' });
      return;
    }

    const timer = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState({ status: 'loading' });

      void fetchRaceProfile(raceUrl, controller.signal).then((result) => {
        if (controller.signal.aborted) return;
        if (result.status === 'success') {
          setState({ status: 'success', data: result.data });
        } else {
          setState({ status: 'error', error: result.error });
        }
      });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [raceUrl]);

  return state;
}
