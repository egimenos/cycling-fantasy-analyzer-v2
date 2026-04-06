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
  { key: 'gc' as const, label: 'GC', text: 'text-gc', border: 'border-gc' },
  { key: 'stage' as const, label: 'STG', text: 'text-stage', border: 'border-stage' },
  { key: 'mountain' as const, label: 'MTN', text: 'text-mountain', border: 'border-mountain' },
  { key: 'sprint' as const, label: 'SPR', text: 'text-sprint', border: 'border-sprint' },
] as const;

export function CategoryBreakdown({ breakdown, variant = 'full' }: CategoryBreakdownProps) {
  if (variant === 'compact') {
    return (
      <div className="flex gap-3 flex-shrink-0">
        {CATEGORIES.map(({ key, label, text }) => (
          <div key={key} className="text-center">
            <span className={cn('text-[8px] font-mono uppercase block', text)}>{label}</span>
            <span className={cn('font-mono font-bold text-xs', text)}>
              {breakdown[key].toFixed(0)}
            </span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {CATEGORIES.map(({ key, label, text, border }) => (
        <div
          key={key}
          className={cn('bg-surface-container-high p-2 rounded-sm border-l-2 min-w-0', border)}
        >
          <p className="text-[10px] text-outline font-mono">{label}</p>
          <p className={cn('font-mono font-bold', text)}>{breakdown[key].toFixed(1)}</p>
        </div>
      ))}
    </div>
  );
}
