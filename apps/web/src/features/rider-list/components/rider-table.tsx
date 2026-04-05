import { useMemo, useState } from 'react';
import type { ColumnDef, Row } from '@tanstack/react-table';
import {
  BreakoutFlag,
  type AnalyzedRider,
  type AnalyzeResponse,
} from '@cycling-analyzer/shared-types';
import { DataTable } from '@/shared/ui/data-table';
import { ScoreBadge } from '@/shared/ui/score-badge';
import { MlBadge } from '@/shared/ui/ml-badge';
import { Badge } from '@/shared/ui/badge';
import { EmptyState } from '@/shared/ui/empty-state';
import { formatNumber, cn } from '@/shared/lib/utils';
import { Lock, Unlock, Ban, ExternalLink, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip';
import { BpiBadge, FlagChip } from './bpi-badge';
import { BreakoutDetailPanel } from './breakout-detail-panel';
import { RiderCardList } from './rider-card-list';
import { useIsDesktop } from '@/shared/hooks/use-media-query';
import { getEffectiveScore } from '@/shared/lib/rider-utils';
import { CategoryBreakdown } from '@/shared/ui/category-breakdown';

interface RiderTableProps {
  data: AnalyzeResponse;
  lockedIds: Set<string>;
  excludedIds: Set<string>;
  selectedNames: Set<string>;
  onToggleLock: (riderName: string) => void;
  onToggleExclude: (riderName: string) => void;
  onToggleSelect: (riderName: string) => void;
  canSelect: (riderName: string) => boolean;
  /** When set externally (e.g. mobile bottom nav), overrides internal filter state */
  externalFilter?: RiderFilter;
}

function findMaxEffectiveScore(riders: AnalyzedRider[]): number {
  let max = 0;
  for (const r of riders) {
    const score = getEffectiveScore(r);
    if (score !== null && score > max) max = score;
  }
  return max || 100;
}

function createColumns(
  lockedIds: Set<string>,
  excludedIds: Set<string>,
  selectedNames: Set<string>,
  onToggleLock: (name: string) => void,
  onToggleExclude: (name: string) => void,
  onToggleSelect: (name: string) => void,
  canSelect: (name: string) => boolean,
  maxScore: number,
): ColumnDef<AnalyzedRider, unknown>[] {
  return [
    {
      id: 'select',
      header: '',
      size: 40,
      enableSorting: false,
      cell: ({ row }) => {
        const name = row.original.rawName;
        const isSelected = selectedNames.has(name);
        const isLocked = lockedIds.has(name);
        const isExcluded = excludedIds.has(name);
        const disabled =
          row.original.unmatched || isExcluded || isLocked || (!isSelected && !canSelect(name));
        return (
          <label className="flex items-center justify-center min-w-[44px] min-h-[44px] cursor-pointer">
            <input
              type="checkbox"
              checked={isSelected || isLocked}
              disabled={disabled}
              onChange={() => onToggleSelect(name)}
              onClick={(e) => e.stopPropagation()}
              className="h-4 w-4 bg-surface-dim border-outline-variant rounded-none checked:bg-primary"
              aria-label={`Select ${name}`}
            />
          </label>
        );
      },
    },
    {
      id: 'rank',
      header: '#',
      size: 50,
      cell: ({ row }) => (
        <span className="font-mono font-bold text-primary">
          {String(row.index + 1).padStart(2, '0')}
        </span>
      ),
      enableSorting: false,
    },
    {
      accessorKey: 'rawName',
      header: 'Rider Name',
      enableSorting: true,
      cell: ({ getValue, row }) => {
        const name = getValue<string>();
        const isLocked = lockedIds.has(row.original.rawName);
        const isExcluded = excludedIds.has(row.original.rawName);
        const flags = row.original.breakout?.flags;
        return (
          <div className="flex flex-wrap items-center gap-0.5">
            <span
              className={cn(
                'max-w-[100px] md:max-w-[160px] truncate font-headline font-bold text-sm',
                isExcluded && 'line-through opacity-50',
              )}
              title={name}
            >
              {name}
              {isLocked && <Lock className="inline ml-1.5 h-3 w-3 text-secondary" />}
            </span>
            {flags?.map((flag) => (
              <FlagChip key={flag} flag={flag} />
            ))}
          </div>
        );
      },
    },
    {
      accessorKey: 'rawTeam',
      header: 'Team',
      enableSorting: true,
      meta: { className: 'hidden md:table-cell' },
      cell: ({ getValue }) => (
        <span className="text-xs font-mono text-outline uppercase">{getValue<string>()}</span>
      ),
    },
    {
      accessorKey: 'priceHillios',
      header: 'Price',
      enableSorting: true,
      cell: ({ getValue, row }) => {
        const name = row.original.rawName;
        const isSelected = selectedNames.has(name) || lockedIds.has(name);
        const affordable = isSelected || canSelect(name);
        return (
          <span
            className={cn('text-right font-mono font-bold', !affordable && 'text-error/60')}
            title={!affordable ? 'Exceeds remaining budget' : undefined}
          >
            {formatNumber(getValue<number>())}
          </span>
        );
      },
    },
    {
      id: 'effectiveScore',
      accessorFn: (row) => getEffectiveScore(row),
      header: () => (
        <span className="inline-flex items-center gap-1.5">
          Score
          <MlBadge />
        </span>
      ),
      enableSorting: true,
      cell: ({ row }) => {
        if (row.original.unmatched) {
          return <span className="text-on-primary-container font-mono">---</span>;
        }
        const score = getEffectiveScore(row.original);
        return <ScoreBadge score={score} maxScore={maxScore} />;
      },
    },
    {
      id: 'value',
      accessorFn: (row) => {
        const score = getEffectiveScore(row);
        return score !== null && row.priceHillios > 0 ? score / row.priceHillios : null;
      },
      header: 'Value',
      enableSorting: true,
      cell: ({ getValue, row }) => {
        if (row.original.unmatched)
          return <span className="text-on-primary-container font-mono">---</span>;
        const val = getValue<number | null>();
        return (
          <span className="text-right font-mono">{val !== null ? val.toFixed(2) : '---'}</span>
        );
      },
    },
    {
      id: 'bpi',
      accessorFn: (row) => row.breakout?.index ?? null,
      header: () => (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center gap-1 cursor-default">
              BPI <Info className="h-3 w-3 text-outline" />
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-[200px]">
            Breakout Potential Index (0-100). Composite of trajectory, form, route fit and variance
            signals.
          </TooltipContent>
        </Tooltip>
      ),
      size: 70,
      enableSorting: true,
      sortingFn: (rowA, rowB) => {
        const a = rowA.original.breakout?.index ?? -1;
        const b = rowB.original.breakout?.index ?? -1;
        return a - b;
      },
      cell: ({ getValue }) => <BpiBadge value={getValue<number | null>()} />,
    },
    {
      id: 'matchStatus',
      header: 'Match',
      enableSorting: false,
      meta: { className: 'hidden md:table-cell' },
      cell: ({ row }) => {
        const isExcluded = excludedIds.has(row.original.rawName);
        if (isExcluded) {
          return (
            <Badge variant="outline" className="text-[10px] rounded-full">
              EXCLUDED
            </Badge>
          );
        }
        return row.original.unmatched ? (
          <Badge variant="warning" className="text-[10px] rounded-full">
            UNMATCHED
          </Badge>
        ) : (
          <Badge variant="secondary" className="text-[10px] rounded-full">
            MATCH
          </Badge>
        );
      },
    },
    {
      id: 'actions',
      header: '',
      size: 100,
      minSize: 90,
      enableSorting: false,
      cell: ({ row }) => {
        const name = row.original.rawName;
        const isLocked = lockedIds.has(name);
        const isExcluded = excludedIds.has(name);
        if (row.original.unmatched) return null;
        return (
          <div className="flex justify-end gap-1 md:gap-2 text-outline pr-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleLock(name);
              }}
              className={cn(
                'p-2.5 md:p-1.5 rounded-sm cursor-pointer hover:text-primary hover:bg-surface-container-highest transition-colors',
                isLocked && 'text-secondary',
              )}
              aria-label={isLocked ? `Unlock ${name}` : `Lock ${name}`}
            >
              {isLocked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleExclude(name);
              }}
              className={cn(
                'p-2.5 md:p-1.5 rounded-sm cursor-pointer hover:text-error hover:bg-surface-container-highest transition-colors',
                isExcluded && 'text-error',
              )}
              aria-label={isExcluded ? `Include ${name}` : `Exclude ${name}`}
            >
              <Ban className="h-4 w-4" />
            </button>
          </div>
        );
      },
    },
  ];
}

function PerformanceContent({ rider }: { rider: AnalyzedRider }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
      {rider.categoryScores && (
        <div className="space-y-4">
          <h4 className="inline-flex items-center gap-1.5 text-[10px] font-mono text-outline uppercase">
            ML Predicted Breakdown
            <MlBadge />
          </h4>
          <CategoryBreakdown breakdown={rider.categoryScores} />
        </div>
      )}

      <div className={rider.categoryScores ? 'col-span-3' : 'col-span-4'}>
        {rider.sameRaceHistory && rider.sameRaceHistory.length > 0 && (
          <div>
            <h4 className="text-[10px] font-mono text-outline uppercase mb-4">Same Race History</h4>
            <div className="bg-surface-container-high rounded-sm overflow-hidden border border-outline-variant/10">
              <table className="w-full text-xs font-mono">
                <thead className="bg-surface-container-highest/50 text-outline">
                  <tr>
                    <th scope="col" className="p-3 text-left">
                      Year
                    </th>
                    <th scope="col" className="p-3 text-right">
                      GC
                    </th>
                    <th scope="col" className="p-3 text-right">
                      Stage
                    </th>
                    <th scope="col" className="p-3 text-right">
                      Mtn
                    </th>
                    <th scope="col" className="p-3 text-right">
                      Sprint
                    </th>
                    <th scope="col" className="p-3 text-right">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {rider.sameRaceHistory.map((h) => (
                    <tr key={h.year}>
                      <td className="p-3 font-bold">{h.year}</td>
                      <td className="p-3 text-right">{h.gc.toFixed(1)}</td>
                      <td className="p-3 text-right">{h.stage.toFixed(1)}</td>
                      <td className="p-3 text-right">{h.mountain.toFixed(1)}</td>
                      <td className="p-3 text-right">{h.sprint.toFixed(1)}</td>
                      <td className="p-3 text-right font-bold">{h.total.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {rider.matchedRider && (
          <div className="flex items-center gap-3 text-xs text-on-primary-container mt-4">
            <span>
              Matched: {rider.matchedRider.fullName} ({rider.matchedRider.currentTeam}) —
              confidence: {(rider.matchConfidence * 100).toFixed(0)}%
            </span>
            <a
              href={`https://www.procyclingstats.com/rider/${rider.matchedRider.pcsSlug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-secondary hover:underline"
            >
              PCS Profile <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

function ExpandedRowContent({ rider }: { rider: AnalyzedRider }) {
  const [activeTab, setActiveTab] = useState<'performance' | 'breakout'>('performance');

  if (rider.unmatched) {
    return (
      <p className="text-sm text-on-surface-variant">
        No match found in database for &ldquo;{rider.rawName}&rdquo;.
      </p>
    );
  }

  const showTabs = !rider.unmatched && rider.breakout != null;

  return (
    <div>
      {showTabs && (
        <div className="flex gap-4 border-b border-outline-variant/20 mb-4">
          <button
            onClick={() => setActiveTab('performance')}
            className={cn(
              'pb-2 text-xs font-mono uppercase tracking-wider cursor-pointer',
              activeTab === 'performance'
                ? 'border-b-2 border-primary text-primary font-bold'
                : 'text-outline hover:text-on-surface',
            )}
          >
            Performance
          </button>
          <button
            onClick={() => setActiveTab('breakout')}
            className={cn(
              'pb-2 text-xs font-mono uppercase tracking-wider cursor-pointer',
              activeTab === 'breakout'
                ? 'border-b-2 border-primary text-primary font-bold'
                : 'text-outline hover:text-on-surface',
            )}
          >
            Breakout
          </button>
        </div>
      )}

      {activeTab === 'performance' || !showTabs ? (
        <PerformanceContent rider={rider} />
      ) : (
        <BreakoutDetailPanel breakout={rider.breakout!} prediction={rider.totalProjectedPts ?? 0} />
      )}
    </div>
  );
}

export type RiderFilter =
  | 'all'
  | 'selected'
  | 'locked'
  | 'excluded'
  | 'unmatched'
  | 'breakout'
  | 'valuePicks';

interface FilterOption {
  value: RiderFilter;
  label: string;
  activeClass: string;
}

const FILTER_OPTIONS: FilterOption[] = [
  { value: 'all', label: 'All', activeClass: 'bg-primary/15 text-primary border-primary/40' },
  {
    value: 'selected',
    label: 'Selected',
    activeClass: 'bg-secondary/15 text-secondary border-secondary/40',
  },
  {
    value: 'locked',
    label: 'Locked',
    activeClass: 'bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/40',
  },
  { value: 'excluded', label: 'Excluded', activeClass: 'bg-error/15 text-error border-error/40' },
  {
    value: 'unmatched',
    label: 'Unmatched',
    activeClass: 'bg-tertiary/15 text-tertiary border-tertiary/40',
  },
  {
    value: 'breakout',
    label: 'Breakout',
    activeClass: 'bg-purple-500/15 text-purple-400 border-purple-500/40',
  },
  {
    value: 'valuePicks',
    label: 'Value Picks',
    activeClass: 'bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/40',
  },
];

export function RiderTable({
  data,
  lockedIds,
  excludedIds,
  selectedNames,
  onToggleLock,
  onToggleExclude,
  onToggleSelect,
  canSelect,
  externalFilter,
}: RiderTableProps) {
  const [internalFilter, setInternalFilter] = useState<RiderFilter>('all');
  const filter = externalFilter ?? internalFilter;
  const setFilter = setInternalFilter;
  const isDesktop = useIsDesktop();

  if (data.riders.length === 0) {
    return <EmptyState title="No riders" description="Submit riders to see analysis results." />;
  }

  const maxScore = useMemo(() => findMaxEffectiveScore(data.riders), [data.riders]);

  const filteredRiders = useMemo(
    () =>
      data.riders.filter((rider) => {
        switch (filter) {
          case 'selected':
            return selectedNames.has(rider.rawName);
          case 'locked':
            return lockedIds.has(rider.rawName);
          case 'excluded':
            return excludedIds.has(rider.rawName);
          case 'unmatched':
            return rider.unmatched;
          case 'breakout':
            return (rider.breakout?.index ?? 0) >= 50;
          case 'valuePicks':
            return rider.breakout?.flags?.includes(BreakoutFlag.DeepValue) ?? false;
          default:
            return true;
        }
      }),
    [data.riders, filter, selectedNames, lockedIds, excludedIds],
  );

  const filterCounts: Record<RiderFilter, number> = useMemo(
    () => ({
      all: data.riders.length,
      selected: selectedNames.size,
      locked: lockedIds.size,
      excluded: excludedIds.size,
      unmatched: data.unmatchedCount,
      breakout: data.riders.filter((r) => (r.breakout?.index ?? 0) >= 50).length,
      valuePicks: data.riders.filter(
        (r) => r.breakout?.flags?.includes(BreakoutFlag.DeepValue) ?? false,
      ).length,
    }),
    [data.riders, data.unmatchedCount, selectedNames.size, lockedIds.size, excludedIds.size],
  );

  const columns = useMemo(
    () =>
      createColumns(
        lockedIds,
        excludedIds,
        selectedNames,
        onToggleLock,
        onToggleExclude,
        onToggleSelect,
        canSelect,
        maxScore,
      ),
    [
      lockedIds,
      excludedIds,
      selectedNames,
      onToggleLock,
      onToggleExclude,
      onToggleSelect,
      canSelect,
      maxScore,
    ],
  );

  return (
    <div data-testid="dashboard-rider-table" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div data-testid="dashboard-filter-bar" className="flex flex-wrap gap-2">
          {FILTER_OPTIONS.map(({ value, label, activeClass }) => {
            const count = filterCounts[value];
            if (value !== 'all' && count === 0) return null;
            const isActive = filter === value;
            return (
              <button
                key={value}
                data-testid={`dashboard-filter-${value}`}
                onClick={() => setFilter(isActive && value !== 'all' ? 'all' : value)}
                className={cn(
                  'px-3 py-2 md:py-1 rounded-sm text-[11px] md:text-[10px] font-mono uppercase tracking-wider border transition-colors',
                  isActive
                    ? activeClass
                    : 'bg-transparent text-outline border-outline-variant/20 hover:text-on-surface hover:border-outline-variant/40',
                )}
              >
                {label}
                <span className="ml-1.5 font-bold">{count}</span>
              </button>
            );
          })}
        </div>
        <span data-testid="dashboard-rider-count" className="text-xs font-mono text-outline">
          Showing {filteredRiders.length} of {data.riders.length}
        </span>
      </div>
      {filteredRiders.length === 0 && filter !== 'all' ? (
        <div className="flex flex-col items-center justify-center py-12 text-outline">
          <p className="text-sm font-mono">
            {filter === 'breakout'
              ? 'No breakout candidates found'
              : filter === 'valuePicks'
                ? 'No value picks found for this race'
                : 'No riders match this filter'}
          </p>
          <button
            className="mt-2 text-xs text-primary hover:underline cursor-pointer"
            onClick={() => setFilter('all')}
          >
            Show all riders
          </button>
        </div>
      ) : isDesktop ? (
        <div data-animated-rows>
          <DataTable<AnalyzedRider>
            columns={columns}
            data={filteredRiders}
            initialSorting={[{ id: 'effectiveScore', desc: true }]}
            renderExpandedRow={(row: Row<AnalyzedRider>) => (
              <ExpandedRowContent rider={row.original} />
            )}
            getRowClassName={(row: Row<AnalyzedRider>) => {
              if (excludedIds.has(row.original.rawName)) return 'opacity-40 grayscale';
              if (lockedIds.has(row.original.rawName)) return 'bg-secondary-container/5';
              if (row.original.unmatched) return 'opacity-60';
              return '';
            }}
          />
        </div>
      ) : (
        <RiderCardList
          riders={filteredRiders}
          lockedIds={lockedIds}
          excludedIds={excludedIds}
          selectedNames={selectedNames}
          onToggleLock={onToggleLock}
          onToggleExclude={onToggleExclude}
          onToggleSelect={onToggleSelect}
          canSelect={canSelect}
          maxScore={maxScore}
        />
      )}
    </div>
  );
}
