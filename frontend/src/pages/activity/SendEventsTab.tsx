import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { authFetch } from '../../lib/authFetch'
import { EmptyState, Skeleton } from '../../components/ui'
import {
  tableContainer,
  tableRow,
  thDense,
  tdDense,
  tdDenseMono,
} from '../../lib/uiTokens'
import type { CommonFilters } from './ActivityHub'
import { mythosEmpty } from '../../lib/copy/mythos'

// ── Types ─────────────────────────────────────────────────────────────────────

/** Item from GET /api/admin/send-queue */
interface SendQueueRow {
  id: number
  score: number
  modem_id?: number
  group_id?: number
  status: string
  worker_id?: string
  lease_expires_at?: string
  last_error?: string
  created_at: string
  payload?: unknown
}

/** Item from GET /api/admin/send-log */
interface SendLogRow {
  id: number
  score?: number
  modem_id?: number
  group_id?: number
  status: string
  worker_id?: string
  last_error?: string
  created_at: string
  sent_at?: string
  payload?: unknown
}

// ── Status dot ────────────────────────────────────────────────────────────────

/** Returns a Tailwind bg-* class for each send status */
function statusDotClass(status: string): string {
  const map: Record<string, string> = {
    pending: 'bg-warning',
    sending: 'bg-accent animate-pulse',
    sent: 'bg-success',
    failed: 'bg-danger',
    invalid: 'bg-fg-3',
  }
  return map[status] ?? 'bg-fg-3'
}

// ── Copy button ───────────────────────────────────────────────────────────────

interface CopyButtonProps {
  row: unknown
}

/** Row copy button with 1.5s "Copiado!" transient feedback */
function CopyButton({ row }: CopyButtonProps) {
  const [state, setState] = React.useState<'idle' | 'copied'>('idle')

  function handleCopy() {
    navigator.clipboard
      .writeText(JSON.stringify(row, null, 2))
      .catch(() => {
        // Clipboard API may not be available — fail silently
      })
    setState('copied')
    setTimeout(() => setState('idle'), 1500)
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={[
        'text-xs px-1.5 py-0.5 rounded transition-colors whitespace-nowrap',
        state === 'copied'
          ? 'text-success bg-success/10'
          : 'text-fg-3 hover:text-fg hover:bg-surface-2',
      ].join(' ')}
    >
      {state === 'copied' ? 'Copiado!' : 'Copiar'}
    </button>
  )
}

// ── Expandable row payload ────────────────────────────────────────────────────

interface ExpandedPayloadProps {
  row: SendQueueRow | SendLogRow
  colSpan: number
}

/** Full JSON payload shown below the row when expanded */
function ExpandedPayload({ row, colSpan }: ExpandedPayloadProps) {
  return (
    <tr className="bg-surface-2">
      <td colSpan={colSpan} className="px-4 py-3">
        <pre className="text-xs text-fg-2 font-mono overflow-x-auto whitespace-pre-wrap">
          {JSON.stringify(row, null, 2)}
        </pre>
      </td>
    </tr>
  )
}

// ── Sortable column header ────────────────────────────────────────────────────

type QueueSortKey = 'score' | 'created_at' | 'status'

interface SortState {
  key: QueueSortKey
  dir: 'asc' | 'desc'
}

/** Returns next sort direction (toggles when same column clicked) */
function toggleSortDir(current: 'asc' | 'desc'): 'asc' | 'desc' {
  return current === 'asc' ? 'desc' : 'asc'
}

interface SortableThProps {
  label: string
  sortKey: QueueSortKey
  sort: SortState
  onSort: (key: QueueSortKey) => void
}

/** Table header cell that updates sort state on click */
function SortableTh({ label, sortKey, sort, onSort }: SortableThProps) {
  const indicator = sort.key !== sortKey ? ' ↕' : sort.dir === 'asc' ? ' ↑' : ' ↓'
  return (
    <th
      className={`${thDense} cursor-pointer select-none hover:text-fg`}
      onClick={() => onSort(sortKey)}
    >
      {label}
      <span className="opacity-60 font-mono">{indicator}</span>
    </th>
  )
}

// ── Pagination cursor ─────────────────────────────────────────────────────────

const PAGE_SIZE = 50

// ── Status filter chips ───────────────────────────────────────────────────────

interface StatusChipsProps {
  options: string[]
  active: string
  onSelect: (status: string) => void
}

/** Horizontal row of clickable status filter chips */
function StatusChips({ options, active, onSelect }: StatusChipsProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {(['', ...options] as string[]).map(status => (
        <button
          key={status}
          type="button"
          onClick={() => onSelect(status)}
          className={[
            'px-2.5 py-1 rounded text-xs font-medium border transition-colors',
            active === status
              ? 'bg-accent text-bg border-accent'
              : 'bg-surface text-fg-3 border-border hover:border-accent/50',
          ].join(' ')}
        >
          {status === '' ? 'Todos' : status}
        </button>
      ))}
    </div>
  )
}

// ── Send Queue sub-tab ────────────────────────────────────────────────────────

interface SendQueueSubTabProps {
  filters: CommonFilters
}

/** Displays GET /api/admin/send-queue with status filter, sort, expand and copy */
function SendQueueSubTab({ filters: _filters }: SendQueueSubTabProps) {
  const [statusFilter, setStatusFilter] = React.useState('')
  const [sort, setSort] = React.useState<SortState>({ key: 'created_at', dir: 'desc' })
  const [expandedIds, setExpandedIds] = React.useState<Set<number>>(new Set())
  const [page, setPage] = React.useState(0)

  const { data = [], isLoading } = useQuery<SendQueueRow[]>({
    queryKey: ['send-queue', statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '200' })
      if (statusFilter) params.set('status', statusFilter)
      const response = await authFetch(`/api/admin/send-queue?${params}`)
      if (!response.ok) return []
      const body = await response.json().catch(() => null)
      return Array.isArray(body) ? body : []
    },
    refetchInterval: 10_000,
  })

  /** Toggles expanded state for the given row id */
  function handleToggleExpand(id: number) {
    setExpandedIds(previous => {
      const next = new Set(previous)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  /** Updates sort state, toggling dir if same column */
  function handleSort(key: QueueSortKey) {
    setSort(previous =>
      previous.key === key
        ? { key, dir: toggleSortDir(previous.dir) }
        : { key, dir: 'asc' },
    )
    setPage(0)
  }

  // Sort the data before paginating
  const sorted = React.useMemo(() => {
    const copy = [...data]
    copy.sort((rowA, rowB) => {
      let comparison = 0
      if (sort.key === 'score') {
        comparison = (rowA.score ?? 0) - (rowB.score ?? 0)
      } else if (sort.key === 'created_at') {
        comparison = new Date(rowA.created_at).getTime() - new Date(rowB.created_at).getTime()
      } else if (sort.key === 'status') {
        comparison = rowA.status.localeCompare(rowB.status)
      }
      return sort.dir === 'asc' ? comparison : -comparison
    })
    return copy
  }, [data, sort])

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE)
  const pageSlice = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  if (isLoading) {
    return <Skeleton variant="table" rows={5} />
  }

  if (data.length === 0) {
    return (
      <EmptyState
        title="Fila vazia"
        description={mythosEmpty.queue}
      />
    )
  }

  return (
    <div className="space-y-3">
      {/* Status filter + page info */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusChips
          options={['pending', 'sending', 'sent', 'failed', 'invalid']}
          active={statusFilter}
          onSelect={value => { setStatusFilter(value); setPage(0) }}
        />
        <span className="text-xs text-fg-3">
          {sorted.length} registros
        </span>
      </div>

      {/* Table */}
      <div className={tableContainer}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2">
              <th className="w-8 px-2 py-2" />
              <th className={thDense}>ID</th>
              <SortableTh label="Score" sortKey="score" sort={sort} onSort={handleSort} />
              <th className={thDense}>Modem</th>
              <th className={thDense}>Grupo</th>
              <SortableTh label="Status" sortKey="status" sort={sort} onSort={handleSort} />
              <th className={thDense}>Worker</th>
              <th className={thDense}>Lease expira</th>
              <th className={thDense}>Último erro</th>
              <SortableTh label="Criado" sortKey="created_at" sort={sort} onSort={handleSort} />
              <th className="w-16 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {pageSlice.map(row => {
              const isExpanded = expandedIds.has(row.id)
              return (
                <React.Fragment key={row.id}>
                  <tr className={tableRow}>
                    {/* Expand toggle */}
                    <td className="px-2 py-2.5 text-center">
                      <button
                        type="button"
                        onClick={() => handleToggleExpand(row.id)}
                        title={isExpanded ? 'Recolher' : 'Ver payload completo'}
                        className="text-fg-3 hover:text-fg text-xs w-5 h-5 flex items-center justify-center rounded hover:bg-surface-2"
                      >
                        {isExpanded ? '▲' : '▼'}
                      </button>
                    </td>
                    <td className={tdDenseMono}>{row.id}</td>
                    <td className={tdDenseMono}>{row.score?.toFixed(3) ?? '—'}</td>
                    <td className={tdDense}>{row.modem_id ?? '—'}</td>
                    <td className={tdDense}>{row.group_id ?? '—'}</td>
                    <td className={tdDense}>
                      <span className="flex items-center gap-1.5">
                        <span className={`inline-block h-2 w-2 rounded-full ${statusDotClass(row.status)}`} />
                        {row.status}
                      </span>
                    </td>
                    <td className={tdDenseMono}>{row.worker_id ?? '—'}</td>
                    <td className={tdDenseMono}>
                      {row.lease_expires_at
                        ? new Date(row.lease_expires_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                        : '—'}
                    </td>
                    <td className={`${tdDense} text-danger truncate max-w-xs`}>
                      {row.last_error ?? '—'}
                    </td>
                    <td className={tdDenseMono}>
                      {new Date(row.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-2 py-2.5 text-center">
                      <CopyButton row={row} />
                    </td>
                  </tr>
                  {isExpanded && (
                    <ExpandedPayload row={row} colSpan={11} />
                  )}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center gap-2 justify-end text-xs text-fg-3">
          <button
            type="button"
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-2 py-1 rounded border border-border hover:border-accent/50 disabled:opacity-40"
          >
            Anterior
          </button>
          <span>{page + 1} / {totalPages}</span>
          <button
            type="button"
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="px-2 py-1 rounded border border-border hover:border-accent/50 disabled:opacity-40"
          >
            Próxima
          </button>
        </div>
      )}
    </div>
  )
}

// ── Send Log sub-tab ──────────────────────────────────────────────────────────

interface SendLogSubTabProps {
  filters: CommonFilters
}

/** Displays GET /api/admin/send-log with status filter, sort, expand and copy */
function SendLogSubTab({ filters: _filters }: SendLogSubTabProps) {
  const [statusFilter, setStatusFilter] = React.useState('')
  const [sort, setSort] = React.useState<SortState>({ key: 'created_at', dir: 'desc' })
  const [expandedIds, setExpandedIds] = React.useState<Set<number>>(new Set())
  const [page, setPage] = React.useState(0)

  const { data = [], isLoading } = useQuery<SendLogRow[]>({
    queryKey: ['send-log', statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '200' })
      if (statusFilter) params.set('status', statusFilter)
      const response = await authFetch(`/api/admin/send-log?${params}`)
      if (!response.ok) return []
      const body = await response.json().catch(() => null)
      return Array.isArray(body) ? body : []
    },
    refetchInterval: 15_000,
  })

  /** Toggles expanded state for the given row id */
  function handleToggleExpand(id: number) {
    setExpandedIds(previous => {
      const next = new Set(previous)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  /** Updates sort state, toggling dir if same column */
  function handleSort(key: QueueSortKey) {
    setSort(previous =>
      previous.key === key
        ? { key, dir: toggleSortDir(previous.dir) }
        : { key, dir: 'asc' },
    )
    setPage(0)
  }

  // Sort the data before paginating
  const sorted = React.useMemo(() => {
    const copy = [...data]
    copy.sort((rowA, rowB) => {
      let comparison = 0
      if (sort.key === 'score') {
        comparison = (rowA.score ?? 0) - (rowB.score ?? 0)
      } else if (sort.key === 'created_at') {
        const dateA = new Date(rowA.sent_at ?? rowA.created_at).getTime()
        const dateB = new Date(rowB.sent_at ?? rowB.created_at).getTime()
        comparison = dateA - dateB
      } else if (sort.key === 'status') {
        comparison = rowA.status.localeCompare(rowB.status)
      }
      return sort.dir === 'asc' ? comparison : -comparison
    })
    return copy
  }, [data, sort])

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE)
  const pageSlice = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  if (isLoading) {
    return <Skeleton variant="table" rows={5} />
  }

  if (data.length === 0) {
    return (
      <EmptyState
        title="Nenhum disparo registrado"
        description={mythosEmpty.sendLog}
      />
    )
  }

  return (
    <div className="space-y-3">
      {/* Status filter + page info */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusChips
          options={['sent', 'failed']}
          active={statusFilter}
          onSelect={value => { setStatusFilter(value); setPage(0) }}
        />
        <span className="text-xs text-fg-3">
          {sorted.length} registros
        </span>
      </div>

      {/* Table */}
      <div className={tableContainer}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2">
              <th className="w-8 px-2 py-2" />
              <th className={thDense}>ID</th>
              <SortableTh label="Score" sortKey="score" sort={sort} onSort={handleSort} />
              <th className={thDense}>Modem</th>
              <th className={thDense}>Grupo</th>
              <SortableTh label="Status" sortKey="status" sort={sort} onSort={handleSort} />
              <th className={thDense}>Worker</th>
              <th className={thDense}>Último erro</th>
              <SortableTh label="Enviado em" sortKey="created_at" sort={sort} onSort={handleSort} />
              <th className="w-16 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {pageSlice.map(row => {
              const isExpanded = expandedIds.has(row.id)
              const displayDate = row.sent_at ?? row.created_at
              return (
                <React.Fragment key={row.id}>
                  <tr className={tableRow}>
                    {/* Expand toggle */}
                    <td className="px-2 py-2.5 text-center">
                      <button
                        type="button"
                        onClick={() => handleToggleExpand(row.id)}
                        title={isExpanded ? 'Recolher' : 'Ver payload completo'}
                        className="text-fg-3 hover:text-fg text-xs w-5 h-5 flex items-center justify-center rounded hover:bg-surface-2"
                      >
                        {isExpanded ? '▲' : '▼'}
                      </button>
                    </td>
                    <td className={tdDenseMono}>{row.id}</td>
                    <td className={tdDenseMono}>{row.score?.toFixed(3) ?? '—'}</td>
                    <td className={tdDense}>{row.modem_id ?? '—'}</td>
                    <td className={tdDense}>{row.group_id ?? '—'}</td>
                    <td className={tdDense}>
                      <span className="flex items-center gap-1.5">
                        <span className={`inline-block h-2 w-2 rounded-full ${statusDotClass(row.status)}`} />
                        {row.status}
                      </span>
                    </td>
                    <td className={tdDenseMono}>{row.worker_id ?? '—'}</td>
                    <td className={`${tdDense} text-danger truncate max-w-xs`}>
                      {row.last_error ?? '—'}
                    </td>
                    <td className={tdDenseMono}>
                      {new Date(displayDate).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-2 py-2.5 text-center">
                      <CopyButton row={row} />
                    </td>
                  </tr>
                  {isExpanded && (
                    <ExpandedPayload row={row} colSpan={10} />
                  )}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center gap-2 justify-end text-xs text-fg-3">
          <button
            type="button"
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-2 py-1 rounded border border-border hover:border-accent/50 disabled:opacity-40"
          >
            Anterior
          </button>
          <span>{page + 1} / {totalPages}</span>
          <button
            type="button"
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="px-2 py-1 rounded border border-border hover:border-accent/50 disabled:opacity-40"
          >
            Próxima
          </button>
        </div>
      )}
    </div>
  )
}

// ── SendEventsTab (inner tab switcher: Fila | Histórico) ──────────────────────

export interface SendEventsTabProps {
  filters: CommonFilters
}

type SendSubTab = 'queue' | 'log'

/**
 * Unified send events tab with two inner sub-tabs:
 * - "Fila" — send_queue endpoint (live pending/sending items)
 * - "Histórico" — send_log endpoint (completed sends)
 */
export function SendEventsTab({ filters }: SendEventsTabProps) {
  const [subTab, setSubTab] = React.useState<SendSubTab>('queue')

  return (
    <div className="space-y-4">
      {/* Inner sub-tab nav */}
      <div className="flex gap-1 border-b border-border">
        {([
          { id: 'queue' as const, label: 'Fila' },
          { id: 'log' as const, label: 'Histórico' },
        ] as const).map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSubTab(item.id)}
            className={[
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              subTab === item.id
                ? 'border-accent text-accent'
                : 'border-transparent text-fg-3 hover:text-fg hover:border-border',
            ].join(' ')}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Active sub-tab content */}
      {subTab === 'queue' && <SendQueueSubTab filters={filters} />}
      {subTab === 'log' && <SendLogSubTab filters={filters} />}
    </div>
  )
}
