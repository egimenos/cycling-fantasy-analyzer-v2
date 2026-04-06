import { useState } from 'react';
import type { AnalyzeResponse } from '@cycling-analyzer/shared-types';
import { RiderTable } from '@/features/rider-list/components/rider-table';
import { RaceProfileSummary } from '@/features/rider-list/components/race-profile-summary';
import { TeamBuilderPanel } from '@/features/team-builder/components/team-builder-panel';
import type { useTeamBuilder } from '@/features/team-builder/hooks/use-team-builder';
import type { useRaceProfile } from '@/features/rider-list/hooks/use-race-profile';
import { useIsDesktop } from '@/shared/hooks/use-media-query';
import { Settings, ChevronDown } from 'lucide-react';
import * as Collapsible from '@radix-ui/react-collapsible';
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
  const [configOpen, setConfigOpen] = useState(false);
  const isDesktop = useIsDesktop();

  const MAX_RIDERS = 9;

  return (
    <div
      data-testid="tab-content-dashboard"
      className={isDesktop ? 'space-y-6' : 'space-y-4 pb-20'}
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

      {/* Collapsible Config */}
      <Collapsible.Root open={configOpen} onOpenChange={setConfigOpen}>
        <div className="bg-surface-container-high/40 border border-outline-variant/15 rounded-sm overflow-hidden">
          <Collapsible.Trigger className="flex items-center justify-between px-4 md:px-6 py-2.5 md:py-3 w-full cursor-pointer hover:bg-surface-container-high transition-colors">
            <div className="flex items-center gap-2 md:gap-3">
              <Settings className="h-3.5 w-3.5 md:h-4 md:w-4 text-outline" />
              <span className="text-xs md:text-sm font-bold uppercase tracking-wider">Config</span>
              <span className="text-[10px] font-mono text-outline">({budget}H)</span>
            </div>
            <ChevronDown
              className={`h-4 w-4 text-outline transition-transform ${configOpen ? 'rotate-180' : ''}`}
            />
          </Collapsible.Trigger>
          <Collapsible.Content className="px-4 md:px-6 pb-4 md:pb-5 text-sm text-on-surface-variant">
            <div className="pt-2 md:pt-3 grid grid-cols-4 gap-2 md:gap-4">
              <div className="bg-surface-container-low p-2 md:p-3 rounded-sm">
                <span className="text-[9px] font-mono text-outline uppercase block mb-0.5">
                  Budget
                </span>
                <span className="font-mono font-bold text-on-surface text-xs md:text-sm">
                  {budget}H
                </span>
              </div>
              <div className="bg-surface-container-low p-2 md:p-3 rounded-sm">
                <span className="text-[9px] font-mono text-outline uppercase block mb-0.5">
                  Riders
                </span>
                <span className="font-mono font-bold text-on-surface text-xs md:text-sm">
                  {data.riders.length}
                </span>
              </div>
              <div className="bg-surface-container-low p-2 md:p-3 rounded-sm">
                <span className="text-[9px] font-mono text-outline uppercase block mb-0.5">
                  Match
                </span>
                <span className="font-mono font-bold text-secondary text-xs md:text-sm">
                  {data.totalMatched}
                </span>
              </div>
              <div className="bg-surface-container-low p-2 md:p-3 rounded-sm">
                <span className="text-[9px] font-mono text-outline uppercase block mb-0.5">
                  No match
                </span>
                <span className="font-mono font-bold text-tertiary text-xs md:text-sm">
                  {data.unmatchedCount}
                </span>
              </div>
            </div>
          </Collapsible.Content>
        </div>
      </Collapsible.Root>

      {/* Mobile: team bar — SELECTED 0/9 + OPTIMIZE button (mock layout) */}
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
              className="flex-1 py-2.5 bg-green-500/20 text-green-600 dark:text-green-400 border border-green-500/30 font-headline font-bold uppercase tracking-wider text-xs rounded-sm text-center"
            >
              Review Team &rarr;
            </button>
          ) : (
            <button
              onClick={onOptimize}
              disabled={isOptimizing}
              className="flex-1 py-2.5 bg-surface-container-highest text-on-surface font-headline font-bold uppercase tracking-wider text-xs rounded-sm text-center active:scale-[0.98] transition-all disabled:opacity-50"
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
          <aside className="w-[320px] flex-shrink-0" aria-label="Team Builder">
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
              onOptimize={onOptimize}
              isOptimizing={isOptimizing}
              onReviewTeam={onReviewTeam}
            />
          </aside>
        )}
      </div>
    </div>
  );
}
