import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, KpiCard } from '../components/ui'
import { apiClient } from '../lib/apiClient'

interface Ad {
  id: number
  name: string
  message_text: string
  image_url?: string | null
  channel_ids: number[]
  group_ids: number[]
  schedule_cron: string
  active_until?: string | null
  enabled: boolean
  last_dispatched_at?: string | null
  dispatch_count: number
  created_at: string
  client_name: string
  paid_amount: number
  short_id?: string | null
  click_count: number
  target_url: string
}

interface ChannelLite {
  id: number
  name: string
}

function isExpired(ad: Ad): boolean {
  if (!ad.active_until) return false
  return new Date(ad.active_until).getTime() < Date.now()
}

function fmtDate(s?: string | null): string {
  if (!s) return '—'
  return new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function fmtMoney(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function statusOf(ad: Ad): 'active' | 'expired' | 'disabled' {
  if (isExpired(ad)) return 'expired'
  if (!ad.enabled) return 'disabled'
  return 'active'
}

function CreateAdModal({
  channels,
  initial,
  onClose,
  onSaved,
}: {
  channels: ChannelLite[]
  initial?: Ad
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = React.useState(initial?.name ?? '')
  const [clientName, setClientName] = React.useState(initial?.client_name ?? '')
  const [paidAmount, setPaidAmount] = React.useState<string>(
    initial ? String(initial.paid_amount) : '',
  )
  const [text, setText] = React.useState(initial?.message_text ?? '')
  const [imageURL, setImageURL] = React.useState(initial?.image_url ?? '')
  const [targetURL, setTargetURL] = React.useState(initial?.target_url ?? '')
  const [cron, setCron] = React.useState(initial?.schedule_cron ?? '0 12 * * *')
  const [activeUntil, setActiveUntil] = React.useState(
    initial?.active_until ? initial.active_until.slice(0, 16) : '',
  )
  const [selectedChannels, setSelectedChannels] = React.useState<number[]>(initial?.channel_ids ?? [])

  const saveMut = useMutation({
    mutationFn: () => {
      const body = {
        name: name.trim(),
        client_name: clientName.trim(),
        paid_amount: Number(paidAmount) || 0,
        message_text: text.trim(),
        image_url: imageURL.trim() || undefined,
        target_url: targetURL.trim(),
        channel_ids: selectedChannels,
        group_ids: [],
        schedule_cron: cron,
        active_until: activeUntil ? new Date(activeUntil).toISOString() : null,
        enabled: true,
      }
      if (initial) return apiClient.patch(`/api/ads/${initial.id}`, body).then(r => r.data)
      return apiClient.post('/api/ads', body).then(r => r.data)
    },
    onSuccess: () => { onSaved(); onClose() },
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Erro ao salvar'),
  })

  const toggleChannel = (id: number) =>
    setSelectedChannels(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-surface border border-border rounded-md w-full max-w-2xl shadow-xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-fg">{initial ? 'Editar anúncio' : 'Novo anúncio pago'}</h2>
          <button type="button" onClick={onClose} className="text-fg-3 hover:text-fg">×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-fg-2 block mb-1">Nome interno</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Promo Whey Outubro"
                className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent" />
            </div>
            <div>
              <label className="text-xs text-fg-2 block mb-1">Cliente</label>
              <input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Loja XYZ"
                className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-fg-2 block mb-1">Valor pago (R$)</label>
              <input type="number" step="0.01" min="0" value={paidAmount} onChange={e => setPaidAmount(e.target.value)}
                placeholder="500.00"
                className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent" />
            </div>
            <div>
              <label className="text-xs text-fg-2 block mb-1">URL destino (rastreada)</label>
              <input type="url" value={targetURL} onChange={e => setTargetURL(e.target.value)} placeholder="https://loja.com/produto"
                className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent" />
            </div>
          </div>
          <div>
            <label className="text-xs text-fg-2 block mb-1">Mensagem</label>
            <textarea value={text} onChange={e => setText(e.target.value)} rows={5}
              placeholder="🔥 Promoção XYZ — frete grátis. Confira: {link}"
              className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent font-mono" />
            <p className="text-[10px] text-fg-3 mt-1">Use <code>{'{link}'}</code> pra inserir a URL encurtada (rastreada).</p>
          </div>
          <div>
            <label className="text-xs text-fg-2 block mb-1">Imagem (opcional)</label>
            <input type="url" value={imageURL} onChange={e => setImageURL(e.target.value)} placeholder="https://…"
              className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-fg-2 block mb-1">
                Schedule (cron)
              </label>
              <input value={cron} onChange={e => setCron(e.target.value)} placeholder="0 12 * * *"
                className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent font-mono" />
              <p className="text-[10px] text-fg-3 mt-1">Ex: <code>0 12 * * *</code> = diário 12h. <code>0 9,21 * * *</code> = 9h e 21h.</p>
            </div>
            <div>
              <label className="text-xs text-fg-2 block mb-1">Ativo até</label>
              <input type="datetime-local" value={activeUntil} onChange={e => setActiveUntil(e.target.value)}
                className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent" />
              <p className="text-[10px] text-fg-3 mt-1">Após esta data desabilita automaticamente.</p>
            </div>
          </div>
          <div>
            <label className="text-xs text-fg-2 block mb-1">Canais alvo</label>
            {channels.length === 0 ? (
              <p className="text-xs text-fg-3">Nenhum canal disponível.</p>
            ) : (
              <div className="grid grid-cols-2 gap-1 max-h-40 overflow-y-auto border border-border rounded-md p-2">
                {channels.map(ch => (
                  <label key={ch.id} className="flex items-center gap-2 text-xs cursor-pointer">
                    <input type="checkbox" checked={selectedChannels.includes(ch.id)} onChange={() => toggleChannel(ch.id)} className="accent-accent" />
                    <span className="truncate">{ch.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" size="sm" loading={saveMut.isPending}
            disabled={!name.trim() || !text.trim() || selectedChannels.length === 0}
            onClick={() => saveMut.mutate()}>
            {initial ? 'Salvar' : 'Criar anúncio'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function Ads() {
  const qc = useQueryClient()
  const [showModal, setShowModal] = React.useState(false)
  const [editing, setEditing] = React.useState<Ad | null>(null)
  const [filter, setFilter] = React.useState<'all' | 'active' | 'expired' | 'disabled'>('all')

  const { data: ads = [] } = useQuery<Ad[]>({
    queryKey: ['ads'],
    queryFn: () => apiClient.get('/api/ads').then(r => r.data ?? []).catch(() => []),
    refetchInterval: 60_000,
  })

  const { data: channels = [] } = useQuery<ChannelLite[]>({
    queryKey: ['channels-lite'],
    queryFn: () =>
      apiClient.get('/api/channels').then(r => {
        const d = r.data
        const arr = Array.isArray(d) ? d : (d?.items ?? [])
        return arr.map((c: any) => ({ id: c.id, name: c.name }))
      }).catch(() => []),
  })

  const toggleMut = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      apiClient.patch(`/api/ads/${id}`, { enabled }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ads'] }),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiClient.delete(`/api/ads/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ads'] }),
  })

  // KPIs agregados
  const totalRevenue = ads.reduce((s, a) => s + (a.paid_amount ?? 0), 0)
  const totalDispatches = ads.reduce((s, a) => s + a.dispatch_count, 0)
  const totalClicks = ads.reduce((s, a) => s + (a.click_count ?? 0), 0)
  const ctr = totalDispatches > 0 ? (totalClicks / totalDispatches) * 100 : 0
  const activeCount = ads.filter(a => statusOf(a) === 'active').length

  const filtered = ads.filter(a => filter === 'all' || statusOf(a) === filter)

  return (
    <div className="p-6 space-y-5 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm text-fg-3">
            Anúncios pagos por terceiros — disparos recorrentes nos grupos com tracking de cliques via short link.
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => { setEditing(null); setShowModal(true) }}>
          + Novo anúncio
        </Button>
      </div>

      {/* KPIs agregados */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Receita total" value={fmtMoney(totalRevenue)} subtitle={`${ads.length} anúncios`} />
        <KpiCard label="Anúncios ativos" value={activeCount} subtitle="rodando agora" />
        <KpiCard label="Disparos totais" value={totalDispatches.toLocaleString('pt-BR')} subtitle="acumulado" />
        <KpiCard label="Cliques totais" value={totalClicks.toLocaleString('pt-BR')} subtitle={`CTR ${ctr.toFixed(1)}%`} />
      </div>

      {/* Filtro */}
      <div className="flex items-center gap-2 flex-wrap">
        {(['all', 'active', 'expired', 'disabled'] as const).map(f => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
              filter === f ? 'border-accent bg-accent/10 text-accent' : 'border-border text-fg-2 hover:border-border-strong'
            }`}
          >
            {f === 'all' ? `Todos (${ads.length})`
              : f === 'active' ? `Ativos (${ads.filter(a => statusOf(a) === 'active').length})`
              : f === 'expired' ? `Expirados (${ads.filter(a => statusOf(a) === 'expired').length})`
              : `Desabilitados (${ads.filter(a => statusOf(a) === 'disabled').length})`}
          </button>
        ))}
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className="bg-surface border border-border rounded-md p-8 text-center">
          <p className="text-sm text-fg-3">Nenhum anúncio nesta categoria.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(ad => {
            const st = statusOf(ad)
            const adCTR = ad.dispatch_count > 0 ? (ad.click_count / ad.dispatch_count) * 100 : 0
            return (
              <div key={ad.id} className={`bg-surface border border-border rounded-md p-4 ${st !== 'active' ? 'opacity-70' : ''}`}>
                <div className="flex items-start gap-4">
                  {ad.image_url ? (
                    <img src={ad.image_url} alt="" className="w-16 h-16 rounded object-cover bg-surface-2 flex-shrink-0" />
                  ) : (
                    <div className="w-16 h-16 rounded bg-surface-2 flex items-center justify-center text-fg-3 text-xl flex-shrink-0">📢</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-fg truncate">{ad.name}</p>
                      {st === 'active' && <span className="text-[10px] text-success bg-success/10 border border-success/30 rounded px-1.5 py-0.5">ativo</span>}
                      {st === 'expired' && <span className="text-[10px] text-fg-3 bg-surface-2 border border-border rounded px-1.5 py-0.5">expirado</span>}
                      {st === 'disabled' && <span className="text-[10px] text-warning bg-warning/10 border border-warning/30 rounded px-1.5 py-0.5">desabilitado</span>}
                    </div>
                    <div className="text-xs text-fg-2 mt-0.5">
                      {ad.client_name && <span>Cliente: <strong>{ad.client_name}</strong></span>}
                      {ad.paid_amount > 0 && <span className="ml-3">Valor: <strong>{fmtMoney(ad.paid_amount)}</strong></span>}
                    </div>
                    <p className="text-xs text-fg-3 mt-1 line-clamp-2 font-mono">{ad.message_text}</p>
                    <div className="text-[10px] text-fg-3 mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
                      <span>cron: <code className="text-fg-2">{ad.schedule_cron}</code></span>
                      <span>canais: {ad.channel_ids.length}</span>
                      {ad.short_id && <span>short: <code className="text-fg-2">/r/{ad.short_id}</code></span>}
                      {ad.active_until && <span>até {fmtDate(ad.active_until)}</span>}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center flex-shrink-0">
                    <div>
                      <p className="text-[10px] text-fg-3 uppercase">Disparos</p>
                      <p className="text-lg font-semibold text-fg">{ad.dispatch_count}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-fg-3 uppercase">Cliques</p>
                      <p className="text-lg font-semibold text-fg">{ad.click_count}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-fg-3 uppercase">CTR</p>
                      <p className={`text-lg font-semibold ${adCTR >= 5 ? 'text-success' : adCTR >= 1 ? 'text-warning' : 'text-fg'}`}>
                        {adCTR.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
                  <span className="text-[10px] text-fg-3">
                    Último disparo: {fmtDate(ad.last_dispatched_at)}
                  </span>
                  <div className="ml-auto flex items-center gap-2">
                    <button type="button"
                      onClick={() => { setEditing(ad); setShowModal(true) }}
                      className="text-xs text-fg-2 hover:text-fg border border-border rounded px-2 py-1">
                      Editar
                    </button>
                    <button type="button"
                      onClick={() => toggleMut.mutate({ id: ad.id, enabled: !ad.enabled })}
                      className="text-xs text-accent hover:underline">
                      {ad.enabled ? 'Desabilitar' : 'Reabilitar'}
                    </button>
                    <button type="button"
                      onClick={() => { if (confirm(`Remover "${ad.name}"?`)) deleteMut.mutate(ad.id) }}
                      className="text-xs text-danger hover:underline">
                      Remover
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showModal && (
        <CreateAdModal
          channels={channels}
          initial={editing ?? undefined}
          onClose={() => { setShowModal(false); setEditing(null) }}
          onSaved={() => qc.invalidateQueries({ queryKey: ['ads'] })}
        />
      )}
    </div>
  )
}
