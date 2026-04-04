import { useEffect, useState } from 'react';
import { fetchRaces } from '@/shared/lib/api-client';
import type { RaceListItem } from '@cycling-analyzer/shared-types';

type RaceCatalogState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; races: RaceListItem[] }
  | { status: 'error'; error: string };

export function useRaceCatalog(): RaceCatalogState {
  const [state, setState] = useState<RaceCatalogState>({ status: 'idle' });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });

    fetchRaces(undefined, controller.signal).then((result) => {
      if (result.status === 'success') {
        setState({ status: 'success', races: result.data.races });
      } else {
        if (result.error === 'Request aborted') return;
        setState({ status: 'error', error: result.error });
      }
    });

    return () => controller.abort();
  }, []);

  return state;
}
