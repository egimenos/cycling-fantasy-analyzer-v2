import { cn } from '@/shared/lib/utils';

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
}

function SkeletonBar({ className }: { className?: string }) {
  return (
    <div className={cn('h-3 rounded bg-surface-container-highest/60 animate-pulse', className)} />
  );
}

export function TableSkeleton({ rows = 8, columns = 6 }: TableSkeletonProps) {
  return (
    <div className="bg-surface-container-low rounded-sm overflow-hidden border border-outline-variant/10 animate-fade-in">
      {/* Header */}
      <div className="bg-surface-container-high/50 px-3 py-3 flex gap-4">
        {Array.from({ length: columns }).map((_, i) => (
          <SkeletonBar
            key={i}
            className={cn('h-2.5', i === 0 ? 'w-8' : i === 1 ? 'w-32' : i === 2 ? 'w-24' : 'w-16')}
          />
        ))}
      </div>
      {/* Rows */}
      <div className="divide-y divide-outline-variant/10">
        {Array.from({ length: rows }).map((_, rowIdx) => (
          <div
            key={rowIdx}
            className="px-3 py-3.5 flex items-center gap-4"
            style={{ animationDelay: `${rowIdx * 50}ms` }}
          >
            <SkeletonBar className="w-4 h-4 rounded" />
            <SkeletonBar className="w-6" />
            <SkeletonBar
              className={cn(
                'flex-1',
                rowIdx % 3 === 0
                  ? 'max-w-[140px]'
                  : rowIdx % 3 === 1
                    ? 'max-w-[120px]'
                    : 'max-w-[160px]',
              )}
            />
            <SkeletonBar className="w-20" />
            <SkeletonBar className="w-14" />
            <SkeletonBar className="w-12" />
            <SkeletonBar className="w-10" />
          </div>
        ))}
      </div>
    </div>
  );
}
