import { useCallback, useEffect, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import type { PriceListEntryDto, ProfileSummary } from '@cycling-analyzer/shared-types';
import { type RaceType } from '@cycling-analyzer/shared-types';
import type { FlowStep } from '@/features/flow/types';
import { FLOW_STEPS, FLOW_STEP_LABELS } from '@/features/flow/types';
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
import { TableSkeleton } from '@/shared/ui/table-skeleton';

import { useOptimize } from '@/features/optimizer/hooks/use-optimize';
import { OptimizerPanel } from '@/features/optimizer/components/optimizer-panel';
import { TeamSummary } from '@/features/team-builder/components/team-summary';
import {
  TrendingUp,
  Settings,
  ChevronDown,
  Trophy,
  Users,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
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
      // Populate team builder with optimal riders (atomic set — no stale-state issues)
      teamBuilder.setTeam(optimizeState.data.optimalTeam.riders.map((r) => r.rawName));
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
    document.title = `${FLOW_STEP_LABELS[tab]} — Cycling Fantasy Optimizer`;
  }, [tab]);

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

  const isAnalyzing = analyzeState.status === 'loading';
  const isOptimizing = optimizeState.status === 'loading';

  return (
    <>
      <FlowTabs activeTab={tab} onTabChange={handleTabChange} />
      <div role="status" aria-live="polite" className="sr-only">
        {isAnalyzing && 'Analyzing riders...'}
        {isOptimizing && 'Optimizing team...'}
      </div>
      <div className="max-w-7xl mx-auto px-6 py-6">
        {tab === 'setup' && (
          <div key="setup" className="animate-fade-in-up">
            <SetupTab
              onAnalyze={handleAnalyze}
              isLoading={isAnalyzing}
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
          </div>
        )}
        {tab === 'dashboard' && analyzeState.status === 'success' && (
          <div key="dashboard" className="animate-fade-in-up">
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
              isOptimizing={isOptimizing}
              onReviewTeam={handleReviewTeam}
            />
          </div>
        )}
        {tab === 'optimization' && (
          <div
            key="optimization"
            className="animate-fade-in-up"
            aria-live="polite"
            aria-atomic="true"
          >
            <OptimizationTab
              optimizeState={optimizeState}
              budget={budget}
              onApplyToRoster={handleApplyToRoster}
            />
          </div>
        )}
        {tab === 'roster' && (
          <div key="roster" className="animate-fade-in-up">
            <RosterTab teamBuilder={teamBuilder} budget={budget} onReset={handleFullReset} />
          </div>
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
    <div data-testid="tab-content-setup" className="grid grid-cols-1 lg:grid-cols-12 gap-12 pt-2">
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
      </div>

      <div className="lg:col-span-7 flex flex-col">
        <div className="flex justify-between items-end mb-4 px-2">
          <div className="flex flex-col">
            <span className="text-outline font-mono text-xs uppercase tracking-tight">
              Real-time Preview
            </span>
            <h2 className="text-xl font-headline font-bold text-on-surface-variant">
              {error ? 'Analysis Failed' : isLoading ? 'Analyzing...' : 'Analysis Pending'}
            </h2>
          </div>
        </div>

        {error ? (
          <div className="flex-1 min-h-[500px] rounded-sm bg-error-container/[0.06] border border-error/20 flex flex-col items-center justify-center p-12 relative overflow-hidden animate-fade-in">
            {/* Diagonal hazard stripes */}
            <div
              className="absolute inset-0 opacity-[0.03] pointer-events-none"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(135deg, transparent, transparent 20px, currentColor 20px, currentColor 22px)',
                color: 'var(--error)',
              }}
            />
            {/* Bottom glow */}
            <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-error/[0.04] to-transparent pointer-events-none" />

            <div className="relative z-10 flex flex-col items-center text-center max-w-lg">
              {/* Pulsing error icon */}
              <div className="relative mb-8">
                <div className="absolute inset-0 w-24 h-24 rounded-full bg-error/10 animate-pulse" />
                <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-error/20 to-error-container/30 flex items-center justify-center ring-1 ring-error/30">
                  <AlertTriangle className="h-11 w-11 text-error" />
                </div>
              </div>

              <h3 className="text-2xl font-headline font-extrabold text-on-surface mb-3 tracking-tight">
                Something Went Wrong
              </h3>

              <div className="bg-surface-container-high/80 border border-outline-variant/15 rounded-sm px-5 py-4 mb-6 w-full backdrop-blur-sm">
                <p className="text-sm font-mono text-error leading-relaxed break-words">{error}</p>
              </div>

              <p className="text-on-surface-variant font-body text-sm leading-relaxed mb-8 max-w-sm">
                The analysis could not be completed. Check that all services are running and your
                configuration is correct, then try again.
              </p>

              {onRetry && (
                <button
                  onClick={onRetry}
                  className="inline-flex items-center gap-2.5 px-6 py-3 bg-error/10 hover:bg-error/20 border border-error/30 text-error font-mono font-bold text-sm uppercase tracking-wider rounded-sm transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                  <RefreshCw className="h-4 w-4" />
                  Retry Analysis
                </button>
              )}

              <div className="flex items-center gap-2 text-[10px] font-mono text-error/60 uppercase tracking-widest mt-6">
                <span className="w-1.5 h-1.5 rounded-full bg-error/40" />
                Error
              </div>
            </div>
          </div>
        ) : isLoading ? (
          <div className="flex-1 min-h-[500px] flex flex-col gap-4">
            <div className="flex items-center gap-3 px-1">
              <LoadingSpinner />
              <span className="text-sm text-on-surface-variant">Analyzing riders...</span>
            </div>
            <TableSkeleton rows={10} />
          </div>
        ) : (
          <div className="flex-1 min-h-[500px] rounded-sm bg-surface-container-low/30 border border-dashed border-outline-variant/20 flex flex-col items-center justify-center p-12 relative overflow-hidden">
            {/* Atmospheric road line */}
            <div className="absolute inset-0 flex justify-center pointer-events-none">
              <div className="w-px h-full bg-gradient-to-b from-transparent via-outline-variant/10 to-transparent" />
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-secondary/[0.02] to-transparent pointer-events-none" />

            <div className="relative z-10 flex flex-col items-center text-center max-w-md animate-fade-in">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-secondary/20 to-primary/10 flex items-center justify-center mb-6 ring-1 ring-secondary/20">
                <TrendingUp className="h-10 w-10 text-secondary" />
              </div>
              <h3 className="text-2xl font-headline font-extrabold text-on-surface mb-3 tracking-tight">
                Ready to Ride
              </h3>
              <p className="text-on-surface-variant font-body leading-relaxed mb-6 text-sm">
                Configure your race profile and rider list to unlock the analysis engine. Your
                optimized lineup will appear here.
              </p>
              <div className="flex items-center gap-2 text-[10px] font-mono text-outline uppercase tracking-widest">
                <span className="w-1.5 h-1.5 rounded-full bg-secondary/40 animate-pulse" />
                Awaiting Input
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 bg-surface-container-high/40 p-5 rounded-sm border border-outline-variant/10 animate-fade-in">
          <div className="flex justify-between items-center">
            <div className="flex gap-8 items-center">
              <div className="flex flex-col">
                <span className="text-[10px] text-outline uppercase font-mono tracking-tighter">
                  Selected Riders
                </span>
                <span className="text-lg font-mono font-bold text-outline">-- / 9</span>
              </div>
              <div className="h-8 w-px bg-outline-variant/15" />
              <div className="flex flex-col">
                <span className="text-[10px] text-outline uppercase font-mono tracking-tighter">
                  Budget
                </span>
                <span className="text-lg font-mono font-bold text-outline">
                  0 / {budget}
                  <span className="text-[10px] ml-0.5 text-outline/50">H</span>
                </span>
              </div>
              <div className="h-8 w-px bg-outline-variant/15" />
              <div className="flex flex-col">
                <span className="text-[10px] text-outline uppercase font-mono tracking-tighter">
                  Projected Score
                </span>
                <span className="text-lg font-mono font-bold text-outline">—</span>
              </div>
            </div>
            <div className="flex gap-3 items-center bg-surface-container-highest/50 px-3 py-1.5 rounded-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary/40 animate-pulse" />
              <span className="text-[10px] text-on-surface-variant uppercase font-mono tracking-wider font-medium">
                System Ready
              </span>
            </div>
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
      <div
        data-testid="tab-content-optimization"
        className="flex flex-col items-center justify-center py-24 animate-fade-in"
      >
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-tertiary/15 to-primary/10 flex items-center justify-center mb-6 ring-1 ring-tertiary/20">
          <Trophy className="h-10 w-10 text-tertiary/60" />
        </div>
        <h3 className="text-xl font-headline font-extrabold text-on-surface mb-2 tracking-tight">
          No Results Yet
        </h3>
        <p className="text-sm text-on-surface-variant max-w-sm text-center">
          Run the optimizer from the Dashboard tab to find the best lineup for your budget.
        </p>
        <div className="flex items-center gap-2 text-[10px] font-mono text-outline uppercase tracking-widest mt-4">
          <span className="w-1.5 h-1.5 rounded-full bg-tertiary/30" />
          Awaiting Optimization
        </div>
      </div>
    );
  }

  return (
    <div data-testid="tab-content-optimization">
      <OptimizerPanel data={optimizeState.data} budget={budget} onApplyToRoster={onApplyToRoster} />
    </div>
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
      <div
        data-testid="tab-content-roster"
        className="flex flex-col items-center justify-center py-24 animate-fade-in"
      >
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-stage/15 to-primary/10 flex items-center justify-center mb-6 ring-1 ring-stage/20">
          <Users className="h-10 w-10 text-stage/60" />
        </div>
        <h3 className="text-xl font-headline font-extrabold text-on-surface mb-2 tracking-tight">
          No Team Selected
        </h3>
        <p className="text-sm text-on-surface-variant max-w-sm text-center">
          Build your 9-rider roster from the Dashboard or run the optimizer to auto-fill.
        </p>
        <div className="flex items-center gap-2 text-[10px] font-mono text-outline uppercase tracking-widest mt-4">
          <span className="w-1.5 h-1.5 rounded-full bg-stage/30" />
          Awaiting Roster
        </div>
      </div>
    );
  }

  return (
    <div data-testid="tab-content-roster">
      <TeamSummary
        riders={teamBuilder.selectedRiders}
        totalCost={teamBuilder.totalCost}
        totalScore={teamBuilder.totalScore}
        mlTotalScore={teamBuilder.mlTotalScore}
        budget={budget}
        onReset={onReset}
      />
    </div>
  );
}
