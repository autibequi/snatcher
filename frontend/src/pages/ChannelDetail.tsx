import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { Badge, Button, Tabs, KpiCard, Skeleton, Switch, Tooltip as UITooltip } from '../components/ui'
import { apiClient } from '../lib/apiClient'
import { usePublicLinkBaseURL } from '../hooks/useBrand'
import AudienceEditor from '../components/AudienceEditor'

// ── Preview WA inline (bolha verde) ──────────────────────────────────────────
function WAMessagePreview({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <p className="text-xs text-center text-white/60 mb-3">Preview WhatsApp · clique fora para fechar</p>
        <div className="bg-[#0b141a] rounded-xl p-4 shadow-2xl">
          <div className="bg-[#005c4b] rounded-xl p-3 ml-auto max-w-[90%] shadow">
            <p className="text-sm text-white whitespace-pre-wrap break-words">{text || '...'}</p>
            <p className="text-xs text-green-300 mt-1.5 text-right opacity-60">agora ✓✓</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Histórico de disparos do canal ────────────────────────────────────────────
function ChannelHistory({ channelId }: { channelId: string }) {
  const [previewText, setPreviewText] = React.useState<string | null>(null)

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['channels', channelId, 'history'],
    queryFn: () => apiClient.get(`/api/channels/${channelId}/history`).then(r => Array.isArray(r.data) ? r.data : []).catch(() => []),
    staleTime: 30_000,
    refetchInterval: 15_000,
  })

  const { data: preview } = useQuery<{ items: { product_id: number; product_name: string; score: number; price: number; already_sent: boolean }[] }>({
    queryKey: ['automations', channelId, 'preview'],
    queryFn: () => apiClient.get(`/api/automations/${channelId}/preview`).then(r => r.data).catch(() => ({ items: [] })),
    staleTime: 30_000,
    refetchInterval: 30_000,
  })
  const queueItems = (preview?.items ?? []).filter(i => !i.already_sent)

  const statusVariant: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
    delivered: 'success', sending: 'warning', failed: 'danger', pending: 'default', pending_approval: 'warning',
  }

  // Split: pending/pending_approval/queued = "a enviar" (ainda não chegou ao grupo)
  //        delivered/failed/sent = "já enviados"
  const NOT_SENT = new Set(['pending', 'pending_approval', 'queued'])
  const toSend = entries.filter((e: any) => NOT_SENT.has(e.status))
  const sent   = entries.filter((e: any) => !NOT_SENT.has(e.status))

  const renderRow = (e: any, i: number) => {
    let msgText = ''
    try { msgText = typeof e.message === 'string' ? JSON.parse(e.message)?.text ?? '' : e.message_text ?? '' } catch {}
    const groupName = e.group_name || `grupo #${e.group_id}`
    return (
      <tr key={`${e.dispatch_id}-${i}`}
        className="border-b border-border last:border-0 hover:bg-surface-2 cursor-pointer"
        onClick={() => setPreviewText(msgText)} title="Clique para ver preview WA">
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

  if (isLoading) return <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>

  return (
    <div className="space-y-5">
      {previewText !== null && <WAMessagePreview text={previewText} onClose={() => setPreviewText(null)} />}

      {/* Próximos (na fila de score) */}
      <div className="border border-border rounded-md overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border bg-surface-2">
          <p className="text-sm font-medium text-fg">Próximos disparos · na fila</p>
          <p className="text-xs text-fg-3">Produtos com score suficiente pra disparar no próximo ciclo</p>
        </div>
        {queueItems.length === 0 ? (
          <p className="px-4 py-4 text-sm text-fg-3">Nenhum produto na fila agora.</p>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border">
              <th className="text-left px-4 py-2 text-xs text-fg-2 font-medium">Produto</th>
              <th className="text-left px-4 py-2 text-xs text-fg-2 font-medium">Score</th>
              <th className="text-left px-4 py-2 text-xs text-fg-2 font-medium">Preço</th>
            </tr></thead>
            <tbody>
              {queueItems.slice(0, 10).map(item => (
                <tr key={item.product_id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5 text-xs text-fg truncate max-w-xs">{item.product_name}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs font-semibold ${item.score >= 70 ? 'text-success' : 'text-warning'}`}>{item.score.toFixed(0)}</span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-fg-2">
                    {item.price > 0 ? `R$ ${item.price.toFixed(2)}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* A enviar (pending_approval) */}
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
            <a href="/automations" className="text-xs text-accent hover:underline">Aprovar em Automações →</a>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-surface-2 border-b border-border">
                <th className="text-left px-4 py-2 text-xs text-fg-2 font-medium">Mensagem</th>
                <th className="text-left px-4 py-2 text-xs text-fg-2 font-medium">Grupo</th>
                <th className="text-left px-4 py-2 text-xs text-fg-2 font-medium">Status</th>
                <th className="text-right px-4 py-2 text-xs text-fg-2 font-medium">Data</th>
              </tr></thead>
              <tbody>{toSend.map(renderRow)}</tbody>
            </table>
          </div>
        </div>
      )}

      {/* Já enviados */}
      <div className="border border-border rounded-md overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border bg-surface-2">
          <p className="text-sm font-medium text-fg">Já enviados</p>
        </div>
        {sent.length === 0 ? (
          <p className="px-4 py-4 text-sm text-fg-3">Nenhum disparo enviado ainda.</p>
        ) : (
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-surface-2 border-b border-border sticky top-0">
                <th className="text-left px-4 py-2 text-xs text-fg-2 font-medium">Mensagem</th>
                <th className="text-left px-4 py-2 text-xs text-fg-2 font-medium">Grupo</th>
                <th className="text-left px-4 py-2 text-xs text-fg-2 font-medium">Status</th>
                <th className="text-right px-4 py-2 text-xs text-fg-2 font-medium">Data</th>
              </tr></thead>
              <tbody>{sent.map(renderRow)}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Histórico: só já enviados ─────────────────────────────────────────────────
function ChannelHistoryOnly({ channelId }: { channelId: string }) {
  const [previewText, setPreviewText] = React.useState<string | null>(null)
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['channels', channelId, 'history'],
    queryFn: () => apiClient.get(`/api/channels/${channelId}/history`).then(r => Array.isArray(r.data) ? r.data : []).catch(() => []),
    staleTime: 30_000,
  })
  const NOT_SENT = new Set(['pending', 'pending_approval', 'queued'])
  const sent = entries.filter((e: any) => !NOT_SENT.has(e.status))
  const statusVariant: Record<string, 'success'|'warning'|'danger'|'default'> = { delivered:'success',sending:'warning',failed:'danger',pending:'default' }
  if (isLoading) return <Skeleton className="h-20 w-full" />
  return (
    <div>
      {previewText !== null && <WAMessagePreview text={previewText} onClose={() => setPreviewText(null)} />}
      {sent.length === 0 ? (
        <p className="text-sm text-fg-3 py-4">Nenhum disparo entregue ainda.</p>
      ) : (
        <div className="border border-border rounded-md overflow-hidden">
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-surface-2 border-b border-border sticky top-0">
                <th className="text-left px-4 py-2 text-xs text-fg-2 font-medium">Mensagem</th>
                <th className="text-left px-4 py-2 text-xs text-fg-2 font-medium">Grupo</th>
                <th className="text-left px-4 py-2 text-xs text-fg-2 font-medium">Status</th>
                <th className="text-right px-4 py-2 text-xs text-fg-2 font-medium">Data</th>
              </tr></thead>
              <tbody>
                {sent.map((e: any, i: number) => {
                  let msgText = ''
                  try { msgText = typeof e.message === 'string' ? JSON.parse(e.message)?.text ?? '' : e.message_text ?? '' } catch {}
                  return (
                    <tr key={`${e.dispatch_id}-${i}`} className="border-b border-border last:border-0 hover:bg-surface-2 cursor-pointer" onClick={() => setPreviewText(msgText)}>
                      <td className="px-4 py-2.5 text-xs text-fg truncate max-w-xs">{msgText || `#${e.dispatch_id}`}</td>
                      <td className="px-4 py-2.5 text-xs text-fg-2">{e.group_name || `#${e.group_id}`}</td>
                      <td className="px-4 py-2.5"><Badge variant={statusVariant[e.status]??'default'} size="sm">{e.status}</Badge></td>
                      <td className="px-4 py-2.5 text-xs text-fg-3 text-right">{new Date(e.created_at).toLocaleString('pt-BR')}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Fila: próximos disparos ───────────────────────────────────────────────────
function ChannelQueue({ channelId }: { channelId: string }) {
  const { data: preview } = useQuery<{ items: { product_id: number; product_name: string; score: number; price: number; already_sent: boolean }[] }>({
    queryKey: ['automations', channelId, 'preview'],
    queryFn: () => apiClient.get(`/api/automations/${channelId}/preview`).then(r => r.data).catch(() => ({ items: [] })),
    staleTime: 30_000,
    refetchInterval: 30_000,
  })
  const { data: entries = [] } = useQuery({
    queryKey: ['channels', channelId, 'history'],
    queryFn: () => apiClient.get(`/api/channels/${channelId}/history`).then(r => Array.isArray(r.data) ? r.data : []).catch(() => []),
    staleTime: 30_000,
  })
  const NOT_SENT = new Set(['pending', 'pending_approval', 'queued'])
  const toSend = entries.filter((e: any) => NOT_SENT.has(e.status))
  const queueItems = (preview?.items ?? []).filter(i => !i.already_sent)
  const statusVariant: Record<string, 'success'|'warning'|'danger'|'default'> = { pending:'default', pending_approval:'warning', queued:'default' }

  return (
    <div className="space-y-5">
      {/* Próximos ciclo */}
      <div className="border border-border rounded-md overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border bg-surface-2">
          <p className="text-sm font-medium text-fg">Próximos disparos · próximo ciclo de auto-match</p>
          <p className="text-xs text-fg-3">
            Produtos do catálogo com score ≥ threshold que ainda não foram disparados.
            {queueItems.length === 0 && ' Se vazio, provavelmente todos estão em cooldown — rode "reset_stale_cooldown" no Jonfrey.'}
          </p>
        </div>
        {queueItems.length === 0 ? <p className="px-4 py-4 text-sm text-fg-3">Nenhum produto na fila (todos em cooldown ou sem score suficiente).</p> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border"><th className="text-left px-4 py-2 text-xs text-fg-2 font-medium">Produto</th><th className="px-4 py-2 text-xs text-fg-2 font-medium">Score</th><th className="px-4 py-2 text-xs text-fg-2 font-medium">Preço</th></tr></thead>
            <tbody>
              {queueItems.slice(0,10).map(item => (
                <tr key={item.product_id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5 text-xs text-fg truncate max-w-xs">{item.product_name}</td>
                  <td className="px-4 py-2.5 text-center"><span className={`text-xs font-semibold ${item.score>=70?'text-success':'text-warning'}`}>{item.score.toFixed(0)}</span></td>
                  <td className="px-4 py-2.5 text-center text-xs text-fg-2">{item.price>0?`R$ ${item.price.toFixed(2)}`:'—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {/* A entregar */}
      {toSend.length > 0 && (
        <div className="border border-warning/40 rounded-md overflow-hidden">
          <div className="px-4 py-2.5 border-b border-warning/30 bg-warning/5 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-fg">A entregar ({toSend.length})</p>
              <p className="text-xs text-fg-3">Já foram matchados e criados — aguardando worker WA/TG enviar para o grupo</p>
            </div>
            <a href="/automations" className="text-xs text-accent hover:underline">Ver em Automações →</a>
          </div>
          <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-surface-2 border-b border-border"><th className="text-left px-4 py-2 text-xs text-fg-2 font-medium">Mensagem</th><th className="text-left px-4 py-2 text-xs text-fg-2 font-medium">Status</th><th className="text-right px-4 py-2 text-xs text-fg-2 font-medium">Data</th></tr></thead>
              <tbody>
                {toSend.map((e: any, i: number) => {
                  let msgText = ''
                  try { msgText = typeof e.message === 'string' ? JSON.parse(e.message)?.text ?? '' : e.message_text ?? '' } catch {}
                  return (
                    <tr key={`${e.dispatch_id}-${i}`} className="border-b border-border last:border-0">
                      <td className="px-4 py-2.5 text-xs text-fg truncate max-w-xs">{msgText || `#${e.dispatch_id}`}</td>
                      <td className="px-4 py-2.5"><Badge variant={statusVariant[e.status]??'default'} size="sm">{e.status}</Badge></td>
                      <td className="px-4 py-2.5 text-xs text-fg-3 text-right">{new Date(e.created_at).toLocaleString('pt-BR')}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Componente: lista grupos WA de uma conta para seleção ─────────────────────
function AccountGroupsPicker({
  account,
  search,
  alreadyAdded,
  onAdd,
  loading,
}: {
  account: { id: number; name: string }
  search: string
  alreadyAdded: string[]
  onAdd: (g: { id: string; name: string }) => void
  loading: boolean
}) {
  const { data: waGroups = [], isLoading } = useQuery({
    queryKey: ['wa-groups', account.id],
    queryFn: () => apiClient.get(`/api/accounts/wa/${account.id}/groups`).then(r => Array.isArray(r.data) ? r.data : []),
    staleTime: 30_000,
  })

  const filtered = search
    ? waGroups.filter((g: any) => g.name?.toLowerCase().includes(search.toLowerCase()))
    : waGroups

  return (
    <div>
      <div className="px-5 py-2 bg-surface-2 border-b border-border">
        <p className="text-xs font-medium text-fg-2">{account.name}</p>
      </div>
      {isLoading ? (
        <div className="px-5 py-3 text-xs text-fg-3">Carregando grupos...</div>
      ) : filtered.length === 0 ? (
        <div className="px-5 py-3 text-xs text-fg-3">
          {waGroups.length === 0 ? 'Sem grupos (aguarde sync)' : 'Nenhum grupo encontrado'}
        </div>
      ) : (
        filtered.map((g: any) => {
          const added = alreadyAdded.includes(g.id)
          return (
            <div key={g.id} className="flex items-center justify-between px-5 py-2.5 border-b border-border last:border-0 hover:bg-surface-2">
              <div>
                <p className="text-sm text-fg">{g.name || '(sem nome)'}</p>
                {g.size > 0 && <p className="text-xs text-fg-3">{g.size.toLocaleString('pt-BR')} membros</p>}
              </div>
              {added ? (
                <Badge variant="success" size="sm">já adicionado</Badge>
              ) : (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => onAdd(g)}
                  className="text-xs text-accent hover:underline disabled:opacity-50"
                >
                  + Adicionar
                </button>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}

// ── Aba: Link público ─────────────────────────────────────────────────────────

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function ChannelPublicLink({ channelId, channel }: { channelId: string; channel: { name?: string; slug?: string } }) {
  const qc = useQueryClient()
  const baseURL = usePublicLinkBaseURL() // respeita app_domain configurado em Settings
  const initialSlug = channel.slug || slugify(channel.name || '')
  const [slug, setSlug] = React.useState(initialSlug)
  const [copied, setCopied] = React.useState(false)

  React.useEffect(() => {
    setSlug(channel.slug || slugify(channel.name || ''))
  }, [channel.slug, channel.name])

  const fullURL = `${baseURL}/canal/${slug}`

  const saveMut = useMutation({
    mutationFn: () => apiClient.put(`/api/channels/${channelId}`, { ...channel, slug }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['channels', channelId] })
      qc.invalidateQueries({ queryKey: ['channels'] })
    },
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Erro ao salvar slug'),
  })

  const handleCopy = () => {
    navigator.clipboard.writeText(fullURL).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const slugChanged = slug !== (channel.slug || slugify(channel.name || ''))

  return (
    <div className="max-w-2xl space-y-4">
      <p className="text-sm text-fg-2">
        Link público compartilhável. Aponta para uma página que oferece os grupos disponíveis (WhatsApp/Telegram) para o usuário escolher.
        Quando um grupo enche, basta atualizar o link de convite na aba <strong>Grupos</strong>.
      </p>

      <div>
        <label className="text-xs text-fg-2 block mb-1">Slug (parte da URL)</label>
        <div className="flex items-center gap-2">
          <span className="text-sm text-fg-3 font-mono">{baseURL.replace(/^https?:\/\//, '')}/canal/</span>
          <input
            value={slug}
            onChange={e => setSlug(slugify(e.target.value))}
            placeholder={slugify(channel.name || 'meu-canal')}
            className="flex-1 text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent font-mono"
          />
          <Button
            variant="primary"
            size="sm"
            disabled={!slug || !slugChanged || saveMut.isPending}
            onClick={() => saveMut.mutate()}
            loading={saveMut.isPending}
          >
            Salvar
          </Button>
        </div>
        <p className="text-xs text-fg-3 mt-1">
          Por default, gerado do nome do canal. Pode ser editado para algo mais curto.
        </p>
      </div>

      <div className="border border-border rounded-md p-4 bg-surface-2">
        <p className="text-xs text-fg-2 font-medium uppercase tracking-wide mb-2">Link completo</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-sm font-mono text-accent bg-surface border border-border rounded px-2 py-1.5 truncate">
            {fullURL}
          </code>
          <Button variant="secondary" size="sm" onClick={handleCopy}>
            {copied ? '✓ Copiado' : 'Copiar'}
          </Button>
          <a href={fullURL} target="_blank" rel="noopener" className="text-sm text-accent hover:underline px-2">
            abrir →
          </a>
        </div>
      </div>

      <div className="text-xs text-fg-3 border-t border-border pt-3">
        Ao acessar, o usuário vê uma página com os grupos ativos do canal e escolhe um para entrar.
        Configure os grupos e seus invite links na aba <strong>Grupos</strong>.
      </div>
    </div>
  )
}

// ── Bar chart 7 dias ──────────────────────────────────────────────────────────

interface DayPoint { day: string; value: number }

const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function emptyLast7Days(): DayPoint[] {
  const today = new Date()
  const out: DayPoint[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    out.push({ day: WEEKDAY_LABELS[d.getDay()], value: 0 })
  }
  return out
}

function DisparoChart({ metrics }: { metrics: any }) {
  const { data, hasData } = React.useMemo(() => {
    const series = metrics?.dispatches_7d_series
    if (Array.isArray(series) && series.length > 0) {
      const mapped = (series as { day: string; value: number }[]).map(p => ({ day: p.day, value: p.value }))
      return { data: mapped, hasData: mapped.some(p => p.value > 0) }
    }
    return { data: emptyLast7Days(), hasData: false }
  }, [metrics])

  return (
    <div className="border border-border rounded-md p-4 bg-surface">
      <p className="text-xs text-fg-3 font-medium uppercase tracking-wide mb-3">
        Disparos — últimos 7 dias
      </p>
      {hasData ? (
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={data} margin={{ top: 2, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #e5e7eb)" vertical={false} />
            <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'var(--color-fg-3, #9ca3af)' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: 'var(--color-fg-3, #9ca3af)' }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: 'var(--color-surface, #fff)', border: '1px solid var(--color-border, #e5e7eb)', borderRadius: 6, fontSize: 12 }}
              cursor={{ fill: 'var(--color-surface-2, #f3f4f6)' }}
            />
            <Bar dataKey="value" name="Disparos" fill="var(--color-accent, #6366f1)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex items-end gap-2 h-[120px] px-2 pb-4 opacity-40">
          {data.map((p, i) => (
            <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1">
              <div className="w-full bg-fg-3/20 rounded-t-sm" style={{ height: '4px' }} />
              <span className="text-[10px] text-fg-3">{p.day}</span>
            </div>
          ))}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-xs text-fg-3 italic">sem disparos no período</span>
          </div>
        </div>
      )}
    </div>
  )
}

const TABS = [
  { id: 'overview', label: 'Visão geral' },
  { id: 'audience', label: 'Audiência' },
  { id: 'automation', label: 'Automação' },
  { id: 'groups', label: 'Grupos' },
  { id: 'history', label: 'Histórico' },
  { id: 'queue', label: 'Fila' },
  { id: 'publiclink', label: 'Link público' },
]

export default function ChannelDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [tab, setTab] = React.useState('overview')
  const [showEdit, setShowEdit] = React.useState(false)
  const [editForm, setEditForm] = React.useState({ name: '', description: '', active: true })

  const { data: channel, isLoading } = useQuery({
    queryKey: ['channels', id],
    queryFn: () => apiClient.get(`/api/channels/${id}`).then(r => r.data),
    enabled: !!id,
  })

  const { data: metrics } = useQuery({
    queryKey: ['channels', id, 'metrics'],
    queryFn: () => apiClient.get(`/api/channels/${id}/metrics?period=30d`).then(r => r.data).catch(() => ({})),
    enabled: !!id,
  })

  const { data: audience } = useQuery({
    queryKey: ['channels', id, 'audience'],
    queryFn: () => apiClient.get(`/api/channels/${id}/audience`).then(r => r.data).catch(() => ({})),
    enabled: tab === 'audience' && !!id,
  })

  const qc = useQueryClient()

  // Pré-popular form de edição quando canal carrega
  React.useEffect(() => {
    if (channel) setEditForm({ name: channel.name ?? '', description: channel.description ?? '', active: channel.active ?? true })
  }, [channel])

  const updateMut = useMutation({
    mutationFn: () => apiClient.put(`/api/channels/${id}`, {
      ...channel,
      name: editForm.name,
      description: editForm.description,
      active: editForm.active,
    }).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['channels', id] }); qc.invalidateQueries({ queryKey: ['channels'] }); setShowEdit(false) },
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Erro ao salvar'),
  })

  const deleteMut = useMutation({
    mutationFn: () => apiClient.delete(`/api/channels/${id}`),
    onSuccess: () => navigate('/channels'),
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Erro ao excluir'),
  })
  const [showAddGroup, setShowAddGroup] = React.useState(false)
  const [search, setSearch] = React.useState('')
  const [editingInviteLink, setEditingInviteLink] = React.useState<Record<number, string>>({})

  const [showSuggest, setShowSuggest] = React.useState(false)
  const [suggestResult, setSuggestResult] = React.useState<any>(null)
  const [suggestLoading, setSuggestLoading] = React.useState(false)

  const runSuggest = async () => {
    setSuggestLoading(true)
    setSuggestResult(null)
    setShowSuggest(true)
    try {
      const r = await apiClient.post('/api/automations/' + String(id) + '/advise', {}, { timeout: 60_000 })
      setSuggestResult(r.data)
    } catch (e: any) {
      setSuggestResult({ error: e?.response?.data?.error ?? e?.message ?? 'Falha ao buscar sugestões' })
    } finally {
      setSuggestLoading(false)
    }
  }

  const updateInviteLinkMut = useMutation({
    mutationFn: ({ groupId, link }: { groupId: number; link: string }) =>
      apiClient.patch(`/api/groups/${groupId}`, { invite_link: link }),
    onSuccess: (_, { groupId }) => {
      qc.invalidateQueries({ queryKey: ['groups', { channelId: id }] })
      setEditingInviteLink(prev => { const n = { ...prev }; delete n[groupId]; return n })
    },
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Erro ao salvar link'),
  })

  const fetchInviteMut = useMutation({
    mutationFn: (groupId: number) =>
      apiClient.post(`/api/groups/${groupId}/fetch-invite`).then(r => r.data as { invite_link?: string }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['groups', { channelId: id }] }),
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Erro ao buscar link via WhatsApp'),
  })

  // Automação do canal
  const { data: automationRow, refetch: refetchAutomation } = useQuery<any>({
    queryKey: ['automations', id],
    queryFn: () => apiClient.get(`/api/automations/${id}`).then(r => r.data?.automation ?? null).catch(() => null),
    enabled: tab === 'automation' && !!id,
  })
  const [autoForm, setAutoForm] = React.useState<any>({})
  React.useEffect(() => { if (automationRow) setAutoForm(automationRow) }, [automationRow])
  const saveAutoMut = useMutation({
    mutationFn: () => apiClient.put(`/api/automations/${id}`, autoForm).then(r => r.data),
    onSuccess: () => refetchAutomation(),
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Erro ao salvar'),
  })

  const { data: groups = [] } = useQuery({
    queryKey: ['groups', { channelId: id }],
    queryFn: () => apiClient.get(`/api/groups?channelId=${id}`).then(r => Array.isArray(r.data) ? r.data : []).catch(() => []),
    enabled: tab === 'groups' && !!id,
  })

  // Buscar contas WA e seus grupos reais (para o modal de adicionar)
  const { data: waAccounts = [] } = useQuery({
    queryKey: ['accounts', 'wa'],
    queryFn: () => apiClient.get('/api/accounts/wa').then(r => Array.isArray(r.data) ? r.data : []),
    enabled: showAddGroup,
  })

  // Para cada conta conectada, buscar grupos WA reais
  const connectedAccounts = waAccounts.filter((a: any) => a.active)

  const addGroupMut = useMutation({
    mutationFn: (g: { name: string; jid: string; accountId: number }) =>
      apiClient.post('/api/groups', {
        channel_id: Number(id),
        name: g.name,
        platform: 'whatsapp',
        jid: g.jid,
        account_id: g.accountId,
        status: 'active',
      }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groups', { channelId: id }] })
      setShowAddGroup(false)
      setSearch('')
    },
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Erro ao adicionar grupo'),
  })

  const removeGroupMut = useMutation({
    mutationFn: (groupId: number) => apiClient.delete(`/api/groups/${groupId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['groups', { channelId: id }] }),
  })

  if (isLoading) return <div className="p-6"><Skeleton className="h-48 w-full" /></div>
  if (!channel) return <div className="p-6 text-fg-2">Canal não encontrado</div>

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-6 border-b border-border">
        <div className="flex items-center gap-3 mb-2">
          <button onClick={() => navigate('/channels')} className="text-fg-3 hover:text-fg text-sm">← Canais</button>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-fg">{channel.name}</h1>
            {channel.description && <p className="text-sm text-fg-2">{channel.description}</p>}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={channel.active ? 'success' : 'default'}>{channel.active ? 'ativo' : 'inativo'}</Badge>
            <UITooltip content="Pedir conselho à IA com base nos últimos disparos deste canal — sugere ajustes de threshold, cooldown e horário" side="bottom">
              <Button variant="secondary" size="sm" loading={suggestLoading} onClick={runSuggest}>
                ✨ Sugerir
              </Button>
            </UITooltip>
            <Button variant="secondary" size="sm" onClick={() => setShowEdit(true)}>Editar</Button>
            <Button variant="danger" size="sm" loading={deleteMut.isPending}
              onClick={() => { if (confirm(`Excluir canal "${channel.name}"? Esta ação é irreversível.`)) deleteMut.mutate() }}>
              Excluir
            </Button>
          </div>
        </div>

        {/* Painel de sugestões da IA */}
        {showSuggest && (
          <div className="border-t border-border bg-surface-2 px-5 py-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-medium text-fg">✨ Sugestões de melhoria — IA</p>
              <button type="button" onClick={() => setShowSuggest(false)} className="text-fg-3 hover:text-fg text-xs">× Fechar</button>
            </div>
            {suggestLoading && <p className="text-xs text-fg-3 mt-1">Analisando desempenho do canal…</p>}
            {suggestResult?.error && (
              <p className="text-xs text-danger mt-1">{suggestResult.error}</p>
            )}
            {suggestResult && !suggestResult.error && (
              <div className="mt-2 space-y-2">
                {suggestResult.summary && <p className="text-sm text-fg-2">{suggestResult.summary}</p>}
                {Array.isArray(suggestResult.suggestions) && suggestResult.suggestions.length > 0 ? (
                  suggestResult.suggestions.map((s: any, i: number) => (
                    <div key={i} className="text-xs border border-border rounded-md p-2 bg-surface">
                      <span className="font-mono text-accent">{s.field}</span>{' '}
                      <span className="text-fg-3">atual: </span><span className="font-mono">{s.current}</span>
                      {' → '}
                      <span className="text-fg-3">sugerido: </span><span className="font-mono text-success">{s.recommended}</span>
                      {s.reason && <p className="text-fg-3 mt-0.5">{s.reason}</p>}
                    </div>
                  ))
                ) : (
                  !suggestLoading && <p className="text-xs text-fg-3">Nenhuma sugestão — canal já está bem configurado.</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal de edição */}
      {showEdit && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowEdit(false)}>
          <div className="bg-surface border border-border rounded-lg p-6 w-full max-w-md shadow-modal" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-fg mb-4">Editar canal</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-fg-2 block mb-1">Nome *</label>
                <input className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent"
                  value={editForm.name} onChange={e => setEditForm(f => ({...f, name: e.target.value}))} />
              </div>
              <div>
                <label className="text-xs text-fg-2 block mb-1">Descrição</label>
                <textarea rows={3} className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent resize-none"
                  value={editForm.description} onChange={e => setEditForm(f => ({...f, description: e.target.value}))} />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={editForm.active} onChange={e => setEditForm(f => ({...f, active: e.target.checked}))} className="accent-accent" />
                <span className="text-sm text-fg">Canal ativo</span>
              </label>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <Button variant="secondary" size="sm" onClick={() => setShowEdit(false)}>Cancelar</Button>
              <Button variant="primary" size="sm" loading={updateMut.isPending} disabled={!editForm.name.trim()} onClick={() => updateMut.mutate()}>Salvar</Button>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs tabs={TABS} active={tab} onChange={setTab} className="px-6" />

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {tab === 'overview' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard
                label="Disparos 7D"
                tooltip="Número de mensagens enviadas pelos grupos deste canal nos últimos 7 dias."
                value={metrics?.dispatches_7d ?? metrics?.dispatches_last_7d ?? '—'}
              />
              <KpiCard
                label="CTR"
                tooltip="Click-Through Rate: percentual de pessoas que clicaram no link após receber a mensagem. Calculado sobre os últimos 30 dias."
                value={metrics?.ctr ? `${(metrics.ctr * 100).toFixed(1)}%` : '—'}
              />
              <KpiCard
                label="Produtos"
                tooltip="Quantidade de produtos únicos já disparados para os grupos deste canal."
                value={metrics?.product_count ?? metrics?.products ?? '—'}
              />
              <KpiCard
                label="Cliques estimados"
                tooltip="Total de cliques registrados nos links dos disparos enviados para os grupos deste canal."
                value={
                  metrics?.estimated_clicks != null
                    ? Number(metrics.estimated_clicks).toLocaleString('pt-BR')
                    : '—'
                }
              />
            </div>
            <DisparoChart metrics={metrics} />
          </div>
        )}

        {tab === 'audience' && (
          <AudienceEditor channelId={id!} audience={audience} />
        )}

        {tab === 'groups' && (
          <div>
            {/* Header da tab */}
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-fg-2">{groups.length} grupo{groups.length !== 1 ? 's' : ''} vinculado{groups.length !== 1 ? 's' : ''}</p>
              <Button variant="primary" size="sm" onClick={() => setShowAddGroup(true)}>
                + Adicionar grupo
              </Button>
            </div>

            {/* Modal — lista de grupos WA reais */}
            {showAddGroup && (
              <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => { setShowAddGroup(false); setSearch('') }}>
                <div className="bg-surface border border-border rounded-lg w-full max-w-lg max-h-[80vh] flex flex-col shadow-modal" onClick={e => e.stopPropagation()}>
                  <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                    <h3 className="font-medium text-fg">Selecionar grupo WhatsApp</h3>
                    <button type="button" onClick={() => setShowAddGroup(false)} className="text-fg-3 hover:text-fg text-lg leading-none">×</button>
                  </div>

                  {/* Busca */}
                  <div className="px-5 py-3 border-b border-border">
                    <input
                      autoFocus
                      className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent"
                      placeholder="Buscar grupo..."
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                    />
                  </div>

                  {/* Lista de grupos por conta */}
                  <div className="flex-1 overflow-y-auto">
                    {connectedAccounts.length === 0 ? (
                      <div className="p-6 text-sm text-fg-3 text-center">
                        Nenhuma conta WhatsApp conectada.<br/>
                        Conecte uma conta em <a href="/accounts" className="text-accent hover:underline">Contas conectadas</a>.
                      </div>
                    ) : (
                      connectedAccounts.map((account: any) => (
                        <AccountGroupsPicker
                          key={account.id}
                          account={account}
                          search={search}
                          alreadyAdded={groups.map((g: any) => g.jid).filter(Boolean)}
                          onAdd={(g) => addGroupMut.mutate({ name: g.name, jid: g.id, accountId: account.id })}
                          loading={addGroupMut.isPending}
                        />
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Tabela */}
            {groups.length === 0 ? (
              <p className="text-sm text-fg-3 py-4">Nenhum grupo vinculado. Clique em "+ Adicionar grupo" para associar.</p>
            ) : (
              <div className="border border-border rounded-md overflow-hidden">
                <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-surface-2 border-b border-border">
                      <th className="text-left px-4 py-2 text-xs text-fg-2 font-medium">Nome</th>
                      <th className="text-left px-4 py-2 text-xs text-fg-2 font-medium">Plataforma</th>
                      <th className="text-left px-4 py-2 text-xs text-fg-2 font-medium">Status</th>
                      <th className="text-right px-4 py-2 text-xs text-fg-2 font-medium">Membros</th>
                      <th className="text-left px-4 py-2 text-xs text-fg-2 font-medium">Link de convite</th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((g: any) => (
                      <tr key={g.id} className="border-b border-border last:border-0 hover:bg-surface-2">
                        <td className="px-4 py-2.5 font-medium text-fg">{g.name}</td>
                        <td className="px-4 py-2.5 text-fg-2">{g.platform}</td>
                        <td className="px-4 py-2.5">
                          <Badge variant={g.status === 'active' ? 'success' : 'warning'} size="sm">{g.status}</Badge>
                        </td>
                        <td className="px-4 py-2.5 text-right text-fg-2">{g.member_count ?? 0}</td>
                        <td className="px-4 py-2.5 min-w-[200px]">
                          {editingInviteLink[g.id] !== undefined ? (
                            <div className="flex items-center gap-1">
                              <input
                                autoFocus
                                type="url"
                                placeholder="https://chat.whatsapp.com/..."
                                value={editingInviteLink[g.id]}
                                onChange={e => setEditingInviteLink(prev => ({ ...prev, [g.id]: e.target.value }))}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') updateInviteLinkMut.mutate({ groupId: g.id, link: editingInviteLink[g.id] })
                                  if (e.key === 'Escape') setEditingInviteLink(prev => { const n = { ...prev }; delete n[g.id]; return n })
                                }}
                                className="flex-1 text-xs border border-accent rounded px-2 py-1 bg-surface text-fg outline-none min-w-0"
                              />
                              <button type="button"
                                onClick={() => updateInviteLinkMut.mutate({ groupId: g.id, link: editingInviteLink[g.id] })}
                                className="text-xs text-success hover:underline whitespace-nowrap">✓</button>
                              <button type="button"
                                onClick={() => setEditingInviteLink(prev => { const n = { ...prev }; delete n[g.id]; return n })}
                                className="text-xs text-fg-3 hover:text-fg">✕</button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <button type="button"
                                onClick={() => setEditingInviteLink(prev => ({ ...prev, [g.id]: g.invite_link ?? '' }))}
                                className="text-xs text-left truncate max-w-[180px] block">
                                {g.invite_link
                                  ? <span className="text-accent font-mono truncate">{g.invite_link}</span>
                                  : <span className="text-fg-3 italic">+ definir link</span>}
                              </button>
                              {g.platform === 'whatsapp' && g.jid && (
                                <button type="button"
                                  onClick={() => fetchInviteMut.mutate(g.id)}
                                  disabled={fetchInviteMut.isPending && fetchInviteMut.variables === g.id}
                                  title="Buscar link de convite via WhatsApp"
                                  className="text-xs text-accent hover:underline disabled:opacity-50 whitespace-nowrap">
                                  {fetchInviteMut.isPending && fetchInviteMut.variables === g.id ? '...' : '🔄 WA'}
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            type="button"
                            className="text-xs text-danger hover:underline"
                            onClick={() => { if (confirm(`Remover "${g.name}" deste canal?`)) removeGroupMut.mutate(g.id) }}
                          >
                            Remover
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            )}
          </div>
        )}

{tab === 'automation' && (
          <div className="space-y-5">
            <div className="border border-border rounded-md p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-fg">Canal ativo</p>
                  <p className="text-xs text-fg-3">Habilita toda automação deste canal</p>
                </div>
                <Switch checked={!!autoForm.enabled} onChange={v => setAutoForm((f: any) => ({ ...f, enabled: v }))} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-fg">Auto Match</p>
                  <p className="text-xs text-fg-3">Dispara automaticamente produtos com score alto</p>
                </div>
                <Switch checked={!!autoForm.auto_match_enabled} onChange={v => setAutoForm((f: any) => ({ ...f, auto_match_enabled: v }))} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-fg">Eventos</p>
                  <p className="text-xs text-fg-3">Notifica por eventos de preço (nova oferta, queda...)</p>
                </div>
                <Switch checked={!!autoForm.events_enabled} onChange={v => setAutoForm((f: any) => ({ ...f, events_enabled: v }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-fg-2 block mb-1">Threshold (0–100)</label>
                  <input type="range" min={0} max={100}
                    value={autoForm.threshold ?? 50}
                    onChange={e => setAutoForm((f: any) => ({ ...f, threshold: Number(e.target.value) }))}
                    className="w-full accent-accent" />
                  <div className="flex justify-between text-xs text-fg-3 mt-0.5">
                    <span>0</span><span className="font-semibold text-fg">{autoForm.threshold ?? 50}</span><span>100</span>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-fg-2 block mb-1">Cooldown (horas)</label>
                  <input type="number" min={1} max={168}
                    value={autoForm.cooldown_hours ?? 6}
                    onChange={e => setAutoForm((f: any) => ({ ...f, cooldown_hours: Number(e.target.value) || 6 }))}
                    className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent" />
                </div>
              </div>
              <div>
                <label className="text-xs text-fg-2 block mb-1">Max disparos por ciclo</label>
                <input type="number" min={1} max={50}
                  value={autoForm.max_per_run ?? ''}
                  placeholder="3 (default)"
                  onChange={e => setAutoForm((f: any) => ({ ...f, max_per_run: e.target.value === '' ? null : Number(e.target.value) }))}
                  className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent" />
              </div>
              <Button variant="primary" size="sm" loading={saveAutoMut.isPending} onClick={() => saveAutoMut.mutate()}>
                Salvar automação
              </Button>
            </div>
          </div>
        )}

        {tab === 'history' && (
          <ChannelHistoryOnly channelId={id!} />
        )}

        {tab === 'queue' && (
          <ChannelQueue channelId={id!} />
        )}

        {tab === 'publiclink' && (
          <ChannelPublicLink channelId={id!} channel={channel} />
        )}
      </div>
    </div>
  )
}
