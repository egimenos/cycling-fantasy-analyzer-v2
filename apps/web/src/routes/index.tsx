import { useCallback, useEffect, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import type { PriceListEntryDto, ProfileSummary } from '@cycling-analyzer/shared-types';
import { type RaceType } from '@cycling-analyzer/shared-types';
import type { FlowStep } from '@/features/flow/types';
import { FLOW_STEPS } from '@/features/flow/types';
import { FlowContext, useFlowReducer, useFlowState } from '@/features/flow/hooks/use-flow-state';
import { FlowTabs } from '@/features/flow/components/flow-tabs';
import { RiderInput } from '@/features/rider-list/components/rider-input';
import { RiderTable } from '@/features/rider-list/components/rider-table';
import { RaceProfileSummary } from '@/features/rider-list/components/race-profile-summary';
import { TeamBuilderPanel } from '@/features/team-builder/components/team-builder-panel';
import { useAnalyze } from '@/features/rider-list/hooks/use-analyze';
import { useLockExclude } from '@/features/rider-list/hooks/use-lock-exclude';
import { useTeamBuilder } from '@/features/team-builder/hooks/use-team-builder';
import { useRaceProfile } from '@/features/rider-list/hooks/use-race-profile';
import { LoadingSpinner } from '@/shared/ui/loading-spinner';
import { ErrorAlert } from '@/shared/ui/error-alert';
import { useOptimize } from '@/features/optimizer/hooks/use-optimize';
import { OptimizerPanel } from '@/features/optimizer/components/optimizer-panel';
import { TeamSummary } from '@/features/team-builder/components/team-summary';
import { TrendingUp, Settings, ChevronDown } from 'lucide-react';
import * as Collapsible from '@radix-ui/react-collapsible';

const VALID_TABS: readonly string[] = ['setup', 'dashboard', 'optimization', 'roster'];

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): { tab: FlowStep } => ({
    tab: VALID_TABS.includes(search.tab as string) ? (search.tab as FlowStep) : 'setup',
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
  const { isUnlocked, dispatch } = useFlowState();

  // Shared state across tabs — persists when switching tabs
  const { state: analyzeState, analyze, retry: retryAnalyze } = useAnalyze();
  const { state: optimizeState, optimize, reset: resetOptimize } = useOptimize();
  const { lockedIds, excludedIds, toggleLock, toggleExclude } = useLockExclude();
  const [budget, setBudget] = useState(2000);
  const [raceUrl, setRaceUrl] = useState('');
  const [riderText, setRiderText] = useState('');
  const [gameUrl, setGameUrl] = useState('');
  const riders = analyzeState.status === 'success' ? analyzeState.data.riders : [];
  const teamBuilder = useTeamBuilder(budget, riders);
  const profileState = useRaceProfile(raceUrl);

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

  // Lock/exclude with flow invalidation (T024)
  const handleToggleLock = useCallback(
    (name: string) => {
      toggleLock(name);
      resetOptimize();
      dispatch({ type: 'INVALIDATE_FROM', step: 'optimization' });
    },
    [toggleLock, resetOptimize, dispatch],
  );

  const handleToggleExclude = useCallback(
    (name: string) => {
      toggleExclude(name);
      resetOptimize();
      dispatch({ type: 'INVALIDATE_FROM', step: 'optimization' });
    },
    [toggleExclude, resetOptimize, dispatch],
  );

  // Handle optimize
  const handleOptimize = useCallback(() => {
    if (analyzeState.status !== 'success') return;
    const mustInclude = Array.from(lockedIds);
    const mustExclude = Array.from(excludedIds);
    void optimize({
      riders: analyzeState.data.riders,
      budget,
      mustInclude,
      mustExclude,
    });
  }, [analyzeState, lockedIds, excludedIds, budget, optimize]);

  // When optimization succeeds, populate team builder and unlock tabs
  useEffect(() => {
    if (optimizeState.status === 'success' && !isUnlocked('optimization')) {
      // Populate team builder with optimal riders
      teamBuilder.clearAll();
      for (const rider of optimizeState.data.optimalTeam.riders) {
        teamBuilder.addRider(rider.rawName);
      }
      dispatch({ type: 'OPTIMIZE_SUCCESS' });
      dispatch({ type: 'TEAM_COMPLETE' });
      void navigate({ search: { tab: 'optimization' } });
    }
  }, [optimizeState.status]); // eslint-disable-line

  // Handle apply optimal team to roster (just navigates — team already populated)
  const handleApplyToRoster = useCallback(() => {
    void navigate({ search: { tab: 'roster' } });
  }, [navigate]);

  // Handle full reset from Roster tab
  const handleFullReset = useCallback(() => {
    teamBuilder.clearAll();
    resetOptimize();
    dispatch({ type: 'RESET' });
    void navigate({ search: { tab: 'setup' } });
  }, [teamBuilder, resetOptimize, dispatch, navigate]);

  // Handle team complete (manual path)
  const handleReviewTeam = useCallback(() => {
    dispatch({ type: 'TEAM_COMPLETE' });
    void navigate({ search: { tab: 'roster' } });
  }, [dispatch, navigate]);

  // Tab navigation
  const handleTabChange = (newTab: FlowStep): void => {
    if (isUnlocked(newTab)) {
      void navigate({ search: { tab: newTab } });
    }
  };

  useEffect(() => {
    if (!isUnlocked(tab)) {
      const lastUnlocked = [...FLOW_STEPS].reverse().find((s) => isUnlocked(s)) ?? 'setup';
      void navigate({ search: { tab: lastUnlocked }, replace: true });
    }
  }, [tab, isUnlocked, navigate]);

  // When analysis succeeds, unlock dashboard and navigate
  useEffect(() => {
    if (analyzeState.status === 'success' && !isUnlocked('dashboard')) {
      dispatch({ type: 'ANALYZE_SUCCESS' });
      void navigate({ search: { tab: 'dashboard' } });
    }
  }, [analyzeState.status, dispatch, navigate, isUnlocked]);

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
      teamBuilder.clearAll();
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
    [analyze, teamBuilder, dispatch],
  );

  return (
    <>
      <FlowTabs activeTab={tab} onTabChange={handleTabChange} />
      <div className="max-w-7xl mx-auto px-6 py-6">
        {tab === 'setup' && (
          <SetupTab
            onAnalyze={handleAnalyze}
            isLoading={analyzeState.status === 'loading'}
            error={analyzeState.status === 'error' ? analyzeState.error : undefined}
            onRetry={retryAnalyze}
            budget={budget}
            riderText={riderText}
            onRiderTextChange={setRiderText}
            raceUrl={raceUrl}
            onRaceUrlChange={setRaceUrl}
            gameUrl={gameUrl}
            onGameUrlChange={setGameUrl}
            onBudgetChange={setBudget}
            profileState={profileState}
          />
        )}
        {tab === 'dashboard' && analyzeState.status === 'success' && (
          <DashboardTab
            data={analyzeState.data}
            lockedIds={lockedIds}
            excludedIds={excludedIds}
            selectedNames={teamBuilder.selectedNames}
            onToggleLock={handleToggleLock}
            onToggleExclude={handleToggleExclude}
            onToggleSelect={handleToggleSelect}
            canSelect={teamBuilder.canSelect}
            teamBuilder={teamBuilder}
            budget={budget}
            profileState={profileState}
            onOptimize={handleOptimize}
            isOptimizing={optimizeState.status === 'loading'}
            onReviewTeam={handleReviewTeam}
          />
        )}
        {tab === 'optimization' && (
          <OptimizationTab
            optimizeState={optimizeState}
            budget={budget}
            onApplyToRoster={handleApplyToRoster}
          />
        )}
        {tab === 'roster' && (
          <RosterTab teamBuilder={teamBuilder} budget={budget} onReset={handleFullReset} />
        )}
      </div>
    </>
  );
}

// ============================================================
// Setup Tab
// ============================================================

interface SetupTabProps {
  onAnalyze: (
    riders: PriceListEntryDto[],
    raceType: RaceType,
    budget: number,
    profileSummary?: ProfileSummary,
    raceSlug?: string,
    year?: number,
  ) => void;
  isLoading: boolean;
  error?: string;
  onRetry?: () => void;
  budget: number;
  riderText: string;
  onRiderTextChange: (text: string) => void;
  raceUrl: string;
  onRaceUrlChange: (url: string) => void;
  gameUrl: string;
  onGameUrlChange: (url: string) => void;
  onBudgetChange: (budget: number) => void;
  profileState: ReturnType<typeof useRaceProfile>;
}

function SetupTab({
  onAnalyze,
  isLoading,
  error,
  onRetry,
  budget,
  riderText,
  onRiderTextChange,
  raceUrl,
  onRaceUrlChange,
  gameUrl,
  onGameUrlChange,
  onBudgetChange,
  profileState,
}: SetupTabProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 pt-2">
      <div className="lg:col-span-5 flex flex-col gap-6">
        <RiderInput
          onAnalyze={onAnalyze}
          isLoading={isLoading}
          text={riderText}
          onTextChange={onRiderTextChange}
          raceUrl={raceUrl}
          onRaceUrlChange={onRaceUrlChange}
          gameUrl={gameUrl}
          onGameUrlChange={onGameUrlChange}
          budget={budget}
          onBudgetChange={onBudgetChange}
          profileState={profileState}
        />
        {error && <ErrorAlert message={error} onRetry={onRetry} />}
      </div>

      <div className="lg:col-span-7 flex flex-col">
        <div className="flex justify-between items-end mb-4 px-2">
          <div className="flex flex-col">
            <span className="text-outline font-mono text-xs uppercase tracking-tight">
              Real-time Preview
            </span>
            <h2 className="text-xl font-headline font-bold text-on-surface-variant">
              {isLoading ? 'Analyzing...' : 'Analysis Pending'}
            </h2>
          </div>
        </div>

        {isLoading ? (
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
                Input your budget and rider list to see the optimized lineup preview here. Our
                engine uses historical performance data to find the best value for your budget.
              </p>
              <div className="w-full flex flex-col gap-3 opacity-50">
                <div className="flex justify-between items-center py-3 border-b border-outline-variant/20">
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded bg-surface-container-highest" />
                    <div className="flex flex-col gap-1">
                      <div className="w-32 h-3 bg-surface-container-highest rounded" />
                      <div className="w-20 h-2 bg-surface-container-highest rounded" />
                    </div>
                  </div>
                  <div className="w-16 h-4 bg-surface-container-highest rounded" />
                </div>
                <div className="flex justify-between items-center py-3 border-b border-outline-variant/20">
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded bg-surface-container-highest" />
                    <div className="flex flex-col gap-1">
                      <div className="w-40 h-3 bg-surface-container-highest rounded" />
                      <div className="w-24 h-2 bg-surface-container-highest rounded" />
                    </div>
                  </div>
                  <div className="w-16 h-4 bg-surface-container-highest rounded" />
                </div>
              </div>
            </div>
          </div>
        )}

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
              <span className="text-xl font-mono font-bold text-outline">0 / {budget}</span>
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

// ============================================================
// Dashboard Tab
// ============================================================

interface DashboardTabProps {
  data: import('@cycling-analyzer/shared-types').AnalyzeResponse;
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

function DashboardTab({
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
    <div className="space-y-6">
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
          <Collapsible.Content className="px-6 pb-4 text-sm text-on-surface-variant">
            <p className="pt-2">
              Budget: {budget}H | Riders: {data.riders.length} | Matched: {data.totalMatched}
            </p>
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

        <aside className="lg:w-[30%]">
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

// ============================================================
// Placeholder Tabs
// ============================================================

interface OptimizationTabProps {
  optimizeState: ReturnType<typeof useOptimize>['state'];
  budget: number;
  onApplyToRoster: () => void;
}

function OptimizationTab({ optimizeState, budget, onApplyToRoster }: OptimizationTabProps) {
  if (optimizeState.status !== 'success') {
    return (
      <div className="flex items-center justify-center py-24 text-on-surface-variant font-mono text-sm uppercase tracking-widest">
        No optimization results available.
      </div>
    );
  }

  return (
    <OptimizerPanel data={optimizeState.data} budget={budget} onApplyToRoster={onApplyToRoster} />
  );
}

interface RosterTabProps {
  teamBuilder: ReturnType<typeof useTeamBuilder>;
  budget: number;
  onReset: () => void;
}

function RosterTab({ teamBuilder, budget, onReset }: RosterTabProps) {
  if (teamBuilder.selectedRiders.length === 0) {
    return (
      <div className="flex items-center justify-center py-24 text-on-surface-variant font-mono text-sm uppercase tracking-widest">
        No team selected.
      </div>
    );
  }

  return (
    <TeamSummary
      riders={teamBuilder.selectedRiders}
      totalCost={teamBuilder.totalCost}
      totalScore={teamBuilder.totalScore}
      mlTotalScore={teamBuilder.mlTotalScore}
      budget={budget}
      onReset={onReset}
    />
  );
}
