import type { AnalyzedRider } from '@cycling-analyzer/shared-types';
import { formatNumber } from '@/shared/lib/utils';
import { CheckCircle, Copy, RotateCcw, Bike } from 'lucide-react';
import { useState } from 'react';

function getEffectiveScore(rider: AnalyzedRider): number | null {
  return rider.mlPredictedScore ?? rider.totalProjectedPts;
}
import { toast } from 'sonner';

interface TeamSummaryProps {
  riders: AnalyzedRider[];
  totalCost: number;
  totalScore: number;
  mlTotalScore: number | null;
  budget: number;
  onReset: () => void;
}

export function TeamSummary({
  riders,
  totalCost,
  totalScore,
  mlTotalScore,
  budget,
  onReset,
}: TeamSummaryProps) {
  const [copied, setCopied] = useState(false);
  const displayScore = mlTotalScore ?? totalScore;
  const remaining = budget - totalCost;
  const avgCost = riders.length > 0 ? totalCost / riders.length : 0;
  const usagePercent = budget > 0 ? (totalCost / budget) * 100 : 0;

  const handleCopy = async (): Promise<void> => {
    const header = 'CYCLING FANTASY OPTIMIZER - TEAM ROSTER';
    const separator = '='.repeat(45);
    const lines = riders.map(
      (r, i) =>
        `${i + 1}. ${r.rawName} (${r.rawTeam}) - ${formatNumber(r.priceHillios)} - Score: ${getEffectiveScore(r)?.toFixed(1) ?? '---'}`,
    );
    const footer = `Total Cost: ${formatNumber(totalCost)} / ${formatNumber(budget)} | Projected Score: ${formatNumber(displayScore)}`;
    const text = [header, separator, ...lines, separator, footer].join('\n');

    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('Team copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-10">
      {/* Success Banner */}
      <div
        data-testid="roster-complete-banner"
        className="bg-green-500/10 dark:bg-green-900/20 border-l-4 border-green-500 p-6 rounded-sm flex flex-col md:flex-row justify-between items-center gap-4"
      >
        <div className="flex items-center gap-4">
          <div className="bg-green-500 text-white p-2 rounded-full">
            <CheckCircle className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-headline text-2xl font-extrabold tracking-tight text-green-800 dark:text-green-100">
              Team Complete!
            </h1>
            <p className="text-green-700 dark:text-green-200/60 text-sm">
              Your roster is mathematically optimized for the upcoming stage.
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            data-testid="roster-reset-btn"
            onClick={onReset}
            className="bg-surface-container-high hover:bg-surface-container-highest transition-colors px-6 py-2 rounded-sm text-sm font-bold flex items-center gap-2"
          >
            <RotateCcw className="h-4 w-4" />
            Reset
          </button>
          <button
            data-testid="roster-copy-btn"
            onClick={() => void handleCopy()}
            className="bg-primary-fixed text-primary-foreground px-6 py-2 rounded-sm text-sm font-bold flex items-center gap-2 hover:brightness-110 transition-all"
          >
            <Copy className="h-4 w-4" />
            {copied ? 'Copied!' : 'Copy to Clipboard'}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        {/* Left: Rider List */}
        <div className="lg:col-span-8 space-y-4">
          <div className="flex justify-between items-end mb-4 px-2">
            <h2 className="font-headline text-lg font-bold tracking-tight uppercase text-on-primary-container">
              Official 9-Rider Roster
            </h2>
          </div>

          <div data-testid="roster-rider-list" className="space-y-2">
            {riders.map((rider, index) => (
              <div
                key={rider.rawName}
                data-testid={`roster-rider-${rider.rawName}`}
                className="bg-surface-container-high p-4 flex items-center gap-4 group hover:bg-surface-container-highest transition-all"
              >
                <div className="w-12 h-12 rounded-sm bg-surface-container-highest flex items-center justify-center flex-shrink-0">
                  <Bike className="h-5 w-5 text-on-primary-container" />
                </div>
                <div className="flex-grow min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-headline font-bold text-on-surface truncate">
                      {rider.rawName}
                    </span>
                    {index === 0 && (
                      <span
                        data-testid="roster-captain-badge"
                        className="bg-tertiary/20 text-tertiary text-[10px] px-1.5 font-bold rounded-sm border border-tertiary/30 flex-shrink-0"
                      >
                        CAPTAIN
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-on-surface-variant">{rider.rawTeam}</span>
                </div>
                <div className="grid grid-cols-3 gap-8 text-right pr-4 flex-shrink-0">
                  <div>
                    <div className="text-[10px] text-on-primary-container font-mono uppercase">
                      Cost
                    </div>
                    <div className="font-mono text-primary font-bold">
                      {formatNumber(rider.priceHillios)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-on-primary-container font-mono uppercase">
                      Proj
                    </div>
                    <div className="font-mono text-tertiary font-bold">
                      {getEffectiveScore(rider)?.toFixed(0) ?? '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-on-primary-container font-mono uppercase">
                      Value
                    </div>
                    <div className="font-mono text-green-700 dark:text-green-400 font-bold">
                      {(() => {
                        const score = getEffectiveScore(rider);
                        return score !== null && rider.priceHillios > 0
                          ? (score / rider.priceHillios).toFixed(1)
                          : '—';
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Metrics Sidebar */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-surface-container-low p-8 rounded-sm space-y-10 border-t-2 border-primary">
            <h3 className="font-headline text-xl font-extrabold tracking-tight">Roster Metrics</h3>

            {/* Total Projected Score */}
            <div className="space-y-2">
              <label className="font-mono text-[10px] tracking-widest text-on-primary-container uppercase">
                Total Proj. Score
              </label>
              <div className="flex items-baseline gap-2">
                <span
                  data-testid="roster-total-score"
                  className="font-headline text-5xl font-black text-on-surface tracking-tighter"
                >
                  {formatNumber(displayScore)}
                </span>
                <span className="font-mono text-tertiary text-lg font-bold">PTS</span>
              </div>
            </div>

            {/* Budget Stats */}
            <div className="space-y-2">
              <div className="flex justify-between text-[10px] font-mono uppercase tracking-widest">
                <span className="text-on-primary-container">Total Expenditure</span>
                <span data-testid="roster-total-cost" className="text-on-surface font-bold">
                  {formatNumber(totalCost)} / {formatNumber(budget)}
                </span>
              </div>
              <div className="h-1.5 bg-surface-container-highest w-full rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary"
                  style={{ width: `${Math.min(usagePercent, 100)}%` }}
                />
              </div>
            </div>

            {/* Remaining + Avg/Rider */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-surface-container-high p-4 rounded-sm">
                <span className="font-mono text-[9px] uppercase text-on-primary-container block mb-1">
                  Remaining
                </span>
                <span
                  data-testid="roster-remaining"
                  className="font-mono text-xl font-bold text-on-surface"
                >
                  {formatNumber(remaining)}
                </span>
              </div>
              <div className="bg-surface-container-high p-4 rounded-sm">
                <span className="font-mono text-[9px] uppercase text-on-primary-container block mb-1">
                  Avg/Rider
                </span>
                <span
                  data-testid="roster-avg-rider"
                  className="font-mono text-xl font-bold text-on-surface"
                >
                  {formatNumber(avgCost)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
