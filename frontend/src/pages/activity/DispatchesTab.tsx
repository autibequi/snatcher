import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, EmptyState, Skeleton, Tooltip } from '../../components/ui'
import { apiClient } from '../../lib/apiClient'
import { dispatchOriginLabel } from '../../lib/dispatchOrigin'
import { useWSEvent } from '../../lib/useWS'
import { tableContainer, tableRow } from '../../lib/uiTokens'
import { MessagePreview } from '../../components/MessagePreview'

// ── Dispatch status tooltips ──────────────────────────────────────────────────

const DISPATCH_STATUS_TOOLTIP: Record<string, string> = {
  draft: 'Rascunho — salvo mas não enviado. Aguarda edição e disparo manual.',
  queued: 'Na fila — agendado para envio. O sistema vai processar em breve.',
  pending_approval:
    'Aguardando aprovação — full_auto_mode está desligado. Clique em Aprovar pra liberar.',
  scheduled: 'Agendado — será disparado no horário configurado.',
  sending: 'Enviando — processo de entrega em andamento para os grupos alvo.',
  completed: 'Concluído — todos os grupos receberam a mensagem com sucesso.',
  failed: 'Falhou — um ou mais grupos não receberam. Veja esta aba com filtro Falhou.',
  cancelled: 'Cancelado — disparo interrompido manualmente antes da entrega.',
}
import { useNavigate } from 'react-router-dom'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Dispatch {
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
  channel_name?: string
  group_name?: string
}

type LogType = 'dispatch' | 'scheduled'

const statusVariant: Record<string, 'default' | 'success' | 'warning' | 'danger'> = {
  completed: 'success',
  queued: 'warning',
  sending: 'warning',
  failed: 'danger',
  draft: 'default',
  pending: 'warning',
  pending_approval: 'warning',
  cancelled: 'default',
  scheduled: 'warning',
}

// ── Sub-components ────────────────────────────────────────────────────────────

function DispatchOriginBadge({ composedBy }: { composedBy?: string }) {
  const v = (composedBy ?? '').trim()
  if (!v) {
    return (
      <Tooltip
        content="Sem campo composed_by no servidor — disparo antigo ou migração incompleta."
        side="top"
      >
        <span className="text-fg-3 text-xs">—</span>
      </Tooltip>
    )
  }
  const label = dispatchOriginLabel(composedBy)
  let variant: 'default' | 'success' | 'warning' | 'danger' | 'accent' | 'outline' = 'default'
  if (v === 'auto-match' || v === 'auto') variant = 'success'
  else if (v === 'manual') variant = 'warning'
  else if (v === 'scheduled-ad') variant = 'accent'
  else if (v === 'api') variant = 'outline'
  return (
    <Tooltip content={`Origem do disparo (composed_by: ${v})`} side="top">
      <Badge variant={variant} size="sm">
        {label}
      </Badge>
    </Tooltip>
  )
}

function TypeBadge({ type }: { type: LogType }) {
  if (type === 'scheduled') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded-sm bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
        <span aria-hidden>●</span> Agenda
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded-sm bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400">
      <span aria-hidden>●</span> Disparo
    </span>
  )
}

// ── DispatchDrawer ────────────────────────────────────────────────────────────

function DispatchDrawer({ dispatch, onClose }: { dispatch: Dispatch; onClose: () => void }) {
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const { data: detail } = useQuery({
    queryKey: ['dispatch-detail', dispatch.id],
    queryFn: () =>
      apiClient.get(`/api/dispatches/${dispatch.id}`).then(r => r.data).catch(() => null),
    enabled: !!dispatch.id,
  })

  const targets: Array<{ id: number; group_id: number; status: string; error_reason?: string; attempted_at?: string }> =
    (detail as { targets?: typeof targets } | null)?.targets ?? []
  const failedTargets = targets.filter(t => t.status === 'failed' && t.error_reason)
  const deliveredTargets = targets.filter(t => t.status === 'delivered')

  const diagnoseMut = useMutation({
    mutationFn: () =>
      apiClient
        .post(`/api/dispatches/${dispatch.id}/diagnose`)
        .then(r => r.data as { likely_cause?: string; diagnosis?: string; is_transient?: boolean; actions?: string[] }),
  })

  return (
    <div className="fixed inset-0 z-40 flex" role="dialog" aria-modal="true">
      <div className="flex-1 bg-black/40" onClick={onClose} aria-label="Fechar painel" />
      <div className="w-full max-w-md bg-surface border-l border-border h-full overflow-y-auto p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-fg">
            Disparo {dispatch.short_id ?? `#${dispatch.id}`}
          </h2>
          <button type="button" onClick={onClose} className="text-fg-3 hover:text-fg text-lg leading-none" aria-label="Fechar">
            x
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Tooltip content={DISPATCH_STATUS_TOOLTIP[dispatch.status] ?? dispatch.status} side="right">
            <Badge variant={statusVariant[dispatch.status] ?? 'default'}>{dispatch.status}</Badge>
          </Tooltip>
          <span className="text-xs text-fg-3">
            {new Date(dispatch.created_at).toLocaleString('pt-BR')}
          </span>
        </div>

        <div>
          <p className="text-xs text-fg-3 mb-1">Origem</p>
          <div className="flex flex-wrap items-center gap-2">
            <DispatchOriginBadge composedBy={dispatch.composed_by} />
            {dispatch.composed_by && (
              <span className="text-[10px] text-fg-3 font-mono">composed_by={dispatch.composed_by}</span>
            )}
          </div>
        </div>

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
              <p className={`text-lg font-semibold ${deliveredTargets.length > 0 ? 'text-success' : 'text-fg'}`}>
                {deliveredTargets.length}
              </p>
            </div>
            <div className="bg-surface-2 rounded-md p-3">
              <p className="text-xs text-fg-3">Falharam</p>
              <p className={`text-lg font-semibold ${failedTargets.length > 0 ? 'text-danger' : 'text-fg'}`}>
                {failedTargets.length}
              </p>
            </div>
          </div>
        )}

        {failedTargets.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-fg-3 font-medium">Erros de envio</p>
              <button
                type="button"
                disabled={diagnoseMut.isPending}
                onClick={() => diagnoseMut.mutate()}
                className="text-xs border border-border rounded px-2 py-1 text-accent hover:bg-accent/5 disabled:opacity-50"
              >
                {diagnoseMut.isPending ? 'Analisando...' : 'Diagnosticar'}
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
                    {diagnoseMut.data.is_transient
                      ? 'Falha transiente — retry pode resolver'
                      : 'Falha estrutural — requer intervenção'}
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
                Erro ao diagnosticar:{' '}
                {(diagnoseMut.error as { response?: { data?: { error?: string } } } | null)?.response?.data?.error ?? 'falha desconhecida'}
              </p>
            )}
            <div className="space-y-2">
              {failedTargets.map(t => (
                <div key={t.id} className="bg-danger/5 border border-danger/20 rounded-md p-3">
                  <p className="text-xs font-medium text-danger mb-1">
                    Grupo #{t.group_id}
                    {t.attempted_at && (
                      <span className="text-fg-3 font-normal ml-2">
                        {new Date(t.attempted_at).toLocaleString('pt-BR')}
                      </span>
                    )}
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

        {(dispatch.message?.text || dispatch.message?.media_url) && (
          <div>
            <p className="text-xs text-fg-3 mb-2">Preview WhatsApp</p>
            <MessagePreview
              text={dispatch.message?.text}
              mediaUrl={dispatch.message?.media_url}
              variant="card"
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface DispatchesTabProps {
  status?: string
  dateFrom?: string
  dateTo?: string
  accountId?: string
  q?: string
  /** If set, open this dispatch ID in the drawer on mount */
  openDispatchId?: number
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DispatchesTab({
  status = '',
  dateFrom = '',
  dateTo = '',
  accountId = '',
  q = '',
  openDispatchId,
}: DispatchesTabProps) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [selected, setSelected] = React.useState<Dispatch | null>(null)
  const [items, setItems] = React.useState<Dispatch[]>([])

  // Load dispatch from URL param if provided
  const { data: dispatchFromUrl } = useQuery({
    queryKey: ['dispatch-open-from-url', openDispatchId],
    queryFn: () =>
      apiClient.get(`/api/dispatches/${openDispatchId!}`).then(r => r.data as Dispatch),
    enabled: openDispatchId != null && openDispatchId > 0,
    retry: false,
  })

  React.useEffect(() => {
    if (!openDispatchId || !dispatchFromUrl?.id) return
    setSelected(dispatchFromUrl)
  }, [openDispatchId, dispatchFromUrl])

  const { isLoading } = useQuery<Dispatch[]>({
    queryKey: ['dispatches', status, dateFrom, dateTo, accountId],
    queryFn: () => {
      const qp = new URLSearchParams()
      if (status) qp.set('status', status)
      if (dateFrom) qp.set('date_from', dateFrom)
      if (dateTo) qp.set('date_to', dateTo)
      if (accountId) qp.set('account_id', accountId)
      return apiClient
        .get(`/api/dispatches${qp.toString() ? `?${qp}` : ''}`)
        .then(r => {
          const data = Array.isArray(r.data) ? r.data : []
          setItems(data)
          return data
        })
    },
    refetchInterval: 30_000,
  })

  // WS: real-time updates
  useWSEvent('dispatch.target_updated', (data: { dispatchId: number }) => {
    setItems(prev => prev.map(d => (d.id === data.dispatchId ? { ...d, status: 'sending' } : d)))
    setSelected(prev => (prev?.id === data.dispatchId ? { ...prev, status: 'sending' } : prev))
  })
  useWSEvent('dispatch.completed', (data: { dispatchId: number }) => {
    setItems(prev => prev.map(d => (d.id === data.dispatchId ? { ...d, status: 'completed' } : d)))
    setSelected(prev => (prev?.id === data.dispatchId ? { ...prev, status: 'completed' } : prev))
  })

  const expireStale = useMutation({
    mutationFn: () =>
      apiClient.post('/api/dispatches/expire-stale').then(r => r.data as { expired_targets: number }),
    onSuccess: data => {
      qc.invalidateQueries({ queryKey: ['dispatches'] })
      alert(`${data.expired_targets} targets expirados.`)
    },
  })

  const filtered = React.useMemo(() => {
    let result = [...items].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    if (q) {
      const lq = q.toLowerCase()
      result = result.filter(d => {
        const text = d.message?.text ?? ''
        const sid = String(d.short_id ?? d.id)
        const ch = d.channel_name ?? ''
        const gr = d.group_name ?? ''
        return (
          text.toLowerCase().includes(lq) ||
          sid.toLowerCase().includes(lq) ||
          ch.toLowerCase().includes(lq) ||
          gr.toLowerCase().includes(lq)
        )
      })
    }
    return result
  }, [items, q])

  return (
    <div>
      <div className="flex items-center justify-end mb-3">
        <Button
          variant="secondary"
          size="sm"
          loading={expireStale.isPending}
          onClick={() => {
            if (confirm('Marcar como "failed" todos os targets pending há mais de 2h?'))
              expireStale.mutate()
          }}
          title="Limpa targets presos em pending que nunca foram processados"
        >
          Expirar stale
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Nenhum disparo encontrado"
          description="Crie um disparo no Composer ou ajuste os filtros."
        />
      ) : (
        <div className={tableContainer}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2">
                <th className="text-left p-3 text-xs text-fg-2 font-medium uppercase tracking-wide">ID</th>
                <th className="text-left p-3 text-xs text-fg-2 font-medium uppercase tracking-wide">Tipo</th>
                <th className="text-left p-3 text-xs text-fg-2 font-medium uppercase tracking-wide">Origem</th>
                <th className="text-left p-3 text-xs text-fg-2 font-medium uppercase tracking-wide">Canal</th>
                <th className="text-left p-3 text-xs text-fg-2 font-medium uppercase tracking-wide">Grupo</th>
                <th className="text-left p-3 text-xs text-fg-2 font-medium uppercase tracking-wide">Status</th>
                <th className="text-left p-3 text-xs text-fg-2 font-medium uppercase tracking-wide hidden sm:table-cell">
                  Destinos
                </th>
                <th className="text-left p-3 text-xs text-fg-2 font-medium uppercase tracking-wide">Data</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(d => {
                const msgText = d.message?.text ?? ''
                const isDraft = d.status === 'draft'
                const isFailed = d.status === 'failed'
                const rowType: LogType = d.scheduled_for ? 'scheduled' : 'dispatch'
                return (
                  <tr
                    key={d.id}
                    className={`${tableRow} cursor-pointer ${isDraft ? 'opacity-80' : ''} ${isFailed ? 'bg-danger/5' : ''}`}
                    onClick={() =>
                      isDraft
                        ? navigate(`/compose?draftId=${d.id}${d.product_id ? `&productId=${d.product_id}` : ''}`)
                        : setSelected(d)
                    }
                    title={isDraft ? 'Clique para continuar editando este rascunho' : undefined}
                  >
                    <td className="p-3">
                      <div className="flex items-start gap-2">
                        {d.message?.media_url && (
                          <img
                            src={d.message.media_url}
                            alt=""
                            className="w-10 h-10 rounded object-cover flex-shrink-0 border border-border"
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                          />
                        )}
                        <div className="min-w-0">
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
                          {isDraft && (
                            <span className="text-xs text-accent mt-0.5 block">clique para continuar edição</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="p-3">
                      <TypeBadge type={rowType} />
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <DispatchOriginBadge composedBy={d.composed_by} />
                    </td>
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

      {selected && <DispatchDrawer dispatch={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
