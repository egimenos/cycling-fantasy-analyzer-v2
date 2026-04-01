import { cn } from '@/shared/lib/utils';

interface BpiBadgeProps {
  value: number | null;
}

export function BpiBadge({ value }: BpiBadgeProps) {
  if (value == null) {
    return <span className="text-outline font-mono">—</span>;
  }

  const colorClass =
    value >= 70
      ? 'bg-green-500/15 text-green-400 border-green-500/40'
      : value >= 40
        ? 'bg-tertiary/15 text-tertiary border-tertiary/40'
        : 'bg-surface-container-high text-outline border-outline-variant/20';

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-sm px-2 py-0.5 text-xs font-mono font-bold border',
        colorClass,
      )}
    >
      {value}
    </span>
  );
}

type BreakoutFlagValue = string;

const FLAG_CONFIG: Record<string, { label: string; colorClass: string }> = {
  EMERGING_TALENT: {
    label: 'EMERGING',
    colorClass: 'bg-purple-500/15 text-purple-400 border-purple-500/40',
  },
  HOT_STREAK: {
    label: 'HOT',
    colorClass: 'bg-error/15 text-error border-error/40',
  },
  DEEP_VALUE: {
    label: 'VALUE',
    colorClass: 'bg-green-500/15 text-green-400 border-green-500/40',
  },
  CEILING_PLAY: {
    label: 'CEILING',
    colorClass: 'bg-primary/15 text-primary border-primary/40',
  },
  SPRINT_OPPORTUNITY: {
    label: 'SPRINT',
    colorClass: 'bg-tertiary/15 text-tertiary border-tertiary/40',
  },
  BREAKAWAY_HUNTER: {
    label: 'BREAKAWAY',
    colorClass: 'bg-secondary/15 text-secondary border-secondary/40',
  },
};

export function FlagChip({ flag }: { flag: BreakoutFlagValue }) {
  const config = FLAG_CONFIG[flag];
  if (!config) return null;

  return (
    <span
      className={cn(
        'ml-1 inline-flex items-center rounded-sm px-1 py-0.5 text-[9px] font-mono font-bold uppercase border',
        config.colorClass,
      )}
    >
      {config.label}
    </span>
  );
}
