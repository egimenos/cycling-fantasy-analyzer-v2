import type { TeamSelection } from '@cycling-analyzer/shared-types';
import { Bike, Crown } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip';
import { formatNumber, cn } from '@/shared/lib/utils';
import { getEffectiveScore } from '@/shared/lib/rider-utils';
import { CategoryBreakdown } from '@/shared/ui/category-breakdown';

interface OptimalTeamCardProps {
  team: TeamSelection;
  variant?: 'primary' | 'secondary';
}

export function OptimalTeamCard({ team, variant = 'primary' }: OptimalTeamCardProps) {
  const isPrimary = variant === 'primary';

  return (
    <ul className={cn('grid grid-cols-1 md:grid-cols-3 gap-1', isPrimary && 'stagger-children')}>
      {team.riders.map((rider, index) => {
        const score = getEffectiveScore(rider);
        const isLeader = index === 0 && isPrimary;
        const breakdown = rider.mlBreakdown ?? rider.categoryScores;
        return (
          <Tooltip key={rider.rawName}>
            <TooltipTrigger asChild>
              <li
                data-testid={`optimization-rider-card-${rider.rawName}`}
                className={cn(
                  'p-3 md:p-5 flex items-center gap-3 md:gap-4 group transition-all relative overflow-hidden cursor-default',
                  isLeader
                    ? 'bg-gradient-to-br from-surface-container-high to-tertiary/[0.06] border-l-2 border-tertiary hover:brightness-110'
                    : 'bg-surface-container-high hover:bg-surface-bright',
                )}
              >
                {/* Rank badge */}
                <div className="absolute top-1.5 right-2 text-[9px] font-mono font-bold text-outline/30">
                  #{String(index + 1).padStart(2, '0')}
                </div>

                <div
                  className={cn(
                    'w-14 h-14 rounded-sm flex-shrink-0 flex items-center justify-center',
                    isLeader
                      ? 'bg-tertiary/15 ring-1 ring-tertiary/30'
                      : 'bg-surface-container-highest',
                  )}
                >
                  {isLeader ? (
                    <Crown className="h-6 w-6 text-tertiary" />
                  ) : (
                    <Bike className="h-6 w-6 text-on-primary-container" />
                  )}
                </div>
                <div className="flex-grow min-w-0">
                  <div
                    className={cn(
                      'font-headline font-bold text-sm text-on-surface truncate',
                      isLeader && 'text-base',
                    )}
                  >
                    {rider.rawName}
                  </div>
                  <div className="text-[10px] font-mono text-on-surface-variant uppercase tracking-widest truncate">
                    {rider.rawTeam}
                  </div>
                  <div className="flex justify-between items-baseline mt-1">
                    <span className="font-mono text-xs text-on-primary-container">
                      {formatNumber(rider.priceHillios)}
                    </span>
                    <span
                      className={cn(
                        'font-mono text-sm font-bold flex-shrink-0',
                        isLeader ? 'text-tertiary' : 'text-on-surface',
                      )}
                    >
                      {score?.toFixed(0) ?? '—'} pts
                    </span>
                  </div>
                </div>
              </li>
            </TooltipTrigger>
            {breakdown && (
              <TooltipContent className="p-2 bg-surface-container-highest border-outline-variant/20 min-w-[200px]">
                <CategoryBreakdown breakdown={breakdown} variant="compact" />
              </TooltipContent>
            )}
          </Tooltip>
        );
      })}
    </ul>
  );
}
