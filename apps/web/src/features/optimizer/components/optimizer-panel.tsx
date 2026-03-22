import type { OptimizeResponse } from '@cycling-analyzer/shared-types';
import { OptimalTeamCard } from './optimal-team-card';
import { ScoreBreakdown } from './score-breakdown';
import { formatNumber } from '@/shared/lib/utils';

interface OptimizerPanelProps {
  data: OptimizeResponse;
  budget: number;
  onApplyToRoster: () => void;
}

export function OptimizerPanel({ data, budget, onApplyToRoster }: OptimizerPanelProps) {
  const { optimalTeam } = data;
  const efficiency =
    budget > 0 ? ((optimalTeam.totalCostHillios / budget) * 100).toFixed(1) : '0';

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-end gap-6">
        <div>
          <span className="text-secondary font-mono text-xs tracking-widest uppercase mb-2 block">
            Optimization Results
          </span>
          <h1 className="text-5xl font-extrabold font-headline tracking-tighter text-on-surface">
            OPTIMAL CONFIGURATION
          </h1>
        </div>
        <div className="flex items-center gap-8 bg-surface-container-low p-6 rounded-sm">
          <div className="text-right">
            <div className="text-xs font-mono text-on-surface-variant uppercase tracking-widest mb-1">
              Projected Total
            </div>
            <div className="text-4xl font-mono font-bold text-secondary tracking-tighter">
              {formatNumber(optimalTeam.totalProjectedPts)}
            </div>
          </div>
          <div className="h-12 w-px bg-outline-variant/20" />
          <div className="text-right">
            <div className="text-xs font-mono text-on-surface-variant uppercase tracking-widest mb-1">
              Budget Efficiency
            </div>
            <div className="text-4xl font-mono font-bold text-tertiary tracking-tighter">
              {efficiency}
              <span className="text-xl">%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Primary Lineup Header + CTA */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold font-headline flex items-center gap-2 uppercase tracking-wide">
          Primary Lineup
        </h2>
        <button
          onClick={onApplyToRoster}
          className="bg-primary-fixed text-primary-foreground px-8 py-3 rounded-sm font-headline font-extrabold uppercase tracking-tighter shadow-xl shadow-primary/10 hover:brightness-110 active:scale-95 transition-all"
        >
          Apply to Roster
        </button>
      </div>

      {/* Score Distribution */}
      <ScoreBreakdown breakdown={optimalTeam.scoreBreakdown} />

      {/* Rider Grid */}
      <OptimalTeamCard team={optimalTeam} />
    </div>
  );
}
