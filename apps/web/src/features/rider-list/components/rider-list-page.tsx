import { useCallback, useEffect } from 'react';
import type { PriceListEntryDto, ProfileSummary } from '@cycling-analyzer/shared-types';
import { type RaceType } from '@cycling-analyzer/shared-types';
import { useAnalyze } from '../hooks/use-analyze';
import { useLockExclude } from '../hooks/use-lock-exclude';
import { useTeamBuilder } from '@/features/team-builder/hooks/use-team-builder';
import { RiderInput } from './rider-input';
import { RiderTable } from './rider-table';
import { OptimizerPanel } from '@/features/optimizer/components/optimizer-panel';
import { TeamBuilderPanel } from '@/features/team-builder/components/team-builder-panel';
import { LoadingSpinner } from '@/shared/ui/loading-spinner';
import { ErrorAlert } from '@/shared/ui/error-alert';
import { EmptyState } from '@/shared/ui/empty-state';
import { useState } from 'react';

export function RiderListPage() {
  const { state: analyzeState, analyze, retry: retryAnalyze } = useAnalyze();
  const { lockedIds, excludedIds, toggleLock, toggleExclude } = useLockExclude();
  const [budget, setBudget] = useState(2000);

  const riders = analyzeState.status === 'success' ? analyzeState.data.riders : [];
  const teamBuilder = useTeamBuilder(budget, riders);

  // Sync lock -> auto-select in team builder
  useEffect(() => {
    for (const name of lockedIds) {
      if (!teamBuilder.isSelected(name)) {
        teamBuilder.addRider(name);
      }
    }
  }, [lockedIds, teamBuilder]);

  // Sync exclude -> auto-remove from team builder
  useEffect(() => {
    for (const name of excludedIds) {
      if (teamBuilder.isSelected(name)) {
        teamBuilder.removeRider(name);
      }
    }
  }, [excludedIds, teamBuilder]);

  const handleToggleSelect = useCallback(
    (name: string) => {
      if (lockedIds.has(name)) return;
      if (teamBuilder.isSelected(name)) {
        teamBuilder.removeRider(name);
      } else {
        teamBuilder.addRider(name);
      }
    },
    [lockedIds, teamBuilder],
  );

  const handleAnalyze = useCallback(
    (
      parsedRiders: PriceListEntryDto[],
      raceType: RaceType,
      newBudget: number,
      seasons: number,
      profileSummary?: ProfileSummary,
      raceSlug?: string,
      year?: number,
    ) => {
      setBudget(newBudget);
      teamBuilder.clearAll();
      void analyze({
        riders: parsedRiders,
        raceType,
        budget: newBudget,
        seasons,
        profileSummary,
        raceSlug,
        year,
      });
    },
    [analyze, teamBuilder],
  );

  const mustInclude = Array.from(lockedIds);
  const mustExclude = Array.from(excludedIds);

  return (
    <div className="space-y-6">
      <RiderInput onAnalyze={handleAnalyze} isLoading={analyzeState.status === 'loading'} />

      {analyzeState.status === 'loading' && <LoadingSpinner message="Analyzing riders..." />}

      {analyzeState.status === 'error' && (
        <ErrorAlert message={analyzeState.error} onRetry={retryAnalyze} />
      )}

      {analyzeState.status === 'success' && (
        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <div className="space-y-6">
            <OptimizerPanel
              riders={riders}
              budget={budget}
              mustInclude={mustInclude}
              mustExclude={mustExclude}
              lockedIds={lockedIds}
            />
            <RiderTable
              data={analyzeState.data}
              lockedIds={lockedIds}
              excludedIds={excludedIds}
              selectedNames={teamBuilder.selectedNames}
              onToggleLock={toggleLock}
              onToggleExclude={toggleExclude}
              onToggleSelect={handleToggleSelect}
              canSelect={teamBuilder.canSelect}
            />
          </div>
          <aside>
            <TeamBuilderPanel
              selectedRiders={teamBuilder.selectedRiders}
              totalCost={teamBuilder.totalCost}
              totalScore={teamBuilder.totalScore}
              mlTotalScore={teamBuilder.mlTotalScore}
              budgetRemaining={teamBuilder.budgetRemaining}
              budget={budget}
              isTeamComplete={teamBuilder.isTeamComplete}
              onRemoveRider={teamBuilder.removeRider}
              onClearAll={teamBuilder.clearAll}
            />
          </aside>
        </div>
      )}

      {analyzeState.status === 'idle' && (
        <EmptyState
          title="Enter riders to get started"
          description="Paste your rider list above (one per line: Name, Team, Price) and click Analyze."
        />
      )}
    </div>
  );
}
