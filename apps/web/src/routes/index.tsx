import { useCallback, useEffect, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import type { PriceListEntryDto, ProfileSummary } from '@cycling-analyzer/shared-types';
import { type RaceType } from '@cycling-analyzer/shared-types';
import type { FlowStep } from '@/features/flow/types';
import { FLOW_STEPS } from '@/features/flow/types';
import {
  FlowContext,
  useFlowReducer,
  useFlowState,
} from '@/features/flow/hooks/use-flow-state';
import { FlowTabs } from '@/features/flow/components/flow-tabs';
import { RiderInput } from '@/features/rider-list/components/rider-input';
import { useAnalyze } from '@/features/rider-list/hooks/use-analyze';
import { LoadingSpinner } from '@/shared/ui/loading-spinner';
import { ErrorAlert } from '@/shared/ui/error-alert';
import { TrendingUp } from 'lucide-react';

const VALID_TABS: readonly string[] = ['setup', 'dashboard', 'optimization', 'roster'];

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): { tab: FlowStep } => ({
    tab: VALID_TABS.includes(search.tab as string)
      ? (search.tab as FlowStep)
      : 'setup',
  }),
  component: HomePage,
});

function HomePage() {
  const flowValue = useFlowReducer();

  return (
    <FlowContext.Provider value={flowValue}>
      <HomePageContent />
    </FlowContext.Provider>
  );
}

function HomePageContent() {
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { isUnlocked } = useFlowState();

  const handleTabChange = (newTab: FlowStep): void => {
    if (isUnlocked(newTab)) {
      void navigate({ search: { tab: newTab } });
    }
  };

  useEffect(() => {
    if (!isUnlocked(tab)) {
      const lastUnlocked =
        [...FLOW_STEPS].reverse().find((s) => isUnlocked(s)) ?? 'setup';
      void navigate({ search: { tab: lastUnlocked }, replace: true });
    }
  }, [tab, isUnlocked, navigate]);

  return (
    <>
      <FlowTabs activeTab={tab} onTabChange={handleTabChange} />
      <div className="max-w-7xl mx-auto px-6 py-6">
        {tab === 'setup' && <SetupTab />}
        {tab === 'dashboard' && <DashboardTab />}
        {tab === 'optimization' && <OptimizationTab />}
        {tab === 'roster' && <RosterTab />}
      </div>
    </>
  );
}

function SetupTab() {
  const { state: analyzeState, analyze, retry: retryAnalyze } = useAnalyze();
  const { dispatch } = useFlowState();
  const navigate = Route.useNavigate();
  const [budget, setBudget] = useState(2000);

  // When analysis succeeds, unlock dashboard and navigate
  useEffect(() => {
    if (analyzeState.status === 'success') {
      dispatch({ type: 'ANALYZE_SUCCESS' });
      void navigate({ search: { tab: 'dashboard' } });
    }
  }, [analyzeState.status, dispatch, navigate]);

  const handleAnalyze = useCallback(
    (
      parsedRiders: PriceListEntryDto[],
      raceType: RaceType,
      newBudget: number,
      profileSummary?: ProfileSummary,
      raceSlug?: string,
      year?: number,
    ) => {
      setBudget(newBudget);
      dispatch({ type: 'RESET' });
      void analyze({
        riders: parsedRiders,
        raceType,
        budget: newBudget,
        profileSummary,
        raceSlug,
        year,
      });
    },
    [analyze, dispatch],
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 pt-2">
      {/* Left: Input Controls */}
      <div className="lg:col-span-5 flex flex-col gap-6">
        <RiderInput
          onAnalyze={handleAnalyze}
          isLoading={analyzeState.status === 'loading'}
        />
        {analyzeState.status === 'error' && (
          <ErrorAlert message={analyzeState.error} onRetry={retryAnalyze} />
        )}
      </div>

      {/* Right: Preview */}
      <div className="lg:col-span-7 flex flex-col">
        <div className="flex justify-between items-end mb-4 px-2">
          <div className="flex flex-col">
            <span className="text-outline font-mono text-xs uppercase tracking-tight">
              Real-time Preview
            </span>
            <h2 className="text-xl font-headline font-bold text-on-surface-variant">
              {analyzeState.status === 'loading' ? 'Analyzing...' : 'Analysis Pending'}
            </h2>
          </div>
        </div>

        {analyzeState.status === 'loading' ? (
          <div className="flex-1 min-h-[500px] rounded-sm bg-surface-container-low/30 border border-dashed border-outline-variant/20 flex items-center justify-center">
            <LoadingSpinner message="Analyzing riders..." />
          </div>
        ) : (
          <div className="flex-1 min-h-[500px] rounded-sm bg-surface-container-low/30 border border-dashed border-outline-variant/20 flex flex-col items-center justify-center p-12 relative overflow-hidden">
            <div className="relative z-10 flex flex-col items-center text-center max-w-md">
              <div className="w-16 h-16 rounded-full bg-surface-container-high flex items-center justify-center mb-6">
                <TrendingUp className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-headline font-bold text-on-surface mb-3">
                No Roster Detected
              </h3>
              <p className="text-on-surface-variant font-body leading-relaxed mb-8">
                Input your budget and rider list to see the optimized lineup preview
                here. Our engine uses historical performance data to find the best
                value for your budget.
              </p>
              {/* Skeleton placeholder rows */}
              <div className="w-full flex flex-col gap-3 opacity-30">
                <div className="flex justify-between items-center py-3 border-b border-outline-variant/10">
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded bg-surface-container-high" />
                    <div className="flex flex-col gap-1">
                      <div className="w-32 h-3 bg-surface-container-high rounded" />
                      <div className="w-20 h-2 bg-surface-container-high rounded" />
                    </div>
                  </div>
                  <div className="w-16 h-4 bg-surface-container-high rounded" />
                </div>
                <div className="flex justify-between items-center py-3 border-b border-outline-variant/10">
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded bg-surface-container-high" />
                    <div className="flex flex-col gap-1">
                      <div className="w-40 h-3 bg-surface-container-high rounded" />
                      <div className="w-24 h-2 bg-surface-container-high rounded" />
                    </div>
                  </div>
                  <div className="w-16 h-4 bg-surface-container-high rounded" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer Summary Bar */}
        <div className="mt-6 bg-surface-container-high/40 p-6 rounded-sm flex justify-between items-center border border-outline-variant/5">
          <div className="flex gap-12">
            <div className="flex flex-col">
              <span className="text-[10px] text-outline uppercase font-mono tracking-tighter">
                Selected Riders
              </span>
              <span className="text-xl font-mono font-bold text-outline">-- / --</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] text-outline uppercase font-mono tracking-tighter">
                Budget Allocation
              </span>
              <span className="text-xl font-mono font-bold text-outline">
                0 / {budget}
              </span>
            </div>
          </div>
          <div className="flex gap-4 items-center">
            <span className="text-[10px] text-outline uppercase font-mono tracking-tighter italic">
              Status: System Ready
            </span>
            <div className="w-2 h-2 rounded-full bg-outline/20" />
          </div>
        </div>
      </div>
    </div>
  );
}

function DashboardTab() {
  return (
    <div className="flex items-center justify-center py-24 text-on-surface-variant font-mono text-sm uppercase tracking-widest">
      Dashboard — Coming in WP04
    </div>
  );
}

function OptimizationTab() {
  return (
    <div className="flex items-center justify-center py-24 text-on-surface-variant font-mono text-sm uppercase tracking-widest">
      Optimization — Coming in WP06
    </div>
  );
}

function RosterTab() {
  return (
    <div className="flex items-center justify-center py-24 text-on-surface-variant font-mono text-sm uppercase tracking-widest">
      Roster — Coming in WP07
    </div>
  );
}
