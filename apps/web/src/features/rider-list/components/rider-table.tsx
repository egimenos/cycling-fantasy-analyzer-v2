import { useState } from 'react';
import type { ColumnDef, Row } from '@tanstack/react-table';
import type { AnalyzedRider, AnalyzeResponse } from '@cycling-analyzer/shared-types';
import { DataTable } from '@/shared/ui/data-table';
import { ScoreBadge } from '@/shared/ui/score-badge';
import { MlBadge } from '@/shared/ui/ml-badge';
import { Badge } from '@/shared/ui/badge';
import { EmptyState } from '@/shared/ui/empty-state';
import { formatNumber, cn } from '@/shared/lib/utils';
import { Lock, Unlock, Ban, ExternalLink } from 'lucide-react';

interface RiderTableProps {
  data: AnalyzeResponse;
  lockedIds: Set<string>;
  excludedIds: Set<string>;
  selectedNames: Set<string>;
  onToggleLock: (riderName: string) => void;
  onToggleExclude: (riderName: string) => void;
  onToggleSelect: (riderName: string) => void;
  canSelect: (riderName: string) => boolean;
}

function getEffectiveScore(rider: AnalyzedRider, hasML: boolean): number | null {
  if (hasML && rider.mlPredictedScore !== null) return rider.mlPredictedScore;
  return rider.totalProjectedPts;
}

function findMaxEffectiveScore(riders: AnalyzedRider[], hasML: boolean): number {
  let max = 0;
  for (const r of riders) {
    const score = getEffectiveScore(r, hasML);
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
  hasML: boolean,
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
          <input
            type="checkbox"
            checked={isSelected || isLocked}
            disabled={disabled}
            onChange={() => onToggleSelect(name)}
            onClick={(e) => e.stopPropagation()}
            className="h-4 w-4 bg-surface-dim border-outline-variant rounded-none checked:bg-primary"
            aria-label={`Select ${name}`}
          />
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
        return (
          <span
            className={cn(
              'max-w-[160px] truncate font-headline font-bold text-sm',
              isExcluded && 'line-through opacity-50',
            )}
            title={name}
          >
            {name}
            {isLocked && <Lock className="inline ml-1.5 h-3 w-3 text-secondary" />}
          </span>
        );
      },
    },
    {
      accessorKey: 'rawTeam',
      header: 'Team',
      enableSorting: true,
      cell: ({ getValue }) => (
        <span className="text-xs font-mono text-outline uppercase">{getValue<string>()}</span>
      ),
    },
    {
      accessorKey: 'priceHillios',
      header: 'Price (H)',
      enableSorting: true,
      cell: ({ getValue }) => (
        <span className="text-right font-mono font-bold">{formatNumber(getValue<number>())}</span>
      ),
    },
    {
      id: 'effectiveScore',
      accessorFn: (row) => getEffectiveScore(row, hasML),
      header: () =>
        hasML ? (
          <span className="inline-flex items-center gap-1.5">
            Score
            <MlBadge />
          </span>
        ) : (
          'Score'
        ),
      enableSorting: true,
      cell: ({ row, table }) => {
        if (row.original.unmatched) {
          return <span className="text-on-primary-container font-mono">---</span>;
        }
        const maxScore = findMaxEffectiveScore(
          table.getCoreRowModel().rows.map((r) => r.original),
          hasML,
        );
        const score = getEffectiveScore(row.original, hasML);
        return <ScoreBadge score={score} maxScore={maxScore} />;
      },
    },
    {
      accessorKey: 'pointsPerHillio',
      header: 'Pts/H',
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
      id: 'matchStatus',
      header: 'Match',
      enableSorting: false,
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
      size: 80,
      enableSorting: false,
      cell: ({ row }) => {
        const name = row.original.rawName;
        const isLocked = lockedIds.has(name);
        const isExcluded = excludedIds.has(name);
        if (row.original.unmatched) return null;
        return (
          <div className="flex justify-end gap-3 text-outline">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleLock(name);
              }}
              className={cn(
                'p-1.5 rounded-sm cursor-pointer hover:text-primary hover:bg-surface-container-highest transition-colors',
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
                'p-1.5 rounded-sm cursor-pointer hover:text-error hover:bg-surface-container-highest transition-colors',
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

function ExpandedRowContent({ rider, hasML }: { rider: AnalyzedRider; hasML: boolean }) {
  if (rider.unmatched) {
    return (
      <p className="text-sm text-on-surface-variant">
        No match found in database for &ldquo;{rider.rawName}&rdquo;.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
      {/* Category Scores */}
      {rider.categoryScores && (
        <div className="space-y-4">
          <h4 className="text-[10px] font-mono text-outline uppercase">Category Scores</h4>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-surface-container-high p-3 rounded-sm border-l-2 border-gc">
              <p className="text-[9px] text-outline uppercase font-mono">GC</p>
              <p className="font-mono font-bold text-gc text-lg">
                {rider.categoryScores.gc.toFixed(1)}
              </p>
            </div>
            <div className="bg-surface-container-high p-3 rounded-sm border-l-2 border-stage">
              <p className="text-[9px] text-outline uppercase font-mono">Stage</p>
              <p className="font-mono font-bold text-stage text-lg">
                {rider.categoryScores.stage.toFixed(1)}
              </p>
            </div>
            <div className="bg-surface-container-high p-3 rounded-sm border-l-2 border-mountain">
              <p className="text-[9px] text-outline uppercase font-mono">MTN</p>
              <p className="font-mono font-bold text-mountain text-lg">
                {rider.categoryScores.mountain.toFixed(1)}
              </p>
            </div>
            <div className="bg-surface-container-high p-3 rounded-sm border-l-2 border-sprint">
              <p className="text-[9px] text-outline uppercase font-mono">SPR</p>
              <p className="font-mono font-bold text-sprint text-lg">
                {rider.categoryScores.sprint.toFixed(1)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Season History */}
      <div className={rider.categoryScores ? 'col-span-3' : 'col-span-4'}>
        {hasML && rider.mlPredictedScore !== null && (
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs text-on-surface-variant">ML Predicted:</span>
            <span className="text-sm font-mono font-medium">
              {rider.mlPredictedScore.toFixed(1)} pts
            </span>
            <MlBadge />
          </div>
        )}

        {rider.seasonBreakdown && rider.seasonBreakdown.length > 0 && (
          <div>
            <h4 className="text-[10px] font-mono text-outline uppercase mb-4">
              Season Performance History
            </h4>
            <div className="bg-surface-container-high rounded-sm overflow-hidden border border-outline-variant/10">
              <table className="w-full text-xs font-mono">
                <thead className="bg-surface-container-highest/50 text-outline">
                  <tr>
                    <th className="p-3 text-left">Season</th>
                    <th className="p-3 text-right">GC</th>
                    <th className="p-3 text-right">Stage</th>
                    <th className="p-3 text-right">Mtn</th>
                    <th className="p-3 text-right">Sprint</th>
                    <th className="p-3 text-right">Total</th>
                    <th className="p-3 text-right">Weight</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {rider.seasonBreakdown.map((s) => (
                    <tr key={s.year}>
                      <td className="p-3 font-bold">{s.year}</td>
                      <td className="p-3 text-right">{s.gc.toFixed(1)}</td>
                      <td className="p-3 text-right">{s.stage.toFixed(1)}</td>
                      <td className="p-3 text-right">{s.mountain.toFixed(1)}</td>
                      <td className="p-3 text-right">{s.sprint.toFixed(1)}</td>
                      <td className="p-3 text-right font-bold">{s.total.toFixed(1)}</td>
                      <td className="p-3 text-right text-on-primary-container">
                        &times;{s.weight}
                      </td>
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

type RiderFilter = 'all' | 'locked' | 'excluded' | 'unmatched';

const FILTER_OPTIONS: { value: RiderFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'locked', label: 'Locked' },
  { value: 'excluded', label: 'Excluded' },
  { value: 'unmatched', label: 'Unmatched' },
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
}: RiderTableProps) {
  const [filter, setFilter] = useState<RiderFilter>('all');

  if (data.riders.length === 0) {
    return <EmptyState title="No riders" description="Submit riders to see analysis results." />;
  }

  const hasML = data.riders.some((r) => r.scoringMethod === 'hybrid');

  const filteredRiders = data.riders.filter((rider) => {
    switch (filter) {
      case 'locked':
        return lockedIds.has(rider.rawName);
      case 'excluded':
        return excludedIds.has(rider.rawName);
      case 'unmatched':
        return rider.unmatched;
      default:
        return true;
    }
  });

  const filterCounts: Record<RiderFilter, number> = {
    all: data.riders.length,
    locked: lockedIds.size,
    excluded: excludedIds.size,
    unmatched: data.unmatchedCount,
  };

  const columns = createColumns(
    lockedIds,
    excludedIds,
    selectedNames,
    onToggleLock,
    onToggleExclude,
    onToggleSelect,
    canSelect,
    hasML,
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="flex flex-wrap gap-2">
          {FILTER_OPTIONS.map(({ value, label }) => {
            const count = filterCounts[value];
            if (value !== 'all' && count === 0) return null;
            const isActive = filter === value;
            return (
              <button
                key={value}
                onClick={() => setFilter(isActive && value !== 'all' ? 'all' : value)}
                className={cn(
                  'px-3 py-1 rounded-sm text-[10px] font-mono uppercase tracking-wider border transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary border-primary/30'
                    : 'bg-transparent text-outline border-outline-variant/20 hover:text-on-surface hover:border-outline-variant/40',
                )}
              >
                {label}
                <span className="ml-1.5 font-bold">{count}</span>
              </button>
            );
          })}
        </div>
        <span className="text-xs font-mono text-outline">
          Showing {filteredRiders.length} of {data.riders.length}
        </span>
      </div>
      <DataTable<AnalyzedRider>
        columns={columns}
        data={filteredRiders}
        initialSorting={[{ id: 'effectiveScore', desc: true }]}
        renderExpandedRow={(row: Row<AnalyzedRider>) => (
          <ExpandedRowContent rider={row.original} hasML={hasML} />
        )}
        getRowClassName={(row: Row<AnalyzedRider>) => {
          if (excludedIds.has(row.original.rawName)) return 'opacity-40 grayscale';
          if (lockedIds.has(row.original.rawName)) return 'bg-secondary-container/5';
          if (row.original.unmatched) return 'opacity-60';
          return '';
        }}
      />
    </div>
  );
}
