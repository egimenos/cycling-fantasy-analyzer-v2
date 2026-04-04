import { cn } from '@/shared/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip';

interface BpiBadgeProps {
  value: number | null;
}

function getBpiLabel(value: number): string {
  if (value >= 70) return 'High breakout potential';
  if (value >= 40) return 'Moderate breakout potential';
  return 'Low breakout potential';
}

export function BpiBadge({ value }: BpiBadgeProps) {
  if (value == null) {
    return <span className="text-outline font-mono">—</span>;
  }

  const colorClass =
    value >= 70
      ? 'bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/40'
      : value >= 40
        ? 'bg-tertiary/15 text-tertiary border-tertiary/40'
        : 'bg-surface-container-high text-outline border-outline-variant/20';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className={cn(
            'inline-flex items-center justify-center rounded-sm px-2 py-0.5 text-xs font-mono font-bold border cursor-default',
            colorClass,
          )}
        >
          {value}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {getBpiLabel(value)} — {value}/100
      </TooltipContent>
    </Tooltip>
  );
}

const FLAG_CONFIG: Record<string, { label: string; colorClass: string; description: string }> = {
  EMERGING_TALENT: {
    label: 'EMERGING',
    colorClass: 'bg-purple-500/15 text-purple-400 border-purple-500/40',
    description: 'Young rider with steep upward trajectory',
  },
  HOT_STREAK: {
    label: 'HOT',
    colorClass: 'bg-error/15 text-error border-error/40',
    description: 'Strong recent form — last 90 days well above career average',
  },
  DEEP_VALUE: {
    label: 'VALUE',
    colorClass: 'bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/40',
    description: 'Top-quartile pts/hillio at low price with meaningful prediction',
  },
  COMEBACK: {
    label: 'COMEBACK',
    colorClass: 'bg-primary/15 text-primary border-primary/40',
    description: 'Historical peak far exceeds prediction with recovery signs',
  },
  SPRINT_OPPORTUNITY: {
    label: 'SPRINT',
    colorClass: 'bg-tertiary/15 text-tertiary border-tertiary/40',
    description: 'Sprint profile on a flat-friendly course',
  },
  BREAKAWAY_HUNTER: {
    label: 'BREAKAWAY',
    colorClass: 'bg-secondary/15 text-secondary border-secondary/40',
    description: 'Mountain points on a budget',
  },
  RACE_SPECIALIST: {
    label: 'SPECIALIST',
    colorClass: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/40',
    description: 'Historically outperforms predictions in this race',
  },
};

export function FlagChip({ flag }: { flag: string }) {
  const config = FLAG_CONFIG[flag];
  if (!config) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className={cn(
            'ml-1 inline-flex items-center rounded-sm px-1 py-0.5 text-[9px] font-mono font-bold uppercase border cursor-default',
            config.colorClass,
          )}
        >
          {config.label}
        </span>
      </TooltipTrigger>
      <TooltipContent>{config.description}</TooltipContent>
    </Tooltip>
  );
}
