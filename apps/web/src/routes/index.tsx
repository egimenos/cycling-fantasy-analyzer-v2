import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import type {
  AnalyzedRider,
  PriceListEntryDto,
  ProfileSummary,
} from '@cycling-analyzer/shared-types';
import { type RaceType } from '@cycling-analyzer/shared-types';
import type { FlowStep } from '@/features/flow/types';
import { FLOW_STEPS, FLOW_STEP_LABELS } from '@/features/flow/types';
import { FlowContext, useFlowReducer, useFlowState } from '@/features/flow/hooks/use-flow-state';
import { FlowTabs } from '@/features/flow/components/flow-tabs';
import { useAnalyze } from '@/features/rider-list/hooks/use-analyze';
import { useLockExclude } from '@/features/rider-list/hooks/use-lock-exclude';
import { useTeamBuilder } from '@/features/team-builder/hooks/use-team-builder';
import { useRaceProfile } from '@/features/rider-list/hooks/use-race-profile';
import { useOptimize } from '@/features/optimizer/hooks/use-optimize';
import { LoadingSpinner } from '@/shared/ui/loading-spinner';
import { useIsDesktop } from '@/shared/hooks/use-media-query';
import type { RiderFilter } from '@/features/rider-list/components/rider-table';
import { Bike, Unlink, TrendingUp, Trophy } from 'lucide-react';

import { SetupTab } from './tabs/setup-tab';

const DashboardTab = lazy(() =>
  import('./tabs/dashboard-tab').then((m) => ({ default: m.DashboardTab })),
);
const OptimizationTab = lazy(() =>
  import('./tabs/optimization-tab').then((m) => ({ default: m.OptimizationTab })),
);
const RosterTab = lazy(() => import('./tabs/roster-tab').then((m) => ({ default: m.RosterTab })));

const EMPTY_RIDERS: AnalyzedRider[] = [];

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
  const riders = analyzeState.status === 'success' ? analyzeState.data.riders : EMPTY_RIDERS;
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

  // Refs for the optimize-success effect to avoid stale closures
  const teamBuilderRef = useRef(teamBuilder);
  teamBuilderRef.current = teamBuilder;
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;
  const isUnlockedRef = useRef(isUnlocked);
  isUnlockedRef.current = isUnlocked;
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  // When optimization succeeds, populate team builder and unlock tabs
  useEffect(() => {
    if (optimizeState.status === 'success' && !isUnlockedRef.current('optimization')) {
      // Populate team builder with optimal riders (atomic set — no stale-state issues)
      teamBuilderRef.current.setTeam(optimizeState.data.optimalTeam.riders.map((r) => r.rawName));
      dispatchRef.current({ type: 'OPTIMIZE_SUCCESS' });
      dispatchRef.current({ type: 'TEAM_COMPLETE' });
      void navigateRef.current({ search: { tab: 'optimization' } });
    }
  }, [optimizeState]);

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
  const isDesktop = useIsDesktop();
  const [mobileFilter, setMobileFilter] = useState<RiderFilter>('all');

  return (
    <>
      <FlowTabs activeTab={tab} onTabChange={handleTabChange} />
      <div role="status" aria-live="polite" className="sr-only">
        {isAnalyzing && 'Analyzing riders...'}
        {isOptimizing && 'Optimizing team...'}
      </div>
      <div className="px-4 md:px-5 lg:px-8 xl:px-12 py-4 md:py-6 overflow-x-hidden">
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
        <Suspense fallback={<LoadingSpinner message="Loading..." />}>
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
                mobileFilter={mobileFilter}
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
        </Suspense>
      </div>

      {/* Mobile bottom nav — outside animated wrappers so position:fixed works */}
      {!isDesktop && tab === 'dashboard' && analyzeState.status === 'success' && (
        <nav className="fixed bottom-0 left-0 right-0 z-40 bg-surface-dim border-t border-outline-variant/15 flex justify-around py-2 safe-area-pb">
          {[
            { value: 'all' as RiderFilter, icon: Bike, label: 'All' },
            { value: 'unmatched' as RiderFilter, icon: Unlink, label: 'Unmatched' },
            { value: 'breakout' as RiderFilter, icon: TrendingUp, label: 'Breakout' },
            { value: 'valuePicks' as RiderFilter, icon: Trophy, label: 'Value Picks' },
          ].map(({ value, icon: Icon, label }) => (
            <button
              key={value}
              onClick={() => setMobileFilter(value)}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-sm transition-colors ${
                mobileFilter === value ? 'text-secondary' : 'text-outline hover:text-on-surface'
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[9px] font-mono uppercase tracking-wider">{label}</span>
            </button>
          ))}
        </nav>
      )}
    </>
  );
}
