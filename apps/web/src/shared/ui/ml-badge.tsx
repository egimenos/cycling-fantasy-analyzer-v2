import { cn } from '@/shared/lib/utils';

export function MlBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-sm border border-secondary/30 bg-secondary-container/20 px-2 py-0.5 text-xs font-medium font-mono text-secondary',
        className,
      )}
    >
      ML
    </span>
  );
}
