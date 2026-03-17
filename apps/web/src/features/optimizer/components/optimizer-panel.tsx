import type { AnalyzedRider } from '@cycling-analyzer/shared-types';
import { Button } from '@/shared/ui/button';
import { ErrorAlert } from '@/shared/ui/error-alert';
import { LoadingSpinner } from '@/shared/ui/loading-spinner';
import { OptimalTeamCard } from './optimal-team-card';
import { AlternativeTeams } from './alternative-teams';
import { useOptimize } from '../hooks/use-optimize';
import { Loader2 } from 'lucide-react';

interface OptimizerPanelProps {
  riders: AnalyzedRider[];
  budget: number;
  mustInclude: string[];
  mustExclude: string[];
  lockedIds: Set<string>;
}

export function OptimizerPanel({
  riders,
  budget,
  mustInclude,
  mustExclude,
  lockedIds,
}: OptimizerPanelProps) {
  const { state, optimize, retry } = useOptimize();
  const hasMatchedRiders = riders.some((r) => !r.unmatched);

  const handleOptimize = () => {
    void optimize({ riders, budget, mustInclude, mustExclude });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button onClick={handleOptimize} disabled={!hasMatchedRiders || state.status === 'loading'}>
          {state.status === 'loading' ? (
            <>
              <Loader2 className="animate-spin" />
              Optimizing...
            </>
          ) : (
            'Get Optimal Team'
          )}
        </Button>
      </div>

      {state.status === 'loading' && <LoadingSpinner message="Finding optimal team..." />}

      {state.status === 'error' && <ErrorAlert message={state.error} onRetry={retry} />}

      {state.status === 'success' && (
        <div className="space-y-6">
          <OptimalTeamCard team={state.data.optimalTeam} budget={budget} lockedIds={lockedIds} />
          <AlternativeTeams teams={state.data.alternativeTeams} budget={budget} />
        </div>
      )}
    </div>
  );
}
