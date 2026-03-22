import type { RaceProfileResponse } from '@cycling-analyzer/shared-types';
import { Badge } from '@/shared/ui/badge';
import { Trophy } from 'lucide-react';

const RACE_TYPE_LABELS: Record<string, string> = {
  grand_tour: 'Grand Tour',
  classic: 'Classic',
  mini_tour: 'Mini Tour',
};

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

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 py-4 px-6 bg-surface-container-low border border-outline-variant/15 rounded-sm">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-tertiary" />
          <h2 className="font-headline font-extrabold text-lg text-on-surface">
            {profile.raceName}
          </h2>
          <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">
            {raceTypeLabel}
          </Badge>
        </div>

        {(totalRiders !== undefined || profile.totalStages > 0) && (
          <>
            <div className="h-6 w-px bg-outline-variant/20 hidden md:block" />
            <div className="flex gap-4">
              {totalRiders !== undefined && (
                <div className="flex items-baseline gap-1.5">
                  <span className="font-mono text-xl font-bold text-primary">{totalRiders}</span>
                  <span className="text-[10px] font-mono text-outline uppercase">riders</span>
                </div>
              )}
              {matchedRiders !== undefined && (
                <div className="flex items-baseline gap-1.5">
                  <span className="font-mono text-xl font-bold text-secondary">
                    {matchedRiders}
                  </span>
                  <span className="text-[10px] font-mono text-outline uppercase">matched</span>
                </div>
              )}
              {profile.totalStages > 0 && totalRiders === undefined && (
                <span className="text-xs text-on-surface-variant font-mono">
                  {profile.totalStages} stages
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {isAnalyzed && (
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono text-outline uppercase">Status:</span>
          <div className="flex items-center gap-1.5 px-3 py-1 bg-green-500/10 text-green-400 border border-green-500/20 rounded-sm">
            <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-tighter">Analyzed</span>
          </div>
        </div>
      )}
    </div>
  );
}
