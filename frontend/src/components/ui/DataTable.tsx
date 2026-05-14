import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { useState } from 'react'
import { cn } from '../../lib/utils'

interface DataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[]
  data: TData[]
  /** Linhas por página. 0 = sem paginação. */
  pageSize?: number
  searchable?: boolean
  searchPlaceholder?: string
  className?: string
  maxHeight?: string
  emptyMessage?: string
}

export function DataTable<TData>({
  columns,
  data,
  pageSize = 20,
  searchable = false,
  searchPlaceholder = 'Buscar…',
  className,
  maxHeight,
  emptyMessage = 'Nenhum resultado.',
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    ...(pageSize > 0 ? { getPaginationRowModel: getPaginationRowModel() } : {}),
    initialState: { pagination: { pageSize: pageSize > 0 ? pageSize : 9999 } },
  })

  return (
    <div className={cn('space-y-2', className)}>
      {searchable && (
        <input
          value={globalFilter}
          onChange={e => setGlobalFilter(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full max-w-xs text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent"
        />
      )}

      <div
        className="rounded-lg border border-border bg-surface shadow-sm overflow-auto"
        style={maxHeight ? { maxHeight } : undefined}
      >
        <table className="w-full text-sm">
          <thead className="bg-surface-2 border-b border-border sticky top-0 z-10">
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id}>
                {hg.headers.map(h => (
                  <th
                    key={h.id}
                    className={cn(
                      'px-3 py-2 text-left font-medium text-fg-2 whitespace-nowrap',
                      h.column.getCanSort() && 'cursor-pointer select-none hover:text-fg',
                    )}
                    onClick={h.column.getToggleSortingHandler()}
                  >
                    {h.isPlaceholder ? null : (
                      <span className="inline-flex items-center gap-1">
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {h.column.getIsSorted() === 'asc' && ' ↑'}
                        {h.column.getIsSorted() === 'desc' && ' ↓'}
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-border">
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-8 text-center text-fg-3 text-sm">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map(row => (
                <tr key={row.id} className="hover:bg-surface-2 transition-colors">
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} className="px-3 py-2 text-fg">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pageSize > 0 && table.getPageCount() > 1 && (
        <div className="flex items-center justify-between px-1 text-xs text-fg-3">
          <span>
            Página {table.getState().pagination.pageIndex + 1} de {table.getPageCount()}
            {' '}({table.getFilteredRowModel().rows.length} resultados)
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="px-2 py-1 rounded border border-border hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ‹ Anterior
            </button>
            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="px-2 py-1 rounded border border-border hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Próxima ›
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
