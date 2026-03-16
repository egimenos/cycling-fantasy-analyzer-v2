import { useCallback } from 'react';
import type { PriceListEntryDto } from '@cycling-analyzer/shared-types';
import { type RaceType } from '@cycling-analyzer/shared-types';
import { useAnalyze } from '../hooks/use-analyze';
import { RiderInput } from './rider-input';
import { RiderTable } from './rider-table';
import { LoadingSpinner } from '@/shared/ui/loading-spinner';
import { ErrorAlert } from '@/shared/ui/error-alert';
import { EmptyState } from '@/shared/ui/empty-state';

export function RiderListPage() {
  const { analyze, result, isLoading, error } = useAnalyze();

  const handleAnalyze = useCallback(
    (riders: PriceListEntryDto[], raceType: RaceType, budget: number) => {
      void analyze({ riders, raceType, budget });
    },
    [analyze],
  );

  const handleRetry = useCallback(() => {
    // Re-trigger with same params would require storing them; for now user re-submits
  }, []);

  return (
    <div className="space-y-6">
      <RiderInput onAnalyze={handleAnalyze} isLoading={isLoading} />

      {isLoading && <LoadingSpinner message="Analyzing riders..." />}

      {error && !isLoading && <ErrorAlert message={error} onRetry={handleRetry} />}

      {result && !isLoading && !error && <RiderTable data={result} />}

      {!result && !isLoading && !error && (
        <EmptyState
          title="Enter riders to get started"
          description="Paste your rider list above (one per line: Name, Team, Price) and click Analyze."
        />
      )}
    </div>
  );
}
