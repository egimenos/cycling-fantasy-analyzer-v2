import { type CategoryScores, ResultCategory } from '@cycling-analyzer/shared-types';
import { cn } from '@/shared/lib/utils';

interface ScoreBreakdownProps {
  breakdown: CategoryScores;
}

const CATEGORY_CONFIG: {
  key: keyof CategoryScores;
  label: string;
  colorBar: string;
  colorDot: string;
}[] = [
  { key: ResultCategory.GC, label: 'GC', colorBar: 'bg-gc/80', colorDot: 'bg-gc' },
  { key: ResultCategory.STAGE, label: 'STAGE', colorBar: 'bg-stage/80', colorDot: 'bg-stage' },
  {
    key: ResultCategory.MOUNTAIN,
    label: 'MOUNTAIN',
    colorBar: 'bg-mountain/80',
    colorDot: 'bg-mountain',
  },
  { key: ResultCategory.SPRINT, label: 'SPRINT', colorBar: 'bg-sprint/80', colorDot: 'bg-sprint' },
];

export function ScoreBreakdown({ breakdown }: ScoreBreakdownProps) {
  const total = Object.values(breakdown).reduce((sum, v) => sum + v, 0);

  return (
    <div className="bg-surface-container-low p-8 rounded-sm">
      <div className="flex justify-between items-end mb-4">
        <span className="text-xs font-mono uppercase tracking-widest text-on-surface-variant">
          Point Distribution Analysis
        </span>
        <div className="flex gap-4 text-[10px] font-mono uppercase tracking-widest">
          {CATEGORY_CONFIG.map(({ key, label, colorDot }) => (
            <span key={key} className="flex items-center gap-1.5">
              <span className={cn('w-2 h-2 rounded-full', colorDot)} />
              {label}
            </span>
          ))}
        </div>
      </div>
      <div className="h-6 w-full flex rounded-sm overflow-hidden bg-surface-container-highest">
        {CATEGORY_CONFIG.map(({ key, colorBar }) => {
          const pct = total > 0 ? (breakdown[key] / total) * 100 : 0;
          if (pct === 0) return null;
          return (
            <div
              key={key}
              className={cn('h-full hover:brightness-125 transition-all', colorBar)}
              style={{ width: `${pct}%` }}
              title={`${key}: ${pct.toFixed(0)}%`}
            />
          );
        })}
      </div>
    </div>
  );
}
