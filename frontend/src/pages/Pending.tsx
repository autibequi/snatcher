import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, PageHeader } from '../components/ui'
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

interface PreviewItem {
  product_id: number
  channel_id: number
  product_name: string
  channel_name: string
  score: number
  already_sent: boolean
}

interface AutoMatchStatusLite {
  enabled: boolean
  threshold: number
  max_per_run: number
  last_run_at: string | null
  interval_seconds: number
}

function relTime(s: string): string {
  const m = Math.floor((Date.now() - new Date(s).getTime()) / 60000)
  if (m < 1) return 'agora'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

function fmtWhen(ts: number): string {
  return new Date(ts).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export default function Pending() {
  const qc = useQueryClient()
  const [selected, setSelected] = React.useState<Set<number>>(new Set())

  const { data: items = [], isLoading } = useQuery<PendingDispatch[]>({
    queryKey: ['dispatches', 'pending-approval'],
    queryFn: () => apiClient.get('/api/dispatches/pending-approval').then(r => Array.isArray(r.data) ? r.data : []).catch(() => []),
    refetchInterval: 15_000,
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

  const { data: amStatus } = useQuery<AutoMatchStatusLite>({
    queryKey: ['auto-match'],
    queryFn: () => apiClient.get('/api/auto-match').then(r => r.data),
    refetchInterval: 30_000,
    staleTime: 15_000,
  })

  const { data: jonfreyConfig } = useQuery<{
    enabled: boolean
    interval_minutes: number
    last_run_at?: string | null
  }>({
    queryKey: ['jonfrey-config'],
    queryFn: () => apiClient.get('/api/jonfrey/config').then(r => r.data).catch(() => ({ enabled: false, interval_minutes: 60 })),
    refetchInterval: 30_000,
  })

  const { data: appConfig } = useQuery<any>({
    queryKey: ['config'],
    queryFn: () => apiClient.get('/api/config').then(r => r.data).catch(() => ({})),
  })
  const fullAutoMode = !!appConfig?.full_auto_mode

  const toggleFullAuto = useMutation({
    mutationFn: async (v: boolean) => {
      try {
        await apiClient.put('/api/config', { ...appConfig, full_auto_mode: v })
      } catch { /* ignore */ }
      if (v) {
        try {
          await apiClient.post('/api/jonfrey/run', { action_type: 'enable_full_auto' })
        } catch { /* ignore */ }
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config'] }),
  })

  const toggleMut = useMutation({
    mutationFn: async (payload: Partial<{ enabled: boolean; threshold: number; max_per_run: number }>) => {
      const tasks: Promise<unknown>[] = [apiClient.post('/api/auto-match/toggle', payload)]
      if (payload.enabled !== undefined) {
        tasks.push(apiClient.put('/api/jonfrey/config', { enabled: payload.enabled }).catch(() => null))
      }
      await Promise.all(tasks)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['auto-match'] })
      qc.invalidateQueries({ queryKey: ['jonfrey-config'] })
      qc.invalidateQueries({ queryKey: ['auto-match', 'preview'] })
    },
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Erro ao salvar'),
  })

  const fullyEnabled = !!(amStatus?.enabled && (jonfreyConfig?.enabled ?? false))

  const nextAutoMatchMs =
    amStatus?.last_run_at && amStatus?.interval_seconds != null
      ? new Date(amStatus.last_run_at).getTime() + amStatus.interval_seconds * 1000
      : null

  const [amSecs, setAmSecs] = React.useState<number | null>(null)
  React.useEffect(() => {
    const tick = () => {
      if (nextAutoMatchMs == null) {
        setAmSecs(null)
        return
      }
      setAmSecs(Math.max(0, Math.round((nextAutoMatchMs - Date.now()) / 1000)))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [nextAutoMatchMs])

  const jonfreyIntervalMs = Math.max(1, jonfreyConfig?.interval_minutes ?? 60) * 60 * 1000
  const [jfSecs, setJfSecs] = React.useState<number | null>(null)
  React.useEffect(() => {
    const tick = () => {
      if (!jonfreyConfig?.enabled) {
        setJfSecs(null)
        return
      }
      const base = jonfreyConfig.last_run_at ? new Date(jonfreyConfig.last_run_at).getTime() : 0
      const next = base > 0 ? base + jonfreyIntervalMs : Date.now() + jonfreyIntervalMs
      setJfSecs(Math.max(0, Math.round((next - Date.now()) / 1000)))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [jonfreyConfig?.enabled, jonfreyConfig?.last_run_at, jonfreyIntervalMs])

  const nextDispatchApproxMs = React.useMemo(() => {
    if (!amStatus?.enabled || nextAutoMatchMs == null) return null
    return nextAutoMatchMs
  }, [amStatus?.enabled, nextAutoMatchMs])

  const approveBatchMut = useMutation({
    mutationFn: async (ids: number[]) => {
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
      setSelected(new Set())
    },
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Erro ao aprovar'),
  })

  const approveAllMut = useMutation({
    mutationFn: () => apiClient.post('/api/dispatches/approve-all'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dispatches', 'pending-approval'] })
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
    amz: 'Amazon',
    amazon: 'Amazon',
    ml: 'Mercado Livre',
    mercadolivre: 'Mercado Livre',
    magalu: 'Magalu',
    shopee: 'Shopee',
    aliexpress: 'AliExpress',
    casasbahia: 'Casas Bahia',
    kabum: 'Kabum',
    americanas: 'Americanas',
  }

  type SortKey = 'channel' | 'source' | 'price' | 'score' | 'created_at'
  const [sortKey, setSortKey] = React.useState<SortKey>('created_at')
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('desc')
  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(k)
      setSortDir(k === 'created_at' ? 'desc' : 'asc')
    }
  }

  const sortedItems = React.useMemo(() => {
    const sorted = [...items]
    sorted.sort((a, b) => {
      let av: any
      let bv: any
      switch (sortKey) {
        case 'channel':
          av = a.channel_name ?? ''
          bv = b.channel_name ?? ''
          break
        case 'source':
          av = a.source ?? ''
          bv = b.source ?? ''
          break
        case 'price':
          av = a.price ?? 0
          bv = b.price ?? 0
          break
        case 'score':
          av = a.score ?? 0
          bv = b.score ?? 0
          break
        case 'created_at':
          av = new Date(a.created_at).getTime()
          bv = new Date(b.created_at).getTime()
          break
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return sorted
  }, [items, sortKey, sortDir])

  const SortHeader = ({ k, label, align }: { k: SortKey; label: string; align?: string }) => (
    <th
      className={`px-3 py-2.5 text-xs font-medium text-fg-2 uppercase tracking-wide cursor-pointer select-none hover:text-fg ${align ?? 'text-left'}`}
      onClick={() => toggleSort(k)}
    >
      {label}
      {sortKey === k ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
    </th>
  )

  const autoMatchCountLabel =
    amSecs === null ? '—' : amSecs === 0 ? 'ciclo em andamento…' : `${amSecs}s`
  const jonfreyCountLabel =
    jfSecs === null ? '—' : jfSecs === 0 ? 'janela liberada…' : `${jfSecs}s`

  const estimatedSendCell =
    !amStatus?.enabled
      ? 'auto-match pausado'
      : nextDispatchApproxMs != null && nextDispatchApproxMs > Date.now()
        ? fmtWhen(nextDispatchApproxMs)
        : 'no próximo ciclo (~1 min)'

  return (
    <div className="p-6 space-y-4">
      <PageHeader
        title="Fila de envio"
        subtitle={
          <>
            <strong className="text-fg-2">Auto-match</strong> cria dispatches a cada ~1 min quando o piloto está ligado.{' '}
            <strong className="text-fg-2">Jonfrey</strong> é manutenção (taxonomia, liberar pending, etc.) na janela configurada — não é a mesma coisa que o envio ao WhatsApp.
            {' '}Esta página mostra a <strong className="text-fg-2">prévia</strong> do próximo ciclo e, sem full-auto, as aprovações manuais.
          </>
        }
        actions={
          !fullAutoMode ? (
            <>
              {selected.size > 0 && (
                <>
                  <Button
                    variant="primary"
                    size="sm"
                    loading={approveBatchMut.isPending}
                    onClick={() => approveBatchMut.mutate(Array.from(selected))}
                  >
                    ✓ Aprovar {selected.size}
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    loading={rejectBatchMut.isPending}
                    onClick={() => {
                      if (confirm(`Rejeitar ${selected.size} dispatches selecionados?`)) rejectBatchMut.mutate(Array.from(selected))
                    }}
                  >
                    ✕ Rejeitar {selected.size}
                  </Button>
                </>
              )}
              {items.length > 0 && (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={approveAllMut.isPending}
                    onClick={() => {
                      if (confirm(`Aprovar TODOS os ${items.length} pendentes?`)) approveAllMut.mutate()
                    }}
                  >
                    Aprovar todos ({items.length})
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={rejectBatchMut.isPending}
                    onClick={() => {
                      if (confirm(`Rejeitar TODOS os ${items.length} pendentes?`)) rejectBatchMut.mutate(items.map(i => i.id))
                    }}
                  >
                    Rejeitar todos
                  </Button>
                </>
              )}
            </>
          ) : null
        }
      />

      {/* Auto-pilot — mesmo padrão da Visão geral em Automations */}
      <div
        className={`flex items-start gap-3 border rounded-md p-4 transition-colors ${
          fullyEnabled && fullAutoMode ? 'border-success/40 bg-success/5' : fullyEnabled ? 'border-warning/40 bg-warning/5' : 'border-border bg-surface'
        }`}
      >
        <div className="flex-1 min-w-0">
          <p className="text-xs text-fg-3 font-medium uppercase tracking-wide">Auto-pilot</p>
          <p className={`text-sm font-semibold mt-1 ${fullyEnabled && fullAutoMode ? 'text-success' : fullyEnabled ? 'text-warning' : 'text-fg-2'}`}>
            {fullyEnabled && fullAutoMode ? 'Ativo · enviando sem aprovação humana' : fullyEnabled ? 'Ativo · aguardando aprovação (full-auto off)' : 'Pausado'}
          </p>
          <p className="text-xs text-fg-3 mt-1">
            Liga auto-match + espelha no Jonfrey (como em <a href="/automations">Automations → Visão geral</a>). Ao ligar, tenta ativar também full-auto.
          </p>
        </div>
        <button
          type="button"
          disabled={toggleMut.isPending || toggleFullAuto.isPending}
          onClick={async () => {
            const next = !fullyEnabled
            await toggleMut.mutateAsync({ enabled: next })
            if (next) await toggleFullAuto.mutateAsync(true)
          }}
          className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${fullyEnabled ? 'bg-accent' : 'bg-border'} disabled:opacity-50`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${fullyEnabled ? 'translate-x-5' : 'translate-x-0'}`}
          />
        </button>
      </div>

      {/* Agenda: próximos ciclos (auto-match + Jonfrey) + prévia com onde/quando */}
      <div className="border border-border rounded-md overflow-hidden bg-surface">
        <div className="px-4 py-3 border-b border-border bg-surface-2/50 space-y-2">
          <p className="text-sm font-medium text-fg">Próximos envios na agenda</p>
          <div className="grid sm:grid-cols-2 gap-3 text-xs text-fg-2">
            <div className="rounded border border-border bg-surface-2/40 px-3 py-2">
              <span className="text-fg-3 uppercase tracking-wide font-medium">Próximo ciclo auto-match</span>
              <p className="text-sm font-semibold text-fg mt-0.5">{autoMatchCountLabel}</p>
              <p className="text-[10px] text-fg-3 mt-0.5">
                Contagem regressiva até o job tentar criar novos dispatches (~1 min). Canal = onde vai publicar.
              </p>
            </div>
            <div className="rounded border border-border bg-surface-2/40 px-3 py-2">
              <span className="text-fg-3 uppercase tracking-wide font-medium">Próxima janela Jonfrey (piloto)</span>
              <p className="text-sm font-semibold text-fg mt-0.5">{jonfreyConfig?.enabled === false ? 'piloto off' : jonfreyCountLabel}</p>
              <p className="text-[10px] text-fg-3 mt-0.5">
                Manutenção agendada (intervalo {jonfreyConfig?.interval_minutes ?? 60} min). Não substitui o auto-match.
              </p>
            </div>
          </div>
        </div>
        <div className="px-4 py-2 border-b border-border bg-surface-2/30 flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-medium text-fg">Candidatos no próximo ciclo de match</p>
            <p className="text-[10px] text-fg-3 mt-0.5">
              Ordenado por score. Coluna “envio estimado” usa o próximo tick do auto-match (não o Jonfrey).
            </p>
          </div>
          <a href="/automations" className="text-xs text-accent hover:underline whitespace-nowrap">
            Automations →
          </a>
        </div>
        {nextCyclePreview?.auto_match_master_enabled === false ? (
          <div className="px-4 py-8 text-sm text-center space-y-2">
            <p className="text-warning font-medium">Auto-match global desligado</p>
            <p className="text-xs text-fg-3 max-w-md mx-auto">
              Ative o Auto-pilot acima ou em <a href="/automations" className="text-accent hover:underline">Automations</a>.
            </p>
          </div>
        ) : previewCandidates.length === 0 ? (
          <p className="px-4 py-8 text-sm text-fg-3 text-center">
            Nenhum candidato elegível na prévia (canais pausados, filtros, já enviados, ou produto sem URL de oferta).
          </p>
        ) : (
          <div className="max-h-[320px] overflow-y-auto divide-y divide-border">
            {previewCandidates.map(p => (
              <div key={`${p.channel_id}-${p.product_id}`} className="px-4 py-2.5 flex flex-wrap items-center gap-3">
                <span
                  className={`text-xs font-semibold px-1.5 py-0.5 rounded shrink-0 ${
                    p.score >= 70 ? 'bg-success/10 text-success' : 'bg-surface-2 text-fg-3'
                  }`}
                >
                  {p.score.toFixed(0)}
                </span>
                <div className="flex-1 min-w-[140px]">
                  <p className="text-sm text-fg truncate">{p.product_name}</p>
                  <p className="text-[10px] text-fg-2">
                    <strong className="text-fg-3 font-normal">Onde:</strong> {p.channel_name}
                  </p>
                </div>
                <div className="text-right shrink-0 min-w-[130px]">
                  <p className="text-[10px] text-fg-3 uppercase tracking-wide">Envio estimado</p>
                  <p className="text-xs text-fg font-medium">{estimatedSendCell}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Full-auto — só liberação automática de approval; visível sempre como estado */}
      <div
        className={`flex items-start gap-3 border rounded-md p-3 ${
          fullAutoMode ? 'border-success/40 bg-success/5' : 'border-warning/40 bg-warning/5'
        }`}
      >
        <span className="text-base leading-none mt-0.5">{fullAutoMode ? '✅' : '⚠️'}</span>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold ${fullAutoMode ? 'text-success' : 'text-fg'}`}>
            {fullAutoMode ? 'Full-auto ativo — dispatches seguem direto para entrega' : 'Full-auto desligado — dispatches novos podem exigir aprovação'}
          </p>
          <p className="text-xs text-fg-3 mt-0.5">
            {fullAutoMode
              ? 'Novos disparos não ficam em pending_approval.'
              : 'Revise a tabela abaixo ou ligue o toggle para liberar automaticamente.'}
          </p>
        </div>
        <button
          type="button"
          disabled={toggleFullAuto.isPending}
          onClick={() => toggleFullAuto.mutate(!fullAutoMode)}
          className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 mt-0.5 ${
            fullAutoMode ? 'bg-success' : 'bg-border'
          } disabled:opacity-50`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
              fullAutoMode ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {/* Aprovação manual — só quando full-auto está desligado */}
      {!fullAutoMode && (
        <>
          <div className="border-b border-border pb-2">
            <p className="text-sm font-medium text-fg">Aguardando aprovação manual</p>
            <p className="text-xs text-fg-3">
              Dispatches em <code className="text-[10px] bg-surface-2 px-1 rounded">pending_approval</code>. Com full-auto ligado, esta secção fica oculta.
            </p>
          </div>
          {isLoading ? (
            <p className="text-sm text-fg-3">Carregando…</p>
          ) : items.length === 0 ? (
            <div className="border border-border rounded-md p-12 text-center bg-surface space-y-2">
              <p className="text-3xl mb-2">✨</p>
              <p className="text-sm text-fg">Sem dispatches em pending_approval</p>
              <p className="text-xs text-fg-3 mt-1 max-w-md mx-auto">
                Use a prévia acima para ver candidatos do próximo ciclo de match ou ligue full-auto para liberar automaticamente.
              </p>
            </div>
          ) : (
            <div className="bg-surface border border-border rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-2 border-b border-border">
                    <th className="w-10 px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={selected.size === items.length && items.length > 0}
                        onChange={toggleAll}
                        className="accent-accent"
                      />
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
                      <tr
                        key={d.id}
                        className={`border-b border-border last:border-0 hover:bg-surface-2 cursor-pointer ${
                          isSelected ? 'bg-accent/5' : ''
                        }`}
                        onClick={() => toggleSelect(d.id)}
                      >
                        <td className="px-3 py-2.5">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(d.id)}
                            onClick={e => e.stopPropagation()}
                            className="accent-accent"
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            {d.product_image && (
                              <img
                                src={d.product_image}
                                alt=""
                                className="w-10 h-10 object-cover rounded border border-border flex-shrink-0"
                              />
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
                        <td className="px-3 py-2.5 text-xs text-fg-2">{d.source ? SOURCE_LABEL[d.source] ?? d.source : '—'}</td>
                        <td className="px-3 py-2.5 text-right text-xs text-fg whitespace-nowrap">
                          {d.price && d.price > 0 ? `R$ ${d.price.toFixed(2)}` : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {d.score != null ? (
                            <span
                              className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                                d.score >= 70
                                  ? 'bg-success/10 text-success'
                                  : d.score >= 50
                                    ? 'bg-warning/10 text-warning'
                                    : 'bg-surface-2 text-fg-3'
                              }`}
                            >
                              {d.score.toFixed(0)}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right text-xs text-fg-3 whitespace-nowrap">{relTime(d.created_at)}</td>
                        <td className="px-3 py-2.5 text-right" onClick={e => e.stopPropagation()}>
                          <button
                            type="button"
                            title="Rejeitar este dispatch"
                            disabled={rejectMut.isPending}
                            onClick={() => {
                              if (confirm('Rejeitar este dispatch?')) rejectMut.mutate(d.id)
                            }}
                            className="text-xs px-2 py-1 rounded border border-danger/30 text-danger hover:bg-danger/10 transition-colors disabled:opacity-50"
                          >
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
        </>
      )}
    </div>
  )
}
