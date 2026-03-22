import { useEffect } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import type { FlowStep } from '@/features/flow/types';
import { FLOW_STEPS } from '@/features/flow/types';
import {
  FlowContext,
  useFlowReducer,
  useFlowState,
} from '@/features/flow/hooks/use-flow-state';
import { FlowTabs } from '@/features/flow/components/flow-tabs';
import { RiderListPage } from '@/features/rider-list/components/rider-list-page';

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
  return <RiderListPage />;
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
