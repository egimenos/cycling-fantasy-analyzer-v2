import { Fragment, useState } from 'react';
import {
  type ColumnDef,
  type SortingState,
  type Row,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getExpandedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';
import { cn } from '@/shared/lib/utils';

interface DataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  initialSorting?: SortingState;
  renderExpandedRow?: (row: Row<TData>) => React.ReactNode;
  getRowClassName?: (row: Row<TData>) => string;
}

function SortIcon({ isSorted }: { isSorted: false | 'asc' | 'desc' }) {
  if (isSorted === 'asc') return <ArrowUp className="ml-1 h-4 w-4" />;
  if (isSorted === 'desc') return <ArrowDown className="ml-1 h-4 w-4" />;
  return <ArrowUpDown className="ml-1 h-4 w-4 opacity-40" />;
}

export function DataTable<TData>({
  columns,
  data,
  initialSorting = [],
  renderExpandedRow,
  getRowClassName,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>(initialSorting);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getExpandedRowModel: renderExpandedRow ? getExpandedRowModel() : undefined,
    getRowCanExpand: renderExpandedRow ? () => true : undefined,
  });

  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <TableHead
                key={header.id}
                className={cn(header.column.getCanSort() && 'cursor-pointer select-none')}
                onClick={header.column.getToggleSortingHandler()}
              >
                <div className="flex items-center">
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                  {header.column.getCanSort() && (
                    <SortIcon isSorted={header.column.getIsSorted()} />
                  )}
                </div>
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
              No results.
            </TableCell>
          </TableRow>
        ) : (
          table.getRowModel().rows.map((row) => (
            <Fragment key={row.id}>
              <TableRow
                className={cn(
                  renderExpandedRow && 'cursor-pointer',
                  row.getIsExpanded() && 'bg-muted/30',
                  getRowClassName?.(row),
                )}
                onClick={renderExpandedRow ? row.getToggleExpandedHandler() : undefined}
                data-state={row.getIsExpanded() ? 'expanded' : undefined}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
              {row.getIsExpanded() && renderExpandedRow && (
                <TableRow>
                  <TableCell colSpan={columns.length} className="bg-muted/20 p-4">
                    {renderExpandedRow(row)}
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          ))
        )}
      </TableBody>
    </Table>
  );
}
