import type { AnalyzedRider } from '@cycling-analyzer/shared-types';
import { formatNumber, cn } from '@/shared/lib/utils';
import { getEffectiveScore, calculateValue } from '@/shared/lib/rider-utils';
import { CheckCircle, Copy, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { useAnimatedNumber } from '@/shared/hooks/use-animated-number';
import { useIsDesktop } from '@/shared/hooks/use-media-query';
import { CategoryBreakdown } from '@/shared/ui/category-breakdown';
import { RiderAvatar } from '@/shared/ui/rider-avatar';
import { FlagChip } from '@/features/rider-list/components/bpi-badge';
import { toast } from 'sonner';

interface TeamSummaryProps {
  riders: AnalyzedRider[];
  totalCost: number;
  totalScore: number;
  budget: number;
  onReset: () => void;
}

export function TeamSummary({ riders, totalCost, totalScore, budget, onReset }: TeamSummaryProps) {
  const [copied, setCopied] = useState(false);
  const displayScore = totalScore;
  const remaining = budget - totalCost;
  const avgCost = riders.length > 0 ? totalCost / riders.length : 0;
  const usagePercent = budget > 0 ? (totalCost / budget) * 100 : 0;
  const animatedScore = useAnimatedNumber(displayScore, 1000);
  const isDesktop = useIsDesktop();

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
        className="bg-stage/10 border-l-4 border-stage p-3 md:p-6 rounded-sm flex flex-col md:flex-row justify-between items-center gap-3 md:gap-4 animate-fade-in-up"
      >
        <div className="flex items-center gap-3 md:gap-4">
          <div className="bg-stage text-white p-1.5 md:p-2 rounded-full">
            <CheckCircle className="h-4 w-4 md:h-5 md:w-5" />
          </div>
          <div>
            <h1 className="font-headline text-base md:text-2xl font-extrabold tracking-tight text-on-surface">
              Team Complete!
            </h1>
            <p className="text-on-surface-variant text-xs md:text-sm">
              Your roster is mathematically optimized for the upcoming stage.
            </p>
          </div>
        </div>
        <div className="flex gap-2 md:gap-3 w-full md:w-auto">
          <button
            data-testid="roster-reset-btn"
            onClick={onReset}
            className="bg-surface-container-high hover:bg-surface-container-highest transition-colors px-3 md:px-6 py-2 rounded-sm text-xs md:text-sm font-bold flex items-center justify-center gap-1.5 md:gap-2 flex-1 md:flex-initial"
          >
            <RotateCcw className="h-3.5 w-3.5 md:h-4 md:w-4" />
            Reset
          </button>
          <button
            data-testid="roster-copy-btn"
            onClick={() => void handleCopy()}
            className="bg-primary-fixed text-primary-foreground px-3 md:px-6 py-2 rounded-sm text-xs md:text-sm font-bold flex items-center justify-center gap-1.5 md:gap-2 hover:brightness-110 transition-all flex-1 md:flex-initial"
          >
            <Copy className="h-3.5 w-3.5 md:h-4 md:w-4" />
            {copied ? 'Copied!' : 'Copy'}
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

          <ul
            data-testid="roster-rider-list"
            className={cn('stagger-children', isDesktop ? 'space-y-1' : 'space-y-2')}
          >
            {riders.map((rider, index) => {
              const score = getEffectiveScore(rider);
              const value = calculateValue(score, rider.priceHillios);
              const breakdown = rider.categoryScores;
              const bpi = rider.breakout?.index ?? null;
              const flags = rider.breakout?.flags;

              if (isDesktop) {
                // Desktop: compact single-row with all data inline
                return (
                  <li
                    key={rider.rawName}
                    data-testid={`roster-rider-${rider.rawName}`}
                    className="bg-surface-container-high rounded-sm flex items-center gap-4 px-4 py-2.5 group hover:bg-surface-container-highest transition-all"
                  >
                    {/* Avatar + Rank */}
                    <div className="relative flex-shrink-0">
                      {rider.matchedRider ? (
                        <RiderAvatar
                          avatarUrl={rider.matchedRider.avatarUrl}
                          fullName={rider.matchedRider.fullName}
                          nationality={rider.matchedRider.nationality}
                          size="sm"
                        />
                      ) : (
                        <RiderAvatar
                          avatarUrl={null}
                          fullName={rider.rawName}
                          nationality={null}
                          size="sm"
                        />
                      )}
                    </div>

                    {/* Name + team + flags */}
                    <div className="w-[200px] flex-shrink-0 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-headline font-bold text-sm text-on-surface truncate">
                          {rider.rawName}
                        </span>
                        {index === 0 && (
                          <span
                            data-testid="roster-captain-badge"
                            className="bg-tertiary/20 text-tertiary text-[9px] px-1 font-bold rounded-sm border border-tertiary/30 flex-shrink-0"
                          >
                            CPT
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-[10px] text-on-surface-variant font-mono uppercase truncate">
                          {rider.rawTeam}
                        </span>
                        {flags?.map((flag) => (
                          <FlagChip key={flag} flag={flag} />
                        ))}
                      </div>
                    </div>

                    {/* Cost */}
                    <div className="w-16 text-right flex-shrink-0">
                      <span className="text-[9px] font-mono text-outline uppercase block">
                        Cost
                      </span>
                      <span className="font-mono font-bold text-primary text-sm">
                        {formatNumber(rider.priceHillios)}
                      </span>
                    </div>

                    {/* Projected */}
                    <div className="w-14 text-right flex-shrink-0">
                      <span className="text-[9px] font-mono text-outline uppercase block">
                        Proj
                      </span>
                      <span className="font-mono font-bold text-tertiary text-sm">
                        {score?.toFixed(0) ?? '—'}
                      </span>
                    </div>

                    {/* Value */}
                    <div className="w-14 text-right flex-shrink-0">
                      <span className="text-[9px] font-mono text-outline uppercase block">
                        Value
                      </span>
                      <span className="font-mono font-bold text-stage text-sm">
                        {value !== null ? value.toFixed(1) : '—'}
                      </span>
                    </div>

                    {/* Category breakdown */}
                    {breakdown && (
                      <div className="ml-2">
                        <CategoryBreakdown breakdown={breakdown} variant="compact" />
                      </div>
                    )}

                    {/* BPI */}
                    {bpi !== null && (
                      <div className="ml-auto flex-shrink-0 text-right">
                        <span
                          className={cn(
                            'text-lg font-mono font-bold',
                            bpi >= 70
                              ? 'text-green-600 dark:text-green-400'
                              : bpi >= 40
                                ? 'text-tertiary'
                                : 'text-outline',
                          )}
                        >
                          {bpi}
                        </span>
                        <span className="text-[8px] font-mono text-outline ml-0.5">BPI</span>
                      </div>
                    )}
                  </li>
                );
              }

              // Mobile: stacked card layout
              return (
                <li
                  key={rider.rawName}
                  data-testid={`roster-rider-${rider.rawName}`}
                  className="bg-surface-container-high rounded-sm overflow-hidden group hover:bg-surface-container-highest transition-all"
                >
                  <div className="flex items-center gap-3 p-3">
                    {rider.matchedRider ? (
                      <RiderAvatar
                        avatarUrl={rider.matchedRider.avatarUrl}
                        fullName={rider.matchedRider.fullName}
                        nationality={rider.matchedRider.nationality}
                        size="md"
                      />
                    ) : (
                      <RiderAvatar
                        avatarUrl={null}
                        fullName={rider.rawName}
                        nationality={null}
                        size="md"
                      />
                    )}
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
                  </div>
                  <div className="grid grid-cols-3 mx-3 mb-3 border border-outline-variant/10 rounded-sm overflow-hidden">
                    <div className="px-3 py-2 border-r border-outline-variant/10">
                      <span className="text-[9px] font-mono text-outline uppercase block">
                        Cost
                      </span>
                      <span className="font-mono font-bold text-primary">
                        {formatNumber(rider.priceHillios)}
                      </span>
                    </div>
                    <div className="px-3 py-2 border-r border-outline-variant/10">
                      <span className="text-[9px] font-mono text-outline uppercase block">
                        Proj
                      </span>
                      <span className="font-mono font-bold text-tertiary">
                        {score?.toFixed(0) ?? '—'}
                      </span>
                    </div>
                    <div className="px-3 py-2">
                      <span className="text-[9px] font-mono text-outline uppercase block">
                        Value
                      </span>
                      <span className="font-mono font-bold text-stage">
                        {value !== null ? value.toFixed(1) : '—'}
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Right: Metrics Sidebar */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-surface-container-low p-5 md:p-8 rounded-sm space-y-8 md:space-y-10 border-t-2 border-secondary animate-slide-in-right">
            <h3 className="font-headline text-xl font-extrabold tracking-tight">Roster Metrics</h3>

            {/* Total Projected Score */}
            <div className="space-y-2">
              <label className="font-mono text-[10px] tracking-widest text-on-primary-container uppercase">
                Total Proj. Score
              </label>
              <div className="flex items-baseline gap-2">
                <span
                  data-testid="roster-total-score"
                  className="font-headline text-3xl md:text-5xl font-black text-on-surface tracking-tighter text-glow-secondary"
                >
                  {formatNumber(Math.round(animatedScore))}
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
                  className="h-full bg-secondary animate-bar-fill"
                  style={{ width: `${Math.min(usagePercent, 100)}%` }}
                />
              </div>
            </div>

            {/* Remaining + Avg/Rider */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-surface-container-high p-4 rounded-sm">
                <span className="font-mono text-[11px] md:text-[9px] uppercase text-on-primary-container block mb-1">
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
                <span className="font-mono text-[11px] md:text-[9px] uppercase text-on-primary-container block mb-1">
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
