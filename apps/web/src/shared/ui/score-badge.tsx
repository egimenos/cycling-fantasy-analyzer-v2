import { cn } from '@/shared/lib/utils';

interface ScoreBadgeProps {
  score: number | null;
  maxScore?: number;
}

export function ScoreBadge({ score, maxScore = 100 }: ScoreBadgeProps) {
  if (score === null) {
    return (
      <span className="inline-flex items-center rounded-sm bg-surface-container-high px-2 py-0.5 text-xs font-medium font-mono text-on-primary-container">
        ---
      </span>
    );
  }

  const ratio = maxScore > 0 ? score / maxScore : 0;

  const colorClass =
    ratio >= 0.75
      ? 'border-green-500/30 bg-green-500/10 text-green-400'
      : ratio >= 0.25
        ? 'border-tertiary/30 bg-tertiary/10 text-tertiary'
        : 'border-error/30 bg-error-container/20 text-error';

  const barColor =
    ratio >= 0.75 ? 'bg-green-500/50' : ratio >= 0.25 ? 'bg-tertiary/50' : 'bg-error/50';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-sm border px-2 py-0.5 text-xs font-semibold font-mono',
        colorClass,
      )}
    >
      {score.toFixed(1)}
      <span className="w-8 h-1 rounded-full bg-surface-container-highest overflow-hidden">
        <span
          className={cn('block h-full rounded-full', barColor)}
          style={{ width: `${Math.min(ratio * 100, 100)}%` }}
        />
      </span>
    </span>
  );
}
