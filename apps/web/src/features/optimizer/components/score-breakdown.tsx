import { type CategoryScores, ResultCategory } from '@cycling-analyzer/shared-types';
import { cn } from '@/shared/lib/utils';

interface ScoreBreakdownProps {
  breakdown: CategoryScores;
}

const CATEGORY_CONFIG: { key: keyof CategoryScores; label: string; color: string }[] = [
  { key: ResultCategory.GC, label: 'GC', color: 'bg-blue-500' },
  { key: ResultCategory.STAGE, label: 'Stage', color: 'bg-green-500' },
  { key: ResultCategory.MOUNTAIN, label: 'Mountain', color: 'bg-orange-500' },
  { key: ResultCategory.SPRINT, label: 'Sprint', color: 'bg-red-500' },
  { key: ResultCategory.FINAL, label: 'Final', color: 'bg-purple-500' },
];

export function ScoreBreakdown({ breakdown }: ScoreBreakdownProps) {
  const total = Object.values(breakdown).reduce((sum, v) => sum + v, 0);

  return (
    <div className="space-y-2">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-secondary">
        {CATEGORY_CONFIG.map(({ key, color }) => {
          const pct = total > 0 ? (breakdown[key] / total) * 100 : 0;
          if (pct === 0) return null;
          return (
            <div
              key={key}
              className={cn('h-full transition-all', color)}
              style={{ width: `${pct}%` }}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-3">
        {CATEGORY_CONFIG.map(({ key, label, color }) => (
          <div key={key} className="flex items-center gap-1.5 text-xs">
            <div className={cn('h-2.5 w-2.5 rounded-sm', color)} />
            <span className="text-muted-foreground">{label}</span>
            <span className="font-medium">{breakdown[key].toFixed(1)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
