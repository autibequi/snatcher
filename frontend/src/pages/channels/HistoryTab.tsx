import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Badge, Skeleton, TooltipIcon } from '../../components/ui'
import { apiClient } from '../../lib/apiClient'
import { tableContainer } from '../../lib/uiTokens'

// ── WhatsApp message preview ───────────────────────────────────────────────────
function WAMessagePreview({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <p className="text-xs text-center text-white/60 mb-3">Preview WhatsApp · clique fora para fechar</p>
        <div className="bg-[#0b141a] rounded-xl p-4 shadow-2xl">
          <div className="bg-[#005c4b] rounded-xl p-3 ml-auto max-w-[90%] shadow">
            <p className="text-sm text-white whitespace-pre-wrap break-words">{text || '...'}</p>
            <p className="text-xs text-green-300 mt-1.5 text-right opacity-60">agora</p>
          </div>
        </div>
      </div>
    </div>
  )
}

interface AutoMatchLog {
  id: number
  product_id: number
  channel_id: number
  dispatch_id: number
  score: number
  created_at: string
  product_name?: string
  channel_name?: string
  group_names?: string
}

function fmtScore(s: number): string {
  return s.toFixed(0)
}

const statusVariant: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
  delivered: 'success', sending: 'warning', failed: 'danger', pending: 'default', pending_approval: 'warning',
}

const NOT_SENT = new Set(['pending', 'pending_approval', 'queued'])

interface HistoryTabProps {
  channelId: string
}

export function HistoryTab({ channelId }: HistoryTabProps) {
  const id = channelId
  const [previewText, setPreviewText] = React.useState<string | null>(null)

  // Dispatches history
  const { data: entries = [], isLoading: entriesLoading } = useQuery({
    queryKey: ['channels', id, 'history'],
    queryFn: () => apiClient.get(`/api/channels/${id}/history`).then(r => Array.isArray(r.data) ? r.data : []).catch(() => []),
    staleTime: 30_000,
    refetchInterval: 15_000,
    enabled: !!id,
  })

  // Auto-match preview (próximos candidatos)
  const { data: channelPreview, isLoading: channelPreviewLoading } = useQuery<{
    items: { product_id: number; product_name: string; score: number; price: number; already_sent: boolean }[]
    threshold: number
    max_per_run: number
  }>({
    queryKey: ['automations', id, 'preview'],
    queryFn: () => apiClient.get(`/api/automations/${id}/preview`).then(r => r.data),
    staleTime: 30_000,
    enabled: !!id,
  })
  const previewItems = channelPreview?.items ?? []
  const queueItems = previewItems.filter(i => !i.already_sent)

  // Auto-match logs
  const { data: automationDetail, isLoading: automationDetailLoading } = useQuery<{ automation: any; logs: AutoMatchLog[] }>({
    queryKey: ['automations', id, 'detail'],
    queryFn: () => apiClient.get(`/api/automations/${id}`).then(r => r.data),
    staleTime: 30_000,
    enabled: !!id,
  })
  const monitorLogs = automationDetail?.logs ?? []

  const toSend = entries.filter((e: any) => NOT_SENT.has(e.status))
  const sent = entries.filter((e: any) => !NOT_SENT.has(e.status))

  const renderDispatchRow = (e: any, i: number) => {
    let msgText = ''
    try { msgText = typeof e.message === 'string' ? JSON.parse(e.message)?.text ?? '' : e.message_text ?? '' } catch {}
    const groupName = e.group_name || `grupo #${e.group_id}`
    return (
      <tr
        key={`${e.dispatch_id}-${i}`}
        className="border-b border-border last:border-0 hover:bg-surface-2 cursor-pointer"
        onClick={() => setPreviewText(msgText)}
        title="Clique para ver preview WA"
      >
        <td className="px-4 py-2.5 text-fg max-w-xs">
          <p className="truncate text-xs">{msgText || `#${e.dispatch_id}`}</p>
        </td>
        <td className="px-4 py-2.5 text-fg-2 text-xs">{groupName}</td>
        <td className="px-4 py-2.5">
          <Badge variant={statusVariant[e.status] ?? 'default'} size="sm">{e.status}</Badge>
        </td>
        <td className="px-4 py-2.5 text-fg-3 text-xs text-right">
          {new Date(e.created_at).toLocaleString('pt-BR')}
        </td>
      </tr>
    )
  }

  return (
    <div className="space-y-5">
      {previewText !== null && <WAMessagePreview text={previewText} onClose={() => setPreviewText(null)} />}

      {/* Próximos candidatos (match preview) */}
      <div className="border border-border rounded-md overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border bg-surface-2 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-fg">
              Próximos candidatos · prévia do match
              {channelPreview && (
                <span className="ml-1 text-xs text-fg-3 font-normal">
                  (score ≥ {channelPreview.threshold} · max {channelPreview.max_per_run}/ciclo)
                </span>
              )}
            </p>
            <p className="text-xs text-fg-3">
              Candidatos elegíveis para o próximo ciclo de auto-match — não é a fila WA/TG.
            </p>
          </div>
        </div>
        {channelPreviewLoading ? (
          <div className="space-y-2 p-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-8 w-full" />)}</div>
        ) : queueItems.length === 0 ? (
          <p className="px-4 py-4 text-sm text-fg-3">Nenhum candidato elegível na prévia agora.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[420px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-2 text-xs text-fg-2 font-medium">Produto</th>
                  <th className="text-left px-4 py-2 text-xs text-fg-2 font-medium">
                    <span className="flex items-center gap-1">
                      Score <TooltipIcon content="Afinidade produto-canal (0–100)." side="bottom" />
                    </span>
                  </th>
                  <th className="text-left px-4 py-2 text-xs text-fg-2 font-medium">Preço</th>
                </tr>
              </thead>
              <tbody>
                {queueItems.slice(0, 10).map(item => (
                  <tr key={item.product_id} className="border-b border-border last:border-0 hover:bg-surface-2">
                    <td className="px-4 py-2.5 text-xs text-fg truncate max-w-xs">{item.product_name}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs font-semibold ${item.score >= 70 ? 'text-success' : 'text-warning'}`}>
                        {item.score.toFixed(0)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-fg-2">
                      {item.price > 0 ? `R$ ${item.price.toFixed(2)}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Auto-match log */}
      <div className="border border-border rounded-md overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border bg-surface-2">
          <p className="text-sm font-medium text-fg">Últimos disparos automáticos (auto-match)</p>
        </div>
        {automationDetailLoading ? (
          <div className="space-y-2 p-4">{[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-8 w-full" />)}</div>
        ) : monitorLogs.length === 0 ? (
          <p className="px-4 py-4 text-sm text-fg-3">Nenhum disparo automático registrado para este canal.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead>
                <tr className="bg-surface-2 border-b border-border">
                  <th className="text-left px-3 py-2 text-xs text-fg-2 font-medium">Produto</th>
                  <th className="text-left px-3 py-2 text-xs text-fg-2 font-medium">Grupos</th>
                  <th className="text-left px-3 py-2 text-xs text-fg-2 font-medium">
                    <span className="flex items-center gap-1">
                      Score <TooltipIcon content="Afinidade produto-canal (0–100)." side="bottom" />
                    </span>
                  </th>
                  <th className="text-left px-3 py-2 text-xs text-fg-2 font-medium">Hora</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {monitorLogs.map((log: AutoMatchLog) => (
                  <tr key={log.id} className="border-b border-border last:border-0 hover:bg-surface-2">
                    <td className="px-3 py-2">
                      <p className="text-xs text-fg truncate max-w-[160px]">{log.product_name || `#${log.product_id}`}</p>
                    </td>
                    <td className="px-3 py-2 max-w-[200px]">
                      {log.group_names ? (
                        <div className="flex flex-wrap gap-1">
                          {log.group_names.split(', ').map(g => (
                            <span
                              key={g}
                              className="text-[10px] bg-surface-2 border border-border rounded px-1.5 py-0.5 text-fg-2 truncate max-w-[96px]"
                              title={g}
                            >
                              {g}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-fg-3">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`text-xs font-semibold ${log.score >= 70 ? 'text-success' : log.score >= 50 ? 'text-warning' : 'text-fg-2'}`}>
                        {fmtScore(log.score)}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-xs text-fg-3">
                        {new Date(log.created_at).toLocaleString('pt-BR')}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <a href={`/dispatches/${log.dispatch_id}`} className="text-xs text-accent hover:underline">
                        ver →
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Enviados (fila WA/TG) */}
      {toSend.length > 0 && (
        <div className="border border-warning/40 rounded-md overflow-hidden">
          <div className="px-4 py-2.5 border-b border-warning/30 bg-warning/5 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-fg">A enviar · na fila de entrega ({toSend.length})</p>
              <p className="text-[10px] text-fg-3">
                {toSend.some((e: any) => e.status === 'pending_approval')
                  ? 'Alguns aguardam aprovação — clique "Aprovar" para enviar'
                  : 'Na fila do worker de entrega WA/TG — enviando automaticamente'}
              </p>
            </div>
            <a href="/automations" className="text-xs text-accent hover:underline">Aprovar em Auto disparos →</a>
          </div>
          {entriesLoading ? (
            <div className="space-y-2 p-4">{[1, 2].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-2 border-b border-border">
                    <th className="text-left px-4 py-2 text-xs text-fg-2 font-medium">Mensagem</th>
                    <th className="text-left px-4 py-2 text-xs text-fg-2 font-medium">Grupo</th>
                    <th className="text-left px-4 py-2 text-xs text-fg-2 font-medium">Status</th>
                    <th className="text-right px-4 py-2 text-xs text-fg-2 font-medium">Data</th>
                  </tr>
                </thead>
                <tbody>{toSend.map(renderDispatchRow)}</tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Já enviados */}
      <div className="border border-border rounded-md overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border bg-surface-2 flex items-center justify-between">
          <p className="text-sm font-medium text-fg">Já enviados</p>
          <Link
            to={`/activity?dispatchChannel=${id}`}
            className="text-xs text-accent hover:underline"
          >
            Ver todos em Atividade →
          </Link>
        </div>
        {entriesLoading ? (
          <div className="space-y-2 p-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : sent.length === 0 ? (
          <p className="px-4 py-4 text-sm text-fg-3">Nenhum disparo enviado ainda.</p>
        ) : (
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-2 border-b border-border sticky top-0">
                  <th className="text-left px-4 py-2 text-xs text-fg-2 font-medium">Mensagem</th>
                  <th className="text-left px-4 py-2 text-xs text-fg-2 font-medium">Grupo</th>
                  <th className="text-left px-4 py-2 text-xs text-fg-2 font-medium">Status</th>
                  <th className="text-right px-4 py-2 text-xs text-fg-2 font-medium">Data</th>
                </tr>
              </thead>
              <tbody>{sent.map(renderDispatchRow)}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
