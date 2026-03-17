import type { ColumnDef, Row } from '@tanstack/react-table';
import type { AnalyzedRider, AnalyzeResponse } from '@cycling-analyzer/shared-types';
import { DataTable } from '@/shared/ui/data-table';
import { ScoreBadge } from '@/shared/ui/score-badge';
import { Badge } from '@/shared/ui/badge';
import { EmptyState } from '@/shared/ui/empty-state';
import { formatNumber, cn } from '@/shared/lib/utils';
import { Lock, Unlock, XCircle } from 'lucide-react';

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

function findMaxScore(riders: AnalyzedRider[]): number {
  let max = 0;
  for (const r of riders) {
    if (r.totalProjectedPts !== null && r.totalProjectedPts > max) {
      max = r.totalProjectedPts;
    }
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
): ColumnDef<AnalyzedRider, unknown>[] {
  return [
    {
      id: 'select',
      header: '',
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
            className="h-4 w-4 rounded border-input"
            aria-label={`Select ${name}`}
          />
        );
      },
    },
    {
      id: 'rank',
      header: '#',
      cell: ({ row }) => <span className="text-muted-foreground">{row.index + 1}</span>,
      enableSorting: false,
    },
    {
      accessorKey: 'rawName',
      header: 'Name',
      enableSorting: true,
      cell: ({ getValue, row }) => {
        const isExcluded = excludedIds.has(row.original.rawName);
        return (
          <span
            className={cn(
              'max-w-[200px] truncate font-medium',
              isExcluded && 'line-through opacity-50',
            )}
            title={getValue<string>()}
          >
            {getValue<string>()}
          </span>
        );
      },
    },
    {
      accessorKey: 'rawTeam',
      header: 'Team',
      enableSorting: true,
    },
    {
      accessorKey: 'priceHillios',
      header: 'Price (H)',
      enableSorting: true,
      cell: ({ getValue }) => formatNumber(getValue<number>()),
    },
    {
      accessorKey: 'totalProjectedPts',
      header: 'Score',
      enableSorting: true,
      cell: ({ row, table }) => {
        if (row.original.unmatched) {
          return <span className="text-muted-foreground">---</span>;
        }
        const maxScore = findMaxScore(table.getCoreRowModel().rows.map((r) => r.original));
        return <ScoreBadge score={row.original.totalProjectedPts} maxScore={maxScore} />;
      },
    },
    {
      accessorKey: 'pointsPerHillio',
      header: 'Pts/H',
      enableSorting: true,
      cell: ({ getValue, row }) => {
        if (row.original.unmatched) return <span className="text-muted-foreground">---</span>;
        const val = getValue<number | null>();
        return val !== null ? val.toFixed(2) : '---';
      },
    },
    {
      id: 'matchStatus',
      header: 'Match',
      enableSorting: false,
      cell: ({ row }) =>
        row.original.unmatched ? (
          <Badge variant="warning">Unmatched</Badge>
        ) : (
          <Badge variant="success">Matched</Badge>
        ),
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: ({ row }) => {
        const name = row.original.rawName;
        const isLocked = lockedIds.has(name);
        const isExcluded = excludedIds.has(name);
        if (row.original.unmatched) return null;
        return (
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleLock(name);
              }}
              className={cn('rounded p-1 hover:bg-muted', isLocked && 'text-green-600')}
              aria-label={isLocked ? `Unlock ${name}` : `Lock ${name}`}
            >
              {isLocked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleExclude(name);
              }}
              className={cn('rounded p-1 hover:bg-muted', isExcluded && 'text-red-600')}
              aria-label={isExcluded ? `Include ${name}` : `Exclude ${name}`}
            >
              <XCircle className={cn('h-3.5 w-3.5', isExcluded && 'fill-red-100')} />
            </button>
          </div>
        );
      },
    },
  ];
}

function ExpandedRowContent({ rider }: { rider: AnalyzedRider }) {
  if (rider.unmatched) {
    return (
      <p className="text-sm text-muted-foreground">
        No match found in database for &ldquo;{rider.rawName}&rdquo;.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-3 lg:grid-cols-5">
      {rider.categoryScores && (
        <>
          <ScoreDetail label="GC" value={rider.categoryScores.gc} />
          <ScoreDetail label="Stage" value={rider.categoryScores.stage} />
          <ScoreDetail label="Mountain" value={rider.categoryScores.mountain} />
          <ScoreDetail label="Sprint" value={rider.categoryScores.sprint} />
        </>
      )}
      {rider.compositeScore !== null && (
        <ScoreDetail label="Composite" value={rider.compositeScore} />
      )}
      {rider.seasonsUsed !== null && <ScoreDetail label="Seasons Used" value={rider.seasonsUsed} />}
      {rider.matchedRider && (
        <div className="col-span-full mt-1 text-xs text-muted-foreground">
          Matched: {rider.matchedRider.fullName} ({rider.matchedRider.currentTeam}) — confidence:{' '}
          {(rider.matchConfidence * 100).toFixed(0)}%
        </div>
      )}
    </div>
  );
}

function ScoreDetail({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <span className="text-xs text-muted-foreground">{label}</span>
      <p className="text-sm font-medium">{value.toFixed(1)}</p>
    </div>
  );
}

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
  if (data.riders.length === 0) {
    return <EmptyState title="No riders" description="Submit riders to see analysis results." />;
  }

  const columns = createColumns(
    lockedIds,
    excludedIds,
    selectedNames,
    onToggleLock,
    onToggleExclude,
    onToggleSelect,
    canSelect,
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
        <span>
          Showing {data.riders.length} rider{data.riders.length !== 1 ? 's' : ''}
        </span>
        <span>
          ({data.totalMatched} matched, {data.unmatchedCount} unmatched)
        </span>
      </div>
      <DataTable<AnalyzedRider>
        columns={columns}
        data={data.riders}
        initialSorting={[{ id: 'totalProjectedPts', desc: true }]}
        renderExpandedRow={(row: Row<AnalyzedRider>) => <ExpandedRowContent rider={row.original} />}
        getRowClassName={(row: Row<AnalyzedRider>) => {
          if (lockedIds.has(row.original.rawName))
            return 'border-l-2 border-green-500 bg-green-50/30 dark:bg-green-950/10';
          if (excludedIds.has(row.original.rawName)) return 'opacity-50';
          if (row.original.unmatched) return 'bg-yellow-50/50 dark:bg-yellow-950/20';
          return '';
        }}
      />
    </div>
  );
}
