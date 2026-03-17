import type { AnalyzedRider } from '@cycling-analyzer/shared-types';
import { BudgetIndicator } from '@/shared/ui/budget-indicator';
import { Button } from '@/shared/ui/button';
import { TeamSummary } from './team-summary';
import { X } from 'lucide-react';

interface TeamBuilderPanelProps {
  selectedRiders: AnalyzedRider[];
  totalCost: number;
  totalScore: number;
  budgetRemaining: number;
  budget: number;
  isTeamComplete: boolean;
  onRemoveRider: (riderName: string) => void;
  onClearAll: () => void;
}

export function TeamBuilderPanel({
  selectedRiders,
  totalCost,
  totalScore,
  budgetRemaining,
  budget,
  isTeamComplete,
  onRemoveRider,
  onClearAll,
}: TeamBuilderPanelProps) {
  if (isTeamComplete) {
    return (
      <TeamSummary
        riders={selectedRiders}
        totalCost={totalCost}
        totalScore={totalScore}
        budget={budget}
        onReset={onClearAll}
      />
    );
  }

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Team Builder ({selectedRiders.length} / 9)</h3>
        {selectedRiders.length > 0 && (
          <Button variant="ghost" size="sm" onClick={onClearAll}>
            Clear
          </Button>
        )}
      </div>

      {selectedRiders.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          Select riders from the table or use the optimizer to build your team.
        </p>
      ) : (
        <>
          <div className="space-y-1">
            {selectedRiders.map((rider) => (
              <div
                key={rider.rawName}
                className="flex items-center justify-between rounded px-2 py-1 text-sm hover:bg-muted/50"
              >
                <span className="truncate">{rider.rawName}</span>
                <button
                  onClick={() => onRemoveRider(rider.rawName)}
                  className="ml-2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={`Remove ${rider.rawName}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>

          <p className="text-xs text-muted-foreground">
            {9 - selectedRiders.length} more rider{9 - selectedRiders.length !== 1 ? 's' : ''}{' '}
            needed
          </p>
        </>
      )}

      <BudgetIndicator spent={totalCost} total={budget} />

      {selectedRiders.length > 0 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Projected Score</span>
          <span className="font-medium">{totalScore.toFixed(1)}</span>
        </div>
      )}

      {budgetRemaining < 0 && (
        <p className="text-xs font-semibold text-red-600">Budget exceeded!</p>
      )}
    </div>
  );
}
