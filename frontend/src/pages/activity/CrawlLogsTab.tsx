import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Badge, EmptyState, Skeleton } from '../../components/ui'
import { apiClient } from '../../lib/apiClient'
import {
  tableContainer,
  tableRow,
} from '../../lib/uiTokens'
import type { CommonFilters } from './ActivityHub'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CrawlLogEntry {
  id: number
  search_term_id: number
  started_at: string
  finished_at?: { Time: string; Valid: boolean }
  status: string
  ml_count: number
  amz_count: number
  source_counts?: string
  error_msg?: { String: string; Valid: boolean }
}

const statusVariant: Record<string, 'default' | 'success' | 'warning' | 'danger'> = {
  done: 'success',
  success: 'success',
  running: 'warning',
  error: 'danger',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseCounts(log: CrawlLogEntry): string {
  try {
    if (log.source_counts) {
      const parsed = JSON.parse(
        typeof log.source_counts === 'string'
          ? log.source_counts
          : JSON.stringify(log.source_counts),
      )
      return Object.entries(parsed)
        .map(([k, v]) => `${k}: ${v}`)
        .join(' · ')
    }
  } catch {}
  const parts: string[] = []
  if (log.ml_count > 0) parts.push(`ml: ${log.ml_count}`)
  if (log.amz_count > 0) parts.push(`amz: ${log.amz_count}`)
  return parts.join(' · ') || '0 encontrados'
}

function calcDuration(log: CrawlLogEntry): string {
  if (!log.finished_at?.Valid) return '—'
  const ms = new Date(log.finished_at.Time).getTime() - new Date(log.started_at).getTime()
  return ms < 60_000 ? `${(ms / 1000).toFixed(0)}s` : `${(ms / 60_000).toFixed(1)}min`
}

function CrawlerErrorsAlert({ logs }: { logs: CrawlLogEntry[] }) {
  const errorCrawls = logs.filter(l => l.status === 'error')
  if (errorCrawls.length === 0) return null
  return (
    <div className="bg-surface border border-danger/30 rounded-md overflow-hidden mb-4">
      <div className="px-4 py-2.5 border-b border-border bg-danger/5">
        <p className="text-xs font-medium text-danger uppercase tracking-wide">
          Execuções com erro ({errorCrawls.length})
        </p>
      </div>
      <table className="w-full text-sm">
        <tbody>
          {errorCrawls.map(l => (
            <tr key={l.id} className={`${tableRow} border-b border-border last:border-0`}>
              <td className="px-4 py-2.5 text-fg text-xs">{`#${l.search_term_id}`}</td>
              <td className="px-4 py-2.5 text-xs text-danger truncate max-w-xs">
                {l.error_msg?.Valid ? l.error_msg.String : 'erro desconhecido'}
              </td>
              <td className="px-4 py-2.5 text-fg-3 text-xs">
                {new Date(l.started_at).toLocaleString('pt-BR')}
              </td>
              <td className="px-4 py-2.5">
                <Badge variant="danger" size="sm">erro</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Sort ──────────────────────────────────────────────────────────────────────

/** Sortable column keys */
type SortKey = 'started_at' | 'status' | 'ml_count' | 'amz_count' | 'search_term_id'

type SortDir = 'asc' | 'desc'

interface SortState {
  key: SortKey
  dir: SortDir
}

/** Returns the next direction when clicking the same column again */
function toggleDir(current: SortDir): SortDir {
  return current === 'asc' ? 'desc' : 'asc'
}

/** Sort indicator characters for the column header */
function sortIndicator(col: SortKey, sort: SortState): string {
  if (sort.key !== col) return ' ↕'
  return sort.dir === 'asc' ? ' ↑' : ' ↓'
}

/** Compare two CrawlLogEntry values by a given sort key */
function compareByKey(a: CrawlLogEntry, b: CrawlLogEntry, key: SortKey): number {
  if (key === 'started_at') {
    return new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
  }
  if (key === 'status') {
    return a.status.localeCompare(b.status)
  }
  if (key === 'ml_count') {
    return a.ml_count - b.ml_count
  }
  if (key === 'amz_count') {
    return a.amz_count - b.amz_count
  }
  if (key === 'search_term_id') {
    return a.search_term_id - b.search_term_id
  }
  return 0
}

/** Applies sort state to a list of entries, returning a new sorted array */
function applySortToEntries(entries: CrawlLogEntry[], sort: SortState): CrawlLogEntry[] {
  const copy = [...entries]
  copy.sort((entryA, entryB) => {
    const comparison = compareByKey(entryA, entryB, sort.key)
    return sort.dir === 'asc' ? comparison : -comparison
  })
  return copy
}

// ── Copy helper ───────────────────────────────────────────────────────────────

/** Copies the full row data as formatted JSON to clipboard */
function copyRowToClipboard(log: CrawlLogEntry): void {
  const text = JSON.stringify(log, null, 2)
  navigator.clipboard.writeText(text).catch(() => {
    // Fallback: silent fail — clipboard API may not be available in all contexts
  })
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface CrawlLogsTabProps {
  /** Texto de busca livre (filtra por ID do termo) */
  q?: string
  /** Status filter */
  status?: string
  /**
   * Optional common filters from ActivityHub (additive — merged with q/status).
   * When `filters.text` is provided it takes precedence over q as the text filter.
   */
  filters?: CommonFilters
}

// ── Expandable row ────────────────────────────────────────────────────────────

interface ExpandedRowProps {
  log: CrawlLogEntry
  termName: string
  colSpan: number
}

/** Expanded detail panel shown below a row when toggled */
function ExpandedRowDetail({ log, termName, colSpan }: ExpandedRowProps) {
  return (
    <tr className="bg-surface-2">
      <td colSpan={colSpan} className="px-4 py-3">
        <div className="text-xs text-fg-2 space-y-1">
          <div>
            <span className="font-medium text-fg-3">Termo:</span>{' '}
            {termName || `#${log.search_term_id}`}
          </div>
          <div>
            <span className="font-medium text-fg-3">Início:</span>{' '}
            {new Date(log.started_at).toLocaleString('pt-BR')}
          </div>
          {log.finished_at?.Valid && (
            <div>
              <span className="font-medium text-fg-3">Fim:</span>{' '}
              {new Date(log.finished_at.Time).toLocaleString('pt-BR')}
            </div>
          )}
          {log.source_counts && (
            <div>
              <span className="font-medium text-fg-3">Contagens por fonte:</span>{' '}
              <span className="font-mono">{log.source_counts}</span>
            </div>
          )}
          {log.error_msg?.Valid && (
            <div>
              <span className="font-medium text-danger">Erro:</span>{' '}
              {log.error_msg.String}
            </div>
          )}
          <div className="pt-1">
            <span className="font-mono text-[10px] text-fg-3">ID: {log.id}</span>
          </div>
        </div>
      </td>
    </tr>
  )
}

// ── Column header with sort support ──────────────────────────────────────────

interface SortableHeaderProps {
  label: string
  sortKey?: SortKey
  current: SortState
  onSort: (key: SortKey) => void
}

/** Table header cell that toggles sort when clicked (if sortKey provided) */
function SortableHeader({ label, sortKey, current, onSort }: SortableHeaderProps) {
  const baseClass =
    'text-left px-4 py-2.5 text-xs text-fg-2 font-medium uppercase tracking-wide whitespace-nowrap'

  if (!sortKey) {
    return (
      <th className={baseClass}>
        {label}
      </th>
    )
  }

  return (
    <th
      className={`${baseClass} cursor-pointer select-none hover:text-fg`}
      onClick={() => onSort(sortKey)}
    >
      {label}
      <span className="opacity-60 font-mono">
        {sortIndicator(sortKey, current)}
      </span>
    </th>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CrawlLogsTab({ q = '', status = '', filters }: CrawlLogsTabProps) {
  // Merge incoming filters: ActivityHub filters.text takes precedence over legacy q
  const effectiveQ = filters?.text ?? q

  // Sort state — default newest first
  const [sort, setSort] = React.useState<SortState>({ key: 'started_at', dir: 'desc' })

  // Set of expanded row IDs
  const [expandedIds, setExpandedIds] = React.useState<Set<number>>(new Set())

  // Copy feedback — briefly shows "Copiado!" on the button
  const [copiedId, setCopiedId] = React.useState<number | null>(null)

  /** Handles column header click: same column toggles direction, new column sets asc */
  function handleSortClick(key: SortKey) {
    setSort(previous =>
      previous.key === key
        ? { key, dir: toggleDir(previous.dir) }
        : { key, dir: 'asc' },
    )
  }

  /** Toggles expanded state for the given row ID */
  function handleRowExpand(id: number) {
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

  /** Copies row to clipboard and shows transient feedback */
  function handleCopyRow(log: CrawlLogEntry) {
    copyRowToClipboard(log)
    setCopiedId(log.id)
    setTimeout(() => setCopiedId(previous => (previous === log.id ? null : previous)), 1500)
  }

  const { data: logs = [], isLoading } = useQuery<CrawlLogEntry[]>({
    queryKey: ['crawl-logs'],
    queryFn: () =>
      apiClient
        .get('/api/crawl-logs?limit=100')
        .then(r => (Array.isArray(r.data) ? r.data : []))
        .catch(() => []),
    refetchInterval: 15_000,
  })

  const { data: terms = [] } = useQuery({
    queryKey: ['search-terms'],
    queryFn: () =>
      apiClient
        .get('/api/search-terms')
        .then(r => (Array.isArray(r.data) ? r.data : []))
        .catch(() => []),
  })

  const termMap: Record<number, string> = {}
  for (const t of terms as Array<{ id: number; query: string }>) termMap[t.id] = t.query

  const filtered = React.useMemo(() => {
    let result = logs

    // Status filter (from URL param or parent)
    if (status) {
      result = result.filter(log => log.status === status)
    }

    // Text filter — searches term name and term ID
    if (effectiveQ) {
      const lowerQuery = effectiveQ.toLowerCase()
      result = result.filter(log => {
        const termName = termMap[log.search_term_id] ?? ''
        return (
          termName.toLowerCase().includes(lowerQuery) ||
          String(log.search_term_id).includes(lowerQuery)
        )
      })
    }

    // Date-range filter from CommonFilters
    if (filters?.from) {
      const fromMs = new Date(filters.from).getTime()
      result = result.filter(log => new Date(log.started_at).getTime() >= fromMs)
    }
    if (filters?.to) {
      // Include the entire "to" day by setting time to end of day
      const toMs = new Date(filters.to).getTime() + 86_400_000 - 1
      result = result.filter(log => new Date(log.started_at).getTime() <= toMs)
    }

    // Apply column sort
    return applySortToEntries(result, sort)
  }, [logs, status, effectiveQ, termMap, filters, sort])

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map(i => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    )
  }

  if (!logs.length) {
    return (
      <EmptyState
        title="Nenhum log de crawler"
        description="Os logs aparecem após rodar um crawler."
      />
    )
  }

  if (!filtered.length) {
    return (
      <EmptyState
        title="Nenhum log encontrado"
        description="Tente ajustar os filtros."
      />
    )
  }

  return (
    <div className="space-y-4">
      <CrawlerErrorsAlert logs={filtered} />
      <div className={tableContainer}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2">
              {/* Expand toggle column — no label */}
              <th className="w-8 px-2 py-2.5" />
              <SortableHeader
                label="Crawler"
                sortKey="search_term_id"
                current={sort}
                onSort={handleSortClick}
              />
              <SortableHeader
                label="Início"
                sortKey="started_at"
                current={sort}
                onSort={handleSortClick}
              />
              <th className="text-left px-4 py-2.5 text-xs text-fg-2 font-medium uppercase tracking-wide">
                Duração
              </th>
              <th className="text-left px-4 py-2.5 text-xs text-fg-2 font-medium uppercase tracking-wide">
                Encontrados
              </th>
              <SortableHeader
                label="Status"
                sortKey="status"
                current={sort}
                onSort={handleSortClick}
              />
              <th className="text-left px-4 py-2.5 text-xs text-fg-2 font-medium uppercase tracking-wide">
                Erro
              </th>
              {/* Copy action column — no label */}
              <th className="w-16 px-2 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {filtered.map(log => {
              const isExpanded = expandedIds.has(log.id)
              const termName = termMap[log.search_term_id] ?? `#${log.search_term_id}`
              const isCopied = copiedId === log.id

              return (
                <React.Fragment key={log.id}>
                  <tr className={tableRow}>
                    {/* Expand toggle button */}
                    <td className="px-2 py-2.5 text-center">
                      <button
                        type="button"
                        onClick={() => handleRowExpand(log.id)}
                        title={isExpanded ? 'Recolher' : 'Expandir detalhes'}
                        className="text-fg-3 hover:text-fg text-xs leading-none w-5 h-5 flex items-center justify-center rounded hover:bg-surface-2"
                      >
                        {isExpanded ? '▲' : '▼'}
                      </button>
                    </td>
                    <td className="px-4 py-2.5 font-medium text-fg">
                      "{termName}"
                    </td>
                    <td className="px-4 py-2.5 text-fg-3 text-xs">
                      {new Date(log.started_at).toLocaleString('pt-BR')}
                    </td>
                    <td className="px-4 py-2.5 text-fg-2 text-xs">
                      {calcDuration(log)}
                    </td>
                    <td className="px-4 py-2.5 text-fg text-xs">
                      {parseCounts(log)}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant={statusVariant[log.status] ?? 'default'} size="sm">
                        {log.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-danger truncate max-w-xs">
                      {log.error_msg?.Valid ? log.error_msg.String : '—'}
                    </td>
                    {/* Copy row button */}
                    <td className="px-2 py-2.5 text-center">
                      <button
                        type="button"
                        onClick={() => handleCopyRow(log)}
                        title="Copiar linha como JSON"
                        className="text-xs text-fg-3 hover:text-fg px-1.5 py-0.5 rounded hover:bg-surface-2 transition-colors whitespace-nowrap"
                      >
                        {isCopied ? 'Copiado!' : 'Copiar'}
                      </button>
                    </td>
                  </tr>
                  {isExpanded && (
                    <ExpandedRowDetail
                      log={log}
                      termName={termName}
                      colSpan={8}
                    />
                  )}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
