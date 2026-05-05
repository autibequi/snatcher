import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Badge, Skeleton, EmptyState } from '../components/ui'
import { apiClient } from '../lib/apiClient'
import { useWSEvent } from '../lib/useWS'

const LOG_TABS = [
  { id: 'dispatches', label: 'Disparos' },
  { id: 'scheduled', label: 'Agendados' },
  { id: 'crawlers', label: 'Crawlers' },
]

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

  const statusVariant: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
    done: 'success',
    running: 'warning',
    error: 'danger',
  }

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
  )
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
}

const statusVariant: Record<string, 'default' | 'success' | 'warning' | 'danger'> = {
  completed: 'success',
  queued: 'warning',
  sending: 'warning',
  failed: 'danger',
  draft: 'default',
}

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

        {dispatch.target_count != null && (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-surface-2 rounded-md p-3">
              <p className="text-xs text-fg-3">Destinos</p>
              <p className="text-lg font-semibold text-fg">{dispatch.target_count}</p>
            </div>
            <div className="bg-surface-2 rounded-md p-3">
              <p className="text-xs text-fg-3">Entregues</p>
              <p className="text-lg font-semibold text-fg">
                {dispatch.delivered_count ?? 0}
              </p>
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

// ── Agendados ────────────────────────────────────────────────────────────────
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
              // message pode ser objeto ou string JSON
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

export default function Logs() {
  const navigate = useNavigate()
  const [logTab, setLogTab] = React.useState('dispatches')
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

  const { isLoading } = useQuery<Dispatch[]>({
    queryKey: ['dispatches', status, dateFrom, dateTo, accountId],
    queryFn: () => {
      const params = new URLSearchParams()
      if (status) params.set('status', status)
      if (dateFrom) params.set('date_from', dateFrom)
      if (dateTo) params.set('date_to', dateTo)
      if (accountId) params.set('account_id', accountId)
      return apiClient
        .get(`/api/dispatches${params.toString() ? '?' + params : ''}`)
        .then((r) => {
          const data = Array.isArray(r.data) ? r.data : []
          setItems(data)
          return data
        })
    },
    refetchInterval: 30_000,
  })

  // WS: atualizar dispatch status em tempo real
  useWSEvent('dispatch.target_updated', (data) => {
    setItems((prev) =>
      prev.map((d) =>
        d.id === data.dispatchId ? { ...d, status: 'sending' } : d
      )
    )
    setSelected((prev) =>
      prev?.id === data.dispatchId ? { ...prev, status: 'sending' } : prev
    )
  })

  useWSEvent('dispatch.completed', (data) => {
    setItems((prev) =>
      prev.map((d) =>
        d.id === data.dispatchId ? { ...d, status: 'completed' } : d
      )
    )
    setSelected((prev) =>
      prev?.id === data.dispatchId ? { ...prev, status: 'completed' } : prev
    )
  })

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold text-fg">Logs</h1>
      </div>
      <div className="flex gap-4 border-b border-border mb-6">
        {LOG_TABS.map(t => (
          <button key={t.id} type="button"
            onClick={() => setLogTab(t.id)}
            className={`pb-2 text-sm font-medium border-b-2 transition-colors -mb-px ${logTab === t.id ? 'border-accent text-accent' : 'border-transparent text-fg-2 hover:text-fg'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {logTab === 'crawlers' ? <CrawlerLogs /> : logTab === 'scheduled' ? <ScheduledDispatches /> : (<div>

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

      {isLoading ? (
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
              <tr className="border-b border-border">
                <th className="text-left p-3 text-fg-2 font-medium">ID</th>
                <th className="text-left p-3 text-fg-2 font-medium">Origem</th>
                <th className="text-left p-3 text-fg-2 font-medium">Status</th>
                <th className="text-left p-3 text-fg-2 font-medium hidden sm:table-cell">
                  Destinos
                </th>
                <th className="text-left p-3 text-fg-2 font-medium">Data</th>
              </tr>
            </thead>
            <tbody>
              {items.map((d) => {
                const msgText = d.message?.text ?? ''
                const isDraft = d.status === 'draft'
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
                      <div>
                        {/* Texto da mensagem como título */}
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
                      </div>
                    </td>
                    <td className="p-3">
                      <Badge variant={statusVariant[d.status] ?? 'default'}>
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
      </div>)}
    </div>
  )
}
