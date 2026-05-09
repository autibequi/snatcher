import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts'
import { Tooltip } from '../components/ui'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Badge, Button, Skeleton, EmptyState } from '../components/ui'
import { apiClient } from '../lib/apiClient'
import { useWSEvent } from '../lib/useWS'
import {
  JonfreyActionCard,
  primaryJonfreyOutcome,
  type JonfreyAction,
} from '../components/JonfreyActionCard'

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

type LogType = 'dispatch' | 'crawl' | 'scheduled' | 'jonfrey'

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
  success: 'success',
  pending: 'warning',
  skipped: 'warning',
}

// Explicações dos status de disparo — usadas em tooltips
export const DISPATCH_STATUS_TOOLTIP: Record<string, string> = {
  draft: 'Rascunho — salvo mas não enviado. Aguarda edição e disparo manual.',
  queued: 'Na fila — agendado para envio. O sistema vai processar em breve.',
  pending_approval: 'Aguardando aprovação — full_auto_mode está desligado. Clique em Aprovar pra liberar.',
  scheduled: 'Agendado — será disparado no horário configurado.',
  sending: 'Enviando — processo de entrega em andamento para os grupos alvo.',
  completed: 'Concluído — todos os grupos receberam a mensagem com sucesso.',
  failed: 'Falhou — um ou mais grupos não receberam. Veja o painel de erros.',
  cancelled: 'Cancelado — disparo interrompido manualmente antes da entrega.',
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
  if (type === 'scheduled') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded-sm bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
        <span aria-hidden>●</span> Agenda
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded-sm bg-fuchsia-50 text-fuchsia-800 dark:bg-fuchsia-900/30 dark:text-fuchsia-300">
      <span aria-hidden>●</span> Jonfrey
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

  const diagnoseMut = useMutation({
    mutationFn: () =>
      apiClient
        .post(`/api/dispatches/${dispatch.id}/diagnose`)
        .then(r => r.data as { likely_cause?: string; diagnosis?: string; is_transient?: boolean; actions?: string[] }),
  })

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
          <Tooltip content={DISPATCH_STATUS_TOOLTIP[dispatch.status] ?? dispatch.status} side="right">
            <Badge variant={statusVariant[dispatch.status] ?? 'default'}>
              {dispatch.status}
            </Badge>
          </Tooltip>
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
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-fg-3 font-medium">❌ Erros de envio</p>
              <button
                type="button"
                disabled={diagnoseMut.isPending}
                onClick={() => diagnoseMut.mutate()}
                className="text-xs border border-border rounded px-2 py-1 text-accent hover:bg-accent/5 disabled:opacity-50"
              >
                {diagnoseMut.isPending ? '⏳ Analisando…' : '🔍 Diagnosticar'}
              </button>
            </div>
            {diagnoseMut.data && (
              <div className="bg-accent/5 border border-accent/30 rounded-md p-3 mb-3">
                {diagnoseMut.data.likely_cause && (
                  <p className="text-sm font-semibold text-fg mb-1">{diagnoseMut.data.likely_cause}</p>
                )}
                {diagnoseMut.data.diagnosis && (
                  <p className="text-xs text-fg-2 mb-2">{diagnoseMut.data.diagnosis}</p>
                )}
                {diagnoseMut.data.is_transient !== undefined && (
                  <p className="text-[10px] text-fg-3 mb-2">
                    {diagnoseMut.data.is_transient ? '🔄 Falha transiente — retry pode resolver' : '⚠️ Falha estrutural — requer intervenção'}
                  </p>
                )}
                {diagnoseMut.data.actions && diagnoseMut.data.actions.length > 0 && (
                  <ul className="space-y-0.5">
                    {diagnoseMut.data.actions.map((a, i) => (
                      <li key={i} className="text-xs text-fg-2 flex gap-1.5">
                        <span className="text-accent">{i + 1}.</span>
                        <span>{a}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {diagnoseMut.isError && (
              <p className="text-xs text-danger mb-2">
                Erro ao diagnosticar: {(diagnoseMut.error as any)?.response?.data?.error ?? 'falha desconhecida'}
              </p>
            )}
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

function ErrorsTab({
  dispatches,
  crawlLogs,
  jonfreyActions,
}: {
  dispatches: Dispatch[]
  crawlLogs: CrawlLogEntry[]
  jonfreyActions: JonfreyAction[]
}) {
  const failedDispatches = dispatches.filter(d => d.status === 'failed')
  const errorCrawls = crawlLogs.filter(l => l.status === 'error')
  const failedJonfrey = jonfreyActions.filter(a => a.status === 'failed')

  if (failedDispatches.length === 0 && errorCrawls.length === 0 && failedJonfrey.length === 0) {
    return (
      <EmptyState
        title="Nenhum erro"
        description="Nenhum disparo, crawl ou ação Jonfrey com falha encontrada."
      />
    )
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
      {failedJonfrey.length > 0 && (
        <div className="bg-surface border border-border rounded-md overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border bg-surface-2">
            <p className="text-xs font-medium text-fg-2 uppercase tracking-wide">
              Jonfrey — falhas ({failedJonfrey.length})
            </p>
          </div>
          <div className="divide-y divide-border">
            {failedJonfrey.map(a => (
              <div key={a.id} className="px-4 py-3 hover:bg-surface-2">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="text-xs font-mono text-fg">{a.action_type}</span>
                  <Badge variant="danger" size="sm">failed</Badge>
                  <span className="text-[10px] text-fg-3">{a.triggered_by}</span>
                  <span className="text-[10px] text-fg-3 ml-auto">
                    {new Date(a.created_at).toLocaleString('pt-BR')}
                  </span>
                </div>
                {a.error_message?.trim() ? (
                  <p className="text-xs text-danger font-mono break-words">{a.error_message}</p>
                ) : (
                  <p className="text-xs text-fg-3">Sem mensagem de erro detalhada.</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── MatchLogs subcomponent ────────────────────────────────────────────────────

interface MatchLog {
  id: number
  product_id: number
  channel_id: number
  score: number
  score_breakdown?: Record<string, number>
  match_reasons?: string[]
  false_positive?: boolean
  false_positive_reason?: string
  false_positive_marked_at?: string
  created_at: string
}

function MatchLogs() {
  const [expandedId, setExpandedId] = React.useState<number | null>(null)
  const qc = useQueryClient()

  const { data: logs = [], isLoading } = useQuery<MatchLog[]>({
    queryKey: ['match-logs'],
    queryFn: () => apiClient.get('/api/match-logs?limit=50').then(r => Array.isArray(r.data) ? r.data : []).catch(() => []),
    refetchInterval: 30_000,
  })

  const markFalsePositiveMut = useMutation({
    mutationFn: (logId: number) => {
      const reason = window.prompt('Motivo do falso positivo:')
      if (!reason) return Promise.reject('Cancelado')
      return apiClient.post(`/api/match-logs/${logId}/false-positive`, { reason })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['match-logs'] })
      alert('Falso positivo marcado.')
    },
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Erro ao marcar falso positivo'),
  })

  if (isLoading) return <div className="space-y-2">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
  if (!logs.length) return <EmptyState title="Nenhum match log" description="Os logs aparecem após matching automático de produtos." />

  return (
    <div className="space-y-2">
      {logs.map(log => (
        <div key={log.id} className="border border-border rounded-md bg-surface">
          {/* Header row */}
          <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-surface-2" onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-fg">Produto #{log.product_id}</span>
                <span className="text-xs text-fg-3">Canal #{log.channel_id}</span>
                {log.false_positive && <Badge variant="danger" size="sm">Falso positivo</Badge>}
              </div>
              <div className="text-xs text-fg-3 mt-0.5">
                {new Date(log.created_at).toLocaleString('pt-BR')}
              </div>
            </div>
            <div className="text-right">
              <div className="text-lg font-semibold text-fg">{log.score}</div>
              <div className="text-xs text-fg-3">score</div>
            </div>
            <span className="ml-2 text-fg-3">{expandedId === log.id ? '▼' : '▶'}</span>
          </div>

          {/* Expandable content */}
          {expandedId === log.id && (
            <div className="border-t border-border p-3 space-y-3 bg-surface-2">
              {/* Score breakdown */}
              {log.score_breakdown && (
                <div>
                  <p className="text-xs font-medium text-fg mb-2">Score breakdown:</p>
                  <div className="space-y-1">
                    {Object.entries(log.score_breakdown).map(([key, val]) => (
                      <div key={key} className="flex items-center gap-2">
                        <span className="text-xs text-fg-2 w-16">{key}:</span>
                        <div className="flex-1 bg-surface rounded h-4 overflow-hidden relative">
                          <div
                            className="bg-accent h-full transition-all"
                            style={{ width: `${Math.min(val * 100, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs font-mono text-fg-2 w-10 text-right">{(val * 100).toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Match reasons */}
              {log.match_reasons && log.match_reasons.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-fg mb-2">Motivos do match:</p>
                  <ul className="text-xs text-fg-3 space-y-1 list-disc list-inside">
                    {log.match_reasons.map((reason, i) => (
                      <li key={i}>{reason}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* False positive section */}
              {log.false_positive && (
                <div className="bg-danger/10 border border-danger/30 rounded p-2">
                  <p className="text-xs font-medium text-danger mb-1">Falso positivo marcado</p>
                  <p className="text-xs text-danger/70">{log.false_positive_reason}</p>
                  <p className="text-xs text-danger/60 mt-1">
                    {log.false_positive_marked_at && new Date(log.false_positive_marked_at).toLocaleString('pt-BR')}
                  </p>
                </div>
              )}

              {/* Mark false positive button */}
              {!log.false_positive && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => markFalsePositiveMut.mutate(log.id)}
                  loading={markFalsePositiveMut.isPending}
                  className="w-full"
                >
                  Marcar como falso positivo
                </Button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Main Logs page ────────────────────────────────────────────────────────────

type LogTab = 'all' | 'dispatches' | 'crawlers' | 'scheduled' | 'jonfrey' | 'errors' | 'llm' | 'match_logs'

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

  const { data: jonfreyActions = [], isLoading: jonfreyLoading } = useQuery<JonfreyAction[]>({
    queryKey: ['jonfrey-actions'],
    queryFn: () => apiClient.get('/api/jonfrey/actions').then(r => r.data ?? []).catch(() => []),
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

  const errorCount =
    items.filter(d => d.status === 'failed').length +
    crawlLogs.filter(l => l.status === 'error').length +
    jonfreyActions.filter(a => a.status === 'failed').length
  const allCount = items.length + crawlLogs.length + scheduledItems.length + jonfreyActions.length

  const TAB_DEFS: { id: LogTab; label: string; count?: number }[] = [
    { id: 'all', label: 'Tudo', count: allCount },
    { id: 'dispatches', label: 'Disparos', count: items.length },
    { id: 'crawlers', label: 'Crawlers', count: crawlLogs.length },
    { id: 'scheduled', label: 'Scheduler', count: (scheduledItems as any[]).length },
    { id: 'jonfrey', label: 'Jonfrey', count: jonfreyActions.length },
    { id: 'match_logs', label: 'Matches' },
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
    for (const j of jonfreyActions) {
      const outcome = primaryJonfreyOutcome(j)
      rows.push({
        id: `jf-${j.id}`,
        type: 'jonfrey',
        label: `${j.action_type} — ${outcome.slice(0, 100)}${outcome.length > 100 ? '…' : ''}`,
        status: j.status,
        date: j.created_at,
      })
    }
    return rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [items, crawlLogs, jonfreyActions])

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
      : logTab === 'jonfrey'
        ? jonfreyActions.map<UnifiedRow>(j => {
            const outcome = primaryJonfreyOutcome(j)
            return {
              id: `jf-${j.id}`,
              type: 'jonfrey',
              label: `${j.action_type} — ${outcome.slice(0, 80)}`,
              status: j.status,
              date: j.created_at,
            }
          })
      : /* errors (+ fallback p/ abas sem CSV dedicado) */ [
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
          ...jonfreyActions.filter(a => a.status === 'failed').map<UnifiedRow>(j => {
            const outcome = primaryJonfreyOutcome(j)
            return {
              id: `jf-${j.id}`,
              type: 'jonfrey' as LogType,
              label: `${j.action_type} — ${outcome.slice(0, 80)}`,
              status: j.status,
              date: j.created_at,
            }
          }),
        ]
    exportCsv(rows, `logs-${logTab}-${new Date().toISOString().slice(0,10)}.csv`)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={`p-6 mx-auto w-full ${logTab === 'llm' ? 'max-w-[min(100%,96rem)]' : 'max-w-5xl'}`}>
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
      {logTab === 'match_logs' && <MatchLogs />}
      {logTab === 'llm' && <LLMLogs />}
      {logTab === 'jonfrey' && (
        <div className="space-y-3">
          <p className="text-xs text-fg-3">
            Auditoria do assistente Jonfrey (mesmos registros que em{' '}
            <a href="/automations/jonfrey" className="text-accent hover:underline">
              Automations → Jonfrey
            </a>
            ).
          </p>
          {jonfreyLoading ? (
            <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : jonfreyActions.length === 0 ? (
            <EmptyState
              title="Nenhuma ação Jonfrey"
              description="Execute o assistente em Automations → Jonfrey para ver o changelog aqui."
            />
          ) : (
            <div className="space-y-2">
              {jonfreyActions.map(a => (
                <JonfreyActionCard key={a.id} action={a} />
              ))}
            </div>
          )}
        </div>
      )}
      {logTab === 'errors' && (
        <ErrorsTab dispatches={items} crawlLogs={crawlLogs} jonfreyActions={jonfreyActions} />
      )}

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

interface LLMCostSeriesPoint {
  bucket: string
  cost_usd: number
  requests: number
}

const LLM_COST_DAY_OPTIONS = [7, 14, 30] as const

function LLMCostSpendChart() {
  const [seriesDays, setSeriesDays] = React.useState<(typeof LLM_COST_DAY_OPTIONS)[number]>(14)
  const { data: seriesRaw = [], isLoading } = useQuery({
    queryKey: ['llm-cost-series', seriesDays],
    queryFn: () =>
      apiClient
        .get<LLMCostSeriesPoint[]>(`/api/admin/llm/cost-series?days=${seriesDays}`)
        .then(r => (Array.isArray(r.data) ? r.data : [])),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  const chartData = React.useMemo(
    () =>
      seriesRaw.map(p => ({
        label: p.bucket ? new Date(p.bucket).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', timeZone: 'UTC' }) : '',
        cost: Number(p.cost_usd ?? 0),
        requests: Number(p.requests ?? 0),
        raw: p.bucket,
      })),
    [seriesRaw],
  )

  const totalCost = chartData.reduce((acc, row) => acc + row.cost, 0)

  return (
    <div className="px-4 py-4 border-b border-border bg-surface-2/40">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <p className="text-xs font-semibold text-fg uppercase tracking-wide">Gastos LLM (USD estimado)</p>
          <p className="text-[11px] text-fg-3 mt-0.5">
            Últimos {seriesDays} dias · agregado por dia (UTC) · total US$
            {' '}
            {totalCost.toFixed(4)}
          </p>
        </div>
        <div className="flex rounded-md border border-border overflow-hidden shrink-0">
          {LLM_COST_DAY_OPTIONS.map(d => (
            <button
              key={d}
              type="button"
              onClick={() => setSeriesDays(d)}
              className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                seriesDays === d
                  ? 'bg-accent text-[var(--fg-on-accent,#fff)]'
                  : 'bg-surface text-fg-2 hover:bg-surface-2'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>
      {isLoading ? (
        <Skeleton className="h-[140px] w-full rounded-md" />
      ) : chartData.length === 0 ? (
        <p className="text-xs text-fg-3 text-center py-8">Sem pontos para o período.</p>
      ) : (
        <ResponsiveContainer width="100%" height={140}>
          <AreaChart data={chartData} margin={{ top: 6, right: 6, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: 'var(--fg-3, #888)' }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[0, 'auto']}
              tick={{ fontSize: 10, fill: 'var(--fg-3, #888)' }}
              tickLine={false}
              axisLine={false}
              width={56}
              tickFormatter={(v: number) =>
                v >= 0.01 ? `$${v.toFixed(2)}` : v <= 0 ? '$0' : `$${v.toFixed(4)}`
              }
            />
            <RechartsTooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const row = payload[0]?.payload as { raw?: string; cost?: number; requests?: number } | undefined
                if (!row) return null
                const dateLabel =
                  row.raw != null && row.raw !== ''
                    ? new Date(row.raw).toLocaleString('pt-BR', {
                        weekday: 'short',
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        timeZone: 'UTC',
                      })
                    : ''
                const c = typeof row.cost === 'number' && Number.isFinite(row.cost) ? row.cost : 0
                const req = typeof row.requests === 'number' && Number.isFinite(row.requests) ? row.requests : 0
                return (
                  <div
                    className="rounded-md border px-2.5 py-2 text-xs shadow-lg"
                    style={{
                      background: 'var(--surface, #1a1a1a)',
                      borderColor: 'var(--border, #333)',
                    }}
                  >
                    {dateLabel && <p className="mb-1.5 font-medium text-fg">{dateLabel}</p>}
                    <p className="text-fg">
                      <span className="text-fg-3">Custo:</span>{' '}
                      US$ {c.toFixed(6)}
                    </p>
                    <p className="mt-1 text-fg-3">{req} requisição{req !== 1 ? 'ões' : ''}</p>
                  </div>
                )
              }}
            />
            <Area
              type="monotone"
              dataKey="cost"
              name="Custo (USD)"
              stroke="#a855f7"
              fill="rgba(168, 85, 247, 0.22)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

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
  prompt: string
  response: string
  created_at: string
}

function normalizeLLMLogRows(raw: unknown): LLMLogRow[] {
  if (!Array.isArray(raw)) return []
  return raw.map((row: Record<string, unknown>) => {
    const cost = Number(row.cost_usd ?? row.estimated_cost_usd ?? 0)
    return {
      id: Number(row.id ?? 0),
      operation: String(row.operation ?? ''),
      model: String(row.model ?? ''),
      status: String(row.status ?? ''),
      tokens_in: Number(row.tokens_in ?? 0),
      tokens_out: Number(row.tokens_out ?? 0),
      cost_usd: Number.isFinite(cost) ? cost : 0,
      cache_hit: Boolean(row.cache_hit),
      error: Boolean(row.error),
      error_msg: row.error_msg != null ? String(row.error_msg) : undefined,
      latency_seconds:
        row.latency_seconds != null && row.latency_seconds !== ''
          ? Number(row.latency_seconds)
          : undefined,
      prompt: row.prompt != null ? String(row.prompt) : '',
      response: row.response != null ? String(row.response) : '',
      created_at: String(row.created_at ?? ''),
    }
  })
}

/** Pré-visualização na tabela */
function llmSnippet(s: string, maxLen = 96): string {
  const t = s.trim()
  if (!t) return '—'
  if (t.length <= maxLen) return t
  return `${t.slice(0, maxLen)}…`
}

const LLM_CLUSTER_GAP_MS = 10 * 60 * 1000

function llmBaseOperation(op: string): string {
  return op
    .replace(/_retry_transient_\d+$/i, '')
    .replace(/_retry_tokens$/i, '')
}

/** Linhas geradas pelo cliente em retentativa automática / rate limit */
function isLLMRetryFlavorRow(r: LLMLogRow): boolean {
  return (
    r.status === 'rate_limited'
    || r.operation.includes('_retry_transient')
    || r.operation.endsWith('_retry_tokens')
  )
}

function clusterLLMLogs(rows: LLMLogRow[]): LLMLogRow[][] {
  const sorted = [...rows].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  )
  const byKey = new Map<string, LLMLogRow[]>()
  for (const r of sorted) {
    const base = llmBaseOperation(r.operation)
    const key = `${base}\n${r.prompt.trim()}`
    let g = byKey.get(key)
    if (!g) {
      g = []
      byKey.set(key, g)
    }
    g.push(r)
  }
  const out: LLMLogRow[][] = []
  for (const g of byKey.values()) {
    g.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    let chunk: LLMLogRow[] = []
    for (const r of g) {
      if (chunk.length === 0) {
        chunk.push(r)
      } else {
        const prev = chunk[chunk.length - 1]
        const dt = new Date(r.created_at).getTime() - new Date(prev.created_at).getTime()
        if (dt > LLM_CLUSTER_GAP_MS) {
          out.push(chunk)
          chunk = [r]
        } else {
          chunk.push(r)
        }
      }
    }
    if (chunk.length) out.push(chunk)
  }
  return out
}

function pickPrimaryLLMAttempt(rows: LLMLogRow[]): LLMLogRow {
  const desc = [...rows].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )
  const ok = desc.find(
    r =>
      !r.error
      && r.status !== 'rate_limited'
      && (r.response.trim().length > 0 || r.tokens_out > 0),
  )
  if (ok) return ok
  return desc[0]
}

interface LLMDisplayGroup {
  id: string
  attempts: LLMLogRow[]
  primary: LLMLogRow
}

function stableGroupId(attempts: LLMLogRow[]): string {
  return `grp-${attempts.map(a => a.id).sort((x, y) => x - y).join(':')}`
}

function buildLLMDisplayGroups(rows: LLMLogRow[], hideRetryChains: boolean): LLMDisplayGroup[] {
  const clusters = clusterLLMLogs(rows)
  const result: LLMDisplayGroup[] = []

  for (const cluster of clusters) {
    const multi = cluster.length > 1
    const hasRetry = cluster.some(isLLMRetryFlavorRow)

    if (!multi) {
      const r = cluster[0]
      result.push({ id: `row-${r.id}`, attempts: cluster, primary: r })
      continue
    }

    if (hideRetryChains && hasRetry) {
      result.push({
        id: stableGroupId(cluster),
        attempts: cluster,
        primary: pickPrimaryLLMAttempt(cluster),
      })
      continue
    }

    const sortedDesc = [...cluster].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    for (const r of sortedDesc) {
      result.push({ id: `row-${r.id}`, attempts: [r], primary: r })
    }
  }

  return result.sort(
    (a, b) =>
      new Date(b.primary.created_at).getTime() - new Date(a.primary.created_at).getTime(),
  )
}

function LLMLogs() {
  const [errorsOnly, setErrorsOnly] = React.useState(false)
  const [hideRetries, setHideRetries] = React.useState(true)
  const [expandedId, setExpandedId] = React.useState<string | null>(null)
  const { data: rows = [], isLoading, refetch } = useQuery<LLMLogRow[]>({
    queryKey: ['llm-logs', errorsOnly],
    queryFn: () =>
      apiClient
        .get(`/api/admin/llm/logs?limit=200${errorsOnly ? '&errors_only=true' : ''}`)
        .then(r => normalizeLLMLogRows(r.data)),
    refetchInterval: 30_000,
  })

  const groups = React.useMemo(
    () => buildLLMDisplayGroups(rows, hideRetries),
    [rows, hideRetries],
  )

  React.useEffect(() => {
    setExpandedId(null)
  }, [hideRetries, errorsOnly])

  const colCount = 9

  return (
    <div className="bg-surface border border-border rounded-lg shadow-sm">
      <LLMCostSpendChart />
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 bg-surface-2 border-b border-border">
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-xs text-fg-2 cursor-pointer select-none">
            <input type="checkbox" checked={errorsOnly} onChange={e => setErrorsOnly(e.target.checked)} className="accent-accent" />
            Apenas erros
          </label>
          <label className="flex items-center gap-2 text-xs text-fg-2 cursor-pointer select-none">
            <input type="checkbox" checked={hideRetries} onChange={e => setHideRetries(e.target.checked)} className="accent-accent" />
            Ocultar retentativas
          </label>
        </div>
        <button type="button" onClick={() => refetch()} className="text-xs text-accent hover:underline shrink-0">
          ↻ atualizar
        </button>
      </div>
      {isLoading ? (
        <p className="text-sm text-fg-3 p-6 text-center">Carregando...</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-fg-3 p-6 text-center">Nenhum log de LLM.</p>
      ) : (
        <div className="overflow-x-auto w-full">
          <table className="w-full text-sm min-w-[920px]">
            <thead>
              <tr className="border-b border-border bg-surface-2">
                <th className="text-left px-3 py-2.5 text-[11px] text-fg-2 font-semibold uppercase tracking-wide">Quando</th>
                <th className="text-left px-3 py-2.5 text-[11px] text-fg-2 font-semibold uppercase tracking-wide">Operação</th>
                <th className="text-left px-3 py-2.5 text-[11px] text-fg-2 font-semibold uppercase tracking-wide">Modelo</th>
                <th className="text-right px-3 py-2.5 text-[11px] text-fg-2 font-semibold uppercase tracking-wide whitespace-nowrap">USD</th>
                <th className="text-left px-3 py-2.5 text-[11px] text-fg-2 font-semibold uppercase tracking-wide">Enviado</th>
                <th className="text-left px-3 py-2.5 text-[11px] text-fg-2 font-semibold uppercase tracking-wide">Recebido</th>
                <th className="text-right px-3 py-2.5 text-[11px] text-fg-2 font-semibold uppercase tracking-wide">Tok</th>
                <th className="text-right px-3 py-2.5 text-[11px] text-fg-2 font-semibold uppercase tracking-wide">Δt</th>
                <th className="text-left px-3 py-2.5 text-[11px] text-fg-2 font-semibold uppercase tracking-wide">Estado</th>
              </tr>
            </thead>
            <tbody>
              {groups.map(g => {
                const r = g.primary
                const isExpanded = expandedId === g.id
                const sentPrev = llmSnippet(r.prompt)
                const recvPrev = llmSnippet(r.response)
                const hasStoredPayload = r.prompt.trim().length > 0 || r.response.trim().length > 0
                const attemptCount = g.attempts.length
                const collapsedRetries = hideRetries && attemptCount > 1 && g.attempts.some(isLLMRetryFlavorRow)
                const isTransient = r.operation?.includes('_retry_transient') || r.status === 'rate_limited'
                const isRealError = r.error && !isTransient
                const showOp = collapsedRetries ? llmBaseOperation(r.operation) : r.operation

                return (
                  <React.Fragment key={g.id}>
                    <tr
                      className={`border-b border-border last:border-0 ${isRealError ? 'bg-danger/5' : isTransient ? 'opacity-80' : ''} cursor-pointer hover:bg-surface-2/80`}
                      onClick={() => setExpandedId(isExpanded ? null : g.id)}
                    >
                      <td className="px-3 py-2.5 text-[11px] text-fg-3 whitespace-nowrap align-top leading-snug">
                        <span className="text-fg-3 mr-0.5">{isExpanded ? '▼' : '▶'}</span>
                        {new Date(r.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' })}
                      </td>
                      <td className={`px-3 py-2.5 text-[11px] align-top leading-snug ${isTransient ? 'text-fg-3 italic' : 'text-fg'}`}>
                        <span className="line-clamp-2 break-all">{showOp}</span>
                        {collapsedRetries && (
                          <span className="mt-1 inline-flex items-center rounded-full border border-border bg-surface px-2 py-0.5 text-[10px] font-medium text-fg-2">
                            {attemptCount} tentativas
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-fg-2 font-mono align-top leading-snug">
                        <span className="line-clamp-3 break-all">{r.model || '—'}</span>
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-fg-2 font-mono text-right align-top whitespace-nowrap tabular-nums">
                        ${r.cost_usd.toFixed(4)}
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-fg align-top min-w-0">
                        <p className="line-clamp-2 whitespace-pre-wrap break-words" title={r.prompt.trim() || undefined}>
                          {sentPrev}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 text-[11px] align-top min-w-0">
                        <p
                          className={`line-clamp-2 whitespace-pre-wrap break-words ${isRealError ? 'text-danger' : 'text-fg'}`}
                          title={r.response.trim() || undefined}
                        >
                          {recvPrev}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-fg-2 font-mono text-right align-top whitespace-nowrap tabular-nums">
                        {r.tokens_in}→{r.tokens_out}
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-fg-3 font-mono text-right align-top whitespace-nowrap tabular-nums">
                        {r.latency_seconds != null ? `${r.latency_seconds.toFixed(2)}s` : '—'}
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        {isTransient ? (
                          <span className="text-[10px] px-1.5 py-0.5 bg-warning/15 text-warning rounded-md">{r.status || 'retry'}</span>
                        ) : r.error ? (
                          <span className="text-[10px] px-1.5 py-0.5 bg-danger/15 text-danger rounded-md font-medium">erro</span>
                        ) : r.cache_hit ? (
                          <span className="text-[10px] px-1.5 py-0.5 bg-accent/15 text-accent rounded-md">cache</span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 bg-success/15 text-success rounded-md">{r.status || 'ok'}</span>
                        )}
                      </td>
                    </tr>
                    {isRealError && r.error_msg && (
                      <tr className="bg-danger/5 border-b border-border last:border-0">
                        <td colSpan={colCount} className="px-4 py-2 text-xs font-mono text-danger break-all">
                          {r.error_msg}
                        </td>
                      </tr>
                    )}
                    {isTransient && r.error_msg && (
                      <tr className="border-b border-border last:border-0 opacity-60">
                        <td colSpan={colCount} className="px-4 py-1 text-[10px] font-mono text-fg-3 break-all">
                          {r.error_msg}
                        </td>
                      </tr>
                    )}
                    {isExpanded && (
                      <tr className="border-b border-border last:border-0 bg-surface-2/90">
                        <td colSpan={colCount} className="p-0">
                          <div
                            className="px-4 py-4 space-y-4"
                            onClick={e => e.stopPropagation()}
                            role="presentation"
                          >
                            {!hasStoredPayload && (
                              <p className="text-xs text-fg-3">
                                Nenhum texto de prompt/resposta foi gravado neste registro.
                              </p>
                            )}
                            {attemptCount > 1 && (
                              <details className="group rounded-lg border border-border bg-surface text-xs">
                                <summary className="cursor-pointer select-none px-3 py-2 font-medium text-fg-2 hover:bg-surface-2 rounded-lg">
                                  Histórico de tentativas ({attemptCount})
                                </summary>
                                <ul className="px-3 pb-3 pt-1 space-y-2 border-t border-border max-h-40 overflow-auto">
                                  {[...g.attempts]
                                    .sort(
                                      (a, b) =>
                                        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
                                    )
                                    .map(a => (
                                      <li
                                        key={a.id}
                                        className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] font-mono text-fg-3 border-b border-border/60 pb-2 last:border-0 last:pb-0"
                                      >
                                        <span className="text-fg-2 shrink-0">
                                          {new Date(a.created_at).toLocaleString('pt-BR', {
                                            dateStyle: 'short',
                                            timeStyle: 'medium',
                                          })}
                                        </span>
                                        <span className="text-fg shrink-0">{a.operation}</span>
                                        <span className={a.error ? 'text-danger' : 'text-fg-3'}>{a.status}</span>
                                        {a.error_msg && (
                                          <span className="text-danger break-all w-full">{a.error_msg}</span>
                                        )}
                                      </li>
                                    ))}
                                </ul>
                              </details>
                            )}
                            <div className="flex flex-col lg:flex-row gap-3 min-h-[min(70vh,520px)] max-h-[75vh]">
                              <div className="flex-1 min-w-0 min-h-0 flex flex-col rounded-lg border border-border bg-surface overflow-hidden">
                                <div className="shrink-0 px-3 py-2 border-b border-border bg-surface-2 text-[11px] font-semibold uppercase tracking-wide text-fg-2">
                                  Mensagem enviada
                                </div>
                                <pre className="flex-1 min-h-[220px] lg:min-h-0 overflow-auto p-3 text-xs font-mono text-fg whitespace-pre-wrap break-words leading-relaxed">
                                  {r.prompt.trim() ? r.prompt : '(vazio)'}
                                </pre>
                              </div>
                              <div className="flex-1 min-w-0 min-h-0 flex flex-col rounded-lg border border-border bg-surface overflow-hidden">
                                <div className="shrink-0 px-3 py-2 border-b border-border bg-surface-2 text-[11px] font-semibold uppercase tracking-wide text-fg-2">
                                  Mensagem recebida
                                </div>
                                <pre
                                  className={`flex-1 min-h-[220px] lg:min-h-0 overflow-auto p-3 text-xs font-mono whitespace-pre-wrap break-words leading-relaxed ${r.error ? 'text-danger' : 'text-fg'}`}
                                >
                                  {r.response.trim() ? r.response : '(vazio)'}
                                </pre>
                              </div>
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
        </div>
      )}
    </div>
  )
}
