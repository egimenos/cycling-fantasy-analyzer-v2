import type { OptimizeResponse } from '@cycling-analyzer/shared-types';
import { OptimalTeamCard } from './optimal-team-card';
import { ScoreBreakdown } from './score-breakdown';
import { AlternativeTeams } from './alternative-teams';
import { computeMlTotal } from '@/features/team-builder/hooks/use-team-builder';
import { formatNumber } from '@/shared/lib/utils';
import { useAnimatedNumber } from '@/shared/hooks/use-animated-number';

interface OptimizerPanelProps {
  data: OptimizeResponse;
  budget: number;
  onApplyToRoster: () => void;
}

export function OptimizerPanel({ data, budget, onApplyToRoster }: OptimizerPanelProps) {
  const { optimalTeam } = data;
  const mlTotal = computeMlTotal(optimalTeam.riders);
  const projectedTotal = mlTotal ?? optimalTeam.totalProjectedPts;
  const efficiencyNum = budget > 0 ? (optimalTeam.totalCostHillios / budget) * 100 : 0;
  const animatedScore = useAnimatedNumber(projectedTotal, 1000);
  const animatedEfficiency = useAnimatedNumber(efficiencyNum, 1000);

  return (
    <div data-testid="optimization-panel" className="space-y-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-end gap-6 animate-fade-in-up">
        <div>
          <span className="text-secondary font-mono text-xs tracking-widest uppercase mb-2 block">
            Optimization Results
          </span>
          <h1 className="text-5xl font-extrabold font-headline tracking-tighter text-on-surface">
            OPTIMAL CONFIGURATION
          </h1>
        </div>
        <div
          className="flex items-center gap-8 bg-surface-container-low p-6 rounded-sm animate-scale-in"
          style={{ animationDelay: '150ms' }}
        >
          <div className="text-right">
            <div className="text-xs font-mono text-on-surface-variant uppercase tracking-widest mb-1">
              Projected Total
            </div>
            <div
              data-testid="optimization-projected-total"
              className="text-4xl font-mono font-bold text-secondary tracking-tighter text-glow-secondary"
            >
              {formatNumber(Math.round(animatedScore))}
            </div>
          </div>
          <div className="h-12 w-px bg-outline-variant/20" />
          <div className="text-right">
            <div className="text-xs font-mono text-on-surface-variant uppercase tracking-widest mb-1">
              Budget Efficiency
            </div>
            <div
              data-testid="optimization-budget-efficiency"
              className="text-4xl font-mono font-bold text-tertiary tracking-tighter text-glow-tertiary"
            >
              {animatedEfficiency.toFixed(1)}
              <span className="text-xl">%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Primary Lineup Header + CTA */}
      <div
        className="flex items-center justify-between animate-fade-in-up"
        style={{ animationDelay: '100ms' }}
      >
        <h2
          data-testid="optimization-lineup"
          className="text-xl font-bold font-headline flex items-center gap-2 uppercase tracking-wide"
        >
          Primary Lineup
        </h2>
        <button
          data-testid="optimization-apply-btn"
          onClick={onApplyToRoster}
          className="bg-primary-fixed text-primary-foreground px-8 py-3 rounded-sm font-headline font-extrabold uppercase tracking-tighter shadow-xl shadow-primary/10 hover:brightness-110 active:scale-95 transition-all"
        >
          Apply to Roster
        </button>
      </div>

      {/* Score Distribution */}
      <div className="animate-fade-in-up" style={{ animationDelay: '200ms' }}>
        <ScoreBreakdown breakdown={optimalTeam.scoreBreakdown} />
      </div>

      {/* Rider Grid */}
      <OptimalTeamCard team={optimalTeam} />

      {/* Alternative Teams */}
      {data.alternativeTeams && data.alternativeTeams.length > 0 && (
        <div className="animate-fade-in-up" style={{ animationDelay: '400ms' }}>
          <AlternativeTeams teams={data.alternativeTeams} budget={budget} />
        </div>
      )}
    </div>
  );
}
