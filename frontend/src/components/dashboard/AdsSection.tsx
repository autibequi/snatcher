import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '../ui'
import { apiClient } from '../../lib/apiClient'

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
  return new Date(s).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
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
  const [text, setText] = React.useState(initial?.message_text ?? '')
  const [imageURL, setImageURL] = React.useState(initial?.image_url ?? '')
  const [cron, setCron] = React.useState(initial?.schedule_cron ?? '0 12 * * *')
  const [activeUntil, setActiveUntil] = React.useState(
    initial?.active_until ? initial.active_until.slice(0, 16) : '',
  )
  const [selectedChannels, setSelectedChannels] = React.useState<number[]>(initial?.channel_ids ?? [])

  const saveMut = useMutation({
    mutationFn: () => {
      const body = {
        name: name.trim(),
        message_text: text.trim(),
        image_url: imageURL.trim() || undefined,
        channel_ids: selectedChannels,
        group_ids: [],
        schedule_cron: cron,
        active_until: activeUntil ? new Date(activeUntil).toISOString() : null,
        enabled: true,
      }
      if (initial) {
        return apiClient.patch(`/api/ads/${initial.id}`, body).then(r => r.data)
      }
      return apiClient.post('/api/ads', body).then(r => r.data)
    },
    onSuccess: () => {
      onSaved()
      onClose()
    },
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Erro ao salvar'),
  })

  const toggleChannel = (id: number) =>
    setSelectedChannels(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-surface border border-border rounded-md w-full max-w-lg shadow-xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-fg">{initial ? 'Editar anúncio' : 'Novo anúncio recorrente'}</h2>
          <button type="button" onClick={onClose} className="text-fg-3 hover:text-fg">×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div>
            <label className="text-xs text-fg-2 block mb-1">Nome interno</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="ex: Promoção Whey de Quarta"
              className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="text-xs text-fg-2 block mb-1">Mensagem</label>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              rows={5}
              placeholder="Texto que será disparado…"
              className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent font-mono"
            />
          </div>
          <div>
            <label className="text-xs text-fg-2 block mb-1">URL da imagem (opcional)</label>
            <input
              type="url"
              value={imageURL}
              onChange={e => setImageURL(e.target.value)}
              placeholder="https://…"
              className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="text-xs text-fg-2 block mb-1">
              Schedule (cron) <span className="text-fg-3">— ex: <code>0 12 * * *</code> = diário 12h</span>
            </label>
            <input
              value={cron}
              onChange={e => setCron(e.target.value)}
              placeholder="0 12 * * *"
              className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent font-mono"
            />
          </div>
          <div>
            <label className="text-xs text-fg-2 block mb-1">Ativo até (opcional)</label>
            <input
              type="datetime-local"
              value={activeUntil}
              onChange={e => setActiveUntil(e.target.value)}
              className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent"
            />
            <p className="text-[10px] text-fg-3 mt-1">Sem data → roda indefinidamente. Após esta data, o anúncio é desabilitado automaticamente.</p>
          </div>
          <div>
            <label className="text-xs text-fg-2 block mb-1">Canais alvo</label>
            {channels.length === 0 ? (
              <p className="text-xs text-fg-3">Nenhum canal disponível.</p>
            ) : (
              <div className="grid grid-cols-2 gap-1 max-h-40 overflow-y-auto border border-border rounded-md p-2">
                {channels.map(ch => (
                  <label key={ch.id} className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedChannels.includes(ch.id)}
                      onChange={() => toggleChannel(ch.id)}
                      className="accent-accent"
                    />
                    <span className="truncate">{ch.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancelar</Button>
          <Button
            variant="primary"
            size="sm"
            loading={saveMut.isPending}
            disabled={!name.trim() || !text.trim() || selectedChannels.length === 0}
            onClick={() => saveMut.mutate()}
          >
            {initial ? 'Salvar' : 'Criar anúncio'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function AdsSection() {
  const qc = useQueryClient()
  const [showModal, setShowModal] = React.useState(false)
  const [editing, setEditing] = React.useState<Ad | null>(null)

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

  const active = ads.filter(a => a.enabled && !isExpired(a))
  const inactive = ads.filter(a => !a.enabled || isExpired(a))

  return (
    <div className="bg-surface border border-border rounded-md overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-medium text-fg">📢 Anúncios recorrentes</p>
          <p className="text-xs text-fg-3 mt-0.5">
            Mensagens customizadas que disparam num schedule até a data limite.
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => { setEditing(null); setShowModal(true) }}>
          + Novo anúncio
        </Button>
      </div>

      {ads.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <p className="text-sm text-fg-3">Nenhum anúncio criado ainda.</p>
          <p className="text-xs text-fg-3 mt-1">
            Crie o primeiro pra disparar mensagens regulares (ex: oferta da semana, lembrete diário).
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {[...active, ...inactive].map(ad => {
            const expired = isExpired(ad)
            const dim = !ad.enabled || expired
            return (
              <div key={ad.id} className={`px-4 py-3 flex items-start gap-3 ${dim ? 'opacity-60' : ''}`}>
                {ad.image_url && (
                  <img src={ad.image_url} alt="" className="w-12 h-12 rounded object-cover bg-surface-2 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-fg truncate">{ad.name}</p>
                    {expired && (
                      <span className="text-[10px] text-fg-3 bg-surface-2 border border-border rounded px-1.5 py-0.5">expirado</span>
                    )}
                    {!ad.enabled && !expired && (
                      <span className="text-[10px] text-fg-3 bg-surface-2 border border-border rounded px-1.5 py-0.5">desabilitado</span>
                    )}
                    {ad.enabled && !expired && (
                      <span className="text-[10px] text-success bg-success/10 border border-success/30 rounded px-1.5 py-0.5">ativo</span>
                    )}
                  </div>
                  <p className="text-xs text-fg-3 mt-1 line-clamp-2 font-mono">{ad.message_text}</p>
                  <div className="text-[10px] text-fg-3 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                    <span>cron: <code className="text-fg-2">{ad.schedule_cron}</code></span>
                    <span>canais: {ad.channel_ids.length}</span>
                    <span>{ad.dispatch_count} disparos · último {fmtDate(ad.last_dispatched_at)}</span>
                    {ad.active_until && <span>até {fmtDate(ad.active_until)}</span>}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => { setEditing(ad); setShowModal(true) }}
                    className="text-[10px] text-fg-2 hover:text-fg border border-border rounded px-1.5 py-0.5"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleMut.mutate({ id: ad.id, enabled: !ad.enabled })}
                    className="text-[10px] text-accent hover:underline"
                  >
                    {ad.enabled ? 'Desabilitar' : 'Reabilitar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { if (confirm(`Remover "${ad.name}"?`)) deleteMut.mutate(ad.id) }}
                    className="text-[10px] text-danger hover:underline"
                  >
                    Remover
                  </button>
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
