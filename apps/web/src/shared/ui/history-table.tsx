import { cn } from '@/shared/lib/utils';

interface HistoryRow {
  year: number;
  gc: number;
  stage: number;
  mountain: number;
  sprint: number;
  total: number;
}

interface HistoryTableProps {
  title: string;
  rows: HistoryRow[];
}

const COLUMNS = [
  { key: 'gc' as const, label: 'GC', text: 'text-gc' },
  { key: 'stage' as const, label: 'STG', text: 'text-stage' },
  { key: 'mountain' as const, label: 'MTN', text: 'text-mountain' },
  { key: 'sprint' as const, label: 'SPR', text: 'text-sprint' },
  { key: 'total' as const, label: 'Total', text: 'text-on-surface font-bold' },
] as const;

export function HistoryTable({ title, rows }: HistoryTableProps) {
  if (rows.length === 0) return null;

  return (
    <div>
      <h4 className="text-[10px] font-mono text-outline uppercase mb-2">{title}</h4>

      {/* Desktop: compact table */}
      <div className="hidden sm:block">
        <div className="bg-surface-container-high rounded-sm overflow-hidden border border-outline-variant/10 w-fit">
          <table className="text-xs font-mono">
            <thead className="bg-surface-container-highest/50">
              <tr>
                <th scope="col" className="px-3 py-1.5 text-left text-outline">
                  Year
                </th>
                {COLUMNS.map((col) => (
                  <th key={col.key} scope="col" className={cn('px-3 py-1.5 text-right', col.text)}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {rows.map((row) => (
                <tr key={row.year}>
                  <td className="px-3 py-1.5 font-bold">{row.year}</td>
                  {COLUMNS.map((col) => (
                    <td key={col.key} className={cn('px-3 py-1.5 text-right', col.text)}>
                      {Math.round(row[col.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile: stacked rows */}
      <div className="sm:hidden space-y-1.5">
        {rows.map((row) => (
          <div
            key={row.year}
            className="bg-surface-container-high rounded-sm border border-outline-variant/10 px-3 py-2"
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-mono font-bold">{row.year}</span>
              <span className="text-xs font-mono font-bold">{Math.round(row.total)} pts</span>
            </div>
            <div className="grid grid-cols-4 gap-2 text-center">
              {COLUMNS.filter((c) => c.key !== 'total').map((col) => (
                <div key={col.key}>
                  <span className={cn('text-[10px] font-mono uppercase block', col.text)}>
                    {col.label}
                  </span>
                  <span className={cn('text-xs font-mono font-bold', col.text)}>
                    {Math.round(row[col.key])}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
