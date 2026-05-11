import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Badge, EmptyState, Skeleton } from '../../components/ui'
import { apiClient } from '../../lib/apiClient'
import {
  tableContainer,
  tableRow,
} from '../../lib/uiTokens'

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

// ── Props ─────────────────────────────────────────────────────────────────────

export interface CrawlLogsTabProps {
  /** Texto de busca livre (filtra por ID do termo) */
  q?: string
  /** Status filter */
  status?: string
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CrawlLogsTab({ q = '', status = '' }: CrawlLogsTabProps) {
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
    if (status) result = result.filter(l => l.status === status)
    if (q) {
      const lq = q.toLowerCase()
      result = result.filter(l => {
        const term = termMap[l.search_term_id] ?? ''
        return (
          term.toLowerCase().includes(lq) ||
          String(l.search_term_id).includes(lq)
        )
      })
    }
    return result
  }, [logs, status, q, termMap])

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
              {['Crawler', 'Início', 'Duração', 'Encontrados', 'Status', 'Erro'].map(h => (
                <th
                  key={h}
                  className="text-left px-4 py-2.5 text-xs text-fg-2 font-medium uppercase tracking-wide"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(log => (
              <tr key={log.id} className={tableRow}>
                <td className="px-4 py-2.5 font-medium text-fg">
                  "{termMap[log.search_term_id] ?? `#${log.search_term_id}`}"
                </td>
                <td className="px-4 py-2.5 text-fg-3 text-xs">
                  {new Date(log.started_at).toLocaleString('pt-BR')}
                </td>
                <td className="px-4 py-2.5 text-fg-2 text-xs">{calcDuration(log)}</td>
                <td className="px-4 py-2.5 text-fg text-xs">{parseCounts(log)}</td>
                <td className="px-4 py-2.5">
                  <Badge variant={statusVariant[log.status] ?? 'default'} size="sm">
                    {log.status}
                  </Badge>
                </td>
                <td className="px-4 py-2.5 text-xs text-danger truncate max-w-xs">
                  {log.error_msg?.Valid ? log.error_msg.String : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
