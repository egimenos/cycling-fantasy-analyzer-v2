import type { RaceProfileResponse } from '@cycling-analyzer/shared-types';
import { Badge } from '@/shared/ui/badge';
import { Trophy } from 'lucide-react';

const RACE_TYPE_LABELS: Record<string, string> = {
  grand_tour: 'Grand Tour',
  classic: 'Classic',
  mini_tour: 'Mini Tour',
};

interface ProfileBadge {
  key: string;
  label: string;
  count: number;
  className: string;
}

function getProfileBadges(profile: RaceProfileResponse): ProfileBadge[] {
  const { profileSummary: s } = profile;
  return [
    {
      key: 'p1',
      label: 'Flat',
      count: s.p1Count,
      className: 'border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400',
    },
    {
      key: 'p2',
      label: 'Hills',
      count: s.p2Count,
      className: 'border-lime-500/30 bg-lime-500/10 text-lime-400',
    },
    {
      key: 'p3',
      label: 'Hills (uphill)',
      count: s.p3Count,
      className: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
    },
    {
      key: 'p4',
      label: 'Mtn',
      count: s.p4Count,
      className: 'border-orange-500/30 bg-orange-500/10 text-orange-400',
    },
    {
      key: 'p5',
      label: 'Mtn (summit)',
      count: s.p5Count,
      className: 'border-red-500/30 bg-red-500/10 text-red-400',
    },
    { key: 'itt', label: 'ITT', count: s.ittCount, className: 'border-gc/30 bg-gc/10 text-gc' },
    {
      key: 'ttt',
      label: 'TTT',
      count: s.tttCount,
      className: 'border-secondary/30 bg-secondary/10 text-secondary',
    },
  ].filter((b) => b.count > 0);
}

interface RaceProfileSummaryProps {
  profile: RaceProfileResponse;
  totalRiders?: number;
  matchedRiders?: number;
  isAnalyzed?: boolean;
}

export function RaceProfileSummary({
  profile,
  totalRiders,
  matchedRiders,
  isAnalyzed,
}: RaceProfileSummaryProps) {
  const raceTypeLabel = RACE_TYPE_LABELS[profile.raceType] ?? profile.raceType;
  const badges = getProfileBadges(profile);

  return (
    <div className="bg-surface-container-low border border-outline-variant/15 rounded-sm">
      {/* Top bar: race name, counts, status */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 md:gap-4 py-3 md:py-4 px-4 md:px-6">
        {/* Race name + type */}
        <div className="flex items-center gap-2 min-w-0">
          <Trophy className="h-4 w-4 md:h-5 md:w-5 text-tertiary flex-shrink-0" />
          <h2
            data-testid="race-profile-name"
            className="font-headline font-extrabold text-sm md:text-lg text-on-surface truncate"
          >
            {profile.raceName}
          </h2>
          <Badge
            data-testid="race-profile-type"
            variant="secondary"
            className="text-[10px] uppercase tracking-wider flex-shrink-0"
          >
            {raceTypeLabel}
          </Badge>
        </div>

        {/* Stats — inline on desktop, compact on mobile */}
        {(totalRiders !== undefined || profile.totalStages > 0) && (
          <div className="flex gap-3 md:gap-4 items-baseline">
            <div className="h-6 w-px bg-outline-variant/20 hidden md:block" />
            {totalRiders !== undefined && (
              <div data-testid="race-profile-rider-count" className="flex items-baseline gap-1">
                <span className="font-mono text-base md:text-xl font-bold text-primary">
                  {totalRiders}
                </span>
                <span className="text-[10px] font-mono text-outline uppercase">riders</span>
              </div>
            )}
            {matchedRiders !== undefined && (
              <div data-testid="race-profile-matched-count" className="flex items-baseline gap-1">
                <span className="font-mono text-base md:text-xl font-bold text-secondary">
                  {matchedRiders}
                </span>
                <span className="text-[10px] font-mono text-outline uppercase">matched</span>
              </div>
            )}
            {profile.totalStages > 0 && totalRiders === undefined && (
              <div className="flex items-baseline gap-1">
                <span className="font-mono text-base md:text-lg font-bold text-on-surface-variant">
                  {profile.totalStages}
                </span>
                <span className="text-[10px] font-mono text-outline uppercase">stages</span>
              </div>
            )}
          </div>
        )}

        {/* Analyzed badge — hidden on mobile to save space */}
        {isAnalyzed && (
          <div className="hidden md:flex items-center gap-3 ml-auto">
            <div className="flex items-center gap-1.5 px-3 py-1 bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20 rounded-sm">
              <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
              <span className="text-xs font-bold uppercase tracking-tighter">Analyzed</span>
            </div>
          </div>
        )}
      </div>

      {/* Stage profile distribution */}
      {badges.length > 0 && (
        <div className="px-4 md:px-6 pb-3 md:pb-4 flex flex-wrap gap-1.5 md:gap-2">
          {badges.map((b) => (
            <span
              key={b.key}
              className={`inline-flex items-center gap-1 md:gap-1.5 rounded-sm border px-1.5 md:px-2 py-0.5 text-[10px] md:text-xs font-mono font-medium ${b.className}`}
            >
              <span className="font-bold">{b.count}</span>
              {b.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
