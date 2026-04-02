import type { AnalyzedRider } from '@cycling-analyzer/shared-types';
import { MlBadge } from '@/shared/ui/ml-badge';
import { cn } from '@/shared/lib/utils';
import { useAnimatedNumber } from '@/shared/hooks/use-animated-number';
import { X, User, Lock, UserPlus } from 'lucide-react';

interface TeamBuilderPanelProps {
  selectedRiders: AnalyzedRider[];
  totalCost: number;
  totalScore: number;
  mlTotalScore: number | null;
  budgetRemaining: number;
  budget: number;
  isTeamComplete: boolean;
  onRemoveRider: (riderName: string) => void;
  onClearAll: () => void;
  lockedIds?: Set<string>;
  onOptimize?: () => void;
  isOptimizing?: boolean;
  onReviewTeam?: () => void;
}

const MAX_RIDERS = 9;

export function TeamBuilderPanel({
  selectedRiders,
  totalCost,
  totalScore,
  mlTotalScore,
  budgetRemaining,
  budget,
  isTeamComplete,
  onRemoveRider,
  onClearAll,
  lockedIds,
  onOptimize,
  isOptimizing = false,
  onReviewTeam,
}: TeamBuilderPanelProps) {
  const emptySlots = MAX_RIDERS - selectedRiders.length;
  const usagePercent = budget > 0 ? (totalCost / budget) * 100 : 0;
  const isOverBudget = budgetRemaining < 0;
  const displayScore = mlTotalScore ?? totalScore;
  const animatedScore = useAnimatedNumber(displayScore);
  const animatedBudget = useAnimatedNumber(budgetRemaining);

  return (
    <div
      data-testid="dashboard-team-builder"
      className="bg-surface-container-high p-6 rounded-sm border border-outline-variant/10 flex flex-col gap-6 sticky top-24 max-h-[calc(100vh-8rem)] overflow-hidden animate-slide-in-right"
    >
      {/* Header */}
      <header className="space-y-1">
        <div className="flex items-center justify-between">
          <h2 className="font-headline font-extrabold text-xl tracking-tight">TEAM BUILDER</h2>
          {selectedRiders.length > 0 && (
            <button
              data-testid="dashboard-clear-all-btn"
              onClick={onClearAll}
              className="text-[10px] font-mono text-outline uppercase hover:text-error transition-colors"
            >
              Clear All
            </button>
          )}
        </div>
        <p className="text-[10px] font-mono text-outline uppercase tracking-widest">
          Live Optimization
        </p>
      </header>

      {/* Roster Count + Rider List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono text-outline uppercase">Active Roster</span>
          <span
            data-testid="dashboard-roster-count"
            className="font-mono font-bold text-secondary text-sm"
          >
            {selectedRiders.length} / {MAX_RIDERS} riders
          </span>
        </div>

        <ul className="space-y-2 overflow-y-auto max-h-[40vh] pr-1">
          {/* Selected rider cards */}
          {selectedRiders.map((rider) => {
            const isLocked = lockedIds?.has(rider.rawName) ?? false;
            return (
              <li
                key={rider.rawName}
                className="flex items-center gap-3 bg-surface-container-low p-2.5 border border-outline-variant/10 rounded-sm animate-scale-in"
              >
                <div className="w-10 h-10 bg-surface-container-highest rounded-sm flex-shrink-0 flex items-center justify-center">
                  {isLocked ? (
                    <Lock className="h-4 w-4 text-secondary" />
                  ) : (
                    <User className="h-5 w-5 text-outline" />
                  )}
                </div>
                <div className="flex-grow min-w-0">
                  <p className="text-xs font-bold font-headline truncate">{rider.rawName}</p>
                  <p className="text-[10px] text-outline font-mono">
                    {rider.priceHillios}
                    {rider.rawTeam && ` · ${rider.rawTeam}`}
                  </p>
                </div>
                {!isLocked && (
                  <button
                    onClick={() => onRemoveRider(rider.rawName)}
                    className="text-outline hover:text-error transition-colors flex-shrink-0"
                    aria-label={`Remove ${rider.rawName}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </li>
            );
          })}

          {/* Empty slots */}
          {Array.from({ length: emptySlots }).map((_, i) => (
            <li
              key={`empty-${i}`}
              className="h-10 border border-dashed border-outline-variant/20 rounded-sm flex items-center justify-center gap-2 text-[10px] text-outline/30 uppercase font-mono tracking-widest group hover:border-outline-variant/40 hover:text-outline/50 transition-colors"
            >
              <UserPlus className="h-3 w-3 opacity-50" />
              Slot {selectedRiders.length + i + 1}
            </li>
          ))}
        </ul>
      </div>

      {/* Budget Meter */}
      <div className="space-y-3 pt-4 border-t border-outline-variant/10">
        <div className="flex items-center justify-between text-[10px] font-mono text-outline uppercase">
          <span>Remaining Budget</span>
          <span
            data-testid="dashboard-budget-remaining"
            className={cn('font-bold', isOverBudget ? 'text-error' : 'text-on-surface')}
          >
            {animatedBudget.toFixed(1)} / {budget}
          </span>
        </div>
        <div className="relative">
          <div className="h-2 w-full bg-surface-container-highest rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full transition-all duration-500 rounded-full',
                isOverBudget
                  ? 'bg-error animate-pulse'
                  : 'bg-gradient-to-r from-secondary to-blue-400',
              )}
              style={{ width: `${Math.min(usagePercent, 100)}%` }}
            />
          </div>
          {/* Tick marks at 25/50/75% */}
          <div className="absolute inset-0 flex justify-between px-0 pointer-events-none">
            <div className="w-px" />
            <div
              className="w-px h-2 bg-on-surface/10"
              style={{ marginLeft: '25%', position: 'absolute', left: 0 }}
            />
            <div
              className="w-px h-2 bg-on-surface/10"
              style={{ marginLeft: '50%', position: 'absolute', left: 0 }}
            />
            <div
              className="w-px h-2 bg-on-surface/10"
              style={{ marginLeft: '75%', position: 'absolute', left: 0 }}
            />
          </div>
        </div>
        <p className="text-[9px] text-outline italic">
          {isOverBudget ? 'Over budget!' : `Efficient build: ${usagePercent.toFixed(0)}% utilized`}
        </p>
      </div>

      {/* Projected Score + CTA */}
      <div className="pt-4 space-y-4">
        <div className="flex justify-between items-center">
          <span className="text-xs text-outline font-mono uppercase flex items-center gap-1.5">
            Projected Score
            {mlTotalScore !== null && <MlBadge />}
          </span>
          <span
            data-testid="dashboard-projected-score"
            className="font-mono font-bold text-2xl text-secondary text-glow-secondary"
          >
            {displayScore > 0
              ? animatedScore.toLocaleString(undefined, { maximumFractionDigits: 0 })
              : '—'}
          </span>
        </div>

        {!isTeamComplete && (
          <p className="text-[10px] text-outline font-mono text-center">
            {emptySlots} more rider{emptySlots !== 1 ? 's' : ''} needed
          </p>
        )}

        {/* CTAs */}
        {isTeamComplete && onReviewTeam ? (
          <button
            data-testid="dashboard-review-btn"
            onClick={onReviewTeam}
            className="w-full py-3 bg-green-500/20 text-green-600 dark:text-green-400 border border-green-500/30 font-headline font-bold uppercase tracking-wider text-sm rounded-sm hover:bg-green-500/30 transition-colors"
          >
            Review Team &rarr;
          </button>
        ) : (
          onOptimize && (
            <button
              data-testid="dashboard-optimize-btn"
              onClick={onOptimize}
              disabled={isOptimizing}
              className="w-full py-4 bg-gradient-to-br from-primary-fixed-dim to-primary-container text-on-surface font-headline font-extrabold uppercase tracking-widest text-sm rounded-sm hover:scale-[1.02] active:scale-95 transition-all shadow-lg shadow-black/40 disabled:opacity-50 disabled:pointer-events-none"
            >
              {isOptimizing ? 'Optimizing...' : 'Get Optimal Team'}
            </button>
          )
        )}
      </div>
    </div>
  );
}
