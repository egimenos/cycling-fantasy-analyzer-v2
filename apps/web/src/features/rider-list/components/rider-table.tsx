import type { ColumnDef, Row } from '@tanstack/react-table';
import type { AnalyzedRider, AnalyzeResponse } from '@cycling-analyzer/shared-types';
import { DataTable } from '@/shared/ui/data-table';
import { ScoreBadge } from '@/shared/ui/score-badge';
import { MlBadge } from '@/shared/ui/ml-badge';
import { Badge } from '@/shared/ui/badge';
import { EmptyState } from '@/shared/ui/empty-state';
import { formatNumber, cn } from '@/shared/lib/utils';
import { Lock, Unlock, XCircle, ExternalLink, Info } from 'lucide-react';

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

function HeaderWithTooltip({ label, tooltip }: { label: string; tooltip: string }) {
  return (
    <span className="inline-flex items-center gap-1" title={tooltip}>
      {label}
      <Info className="h-3 w-3 text-muted-foreground/60" />
    </span>
  );
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
      header: () => <HeaderWithTooltip label="Price (H)" tooltip="Fantasy game price in Hillios" />,
      enableSorting: true,
      cell: ({ getValue }) => formatNumber(getValue<number>()),
    },
    {
      id: 'effectiveScore',
      accessorFn: (row) => getEffectiveScore(row, hasML),
      header: () =>
        hasML ? (
          <span className="inline-flex items-center gap-1.5">
            <HeaderWithTooltip
              label="Score"
              tooltip="ML-predicted fantasy points based on rider form, race profile, and historical data"
            />
            <MlBadge />
          </span>
        ) : (
          <HeaderWithTooltip
            label="Score"
            tooltip="Projected fantasy points based on weighted historical results"
          />
        ),
      enableSorting: true,
      cell: ({ row, table }) => {
        if (row.original.unmatched) {
          return <span className="text-muted-foreground">---</span>;
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
      header: () => (
        <HeaderWithTooltip label="Pts/H" tooltip="Points per Hillio — value for money ratio" />
      ),
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

function ExpandedRowContent({ rider, hasML }: { rider: AnalyzedRider; hasML: boolean }) {
  if (rider.unmatched) {
    return (
      <p className="text-sm text-muted-foreground">
        No match found in database for &ldquo;{rider.rawName}&rdquo;.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* Rules-based breakdown */}
      {rider.categoryScores && (
        <div>
          <h4 className="mb-1.5 text-xs font-medium text-muted-foreground">
            Rules-Based Breakdown
            {hasML && rider.mlPredictedScore !== null && (
              <span className="ml-2 font-normal">
                (total: {rider.totalProjectedPts?.toFixed(1)} pts)
              </span>
            )}
          </h4>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-4">
            <ScoreDetail label="GC" value={rider.categoryScores.gc} />
            <ScoreDetail label="Stage" value={rider.categoryScores.stage} />
            <ScoreDetail label="Mountain" value={rider.categoryScores.mountain} />
            <ScoreDetail label="Sprint" value={rider.categoryScores.sprint} />
          </div>
        </div>
      )}

      {/* ML score in detail if available */}
      {hasML && rider.mlPredictedScore !== null && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">ML Predicted:</span>
          <span className="text-sm font-medium">{rider.mlPredictedScore.toFixed(1)} pts</span>
          <MlBadge />
        </div>
      )}

      {/* Season breakdown table */}
      {rider.seasonBreakdown && rider.seasonBreakdown.length > 0 && (
        <div className="overflow-x-auto">
          <h4 className="mb-1.5 text-xs font-medium text-muted-foreground">Season History</h4>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="pb-1 pr-4 font-medium">Season</th>
                <th className="pb-1 pr-4 text-right font-medium">GC</th>
                <th className="pb-1 pr-4 text-right font-medium">Stage</th>
                <th className="pb-1 pr-4 text-right font-medium">Mtn</th>
                <th className="pb-1 pr-4 text-right font-medium">Sprint</th>
                <th className="pb-1 pr-4 text-right font-medium">Total</th>
                <th className="pb-1 text-right font-medium">Weight</th>
              </tr>
            </thead>
            <tbody>
              {rider.seasonBreakdown.map((s) => (
                <tr key={s.year} className="border-b border-dashed last:border-0">
                  <td className="py-1 pr-4 font-medium">{s.year}</td>
                  <td className="py-1 pr-4 text-right">{s.gc.toFixed(1)}</td>
                  <td className="py-1 pr-4 text-right">{s.stage.toFixed(1)}</td>
                  <td className="py-1 pr-4 text-right">{s.mountain.toFixed(1)}</td>
                  <td className="py-1 pr-4 text-right">{s.sprint.toFixed(1)}</td>
                  <td className="py-1 pr-4 text-right font-medium">{s.total.toFixed(1)}</td>
                  <td className="py-1 text-right text-muted-foreground">&times;{s.weight}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Match info + PCS link */}
      {rider.matchedRider && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>
            Matched: {rider.matchedRider.fullName} ({rider.matchedRider.currentTeam}) — confidence:{' '}
            {(rider.matchConfidence * 100).toFixed(0)}%
          </span>
          <a
            href={`https://www.procyclingstats.com/rider/${rider.matchedRider.pcsSlug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400"
          >
            PCS Profile <ExternalLink className="h-3 w-3" />
          </a>
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

  const hasML = data.riders.some((r) => r.scoringMethod === 'hybrid');

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
        initialSorting={[{ id: 'effectiveScore', desc: true }]}
        renderExpandedRow={(row: Row<AnalyzedRider>) => (
          <ExpandedRowContent rider={row.original} hasML={hasML} />
        )}
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
