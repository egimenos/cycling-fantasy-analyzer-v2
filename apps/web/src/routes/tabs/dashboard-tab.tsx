import { useState } from 'react';
import type { AnalyzeResponse } from '@cycling-analyzer/shared-types';
import { RiderTable } from '@/features/rider-list/components/rider-table';
import { RaceProfileSummary } from '@/features/rider-list/components/race-profile-summary';
import { TeamBuilderPanel } from '@/features/team-builder/components/team-builder-panel';
import type { useTeamBuilder } from '@/features/team-builder/hooks/use-team-builder';
import type { useRaceProfile } from '@/features/rider-list/hooks/use-race-profile';
import { Settings, ChevronDown } from 'lucide-react';
import * as Collapsible from '@radix-ui/react-collapsible';

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
}: DashboardTabProps) {
  const [configOpen, setConfigOpen] = useState(false);

  return (
    <div data-testid="tab-content-dashboard" className="space-y-6">
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
          <Collapsible.Trigger className="flex items-center justify-between px-6 py-3 w-full cursor-pointer hover:bg-surface-container-high transition-colors">
            <div className="flex items-center gap-3">
              <Settings className="h-4 w-4 text-outline" />
              <span className="text-sm font-bold uppercase tracking-wider">
                Configuration & Inputs
              </span>
              <span className="text-[10px] font-mono text-outline ml-2">BUDGET ({budget}H)</span>
            </div>
            <ChevronDown
              className={`h-4 w-4 text-outline transition-transform ${configOpen ? 'rotate-180' : ''}`}
            />
          </Collapsible.Trigger>
          <Collapsible.Content className="px-6 pb-5 text-sm text-on-surface-variant">
            <div className="pt-3 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-surface-container-low p-3 rounded-sm">
                <span className="text-[9px] font-mono text-outline uppercase block mb-1">
                  Budget
                </span>
                <span className="font-mono font-bold text-on-surface">{budget}H</span>
              </div>
              <div className="bg-surface-container-low p-3 rounded-sm">
                <span className="text-[9px] font-mono text-outline uppercase block mb-1">
                  Total Riders
                </span>
                <span className="font-mono font-bold text-on-surface">{data.riders.length}</span>
              </div>
              <div className="bg-surface-container-low p-3 rounded-sm">
                <span className="text-[9px] font-mono text-outline uppercase block mb-1">
                  Matched
                </span>
                <span className="font-mono font-bold text-secondary">{data.totalMatched}</span>
              </div>
              <div className="bg-surface-container-low p-3 rounded-sm">
                <span className="text-[9px] font-mono text-outline uppercase block mb-1">
                  Unmatched
                </span>
                <span className="font-mono font-bold text-tertiary">{data.unmatchedCount}</span>
              </div>
            </div>
          </Collapsible.Content>
        </div>
      </Collapsible.Root>

      {/* Main Content: Table + Sidebar */}
      <div className="flex flex-col lg:flex-row gap-6">
        <section className="lg:w-[70%] flex flex-col gap-4">
          <RiderTable
            data={data}
            lockedIds={lockedIds}
            excludedIds={excludedIds}
            selectedNames={selectedNames}
            onToggleLock={onToggleLock}
            onToggleExclude={onToggleExclude}
            onToggleSelect={onToggleSelect}
            canSelect={canSelect}
          />
        </section>

        <aside className="lg:w-[30%]" aria-label="Team Builder">
          <TeamBuilderPanel
            selectedRiders={teamBuilder.selectedRiders}
            totalCost={teamBuilder.totalCost}
            totalScore={teamBuilder.totalScore}
            mlTotalScore={teamBuilder.mlTotalScore}
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
      </div>
    </div>
  );
}
