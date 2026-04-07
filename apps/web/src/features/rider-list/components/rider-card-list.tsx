import { useState } from 'react';
import type { AnalyzedRider } from '@cycling-analyzer/shared-types';
import { FlagChip } from './bpi-badge';
import { cn, formatNumber } from '@/shared/lib/utils';
import { getEffectiveScore, calculateValue } from '@/shared/lib/rider-utils';
import { Lock, Unlock, Ban } from 'lucide-react';
import { BreakoutDetailPanel } from './breakout-detail-panel';
import { MlBadge } from '@/shared/ui/ml-badge';
import { CategoryBreakdown } from '@/shared/ui/category-breakdown';
import { HistoryTable } from '@/shared/ui/history-table';
import { RiderAvatar } from '@/shared/ui/rider-avatar';

interface RiderCardListProps {
  riders: AnalyzedRider[];
  lockedIds: Set<string>;
  excludedIds: Set<string>;
  selectedNames: Set<string>;
  onToggleLock: (name: string) => void;
  onToggleExclude: (name: string) => void;
  onToggleSelect: (name: string) => void;
  canSelect: (name: string) => boolean;
  maxScore: number;
}

export function RiderCardList({
  riders,
  lockedIds,
  excludedIds,
  selectedNames,
  onToggleLock,
  onToggleExclude,
  onToggleSelect,
  canSelect,
  maxScore,
}: RiderCardListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <ul className="space-y-2" data-animated-rows>
      {riders.map((rider, index) => {
        const name = rider.rawName;
        const isLocked = lockedIds.has(name);
        const isExcluded = excludedIds.has(name);
        const isSelected = selectedNames.has(name);
        const isExpanded = expandedId === name;
        const disabled =
          rider.unmatched || isExcluded || isLocked || (!isSelected && !canSelect(name));
        const score = getEffectiveScore(rider);
        const value = calculateValue(score, rider.priceHillios);
        const flags = rider.breakout?.flags;
        const bpi = rider.breakout?.index ?? null;
        const scoreRatio = score !== null && maxScore > 0 ? score / maxScore : 0;

        return (
          <li
            key={name}
            className={cn(
              'bg-surface-container-low rounded-sm border border-outline-variant/10 overflow-hidden',
              isExcluded && 'opacity-40 grayscale',
              isLocked && 'bg-secondary-container/5',
              rider.unmatched && 'opacity-60',
            )}
          >
            {/* Top row: checkbox + rank | name + team | BPI */}
            <button
              onClick={() => setExpandedId(isExpanded ? null : name)}
              className="w-full text-left"
              aria-expanded={isExpanded}
            >
              <div className="flex items-start gap-3 px-4 pt-3 pb-2">
                {/* Checkbox + rank */}
                <div className="flex flex-col items-center gap-1 flex-shrink-0 pt-0.5">
                  <label
                    className="flex items-center justify-center min-w-[28px] min-h-[28px] cursor-pointer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected || isLocked}
                      disabled={disabled}
                      onChange={() => onToggleSelect(name)}
                      className="h-4 w-4 bg-surface-dim border-outline-variant rounded-none checked:bg-primary"
                      aria-label={`Select ${name}`}
                    />
                  </label>
                  <span className="text-[10px] font-mono text-outline">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                </div>

                {/* Avatar + Name + team + flags */}
                {rider.matchedRider && (
                  <RiderAvatar
                    avatarUrl={rider.matchedRider.avatarUrl}
                    fullName={rider.matchedRider.fullName}
                    nationality={rider.matchedRider.nationality}
                    size="md"
                    className="flex-shrink-0 mt-0.5"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-headline font-extrabold text-sm text-on-surface uppercase tracking-tight truncate">
                    {name}
                    {isLocked && <Lock className="inline ml-1.5 h-3 w-3 text-secondary" />}
                  </p>
                  <p className="text-[11px] text-outline font-mono uppercase tracking-wide mt-0.5">
                    {rider.rawTeam}
                  </p>
                  {flags && flags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {flags.map((flag) => (
                        <FlagChip key={flag} flag={flag} />
                      ))}
                    </div>
                  )}
                </div>

                {/* BPI */}
                {bpi !== null && (
                  <div className="flex-shrink-0 text-right">
                    <span
                      className={cn(
                        'text-2xl font-mono font-bold',
                        bpi >= 70
                          ? 'text-green-600 dark:text-green-400'
                          : bpi >= 40
                            ? 'text-tertiary'
                            : 'text-outline',
                      )}
                    >
                      {bpi}
                    </span>
                    <span className="text-[10px] font-mono text-outline ml-0.5 uppercase">BPI</span>
                  </div>
                )}
              </div>
            </button>

            {/* Price / Value row */}
            <div className="grid grid-cols-3 mx-4 mb-2 border border-outline-variant/10 rounded-sm overflow-hidden">
              <div className="px-3 py-2 border-r border-outline-variant/10">
                <span className="text-[10px] font-mono text-outline uppercase block">Price</span>
                <span className="font-mono font-bold text-on-surface">
                  {formatNumber(rider.priceHillios)}
                </span>
              </div>
              <div className="px-3 py-2 border-r border-outline-variant/10">
                <span className="text-[10px] font-mono text-outline uppercase block">
                  Predicted
                </span>
                <span className="font-mono font-bold text-secondary">
                  {score !== null ? score.toFixed(0) : '—'}
                </span>
              </div>
              <div className="px-3 py-2">
                <span className="text-[10px] font-mono text-outline uppercase block">Value</span>
                <span
                  className={cn(
                    'font-mono font-bold',
                    value !== null && value >= 1.5
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-on-surface',
                  )}
                >
                  {value !== null ? value.toFixed(2) : '—'}
                </span>
              </div>
            </div>

            {/* Score bar */}
            {score !== null && (
              <div className="mx-4 mb-3">
                <div className="h-1.5 w-full bg-surface-container-highest rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      scoreRatio >= 0.75
                        ? 'bg-green-500'
                        : scoreRatio >= 0.25
                          ? 'bg-tertiary'
                          : 'bg-error/60',
                    )}
                    style={{ width: `${Math.min(scoreRatio * 100, 100)}%` }}
                  />
                </div>
              </div>
            )}

            {/* Lock / Exclude buttons */}
            {!rider.unmatched && (
              <div className="flex border-t border-outline-variant/10 divide-x divide-outline-variant/10">
                <button
                  onClick={() => onToggleLock(name)}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-mono uppercase tracking-wider transition-colors',
                    isLocked
                      ? 'text-secondary bg-secondary/5 font-bold'
                      : 'text-outline hover:text-primary',
                  )}
                  aria-label={isLocked ? `Unlock ${name}` : `Lock ${name}`}
                >
                  {isLocked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                  {isLocked ? 'Locked' : 'Lock'}
                </button>
                <button
                  onClick={() => onToggleExclude(name)}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-mono uppercase tracking-wider transition-colors',
                    isExcluded
                      ? 'text-error bg-error/5 font-bold'
                      : 'text-outline hover:text-error',
                  )}
                  aria-label={isExcluded ? `Include ${name}` : `Exclude ${name}`}
                >
                  <Ban className="h-3.5 w-3.5" />
                  {isExcluded ? 'Excluded' : 'Exclude'}
                </button>
              </div>
            )}

            {/* Expanded detail */}
            {isExpanded && !rider.unmatched && (
              <div className="border-t border-outline-variant/10 p-4 bg-surface-container-low animate-fade-in">
                {rider.categoryScores && (
                  <div className="mb-3">
                    <h4 className="text-[11px] font-mono text-outline uppercase mb-2 flex items-center gap-1.5">
                      ML Predicted Breakdown
                      <MlBadge />
                    </h4>
                    <CategoryBreakdown breakdown={rider.categoryScores} />
                  </div>
                )}

                {rider.sameRaceHistory && rider.sameRaceHistory.length > 0 && (
                  <div className="mb-3">
                    <HistoryTable title="Same Race History" rows={rider.sameRaceHistory} />
                  </div>
                )}

                {rider.seasonBreakdowns && rider.seasonBreakdowns.length > 0 && (
                  <div className="mb-3">
                    <HistoryTable title="Season Totals" rows={rider.seasonBreakdowns} />
                  </div>
                )}

                {rider.breakout && (
                  <BreakoutDetailPanel
                    breakout={rider.breakout}
                    prediction={rider.totalProjectedPts ?? 0}
                  />
                )}

                {rider.matchedRider && (
                  <div className="mt-2 text-[11px] text-on-primary-container">
                    Matched: {rider.matchedRider.fullName} ({rider.matchedRider.currentTeam}) —{' '}
                    {(rider.matchConfidence * 100).toFixed(0)}%
                  </div>
                )}
              </div>
            )}

            {isExpanded && rider.unmatched && (
              <div className="border-t border-outline-variant/10 p-3 bg-surface-container-low">
                <p className="text-sm text-on-surface-variant">
                  No match found for &ldquo;{name}&rdquo;.
                </p>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
