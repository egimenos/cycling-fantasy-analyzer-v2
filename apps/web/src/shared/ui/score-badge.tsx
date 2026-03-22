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

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-sm border px-2 py-0.5 text-xs font-semibold font-mono',
        colorClass,
      )}
    >
      {score.toFixed(1)}
    </span>
  );
}
