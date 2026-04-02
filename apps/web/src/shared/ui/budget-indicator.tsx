import { cn } from '@/shared/lib/utils';
import { formatNumber } from '@/shared/lib/utils';

interface BudgetIndicatorProps {
  spent: number;
  total: number;
  unit?: string;
}

export function BudgetIndicator({ spent, total, unit = '' }: BudgetIndicatorProps) {
  const percentage = total > 0 ? (spent / total) * 100 : 0;
  const isOverBudget = spent > total;

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-mono font-medium text-on-surface">
          {formatNumber(spent)}
          {unit} / {formatNumber(total)}
          {unit}
        </span>
        {isOverBudget && (
          <span className="text-xs font-semibold font-mono text-error">Over budget!</span>
        )}
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-surface-container-highest"
        role="progressbar"
        aria-valuenow={percentage}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Budget usage"
      >
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            isOverBudget ? 'bg-error animate-pulse' : 'bg-gradient-to-r from-secondary to-blue-400',
          )}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
    </div>
  );
}
