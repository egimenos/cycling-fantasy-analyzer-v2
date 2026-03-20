import type { TeamSelection } from '@cycling-analyzer/shared-types';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/shared/ui/accordion';
import { MlBadge } from '@/shared/ui/ml-badge';
import { computeMlTotal } from '@/features/team-builder/hooks/use-team-builder';
import { OptimalTeamCard } from './optimal-team-card';

interface AlternativeTeamsProps {
  teams: TeamSelection[];
  budget: number;
}

export function AlternativeTeams({ teams, budget }: AlternativeTeamsProps) {
  if (teams.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        No alternative teams available.
      </p>
    );
  }

  return (
    <Accordion type="multiple">
      {teams.map((team, index) => {
        const mlTotal = computeMlTotal(team.riders);
        return (
          <AccordionItem key={index} value={`alt-${index}`}>
            <AccordionTrigger>
              <span className="flex items-center gap-2">
                Alternative Team #{index + 1} — {team.totalProjectedPts.toFixed(1)} pts
                {mlTotal !== null && (
                  <span className="flex items-center gap-1">
                    (ML: {mlTotal.toFixed(1)} pts) <MlBadge />
                  </span>
                )}
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <OptimalTeamCard
                team={team}
                budget={budget}
                variant="secondary"
                title={`Alternative Team #${index + 1}`}
              />
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}
