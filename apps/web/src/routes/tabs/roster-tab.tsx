import { TeamSummary } from '@/features/team-builder/components/team-summary';
import type { useTeamBuilder } from '@/features/team-builder/hooks/use-team-builder';
import { Users } from 'lucide-react';

export interface RosterTabProps {
  teamBuilder: ReturnType<typeof useTeamBuilder>;
  budget: number;
  onReset: () => void;
}

export function RosterTab({ teamBuilder, budget, onReset }: RosterTabProps) {
  if (teamBuilder.selectedRiders.length === 0) {
    return (
      <div
        data-testid="tab-content-roster"
        className="flex flex-col items-center justify-center py-24 animate-fade-in"
      >
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-stage/15 to-primary/10 flex items-center justify-center mb-6 ring-1 ring-stage/20">
          <Users className="h-10 w-10 text-stage/60" />
        </div>
        <h3 className="text-xl font-headline font-extrabold text-on-surface mb-2 tracking-tight">
          No Team Selected
        </h3>
        <p className="text-sm text-on-surface-variant max-w-sm text-center">
          Build your 9-rider roster from the Dashboard or run the optimizer to auto-fill.
        </p>
        <div className="flex items-center gap-2 text-[10px] font-mono text-outline uppercase tracking-widest mt-4">
          <span className="w-1.5 h-1.5 rounded-full bg-stage/30" />
          Awaiting Roster
        </div>
      </div>
    );
  }

  return (
    <div data-testid="tab-content-roster">
      <TeamSummary
        riders={teamBuilder.selectedRiders}
        totalCost={teamBuilder.totalCost}
        totalScore={teamBuilder.totalScore}
        mlTotalScore={teamBuilder.mlTotalScore}
        budget={budget}
        onReset={onReset}
      />
    </div>
  );
}
