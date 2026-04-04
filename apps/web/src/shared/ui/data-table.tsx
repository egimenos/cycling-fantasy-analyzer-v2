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
  if (isSorted === 'asc') return <ArrowUp className="ml-1 h-3 w-3" />;
  if (isSorted === 'desc') return <ArrowDown className="ml-1 h-3 w-3" />;
  return <ArrowUpDown className="ml-1 h-3 w-3 opacity-40" />;
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
    <div className="bg-surface-container-low rounded-sm overflow-hidden border border-outline-variant/10">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={cn(
                      header.column.getCanSort() && 'cursor-pointer select-none',
                      (header.column.columnDef.meta as Record<string, string> | undefined)
                        ?.className,
                    )}
                    onClick={header.column.getToggleSortingHandler()}
                    onKeyDown={
                      header.column.getCanSort()
                        ? (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              header.column.getToggleSortingHandler()?.(e);
                            }
                          }
                        : undefined
                    }
                    tabIndex={header.column.getCanSort() ? 0 : undefined}
                    role={header.column.getCanSort() ? 'button' : undefined}
                    aria-sort={
                      header.column.getCanSort()
                        ? header.column.getIsSorted() === 'asc'
                          ? 'ascending'
                          : header.column.getIsSorted() === 'desc'
                            ? 'descending'
                            : 'none'
                        : undefined
                    }
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
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-on-surface-variant"
                >
                  No results.
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <Fragment key={row.id}>
                  <TableRow
                    className={cn(renderExpandedRow && 'cursor-pointer', getRowClassName?.(row))}
                    onClick={renderExpandedRow ? row.getToggleExpandedHandler() : undefined}
                    onKeyDown={
                      renderExpandedRow
                        ? (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              row.getToggleExpandedHandler()();
                            }
                          }
                        : undefined
                    }
                    tabIndex={renderExpandedRow ? 0 : undefined}
                    role={renderExpandedRow ? 'button' : undefined}
                    aria-expanded={renderExpandedRow ? row.getIsExpanded() : undefined}
                    data-state={row.getIsExpanded() ? 'expanded' : undefined}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={
                          (cell.column.columnDef.meta as Record<string, string> | undefined)
                            ?.className
                        }
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                  {row.getIsExpanded() && renderExpandedRow && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={columns.length} className="p-0">
                        <div className="border-t border-outline-variant/10 bg-surface-container-low p-3 md:p-6">
                          {renderExpandedRow(row)}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
