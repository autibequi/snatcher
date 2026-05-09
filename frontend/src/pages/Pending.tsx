import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '../components/ui'
import { apiClient } from '../lib/apiClient'

interface PendingDispatch {
  id: number
  status: string
  composed_by: string
  affiliate_link: string
  channel_id?: number
  channel_name?: string
  product_name?: string
  product_image?: string
  price?: number
  source?: string
  brand?: string
  score?: number
  message_text: string
  created_at: string
}

interface SendQueueRow extends PendingDispatch {
  pending_targets?: number
}

interface PreviewItem {
  product_id: number
  channel_id: number
  product_name: string
  channel_name: string
  score: number
  already_sent: boolean
}

function relTime(s: string): string {
  const m = Math.floor((Date.now() - new Date(s).getTime()) / 60000)
  if (m < 1) return 'agora'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

export default function Pending() {
  const qc = useQueryClient()
  const [selected, setSelected] = React.useState<Set<number>>(new Set())

  const { data: items = [], isLoading } = useQuery<PendingDispatch[]>({
    queryKey: ['dispatches', 'pending-approval'],
    queryFn: () => apiClient.get('/api/dispatches/pending-approval').then(r => Array.isArray(r.data) ? r.data : []).catch(() => []),
    refetchInterval: 15_000,
  })

  const { data: sendQueue = [], isLoading: loadQueue } = useQuery<SendQueueRow[]>({
    queryKey: ['dispatches', 'send-queue'],
    queryFn: () => apiClient.get('/api/dispatches/send-queue').then(r => Array.isArray(r.data) ? r.data : []).catch(() => []),
    refetchInterval: 10_000,
  })

  const { data: nextCyclePreview } = useQuery<{
    items: PreviewItem[]
    auto_match_master_enabled?: boolean
  }>({
    queryKey: ['auto-match', 'preview'],
    queryFn: () => apiClient.get('/api/auto-match/preview').then(r => r.data).catch(() => ({ items: [] })),
    refetchInterval: 60_000,
  })
  const previewCandidates = React.useMemo(
    () => (nextCyclePreview?.items ?? []).filter(i => !i.already_sent).slice(0, 30),
    [nextCyclePreview],
  )

  const { data: appConfig } = useQuery<any>({
    queryKey: ['config'],
    queryFn: () => apiClient.get('/api/config').then(r => r.data).catch(() => ({})),
  })
  const fullAutoMode = !!appConfig?.full_auto_mode

  const toggleFullAuto = useMutation({
    mutationFn: async (v: boolean) => {
      // Tenta direto via PUT config (precisa do fix do UpdateConfig)
      try { await apiClient.put('/api/config', { ...appConfig, full_auto_mode: v }) } catch {}
      // Fallback robusto: se ligando, dispara a action Jonfrey enable_full_auto
      if (v) { try { await apiClient.post('/api/jonfrey/run', { action_type: 'enable_full_auto' }) } catch {} }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config'] }),
  })

  // Ordenação
  type SortKey = 'channel'|'source'|'price'|'score'|'created_at'
  const [sortKey, setSortKey] = React.useState<SortKey>('created_at')
  const [sortDir, setSortDir] = React.useState<'asc'|'desc'>('desc')
  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(k); setSortDir(k === 'created_at' ? 'desc' : 'asc') }
  }

  const approveBatchMut = useMutation({
    mutationFn: async (ids: number[]) => {
      // Tenta o endpoint batch (mais rápido) — fallback para per-id em paralelo se 404
      try {
        return await apiClient.post('/api/dispatches/approve-batch', { ids })
      } catch (err: any) {
        if (err?.response?.status === 404) {
          await Promise.allSettled(ids.map(id => apiClient.post(`/api/dispatches/${id}/approve`)))
          return { data: { approved: ids.length } }
        }
        throw err
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dispatches', 'pending-approval'] })
      qc.invalidateQueries({ queryKey: ['dispatches', 'send-queue'] })
      setSelected(new Set())
    },
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Erro ao aprovar'),
  })

  const approveAllMut = useMutation({
    mutationFn: () => apiClient.post('/api/dispatches/approve-all'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dispatches', 'pending-approval'] })
      qc.invalidateQueries({ queryKey: ['dispatches', 'send-queue'] })
      setSelected(new Set())
    },
  })

  const rejectMut = useMutation({
    mutationFn: (id: number) => apiClient.post(`/api/dispatches/${id}/reject`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dispatches', 'pending-approval'] }),
  })

  const rejectBatchMut = useMutation({
    mutationFn: async (ids: number[]) => {
      await Promise.allSettled(ids.map(id => apiClient.post(`/api/dispatches/${id}/reject`)))
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dispatches', 'pending-approval'] })
      setSelected(new Set())
    },
  })

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  const toggleAll = () => {
    if (selected.size === items.length) setSelected(new Set())
    else setSelected(new Set(items.map(i => i.id)))
  }

  const SOURCE_LABEL: Record<string, string> = {
    amz: 'Amazon', amazon: 'Amazon',
    ml: 'Mercado Livre', mercadolivre: 'Mercado Livre',
    magalu: 'Magalu', shopee: 'Shopee', aliexpress: 'AliExpress',
    casasbahia: 'Casas Bahia', kabum: 'Kabum', americanas: 'Americanas',
  }

  // Sort items
  const sortedItems = React.useMemo(() => {
    const sorted = [...items]
    sorted.sort((a, b) => {
      let av: any, bv: any
      switch (sortKey) {
        case 'channel': av = a.channel_name ?? ''; bv = b.channel_name ?? ''; break
        case 'source': av = a.source ?? ''; bv = b.source ?? ''; break
        case 'price': av = a.price ?? 0; bv = b.price ?? 0; break
        case 'score': av = a.score ?? 0; bv = b.score ?? 0; break
        case 'created_at': av = new Date(a.created_at).getTime(); bv = new Date(b.created_at).getTime(); break
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return sorted
  }, [items, sortKey, sortDir])

  const SortHeader = ({ k, label, align }: { k: SortKey; label: string; align?: string }) => (
    <th className={`px-3 py-2.5 text-xs font-medium text-fg-2 uppercase tracking-wide cursor-pointer select-none hover:text-fg ${align ?? 'text-left'}`}
      onClick={() => toggleSort(k)}>
      {label}{sortKey === k ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
    </th>
  )

  return (
    <div className="p-6 space-y-4">
      {/* Header + ações */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-fg">Pendentes de envio</h1>
          <p className="text-sm text-fg-3">
            <strong className="text-fg-2">Fila WA</strong> = dispatches <code className="text-xs bg-surface-2 px-1 rounded">queued</code> aguardando o worker Evolution (~15s).
            <strong className="text-fg-2"> Auto-match</strong> (quem cria esses dispatches) roda <strong className="text-fg-2">a cada 1 min</strong> se estiver ligado em Config — não confundir com o intervalo do Jonfrey (manutenção / <code className="text-xs bg-surface-2 px-1">auto_release_pending</code>).
            <strong className="text-fg-2"> Prévia</strong> = candidatos por score; <strong className="text-fg-2">aprovação manual</strong> = <code className="text-xs bg-surface-2 px-1 rounded">pending_approval</code> só sem full-auto.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
          {selected.size > 0 && (
            <>
              <Button variant="primary" size="sm"
                loading={approveBatchMut.isPending}
                onClick={() => approveBatchMut.mutate(Array.from(selected))}>
                ✓ Aprovar {selected.size}
              </Button>
              <Button variant="danger" size="sm"
                loading={rejectBatchMut.isPending}
                onClick={() => { if (confirm(`Rejeitar ${selected.size} dispatches selecionados?`)) rejectBatchMut.mutate(Array.from(selected)) }}>
                ✕ Rejeitar {selected.size}
              </Button>
            </>
          )}
          {items.length > 0 && (
            <>
              <Button variant="secondary" size="sm"
                loading={approveAllMut.isPending}
                onClick={() => { if (confirm(`Aprovar TODOS os ${items.length} pendentes?`)) approveAllMut.mutate() }}>
                Aprovar todos ({items.length})
              </Button>
              <Button variant="secondary" size="sm"
                loading={rejectBatchMut.isPending}
                onClick={() => { if (confirm(`Rejeitar TODOS os ${items.length} pendentes?`)) rejectBatchMut.mutate(items.map(i => i.id)) }}>
                Rejeitar todos
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Fila do WhatsApp — queued/sending */}
      <div className="border border-border rounded-md overflow-hidden bg-surface">
        <div className="px-4 py-3 border-b border-border bg-surface-2/50">
          <p className="text-sm font-medium text-fg">Na fila do WhatsApp (próximo envio)</p>
          <p className="text-xs text-fg-3 mt-0.5">
            Status <code className="text-[10px]">queued</code>/<code className="text-[10px]">sending</code> com targets pendentes — ordem FIFO.
            Se ficar parado: conferir Evolution (URL/chave/instância), JID dos grupos e rate limit (3 msg/grupo/h).
          </p>
        </div>
        {loadQueue ? (
          <p className="px-4 py-8 text-sm text-fg-3 text-center">Carregando fila…</p>
        ) : sendQueue.length === 0 ? (
          <div className="px-4 py-8 text-sm text-fg-3 text-center space-y-2">
            <p>Nenhum dispatch na fila do worker.</p>
            <p className="text-xs max-w-md mx-auto">
              Se a prévia mostra candidatos mas aqui continua vazio: cooldown por canal, <code className="text-[10px]">max_per_run</code> no último ciclo,
              fila dos grupos cheia (backpressure), ou produto <strong className="text-fg-2">sem URL de oferta</strong> (<code className="text-[10px]">lowest_price_url</code>) — o worker não cria dispatch sem link.
              Confira também se o <strong className="text-fg-2">auto-match global</strong> está ligado em Automations.
              O ciclo percorre só os 100 produtos ativos mais recentes e prioriza por score (como a prévia).
            </p>
          </div>
        ) : (
          <div className="max-h-[360px] overflow-y-auto divide-y divide-border">
            {sendQueue.map(row => (
              <div key={row.id} className="px-4 py-2.5 flex items-start gap-3 hover:bg-surface-2/30">
                <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded shrink-0 ${row.status === 'sending' ? 'bg-accent/15 text-accent' : 'bg-warning/10 text-warning'}`}>
                  {row.status}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-fg truncate">{row.product_name || row.message_text?.slice(0, 80) || `Dispatch #${row.id}`}</p>
                  <p className="text-[10px] text-fg-3">
                    {row.channel_name ? `${row.channel_name} · ` : ''}
                    {row.pending_targets != null ? `${row.pending_targets} grupos pendentes` : '—'}
                    {' · '}
                    <a href={`/logs?dispatchId=${row.id}`} className="text-accent hover:underline">logs</a>
                  </p>
                </div>
                <span className="text-[10px] text-fg-3 shrink-0">{relTime(row.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Próximo ciclo auto-match (prévia) */}
      <div className="border border-border rounded-md overflow-hidden bg-surface">
        <div className="px-4 py-3 border-b border-border bg-surface-2/50 flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-fg">Próximos candidatos (prévia do próximo ciclo)</p>
            <p className="text-xs text-fg-3 mt-0.5">
              Ordenado por score (como na Automations). Criar dispatch na base é o job <strong className="text-fg-2">auto-match a cada 1 min</strong>; esta lista não reflete o horário do Jonfrey.
            </p>
          </div>
          <a href="/automations" className="text-xs text-accent hover:underline whitespace-nowrap">Automations →</a>
        </div>
        {nextCyclePreview?.auto_match_master_enabled === false ? (
          <div className="px-4 py-8 text-sm text-center space-y-2">
            <p className="text-warning font-medium">Auto-match global desligado</p>
            <p className="text-xs text-fg-3 max-w-md mx-auto">
              O toggle «Auto-pilot» / auto-match em Config está off — o worker não roda e a prévia fica vazia.
              Ative em <a href="/automations" className="text-accent hover:underline">Automations</a> para voltar a gerar dispatches.
            </p>
          </div>
        ) : previewCandidates.length === 0 ? (
          <p className="px-4 py-8 text-sm text-fg-3 text-center">
            Nenhum candidato elegível na prévia (canais pausados, filtros, já enviados, ou produto sem URL de oferta para afiliado).
          </p>
        ) : (
          <div className="max-h-[280px] overflow-y-auto divide-y divide-border">
            {previewCandidates.map(p => (
              <div key={`${p.channel_id}-${p.product_id}`} className="px-4 py-2 flex items-center gap-3">
                <span className={`text-xs font-semibold px-1.5 py-0.5 rounded shrink-0 ${p.score >= 70 ? 'bg-success/10 text-success' : 'bg-surface-2 text-fg-3'}`}>
                  {p.score.toFixed(0)}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-fg truncate">{p.product_name}</p>
                  <p className="text-[10px] text-fg-3 truncate">{p.channel_name}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Painel de modo: toggle Full-auto sincronizado */}
      <div className={`flex items-start gap-3 border rounded-md p-3 ${fullAutoMode ? 'border-success/40 bg-success/5' : 'border-warning/40 bg-warning/5'}`}>
        <span className="text-base leading-none mt-0.5">{fullAutoMode ? '✅' : '⚠️'}</span>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold ${fullAutoMode ? 'text-success' : 'text-fg'}`}>
            {fullAutoMode ? 'Full-auto ativo — envio automático sem aprovação' : 'Modo manual ativo — aprovação humana necessária'}
          </p>
          <p className="text-xs text-fg-3 mt-0.5">
            {fullAutoMode
              ? 'Todo dispatch novo nasce já liberado e vai para a fila do WhatsApp (bloco acima); o Evolution envia em seguida. O Jonfrey não «esvazia» esta fila — só jobs de manutenção (ex.: auto_release_pending).'
              : 'Disparos novos vão se acumular aqui. Aprove manualmente ou ative o Full-auto para auto-aprovação contínua.'}
          </p>
        </div>
        <button type="button"
          disabled={toggleFullAuto.isPending}
          onClick={() => toggleFullAuto.mutate(!fullAutoMode)}
          className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 mt-0.5 ${fullAutoMode ? 'bg-success' : 'bg-border'} disabled:opacity-50`}>
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${fullAutoMode ? 'translate-x-5' : 'translate-x-0'}`} />
        </button>
      </div>


      {/* Tabela — aprovação manual */}
      <div className="border-b border-border pb-2">
        <p className="text-sm font-medium text-fg">Aguardando aprovação manual</p>
        <p className="text-xs text-fg-3">Só quando full-auto está desligado — caso contrário esta lista tende a ficar vazia.</p>
      </div>
      {isLoading ? (
        <p className="text-sm text-fg-3">Carregando…</p>
      ) : items.length === 0 ? (
        <div className="border border-border rounded-md p-12 text-center bg-surface space-y-2">
          <p className="text-3xl mb-2">✨</p>
          <p className="text-sm text-fg">Sem dispatches em pending_approval</p>
          <p className="text-xs text-fg-3 mt-1 max-w-md mx-auto">
            {fullAutoMode
              ? 'Com full-auto, novos disparos vão direto para a fila do WhatsApp (bloco acima). Use a prévia para ver candidatos do próximo ciclo.'
              : 'Ative aprovações pendentes aqui ou ligue full-auto para liberar automaticamente.'}
          </p>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-2 border-b border-border">
                <th className="w-10 px-3 py-2.5">
                  <input type="checkbox"
                    checked={selected.size === items.length && items.length > 0}
                    onChange={toggleAll}
                    className="accent-accent" />
                </th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-fg-2 uppercase tracking-wide">Produto</th>
                <SortHeader k="channel" label="Canal" />
                <SortHeader k="source" label="Loja" />
                <SortHeader k="price" label="Preço" align="text-right" />
                <SortHeader k="score" label="Score" align="text-center" />
                <SortHeader k="created_at" label="Quando" align="text-right" />
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {sortedItems.map(d => {
                const isSelected = selected.has(d.id)
                return (
                  <tr key={d.id}
                    className={`border-b border-border last:border-0 hover:bg-surface-2 cursor-pointer ${isSelected ? 'bg-accent/5' : ''}`}
                    onClick={() => toggleSelect(d.id)}>
                    <td className="px-3 py-2.5">
                      <input type="checkbox" checked={isSelected}
                        onChange={() => toggleSelect(d.id)}
                        onClick={e => e.stopPropagation()}
                        className="accent-accent" />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        {d.product_image && (
                          <img src={d.product_image} alt="" className="w-10 h-10 object-cover rounded border border-border flex-shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className="text-xs text-fg truncate max-w-[280px]" title={d.product_name ?? ''}>
                            {d.product_name || `Dispatch #${d.id}`}
                          </p>
                          {d.brand && <p className="text-[10px] text-fg-3">{d.brand}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-fg-2">{d.channel_name ?? '—'}</td>
                    <td className="px-3 py-2.5 text-xs text-fg-2">{d.source ? (SOURCE_LABEL[d.source] ?? d.source) : '—'}</td>
                    <td className="px-3 py-2.5 text-right text-xs text-fg whitespace-nowrap">
                      {d.price && d.price > 0 ? `R$ ${d.price.toFixed(2)}` : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {d.score != null ? (
                        <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${d.score >= 70 ? 'bg-success/10 text-success' : d.score >= 50 ? 'bg-warning/10 text-warning' : 'bg-surface-2 text-fg-3'}`}>
                          {d.score.toFixed(0)}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs text-fg-3 whitespace-nowrap">{relTime(d.created_at)}</td>
                    <td className="px-3 py-2.5 text-right" onClick={e => e.stopPropagation()}>
                      <button type="button"
                        title="Rejeitar este dispatch"
                        disabled={rejectMut.isPending}
                        onClick={() => { if (confirm('Rejeitar este dispatch?')) rejectMut.mutate(d.id) }}
                        className="text-xs px-2 py-1 rounded border border-danger/30 text-danger hover:bg-danger/10 transition-colors disabled:opacity-50">
                        ✕ Rejeitar
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
