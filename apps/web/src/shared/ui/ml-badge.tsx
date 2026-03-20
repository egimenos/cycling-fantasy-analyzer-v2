import { cn } from '@/shared/lib/utils';

export function MlBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900 dark:text-indigo-200',
        className,
      )}
    >
      ML
    </span>
  );
}
