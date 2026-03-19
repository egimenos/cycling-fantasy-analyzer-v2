import type { RaceProfileResponse } from '@cycling-analyzer/shared-types';
import { Badge } from '@/shared/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';

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
  const badges: ProfileBadge[] = [
    {
      key: 'p1',
      label: 'Flat',
      count: s.p1Count,
      className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    },
    {
      key: 'p2',
      label: 'Hills (flat)',
      count: s.p2Count,
      className: 'bg-lime-100 text-lime-800 dark:bg-lime-900 dark:text-lime-200',
    },
    {
      key: 'p3',
      label: 'Hills (uphill)',
      count: s.p3Count,
      className: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
    },
    {
      key: 'p4',
      label: 'Mtn (flat)',
      count: s.p4Count,
      className: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    },
    {
      key: 'p5',
      label: 'Mtn (summit)',
      count: s.p5Count,
      className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    },
    {
      key: 'itt',
      label: 'ITT',
      count: s.ittCount,
      className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    },
    {
      key: 'ttt',
      label: 'TTT',
      count: s.tttCount,
      className: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
    },
  ];
  return badges.filter((b) => b.count > 0);
}

interface RaceProfileSummaryProps {
  profile: RaceProfileResponse;
}

export function RaceProfileSummary({ profile }: RaceProfileSummaryProps) {
  const badges = getProfileBadges(profile);
  const raceTypeLabel = RACE_TYPE_LABELS[profile.raceType] ?? profile.raceType;

  return (
    <Card className="border-green-200 dark:border-green-800">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center gap-2">
          <CardTitle className="text-sm">{profile.raceName}</CardTitle>
          <Badge variant="secondary" className="text-xs">
            {raceTypeLabel}
          </Badge>
          {profile.totalStages > 0 && (
            <span className="text-xs text-muted-foreground">{profile.totalStages} stages</span>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-3 pt-0">
        <div className="flex flex-wrap gap-1.5">
          {badges.map((b) => (
            <Badge key={b.key} className={`border-transparent ${b.className}`}>
              {b.count} {b.label}
            </Badge>
          ))}
          {badges.length === 0 && (
            <span className="text-xs text-muted-foreground">No profile data</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
