import type { ColumnDef, Row } from '@tanstack/react-table';
import type { AnalyzedRider, AnalyzeResponse } from '@cycling-analyzer/shared-types';
import { DataTable } from '@/shared/ui/data-table';
import { ScoreBadge } from '@/shared/ui/score-badge';
import { Badge } from '@/shared/ui/badge';
import { EmptyState } from '@/shared/ui/empty-state';
import { formatNumber } from '@/shared/lib/utils';

interface RiderTableProps {
  data: AnalyzeResponse;
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

const columns: ColumnDef<AnalyzedRider, unknown>[] = [
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
    cell: ({ getValue }) => (
      <span className="max-w-[200px] truncate font-medium" title={getValue<string>()}>
        {getValue<string>()}
      </span>
    ),
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
];

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
          <ScoreDetail label="Final" value={rider.categoryScores.final} />
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

export function RiderTable({ data }: RiderTableProps) {
  if (data.riders.length === 0) {
    return <EmptyState title="No riders" description="Submit riders to see analysis results." />;
  }

  const matchedCount = data.totalMatched;
  const unmatchedCount = data.unmatchedCount;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
        <span>
          Showing {data.riders.length} rider{data.riders.length !== 1 ? 's' : ''}
        </span>
        <span>
          ({matchedCount} matched, {unmatchedCount} unmatched)
        </span>
      </div>
      <DataTable<AnalyzedRider>
        columns={columns}
        data={data.riders}
        initialSorting={[{ id: 'totalProjectedPts', desc: true }]}
        renderExpandedRow={(row: Row<AnalyzedRider>) => <ExpandedRowContent rider={row.original} />}
        getRowClassName={(row: Row<AnalyzedRider>) =>
          row.original.unmatched ? 'bg-yellow-50/50 dark:bg-yellow-950/20' : ''
        }
      />
    </div>
  );
}
