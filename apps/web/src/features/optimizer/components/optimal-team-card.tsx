import type { TeamSelection } from '@cycling-analyzer/shared-types';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/shared/ui/card';
import { BudgetIndicator } from '@/shared/ui/budget-indicator';
import { MlBadge } from '@/shared/ui/ml-badge';
import { ScoreBreakdown } from './score-breakdown';
import { computeMlTotal } from '@/features/team-builder/hooks/use-team-builder';
import { formatNumber } from '@/shared/lib/utils';
import { Trophy } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

interface OptimalTeamCardProps {
  team: TeamSelection;
  budget: number;
  lockedIds?: Set<string>;
  variant?: 'primary' | 'secondary';
  title?: string;
}

export function OptimalTeamCard({
  team,
  budget,
  lockedIds,
  variant = 'primary',
  title = 'Optimal Team',
}: OptimalTeamCardProps) {
  const mlTotal = computeMlTotal(team.riders);

  return (
    <Card className={cn(variant === 'secondary' && 'bg-muted/30')}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {variant === 'primary' && <Trophy className="h-4 w-4 text-yellow-500" />}
          {title}
          {mlTotal !== null && <MlBadge />}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="divide-y">
          {team.riders.map((rider) => {
            const isLocked = lockedIds?.has(rider.rawName);
            return (
              <div
                key={rider.rawName}
                className={cn(
                  'flex items-center justify-between py-1.5 text-sm',
                  isLocked && 'border-l-2 border-green-500 pl-2',
                )}
              >
                <div className="min-w-0 flex-1">
                  <span className="font-medium">{rider.rawName}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{rider.rawTeam}</span>
                </div>
                <div className="flex items-center gap-4 text-right">
                  <span className="text-xs text-muted-foreground">
                    {formatNumber(rider.priceHillios)}H
                  </span>
                  <span className="w-12 font-medium">
                    {rider.totalProjectedPts?.toFixed(1) ?? '---'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <ScoreBreakdown breakdown={team.scoreBreakdown} />
      </CardContent>
      <CardFooter className="flex-col items-stretch gap-3 border-t pt-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {mlTotal !== null ? 'Rules Score' : 'Total Score'}
          </span>
          <span className="text-lg font-bold">{team.totalProjectedPts.toFixed(1)}</span>
        </div>
        {mlTotal !== null && (
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              ML Score <MlBadge />
            </span>
            <span className="text-lg font-bold">{mlTotal.toFixed(1)}</span>
          </div>
        )}
        <BudgetIndicator spent={team.totalCostHillios} total={budget} />
      </CardFooter>
    </Card>
  );
}
