import type { TeamSelection } from '@cycling-analyzer/shared-types';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/shared/ui/accordion';
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
      {teams.map((team, index) => (
        <AccordionItem key={index} value={`alt-${index}`}>
          <AccordionTrigger>
            Alternative Team #{index + 1} — {team.totalProjectedPts.toFixed(1)} pts
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
      ))}
    </Accordion>
  );
}
