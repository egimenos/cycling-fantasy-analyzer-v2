import { type CategoryScores, ResultCategory } from '@cycling-analyzer/shared-types';
import { cn } from '@/shared/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip';

interface ScoreBreakdownProps {
  breakdown: CategoryScores;
}

const CATEGORY_CONFIG: {
  key: keyof CategoryScores;
  label: string;
  colorBar: string;
  colorDot: string;
  colorText: string;
}[] = [
  {
    key: ResultCategory.GC,
    label: 'GC',
    colorBar: 'bg-gc/80',
    colorDot: 'bg-gc',
    colorText: 'text-gc',
  },
  {
    key: ResultCategory.STAGE,
    label: 'STAGE',
    colorBar: 'bg-stage/80',
    colorDot: 'bg-stage',
    colorText: 'text-stage',
  },
  {
    key: ResultCategory.MOUNTAIN,
    label: 'MOUNTAIN',
    colorBar: 'bg-mountain/80',
    colorDot: 'bg-mountain',
    colorText: 'text-mountain',
  },
  {
    key: ResultCategory.SPRINT,
    label: 'SPRINT',
    colorBar: 'bg-sprint/80',
    colorDot: 'bg-sprint',
    colorText: 'text-sprint',
  },
];

export function ScoreBreakdown({ breakdown }: ScoreBreakdownProps) {
  const total = Object.values(breakdown).reduce((sum, v) => sum + v, 0);

  return (
    <div
      data-testid="optimization-score-breakdown"
      className="bg-surface-container-low p-4 md:p-8 rounded-sm"
    >
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-2 mb-4">
        <span className="text-xs font-mono uppercase tracking-widest text-on-surface-variant">
          Point Distribution Analysis
        </span>
        <div className="flex flex-wrap gap-3 md:gap-4 text-[10px] font-mono uppercase tracking-widest">
          {CATEGORY_CONFIG.map(({ key, label, colorDot }) => {
            const pct = total > 0 ? (breakdown[key] / total) * 100 : 0;
            return (
              <span key={key} className="flex items-center gap-1.5">
                <span className={cn('w-2 h-2 rounded-full', colorDot)} />
                {label}
                <span className="font-bold">{pct.toFixed(0)}%</span>
              </span>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        <div className="h-8 w-full flex rounded-sm overflow-hidden bg-surface-container-highest">
          {CATEGORY_CONFIG.map(({ key, label, colorBar, colorText }) => {
            const pct = total > 0 ? (breakdown[key] / total) * 100 : 0;
            if (pct === 0) return null;
            return (
              <Tooltip key={key}>
                <TooltipTrigger asChild>
                  <div
                    className={cn(
                      'h-full hover:brightness-125 transition-all animate-bar-fill relative flex items-center justify-center cursor-default',
                      colorBar,
                    )}
                    style={{ width: `${pct}%` }}
                  >
                    {pct >= 12 && (
                      <span className="text-[10px] font-mono font-bold text-white/80 drop-shadow-sm">
                        {pct.toFixed(0)}%
                      </span>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <span className={colorText}>{label}</span>: {breakdown[key].toFixed(1)} pts (
                  {pct.toFixed(1)}%)
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
        {/* Per-category breakdown */}
        <div className="grid grid-cols-4 gap-2">
          {CATEGORY_CONFIG.map(({ key, label, colorDot, colorText }) => (
            <div key={key} className="bg-surface-container-high/50 p-2.5 rounded-sm text-center">
              <span className={cn('w-1.5 h-1.5 rounded-full inline-block mb-1', colorDot)} />
              <div className={cn('text-lg font-mono font-bold', colorText)}>
                {breakdown[key].toFixed(0)}
              </div>
              <div className="text-[10px] font-mono text-outline uppercase">{label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
