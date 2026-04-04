import { cn } from '@/shared/lib/utils';

interface BaseBreakdown {
  gc: number;
  stage: number;
  mountain: number;
  sprint: number;
}

interface CategoryBreakdownProps {
  breakdown: BaseBreakdown;
  /** 'compact' for inline display, 'full' for card grid */
  variant?: 'compact' | 'full';
}

const CATEGORIES = [
  { key: 'gc' as const, label: 'GC', color: 'gc' },
  { key: 'stage' as const, label: 'STG', color: 'stage' },
  { key: 'mountain' as const, label: 'MTN', color: 'mountain' },
  { key: 'sprint' as const, label: 'SPR', color: 'sprint' },
] as const;

export function CategoryBreakdown({ breakdown, variant = 'full' }: CategoryBreakdownProps) {
  if (variant === 'compact') {
    return (
      <div className="flex gap-3 flex-shrink-0">
        {CATEGORIES.map(({ key, label, color }) => (
          <div key={key} className="text-center">
            <span className={cn('text-[8px] font-mono uppercase block', `text-${color}`)}>
              {label}
            </span>
            <span className={cn('font-mono font-bold text-xs', `text-${color}`)}>
              {breakdown[key].toFixed(0)}
            </span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-4 gap-2">
      {CATEGORIES.map(({ key, label, color }) => (
        <div
          key={key}
          className={cn('bg-surface-container-high p-2 rounded-sm border-l-2', `border-${color}`)}
        >
          <p className={cn('text-[10px] text-outline font-mono')}>{label}</p>
          <p className={cn('font-mono font-bold', `text-${color}`)}>{breakdown[key].toFixed(1)}</p>
        </div>
      ))}
    </div>
  );
}
