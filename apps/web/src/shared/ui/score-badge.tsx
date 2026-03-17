import { cn } from '@/shared/lib/utils';

interface ScoreBadgeProps {
  score: number | null;
  maxScore?: number;
}

export function ScoreBadge({ score, maxScore = 100 }: ScoreBadgeProps) {
  if (score === null) {
    return (
      <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
        ---
      </span>
    );
  }

  const ratio = maxScore > 0 ? score / maxScore : 0;

  const colorClass =
    ratio >= 0.75
      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
      : ratio >= 0.25
        ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
        : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold',
        colorClass,
      )}
    >
      {score.toFixed(1)}
    </span>
  );
}
