import { useMemo, useState } from 'react'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table'
import { ledger, type LedgerEntry } from '../data/ledger'
import { filterEntries, fmtDKK } from '../lib/ledgerQuery'
import type { CitationDef } from '../lib/types'

const col = createColumnHelper<LedgerEntry>()

const columns = [
  col.accessor('date', { header: 'Date', cell: (c) => c.getValue() }),
  col.accessor('description', { header: 'Description' }),
  col.accessor('counterparty', { header: 'Counterparty' }),
  col.accessor('category', { header: 'Category' }),
  col.accessor('amount', {
    header: 'Amount',
    cell: (c) => (
      <span className={c.getValue() >= 0 ? 'amount-in' : 'amount-out'}>{fmtDKK(c.getValue())}</span>
    ),
  }),
]

export function CitationDrawer({
  citation,
  index,
  onClose,
}: {
  citation: CitationDef
  index: number
  onClose: () => void
}) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'date', desc: false }])

  const rows = useMemo(() => {
    if (citation.entryIds?.length) {
      const wanted = new Set(citation.entryIds)
      return ledger.filter((e) => wanted.has(e.id))
    }
    if (citation.filter) return filterEntries(citation.filter)
    return []
  }, [citation])

  const total = useMemo(() => rows.reduce((acc, r) => acc + r.amount, 0), [rows])

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <aside className="drawer" aria-label={`Source ${index}`}>
      <div className="drawer-head">
        <div>
          <span className="drawer-badge">{index}</span>
          <strong>{citation.label}</strong>
          <div className="drawer-meta">
            {rows.length} ledger {rows.length === 1 ? 'row' : 'rows'} · net {fmtDKK(total)}
          </div>
        </div>
        <button type="button" className="drawer-close" onClick={onClose} aria-label="Close sources">
          ✕
        </button>
      </div>
      <div className="drawer-table">
        <table>
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th key={h.id} onClick={h.column.getToggleSortingHandler()}>
                    {flexRender(h.column.columnDef.header, h.getContext())}
                    {{ asc: ' ↑', desc: ' ↓' }[h.column.getIsSorted() as string] ?? ''}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </aside>
  )
}
