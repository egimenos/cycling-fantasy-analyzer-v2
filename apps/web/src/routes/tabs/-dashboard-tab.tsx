import type { AnalyzeResponse } from '@cycling-analyzer/shared-types';
import { RiderTable } from '@/features/rider-list/components/rider-table';
import { RaceProfileSummary } from '@/features/rider-list/components/race-profile-summary';
import { TeamBuilderPanel } from '@/features/team-builder/components/team-builder-panel';
import type { useTeamBuilder } from '@/features/team-builder/hooks/use-team-builder';
import type { useRaceProfile } from '@/features/rider-list/hooks/use-race-profile';
import { useIsDesktop } from '@/shared/hooks/use-media-query';
import type { RiderFilter } from '@/features/rider-list/components/rider-table';

export interface DashboardTabProps {
  data: AnalyzeResponse;
  lockedIds: Set<string>;
  excludedIds: Set<string>;
  selectedNames: Set<string>;
  onToggleLock: (name: string) => void;
  onToggleExclude: (name: string) => void;
  onToggleSelect: (name: string) => void;
  canSelect: (name: string) => boolean;
  teamBuilder: ReturnType<typeof useTeamBuilder>;
  budget: number;
  profileState: ReturnType<typeof useRaceProfile>;
  onOptimize: () => void;
  isOptimizing: boolean;
  onReviewTeam: () => void;
  mobileFilter?: RiderFilter;
}

export function DashboardTab({
  data,
  lockedIds,
  excludedIds,
  selectedNames,
  onToggleLock,
  onToggleExclude,
  onToggleSelect,
  canSelect,
  teamBuilder,
  budget,
  profileState,
  onOptimize,
  isOptimizing,
  onReviewTeam,
  mobileFilter,
}: DashboardTabProps) {
  const isDesktop = useIsDesktop();

  const MAX_RIDERS = 9;

  return (
    <div
      data-testid="tab-content-dashboard"
      className={isDesktop ? 'space-y-6 pb-24' : 'space-y-4 pb-20'}
    >
      <h1 className="sr-only">Dashboard</h1>
      {/* Race Profile Bar */}
      {profileState.status === 'success' && (
        <RaceProfileSummary
          profile={profileState.data}
          totalRiders={data.riders.length}
          matchedRiders={data.totalMatched}
          isAnalyzed
        />
      )}

      {/* Mobile: team bar — SELECTED 0/9 + OPTIMIZE button */}
      {!isDesktop && (
        <div className="flex items-center gap-3">
          <div className="bg-surface-container-low border border-outline-variant/10 rounded-sm px-4 py-3 flex-shrink-0">
            <span className="text-[9px] font-mono text-outline uppercase block">Selected</span>
            <span className="font-mono font-bold text-on-surface text-xl">
              {teamBuilder.selectedRiders.length}/{MAX_RIDERS}
            </span>
          </div>
          {teamBuilder.isTeamComplete ? (
            <button
              onClick={onReviewTeam}
              className="flex-1 py-2.5 bg-stage text-white font-headline font-bold uppercase tracking-wider text-xs rounded-sm text-center shadow-md shadow-stage/30 active:scale-[0.98] transition-all"
            >
              Review Team &rarr;
            </button>
          ) : (
            <button
              onClick={onOptimize}
              disabled={isOptimizing}
              className="flex-1 py-2.5 bg-secondary text-secondary-foreground font-headline font-bold uppercase tracking-wider text-xs rounded-sm text-center shadow-md shadow-secondary/25 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {isOptimizing ? 'Optimizing...' : 'Optimize'}
            </button>
          )}
        </div>
      )}

      {/* Main Content: Table + Sidebar */}
      <div className="flex flex-col lg:flex-row gap-6 min-w-0">
        <section className="flex-1 min-w-0 flex flex-col gap-4">
          <RiderTable
            data={data}
            lockedIds={lockedIds}
            excludedIds={excludedIds}
            selectedNames={selectedNames}
            onToggleLock={onToggleLock}
            onToggleExclude={onToggleExclude}
            onToggleSelect={onToggleSelect}
            canSelect={canSelect}
            externalFilter={isDesktop ? undefined : mobileFilter}
          />
        </section>

        {isDesktop && (
          <aside className="w-[340px] flex-shrink-0" aria-label="Team Builder">
            <TeamBuilderPanel
              selectedRiders={teamBuilder.selectedRiders}
              totalCost={teamBuilder.totalCost}
              totalScore={teamBuilder.totalScore}
              budgetRemaining={teamBuilder.budgetRemaining}
              budget={budget}
              isTeamComplete={teamBuilder.isTeamComplete}
              onRemoveRider={teamBuilder.removeRider}
              lockedIds={lockedIds}
              onClearAll={teamBuilder.clearAll}
            />
          </aside>
        )}
      </div>
    </div>
  );
}
