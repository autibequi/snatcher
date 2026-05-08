import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Badge, Button, Skeleton, EmptyState } from '../components/ui'
import { apiClient } from '../lib/apiClient'
import { useWSEvent } from '../lib/useWS'

// ── Types ─────────────────────────────────────────────────────────────────────

interface CrawlLogEntry {
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

interface Dispatch {
  id: number
  short_id?: string
  status: string
  composed_by?: string
  message?: { text?: string; media_url?: string }
  target_count?: number
  delivered_count?: number
  created_at: string
  product_id?: number
  scheduled_for?: string
  // optional fields that may come from API
  channel_name?: string
  group_name?: string
}

// ── Unified log row for "Tudo" tab ────────────────────────────────────────────

type LogType = 'dispatch' | 'crawl' | 'scheduled'

interface UnifiedRow {
  id: string
  type: LogType
  label: string
  status: string
  date: string
  channel?: string
  group?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const statusVariant: Record<string, 'default' | 'success' | 'warning' | 'danger'> = {
  completed: 'success',
  queued: 'warning',
  sending: 'warning',
  failed: 'danger',
  draft: 'default',
  done: 'success',
  running: 'warning',
  error: 'danger',
}

function TypeBadge({ type }: { type: LogType }) {
  if (type === 'dispatch') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded-sm bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400">
        <span aria-hidden>●</span> Disparo
      </span>
    )
  }
  if (type === 'crawl') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded-sm bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
        <span aria-hidden>●</span> Crawl
      </span>
    )
  }
  // scheduled
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded-sm bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
      <span aria-hidden>●</span> Agenda
    </span>
  )
}

// ── CSV Export ────────────────────────────────────────────────────────────────

function exportCsv(rows: UnifiedRow[], filename = 'logs.csv') {
  const header = ['ID', 'Tipo', 'Descrição', 'Status', 'Canal', 'Grupo', 'Data']
  const lines = rows.map(r => [
    r.id,
    r.type,
    `"${r.label.replace(/"/g, '""')}"`,
    r.status,
    r.channel ?? '',
    r.group ?? '',
    r.date,
  ].join(','))
  const csv = [header.join(','), ...lines].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ── CrawlerLogs subcomponent ──────────────────────────────────────────────────

function CrawlerLogs() {
  const { data: logs = [], isLoading } = useQuery<CrawlLogEntry[]>({
    queryKey: ['crawl-logs'],
    queryFn: () => apiClient.get('/api/crawl-logs?limit=100').then(r => Array.isArray(r.data) ? r.data : []).catch(() => []),
    refetchInterval: 15_000,
  })

  const { data: terms = [] } = useQuery({
    queryKey: ['search-terms'],
    queryFn: () => apiClient.get('/api/search-terms').then(r => Array.isArray(r.data) ? r.data : []).catch(() => []),
  })

  const termMap: Record<number, string> = {}
  for (const t of terms as any[]) termMap[t.id] = t.query

  const parseCounts = (log: CrawlLogEntry) => {
    try {
      if (log.source_counts) {
        const parsed = JSON.parse(typeof log.source_counts === 'string' ? log.source_counts : JSON.stringify(log.source_counts))
        return Object.entries(parsed).map(([k, v]) => `${k}: ${v}`).join(' · ')
      }
    } catch {}
    const parts = []
    if (log.ml_count > 0) parts.push(`ml: ${log.ml_count}`)
    if (log.amz_count > 0) parts.push(`amz: ${log.amz_count}`)
    return parts.join(' · ') || '0 encontrados'
  }

  const calcDuration = (log: CrawlLogEntry) => {
    if (!log.finished_at?.Valid) return '—'
    const ms = new Date(log.finished_at.Time).getTime() - new Date(log.started_at).getTime()
    return ms < 60_000 ? `${(ms/1000).toFixed(0)}s` : `${(ms/60_000).toFixed(1)}min`
  }

  if (isLoading) return <div className="space-y-2">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
  if (!logs.length) return <EmptyState title="Nenhum log de crawler" description="Os logs aparecem após rodar um crawler." />

  return (
    <div className="bg-surface border border-border rounded-md overflow-hidden">
      <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-2">
            {['Crawler', 'Início', 'Duração', 'Encontrados', 'Status', 'Erro'].map(h => (
              <th key={h} className="text-left px-4 py-2.5 text-xs text-fg-2 font-medium uppercase tracking-wide">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {logs.map(log => (
            <tr key={log.id} className="border-b border-border last:border-0 hover:bg-surface-2">
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

// ── DispatchDrawer ────────────────────────────────────────────────────────────

function DispatchDrawer({
  dispatch,
  onClose,
}: {
  dispatch: Dispatch
  onClose: () => void
}) {
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Buscar detalhes com targets e erros
  const { data: detail } = useQuery({
    queryKey: ['dispatch-detail', dispatch.id],
    queryFn: () => apiClient.get(`/api/dispatches/${dispatch.id}`).then(r => r.data).catch(() => null),
    enabled: !!dispatch.id,
  })
  const targets: any[] = detail?.targets ?? []
  const failedTargets = targets.filter((t: any) => t.status === 'failed' && t.error_reason)
  const deliveredTargets = targets.filter((t: any) => t.status === 'delivered')

  return (
    <div className="fixed inset-0 z-40 flex" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        className="flex-1 bg-black/40"
        onClick={onClose}
        aria-label="Fechar painel"
      />
      {/* Drawer */}
      <div className="w-full max-w-md bg-surface border-l border-border h-full overflow-y-auto p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-fg">
            Disparo {dispatch.short_id ?? `#${dispatch.id}`}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-fg-3 hover:text-fg text-lg leading-none"
            aria-label="Fechar"
          >
            x
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant={statusVariant[dispatch.status] ?? 'default'}>
            {dispatch.status}
          </Badge>
          <span className="text-xs text-fg-3">
            {new Date(dispatch.created_at).toLocaleString('pt-BR')}
          </span>
        </div>

        {dispatch.composed_by && (
          <div>
            <p className="text-xs text-fg-3 mb-1">Criado por</p>
            <p className="text-sm text-fg">{dispatch.composed_by}</p>
          </div>
        )}

        {(dispatch.channel_name || dispatch.group_name) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {dispatch.channel_name && (
              <div className="bg-surface-2 rounded-md p-3">
                <p className="text-xs text-fg-3">Canal</p>
                <p className="text-sm font-medium text-fg">{dispatch.channel_name}</p>
              </div>
            )}
            {dispatch.group_name && (
              <div className="bg-surface-2 rounded-md p-3">
                <p className="text-xs text-fg-3">Grupo</p>
                <p className="text-sm font-medium text-fg">{dispatch.group_name}</p>
              </div>
            )}
          </div>
        )}

        {targets.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="bg-surface-2 rounded-md p-3">
              <p className="text-xs text-fg-3">Total</p>
              <p className="text-lg font-semibold text-fg">{targets.length}</p>
            </div>
            <div className="bg-surface-2 rounded-md p-3">
              <p className="text-xs text-fg-3">Entregues</p>
              <p className={`text-lg font-semibold ${deliveredTargets.length > 0 ? 'text-success' : 'text-fg'}`}>{deliveredTargets.length}</p>
            </div>
            <div className="bg-surface-2 rounded-md p-3">
              <p className="text-xs text-fg-3">Falharam</p>
              <p className={`text-lg font-semibold ${failedTargets.length > 0 ? 'text-danger' : 'text-fg'}`}>{failedTargets.length}</p>
            </div>
          </div>
        )}

        {/* Erros detalhados por target */}
        {failedTargets.length > 0 && (
          <div>
            <p className="text-xs text-fg-3 font-medium mb-2">❌ Erros de envio</p>
            <div className="space-y-2">
              {failedTargets.map((t: any) => (
                <div key={t.id} className="bg-danger/5 border border-danger/20 rounded-md p-3">
                  <p className="text-xs font-medium text-danger mb-1">
                    Grupo #{t.group_id}
                    {t.attempted_at && <span className="text-fg-3 font-normal ml-2">{new Date(t.attempted_at).toLocaleString('pt-BR')}</span>}
                  </p>
                  <p className="text-xs text-fg-2 font-mono break-all">{t.error_reason}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {dispatch.target_count != null && targets.length === 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-surface-2 rounded-md p-3">
              <p className="text-xs text-fg-3">Destinos</p>
              <p className="text-lg font-semibold text-fg">{dispatch.target_count}</p>
            </div>
            <div className="bg-surface-2 rounded-md p-3">
              <p className="text-xs text-fg-3">Entregues</p>
              <p className="text-lg font-semibold text-fg">{dispatch.delivered_count ?? 0}</p>
            </div>
          </div>
        )}

        {dispatch.message?.text && (
          <div>
            <p className="text-xs text-fg-3 mb-2">Preview WhatsApp</p>
            <div className="bg-[#0b141a] rounded-lg p-3">
              <div className="bg-[#005c4b] rounded-lg p-3 max-w-xs ml-auto shadow">
                <p className="text-sm text-white whitespace-pre-wrap break-words">{dispatch.message.text}</p>
                <p className="text-xs text-green-300 mt-1 text-right opacity-60">
                  {new Date(dispatch.created_at).toLocaleString('pt-BR')} ✓✓
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── ScheduledDispatches ───────────────────────────────────────────────────────

function ScheduledDispatches() {
  const qc = useQueryClient()
  const [previewText, setPreviewText] = React.useState<string | null>(null)

  const { data: items = [], isLoading, refetch } = useQuery({
    queryKey: ['dispatches', 'scheduled'],
    queryFn: () =>
      apiClient.get('/api/dispatches?status=queued&limit=100').then(r =>
        (Array.isArray(r.data) ? r.data : []).filter((d: any) => d.scheduled_for)
      ).catch(() => []),
    refetchInterval: 30_000,
  })

  const cancelMut = useMutation({
    mutationFn: (id: number) => apiClient.post(`/api/dispatches/${id}/cancel`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['dispatches', 'scheduled'] }) },
  })

  if (isLoading) return <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>

  if (!items.length) return (
    <div className="text-center py-12 space-y-2">
      <p className="text-sm text-fg-2">Nenhum disparo agendado</p>
      <p className="text-xs text-fg-3">Use o Composer para agendar um disparo escolhendo data e hora.</p>
      <a href="/compose" className="inline-block mt-2 text-xs text-accent hover:underline">→ Ir para Compor disparo</a>
    </div>
  )

  return (
    <>
      {previewText !== null && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setPreviewText(null)}>
          <div className="w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <p className="text-xs text-center text-white/60 mb-3">Preview · clique fora para fechar</p>
            <div className="bg-[#0b141a] rounded-xl p-4">
              <div className="bg-[#005c4b] rounded-xl p-3 ml-auto max-w-[90%] shadow">
                <p className="text-sm text-white whitespace-pre-wrap break-words">{previewText}</p>
                <p className="text-xs text-green-300 mt-1 text-right opacity-60">agendado ✓</p>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="bg-surface border border-border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-2 border-b border-border">
              <th className="text-left px-4 py-2.5 text-xs text-fg-2 font-medium">Mensagem</th>
              <th className="text-left px-4 py-2.5 text-xs text-fg-2 font-medium">Agendado para</th>
              <th className="text-left px-4 py-2.5 text-xs text-fg-2 font-medium">Status</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((d: any) => {
              const msg = typeof d.message === 'string' ? (() => { try { return JSON.parse(d.message) } catch { return {} } })() : (d.message ?? {})
              const text = msg?.text ?? ''
              const displayText = text.slice(0, 60) || `Disparo agendado #${d.id}`
              const scheduledAt = d.scheduled_for ? new Date(d.scheduled_for) : null
              const isPast = scheduledAt && scheduledAt < new Date()
              return (
                <tr key={d.id} className="border-b border-border last:border-0 hover:bg-surface-2">
                  <td className="px-4 py-3 cursor-pointer" onClick={() => setPreviewText(text || displayText)}>
                    <p className="text-sm text-fg truncate max-w-xs">{displayText}</p>
                    <p className="text-xs text-accent hover:underline mt-0.5">ver preview →</p>
                  </td>
                  <td className="px-4 py-3">
                    {scheduledAt ? (
                      <div>
                        <p className="text-sm text-fg">{scheduledAt.toLocaleString('pt-BR')}</p>
                        {isPast ? (
                          <p className="text-xs text-warning">⏳ aguardando worker...</p>
                        ) : (
                          <p className="text-xs text-fg-3">em {Math.round((scheduledAt.getTime() - Date.now()) / 60000)} min</p>
                        )}
                      </div>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="warning" size="sm">agendado</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      className="text-xs text-danger hover:underline disabled:opacity-50"
                      disabled={cancelMut.isPending}
                      onClick={() => { if (confirm('Cancelar este agendamento?')) cancelMut.mutate(d.id) }}
                    >
                      Cancelar
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-fg-3 mt-2">
        Disparos agendados são processados automaticamente pelo worker a cada 15s.{' '}
        <button type="button" className="text-accent hover:underline" onClick={() => refetch()}>↻ Atualizar</button>
      </p>
    </>
  )
}

// ── ErrorsTab ─────────────────────────────────────────────────────────────────

function ErrorsTab({ dispatches, crawlLogs }: { dispatches: Dispatch[]; crawlLogs: CrawlLogEntry[] }) {
  const failedDispatches = dispatches.filter(d => d.status === 'failed')
  const errorCrawls = crawlLogs.filter(l => l.status === 'error')

  if (failedDispatches.length === 0 && errorCrawls.length === 0) {
    return <EmptyState title="Nenhum erro" description="Nenhum disparo ou crawl com erro encontrado." />
  }

  return (
    <div className="space-y-4">
      {failedDispatches.length > 0 && (
        <div className="bg-surface border border-border rounded-md overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border bg-surface-2">
            <p className="text-xs font-medium text-fg-2 uppercase tracking-wide">Disparos com falha ({failedDispatches.length})</p>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {failedDispatches.map(d => (
                <tr key={d.id} className="border-b border-border last:border-0 hover:bg-surface-2">
                  <td className="px-4 py-2.5 text-fg font-mono text-xs">{d.short_id ?? `#${d.id}`}</td>
                  <td className="px-4 py-2.5 text-fg-2 text-xs">{d.message?.text?.slice(0, 60) ?? '(sem texto)'}</td>
                  <td className="px-4 py-2.5 text-fg-3 text-xs">{new Date(d.created_at).toLocaleString('pt-BR')}</td>
                  <td className="px-4 py-2.5"><Badge variant="danger" size="sm">falhou</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {errorCrawls.length > 0 && (
        <div className="bg-surface border border-border rounded-md overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border bg-surface-2">
            <p className="text-xs font-medium text-fg-2 uppercase tracking-wide">Crawlers com erro ({errorCrawls.length})</p>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {errorCrawls.map(l => (
                <tr key={l.id} className="border-b border-border last:border-0 hover:bg-surface-2">
                  <td className="px-4 py-2.5 text-fg text-xs">{`#${l.search_term_id}`}</td>
                  <td className="px-4 py-2.5 text-xs text-danger truncate max-w-xs">{l.error_msg?.Valid ? l.error_msg.String : 'erro desconhecido'}</td>
                  <td className="px-4 py-2.5 text-fg-3 text-xs">{new Date(l.started_at).toLocaleString('pt-BR')}</td>
                  <td className="px-4 py-2.5"><Badge variant="danger" size="sm">erro</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Main Logs page ────────────────────────────────────────────────────────────

type LogTab = 'all' | 'dispatches' | 'crawlers' | 'scheduled' | 'errors' | 'llm'

export default function Logs() {
  const navigate = useNavigate()
  const [logTab, setLogTab] = React.useState<LogTab>('dispatches')
  const [params] = useSearchParams()
  const statusFilter = params.get('status') ?? ''
  const [status, setStatus] = React.useState(statusFilter)
  const [dateFrom, setDateFrom] = React.useState('')
  const [dateTo, setDateTo] = React.useState('')
  const [accountId, setAccountId] = React.useState('')
  const [items, setItems] = React.useState<Dispatch[]>([])
  const [selected, setSelected] = React.useState<Dispatch | null>(null)

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts-filter'],
    queryFn: () => apiClient.get('/api/accounts/wa').then(r => Array.isArray(r.data) ? r.data : []).catch(() => []),
  })

  const { isLoading: dispatchLoading } = useQuery<Dispatch[]>({
    queryKey: ['dispatches', status, dateFrom, dateTo, accountId],
    queryFn: () => {
      const qp = new URLSearchParams()
      if (status) qp.set('status', status)
      if (dateFrom) qp.set('date_from', dateFrom)
      if (dateTo) qp.set('date_to', dateTo)
      if (accountId) qp.set('account_id', accountId)
      return apiClient
        .get(`/api/dispatches${qp.toString() ? '?' + qp : ''}`)
        .then((r) => {
          const data = Array.isArray(r.data) ? r.data : []
          setItems(data)
          return data
        })
    },
    refetchInterval: 30_000,
  })

  const { data: crawlLogs = [] } = useQuery<CrawlLogEntry[]>({
    queryKey: ['crawl-logs'],
    queryFn: () => apiClient.get('/api/crawl-logs?limit=100').then(r => Array.isArray(r.data) ? r.data : []).catch(() => []),
    refetchInterval: 15_000,
  })

  const qc = useQueryClient()
  const expireStale = useMutation({
    mutationFn: () => apiClient.post('/api/dispatches/expire-stale').then(r => r.data as { expired_targets: number }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['dispatches'] })
      alert(`${data.expired_targets} targets expirados.`)
    },
  })

  const { data: scheduledItems = [] } = useQuery({
    queryKey: ['dispatches', 'scheduled'],
    queryFn: () =>
      apiClient.get('/api/dispatches?status=queued&limit=100').then(r =>
        (Array.isArray(r.data) ? r.data : []).filter((d: any) => d.scheduled_for)
      ).catch(() => []),
    refetchInterval: 30_000,
  })

  // WS: atualizar dispatch status em tempo real
  useWSEvent('dispatch.target_updated', (data: any) => {
    setItems((prev) =>
      prev.map((d) =>
        d.id === data.dispatchId ? { ...d, status: 'sending' } : d
      )
    )
    setSelected((prev) =>
      prev?.id === data.dispatchId ? ({ ...prev, status: 'sending' } as Dispatch) : prev
    )
  })

  useWSEvent('dispatch.completed', (data: any) => {
    setItems((prev) =>
      prev.map((d) =>
        d.id === data.dispatchId ? { ...d, status: 'completed' } : d
      )
    )
    setSelected((prev) =>
      prev?.id === data.dispatchId ? ({ ...prev, status: 'completed' } as Dispatch) : prev
    )
  })

  // ── Badge counts ──────────────────────────────────────────────────────────

  const errorCount = items.filter(d => d.status === 'failed').length + crawlLogs.filter(l => l.status === 'error').length
  const allCount = items.length + crawlLogs.length + scheduledItems.length

  const TAB_DEFS: { id: LogTab; label: string; count?: number }[] = [
    { id: 'all', label: 'Tudo', count: allCount },
    { id: 'dispatches', label: 'Disparos', count: items.length },
    { id: 'crawlers', label: 'Crawlers', count: crawlLogs.length },
    { id: 'scheduled', label: 'Scheduler', count: (scheduledItems as any[]).length },
    { id: 'llm', label: 'LLM' },
    { id: 'errors', label: 'Erros', count: errorCount },
  ]

  // ── Unified rows for "Tudo" tab ────────────────────────────────────────────

  const unifiedRows: UnifiedRow[] = React.useMemo(() => {
    const rows: UnifiedRow[] = []
    for (const d of items) {
      rows.push({
        id: String(d.short_id ?? d.id),
        type: d.scheduled_for ? 'scheduled' : 'dispatch',
        label: d.message?.text?.slice(0, 80) ?? `Disparo #${d.id}`,
        status: d.status,
        date: d.created_at,
        channel: d.channel_name,
        group: d.group_name,
      })
    }
    for (const l of crawlLogs) {
      rows.push({
        id: String(l.id),
        type: 'crawl',
        label: `Crawler #${l.search_term_id}`,
        status: l.status,
        date: l.started_at,
      })
    }
    return rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [items, crawlLogs])

  // ── Export CSV ─────────────────────────────────────────────────────────────

  function handleExport() {
    const rows = logTab === 'all' ? unifiedRows
      : logTab === 'dispatches' ? items.map<UnifiedRow>(d => ({
          id: String(d.short_id ?? d.id),
          type: 'dispatch',
          label: d.message?.text?.slice(0, 80) ?? `Disparo #${d.id}`,
          status: d.status,
          date: d.created_at,
          channel: d.channel_name,
          group: d.group_name,
        }))
      : logTab === 'crawlers' ? crawlLogs.map<UnifiedRow>(l => ({
          id: String(l.id),
          type: 'crawl',
          label: `Crawler #${l.search_term_id}`,
          status: l.status,
          date: l.started_at,
        }))
      : logTab === 'scheduled' ? (scheduledItems as any[]).map<UnifiedRow>(d => ({
          id: String(d.short_id ?? d.id),
          type: 'scheduled',
          label: d.message?.text?.slice(0, 80) ?? `Agendado #${d.id}`,
          status: d.status,
          date: d.scheduled_for ?? d.created_at,
        }))
      : /* errors */ [
          ...items.filter(d => d.status === 'failed').map<UnifiedRow>(d => ({
            id: String(d.short_id ?? d.id),
            type: 'dispatch' as LogType,
            label: d.message?.text?.slice(0, 80) ?? `Disparo #${d.id}`,
            status: d.status,
            date: d.created_at,
          })),
          ...crawlLogs.filter(l => l.status === 'error').map<UnifiedRow>(l => ({
            id: String(l.id),
            type: 'crawl' as LogType,
            label: `Crawler #${l.search_term_id}`,
            status: l.status,
            date: l.started_at,
          })),
        ]
    exportCsv(rows, `logs-${logTab}-${new Date().toISOString().slice(0,10)}.csv`)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-end gap-2 mb-4">
        <Button
          variant="secondary"
          size="sm"
          loading={expireStale.isPending}
          onClick={() => {
            if (confirm('Marcar como "failed" todos os targets pending há mais de 2h?'))
              expireStale.mutate()
          }}
          title="Limpa targets presos em 'pending' que nunca foram processados"
        >
          Expirar stale
        </Button>
        <Button variant="secondary" size="sm" onClick={handleExport}>
          Exportar CSV
        </Button>
      </div>

      {/* Tabs with badge counts */}
      <div className="flex gap-4 border-b border-border mb-6 overflow-x-auto">
        {TAB_DEFS.map(t => (
          <button key={t.id} type="button"
            onClick={() => setLogTab(t.id)}
            className={`pb-2 text-sm font-medium border-b-2 transition-colors -mb-px flex items-center gap-1.5 whitespace-nowrap ${logTab === t.id ? 'border-accent text-accent' : 'border-transparent text-fg-2 hover:text-fg'}`}>
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-semibold rounded-full ${
                t.id === 'errors' ? 'bg-danger/10 text-danger' : 'bg-surface-2 text-fg-3'
              }`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {logTab === 'crawlers' && <CrawlerLogs />}
      {logTab === 'scheduled' && <ScheduledDispatches />}
      {logTab === 'llm' && <LLMLogs />}
      {logTab === 'errors' && <ErrorsTab dispatches={items} crawlLogs={crawlLogs} />}

      {/* "Tudo" tab — unified table */}
      {logTab === 'all' && (
        <div className="bg-surface border border-border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2">
                {['Tipo', 'Descrição', 'Canal', 'Grupo', 'Status', 'Data'].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-xs text-fg-2 font-medium uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {unifiedRows.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-fg-3 text-sm">Nenhum registro encontrado.</td></tr>
              ) : unifiedRows.map(row => (
                <tr key={`${row.type}-${row.id}`} className="border-b border-border last:border-0 hover:bg-surface-2">
                  <td className="px-4 py-2.5"><TypeBadge type={row.type} /></td>
                  <td className="px-4 py-2.5 text-fg text-sm max-w-xs truncate">{row.label}</td>
                  <td className="px-4 py-2.5 text-fg-3 text-xs">{row.channel ?? '—'}</td>
                  <td className="px-4 py-2.5 text-fg-3 text-xs">{row.group ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    <Badge variant={statusVariant[row.status] ?? 'default'} size="sm">{row.status}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-fg-3 text-xs whitespace-nowrap">
                    {new Date(row.date).toLocaleString('pt-BR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* "Disparos" tab */}
      {logTab === 'dispatches' && (
        <div>
          {/* Filtros */}
          <div className="flex gap-3 mb-4 flex-wrap items-end">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-fg-2">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="text-sm border border-border rounded-md px-2 py-1.5 bg-surface text-fg"
              >
                <option value="">Todos</option>
                <option value="queued">Agendado</option>
                <option value="sending">Enviando</option>
                <option value="completed">Concluído</option>
                <option value="failed">Falhou</option>
                <option value="draft">Rascunho</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-fg-2">De</label>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                className="text-sm border border-border rounded-md px-2 py-1.5 bg-surface text-fg" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-fg-2">Até</label>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                className="text-sm border border-border rounded-md px-2 py-1.5 bg-surface text-fg" />
            </div>
            {accounts.length > 0 && (
              <div className="flex flex-col gap-1">
                <label className="text-xs text-fg-2">Conta</label>
                <select value={accountId} onChange={(e) => setAccountId(e.target.value)}
                  className="text-sm border border-border rounded-md px-2 py-1.5 bg-surface text-fg">
                  <option value="">Todas</option>
                  {accounts.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            )}
            <button type="button" onClick={() => { setDateFrom(''); setDateTo(''); setAccountId(''); setStatus('') }}
              className="text-xs text-fg-3 hover:text-fg self-end pb-1.5">Limpar</button>
          </div>

          {dispatchLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              title="Nenhum disparo ainda"
              description="Crie um disparo no Composer para ver os logs aqui."
            />
          ) : (
            <div className="bg-surface border border-border rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-2">
                    <th className="text-left p-3 text-xs text-fg-2 font-medium uppercase tracking-wide">ID</th>
                    <th className="text-left p-3 text-xs text-fg-2 font-medium uppercase tracking-wide">Tipo</th>
                    <th className="text-left p-3 text-xs text-fg-2 font-medium uppercase tracking-wide">Canal</th>
                    <th className="text-left p-3 text-xs text-fg-2 font-medium uppercase tracking-wide">Grupo</th>
                    <th className="text-left p-3 text-xs text-fg-2 font-medium uppercase tracking-wide">Status</th>
                    <th className="text-left p-3 text-xs text-fg-2 font-medium uppercase tracking-wide hidden sm:table-cell">Destinos</th>
                    <th className="text-left p-3 text-xs text-fg-2 font-medium uppercase tracking-wide">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((d) => {
                    const msgText = d.message?.text ?? ''
                    const isDraft = d.status === 'draft'
                    const rowType: LogType = d.scheduled_for ? 'scheduled' : 'dispatch'
                    return (
                      <tr
                        key={d.id}
                        className={`border-b border-border last:border-0 hover:bg-surface-2 cursor-pointer ${isDraft ? 'opacity-80' : ''}`}
                        onClick={() => isDraft
                          ? navigate(`/compose?draftId=${d.id}${d.product_id ? `&productId=${d.product_id}` : ''}`)
                          : setSelected(d)
                        }
                        title={isDraft ? 'Clique para continuar editando este rascunho' : undefined}
                      >
                        <td className="p-3">
                          {msgText ? (
                            <>
                              <p className="text-sm text-fg line-clamp-2">{msgText.slice(0, 100)}</p>
                              <p className="text-xs text-fg-3 font-mono mt-0.5">{d.short_id ?? d.id}</p>
                            </>
                          ) : (
                            <>
                              <p className="text-xs text-fg-3 italic">(sem texto)</p>
                              <p className="text-xs text-fg-3 font-mono">{d.short_id ?? d.id}</p>
                            </>
                          )}
                          {isDraft && <span className="text-xs text-accent mt-0.5 block">→ clique para continuar edição</span>}
                        </td>
                        <td className="p-3"><TypeBadge type={rowType} /></td>
                        <td className="p-3 text-fg-2 text-xs">{d.channel_name ?? '—'}</td>
                        <td className="p-3 text-fg-2 text-xs">{d.group_name ?? '—'}</td>
                        <td className="p-3">
                          <Badge variant={statusVariant[d.status] ?? 'default'} size="sm">
                            {d.status}
                          </Badge>
                        </td>
                        <td className="p-3 text-fg-3 text-xs hidden sm:table-cell">
                          {d.target_count != null
                            ? `${d.delivered_count ?? 0}/${d.target_count} entregues`
                            : '—'}
                        </td>
                        <td className="p-3 text-fg-3 text-xs whitespace-nowrap">
                          {new Date(d.created_at).toLocaleString('pt-BR')}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {selected && (
            <DispatchDrawer dispatch={selected} onClose={() => setSelected(null)} />
          )}
        </div>
      )}
    </div>
  )
}

// ── LLM Logs ──────────────────────────────────────────────────────────────────

interface LLMLogRow {
  id: number
  operation: string
  model: string
  status: string
  tokens_in: number
  tokens_out: number
  cost_usd: number
  cache_hit: boolean
  error: boolean
  error_msg?: string
  latency_seconds?: number
  prompt?: string
  response?: string
  created_at: string
}

function LLMLogs() {
  const [errorsOnly, setErrorsOnly] = React.useState(false)
  const [expandedId, setExpandedId] = React.useState<number | null>(null)
  const { data: rows = [], isLoading, refetch } = useQuery<LLMLogRow[]>({
    queryKey: ['llm-logs', errorsOnly],
    queryFn: () => apiClient.get(`/api/admin/llm/logs?limit=200${errorsOnly ? '&errors_only=true' : ''}`)
      .then(r => Array.isArray(r.data) ? r.data : []),
    refetchInterval: 30_000,
  })

  return (
    <div className="bg-surface border border-border rounded-md overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-surface-2 border-b border-border">
        <label className="flex items-center gap-2 text-xs text-fg-2 cursor-pointer">
          <input type="checkbox" checked={errorsOnly} onChange={e => setErrorsOnly(e.target.checked)} className="accent-accent" />
          Apenas erros
        </label>
        <button type="button" onClick={() => refetch()} className="text-xs text-accent hover:underline">↻ atualizar</button>
      </div>
      {isLoading ? (
        <p className="text-sm text-fg-3 p-6 text-center">Carregando...</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-fg-3 p-6 text-center">Nenhum log de LLM.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2">
              <th className="text-left px-3 py-2 text-xs text-fg-2 font-medium uppercase">Quando</th>
              <th className="text-left px-3 py-2 text-xs text-fg-2 font-medium uppercase">Op</th>
              <th className="text-left px-3 py-2 text-xs text-fg-2 font-medium uppercase">Modelo</th>
              <th className="text-right px-3 py-2 text-xs text-fg-2 font-medium uppercase">Tokens</th>
              <th className="text-right px-3 py-2 text-xs text-fg-2 font-medium uppercase">Custo</th>
              <th className="text-right px-3 py-2 text-xs text-fg-2 font-medium uppercase">Latência</th>
              <th className="text-left px-3 py-2 text-xs text-fg-2 font-medium uppercase">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const isExpanded = expandedId === r.id
              const hasPayload = !!(r.prompt || r.response)
              return (
                <React.Fragment key={r.id}>
                  <tr
                    className={`border-b border-border last:border-0 ${r.error ? 'bg-danger/5' : ''} ${hasPayload ? 'cursor-pointer hover:bg-surface-2' : ''}`}
                    onClick={() => hasPayload && setExpandedId(isExpanded ? null : r.id)}
                  >
                    <td className="px-3 py-2 text-xs text-fg-3 whitespace-nowrap">
                      {hasPayload && <span className="text-fg-3 mr-1">{isExpanded ? '▼' : '▶'}</span>}
                      {new Date(r.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' })}
                    </td>
                    <td className="px-3 py-2 text-xs text-fg">{r.operation}</td>
                    <td className="px-3 py-2 text-xs text-fg-2 font-mono truncate max-w-xs">{r.model}</td>
                    <td className="px-3 py-2 text-xs text-fg-2 font-mono text-right">{r.tokens_in}→{r.tokens_out}</td>
                    <td className="px-3 py-2 text-xs text-fg-2 font-mono text-right">${r.cost_usd.toFixed(4)}</td>
                    <td className="px-3 py-2 text-xs text-fg-3 font-mono text-right">
                      {r.latency_seconds != null ? `${r.latency_seconds.toFixed(2)}s` : '—'}
                    </td>
                    <td className="px-3 py-2">
                      {r.error ? (
                        <span className="text-xs px-1.5 py-0.5 bg-danger/10 text-danger rounded font-medium">erro</span>
                      ) : r.cache_hit ? (
                        <span className="text-xs px-1.5 py-0.5 bg-accent/10 text-accent rounded">cache</span>
                      ) : (
                        <span className="text-xs px-1.5 py-0.5 bg-success/10 text-success rounded">{r.status || 'ok'}</span>
                      )}
                    </td>
                  </tr>
                  {r.error && r.error_msg && (
                    <tr className="bg-danger/5 border-b border-border last:border-0">
                      <td colSpan={7} className="px-4 py-2 text-xs font-mono text-danger break-all">
                        {r.error_msg}
                      </td>
                    </tr>
                  )}
                  {isExpanded && hasPayload && (
                    <tr className="border-b border-border last:border-0 bg-surface-2">
                      <td colSpan={7} className="px-4 py-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs font-medium text-fg-2 uppercase tracking-wide mb-1">Prompt enviado</p>
                            <pre className="text-xs font-mono text-fg-2 bg-surface border border-border rounded p-2 max-h-60 overflow-auto whitespace-pre-wrap break-words">
                              {r.prompt || '(vazio)'}
                            </pre>
                          </div>
                          <div>
                            <p className="text-xs font-medium text-fg-2 uppercase tracking-wide mb-1">Resposta recebida</p>
                            <pre className={`text-xs font-mono bg-surface border border-border rounded p-2 max-h-60 overflow-auto whitespace-pre-wrap break-words ${r.error ? 'text-danger' : 'text-fg-2'}`}>
                              {r.response || '(vazio)'}
                            </pre>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
