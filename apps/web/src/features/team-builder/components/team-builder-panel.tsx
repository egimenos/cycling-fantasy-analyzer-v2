import type { AnalyzedRider } from '@cycling-analyzer/shared-types';
import { MlBadge } from '@/shared/ui/ml-badge';
import { cn } from '@/shared/lib/utils';
import { X, User, Lock } from 'lucide-react';

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

  return (
    <div className="bg-surface-container-high p-6 rounded-sm border border-outline-variant/10 flex flex-col gap-6 sticky top-24 max-h-[calc(100vh-8rem)] overflow-hidden">
      {/* Header */}
      <header className="space-y-1">
        <div className="flex items-center justify-between">
          <h3 className="font-headline font-extrabold text-xl tracking-tight">TEAM BUILDER</h3>
          {selectedRiders.length > 0 && (
            <button
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
          <span className="font-mono font-bold text-secondary text-sm">
            {selectedRiders.length} / {MAX_RIDERS} riders
          </span>
        </div>

        <div className="space-y-2 overflow-y-auto max-h-[40vh] pr-1">
          {/* Selected rider cards */}
          {selectedRiders.map((rider) => {
            const isLocked = lockedIds?.has(rider.rawName) ?? false;
            return (
              <div
                key={rider.rawName}
                className="flex items-center gap-3 bg-surface-container-low p-2.5 border border-outline-variant/10 rounded-sm"
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
              </div>
            );
          })}

          {/* Empty slots */}
          {Array.from({ length: emptySlots }).map((_, i) => (
            <div
              key={`empty-${i}`}
              className="h-10 border border-dashed border-outline-variant/30 rounded-sm flex items-center justify-center text-[10px] text-outline/50 uppercase font-mono tracking-widest"
            >
              Empty Slot
            </div>
          ))}
        </div>
      </div>

      {/* Budget Meter */}
      <div className="space-y-3 pt-4 border-t border-outline-variant/10">
        <div className="flex items-center justify-between text-[10px] font-mono text-outline uppercase">
          <span>Remaining Budget</span>
          <span className="text-on-surface font-bold">
            {budgetRemaining.toFixed(1)} / {budget}
          </span>
        </div>
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
          <span className="font-mono font-bold text-2xl text-secondary">
            {displayScore > 0
              ? displayScore.toLocaleString(undefined, { maximumFractionDigits: 0 })
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
            onClick={onReviewTeam}
            className="w-full py-3 bg-green-500/20 text-green-400 border border-green-500/30 font-headline font-bold uppercase tracking-wider text-sm rounded-sm hover:bg-green-500/30 transition-colors"
          >
            Review Team &rarr;
          </button>
        ) : (
          onOptimize && (
            <button
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
