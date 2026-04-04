import { useCallback, useState } from 'react';
import { gmvMatch } from '@/shared/lib/api-client';
import type { GmvMatchResponse } from '@cycling-analyzer/shared-types';

export type GmvImportState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: GmvMatchResponse }
  | { status: 'error'; error: string };

export function useGmvAutoImport(): {
  state: GmvImportState;
  importForRace: (raceSlug: string, raceName: string, year: number) => Promise<void>;
  reset: () => void;
} {
  const [state, setState] = useState<GmvImportState>({ status: 'idle' });

  const importForRace = useCallback(async (raceSlug: string, raceName: string, year: number) => {
    setState({ status: 'loading' });
    const result = await gmvMatch(raceSlug, raceName, year);

    if (result.status === 'success') {
      setState({ status: 'success', data: result.data });
    } else {
      setState({ status: 'error', error: result.error });
    }
  }, []);

  const reset = useCallback(() => setState({ status: 'idle' }), []);

  return { state, importForRace, reset };
}
