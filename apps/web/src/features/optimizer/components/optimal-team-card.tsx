import type { AnalyzedRider, TeamSelection } from '@cycling-analyzer/shared-types';
import { Bike } from 'lucide-react';

function getEffectiveScore(rider: AnalyzedRider): number | null {
  return rider.mlPredictedScore ?? rider.totalProjectedPts;
}

interface OptimalTeamCardProps {
  team: TeamSelection;
}

export function OptimalTeamCard({ team }: OptimalTeamCardProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-1">
      {team.riders.map((rider, index) => {
        const isTopThree = index < 3;
        const score = getEffectiveScore(rider);
        return (
          <div
            key={rider.rawName}
            className="bg-surface-container-high p-5 flex items-center gap-4 group hover:bg-surface-bright transition-colors relative overflow-hidden"
          >
            <div
              className={`${isTopThree ? 'w-16 h-16' : 'w-12 h-12'} rounded-sm bg-surface-container-highest flex-shrink-0 flex items-center justify-center`}
            >
              <Bike className={`${isTopThree ? 'h-7 w-7' : 'h-5 w-5'} text-on-primary-container`} />
            </div>
            <div className="flex-grow min-w-0">
              <div className="text-[10px] font-mono text-on-surface-variant uppercase tracking-widest mb-0.5 truncate">
                {rider.rawName}
              </div>
              <div className="flex justify-between items-baseline">
                <span className="font-bold font-headline tracking-tight truncate">
                  {rider.rawTeam}
                </span>
                <span className="font-mono text-sm text-on-surface flex-shrink-0 ml-2">
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
