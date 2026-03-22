import type { AnalyzedRider, TeamSelection } from '@cycling-analyzer/shared-types';
import { Bike } from 'lucide-react';
import { formatNumber } from '@/shared/lib/utils';

function getEffectiveScore(rider: AnalyzedRider): number | null {
  return rider.mlPredictedScore ?? rider.totalProjectedPts;
}

interface OptimalTeamCardProps {
  team: TeamSelection;
}

export function OptimalTeamCard({ team }: OptimalTeamCardProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-1">
      {team.riders.map((rider) => {
        const score = getEffectiveScore(rider);
        return (
          <div
            key={rider.rawName}
            className="bg-surface-container-high p-5 flex items-center gap-4 group hover:bg-surface-bright transition-colors relative overflow-hidden"
          >
            <div className="w-14 h-14 rounded-sm bg-surface-container-highest flex-shrink-0 flex items-center justify-center">
              <Bike className="h-6 w-6 text-on-primary-container" />
            </div>
            <div className="flex-grow min-w-0">
              <div className="font-headline font-bold text-sm text-on-surface truncate">
                {rider.rawName}
              </div>
              <div className="text-[10px] font-mono text-on-surface-variant uppercase tracking-widest truncate">
                {rider.rawTeam}
              </div>
              <div className="flex justify-between items-baseline mt-1">
                <span className="font-mono text-xs text-on-primary-container">
                  {formatNumber(rider.priceHillios)}H
                </span>
                <span className="font-mono text-sm font-bold text-on-surface flex-shrink-0">
                  {score?.toFixed(0) ?? '—'} pts
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
