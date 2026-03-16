import { cn } from '@/shared/lib/utils';
import { formatNumber } from '@/shared/lib/utils';

interface BudgetIndicatorProps {
  spent: number;
  total: number;
  unit?: string;
}

export function BudgetIndicator({ spent, total, unit = 'H' }: BudgetIndicatorProps) {
  const percentage = total > 0 ? (spent / total) * 100 : 0;
  const isOverBudget = spent > total;

  const barColor =
    isOverBudget || percentage >= 100
      ? 'bg-red-500'
      : percentage >= 80
        ? 'bg-yellow-500'
        : 'bg-green-500';

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">
          {formatNumber(spent)}
          {unit} / {formatNumber(total)}
          {unit}
        </span>
        {isOverBudget && <span className="text-xs font-semibold text-red-600">Over budget!</span>}
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className={cn('h-full rounded-full transition-all', barColor)}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
    </div>
  );
}
