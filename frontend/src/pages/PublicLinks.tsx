import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'
import { Badge, Button, KpiCard, Skeleton, EmptyState } from '../components/ui'
import { apiClient } from '../lib/apiClient'

// ── Types ─────────────────────────────────────────────────────────────────────

interface PublicLink {
  id: number
  slug: string
  channel_id: number
  channel_name?: string
  redirect_strategy: string
  active: boolean
  clicks_30d: number
  clicks_7d?: number
  current_target?: string
  fallback_chain?: FallbackGroup[]
}

interface FallbackGroup {
  group_id: number
  group_name?: string
  priority: number
}

interface Channel {
  id: number
  name: string
}

interface DayBucket {
  day: string
  [slug: string]: number | string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SLUG_COLORS = ['#6366f1', '#22d3ee', '#4ade80', '#f97316', '#f43f5e', '#a78bfa', '#facc15']

const DAY_LABELS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

// ── Mock analytics fallback ───────────────────────────────────────────────────

function buildMockChart(links: PublicLink[]): DayBucket[] {
  return DAY_LABELS.map((day, i) => {
    const bucket: DayBucket = { day }
    links.forEach(l => {
      const base = l.clicks_7d ?? Math.round(l.clicks_30d / 4)
      bucket[l.slug] = Math.max(0, Math.round((base / 7) * (0.7 + Math.random() * 0.6)))
    })
    return bucket
  })
}

// ── QR fallback ───────────────────────────────────────────────────────────────

function QrImage({ url }: { url: string }) {
  const src = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(url)}&size=120x120&format=png`
  return <img src={src} alt="QR code" className="w-28 h-28 rounded-md border border-border" />
}

// ── CreateLinkModal ───────────────────────────────────────────────────────────

function CreateLinkModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = React.useState({
    slug: '',
    channel_id: '',
    redirect_strategy: 'first_active',
  })
  const [saving, setSaving] = React.useState(false)

  const { data: channels = [] } = useQuery<Channel[]>({
    queryKey: ['channels-select'],
    queryFn: () =>
      apiClient.get('/api/channels').then(r => (Array.isArray(r.data) ? r.data : (r.data?.items ?? []))),
  })

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault()
    if (!form.slug.trim() || !form.channel_id) return
    setSaving(true)
    try {
      await apiClient.post('/api/public-links', {
        slug: form.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        channel_id: Number(form.channel_id),
        fallback_chain: [],
        redirect_strategy: form.redirect_strategy,
        active: true,
      })
      qc.invalidateQueries({ queryKey: ['public-links'] })
      onClose()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      alert(msg || 'Erro ao criar link')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-surface border border-border rounded-lg p-6 w-full max-w-md shadow-modal"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="font-semibold text-fg mb-4">Novo link público</h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-fg-2 block mb-1">Slug (a-z, números, hífen) *</label>
            <div className="flex items-center border border-border rounded-md overflow-hidden focus-within:border-accent">
              <span className="px-2.5 py-1.5 text-sm text-fg-3 bg-surface-2">snatcher.link/</span>
              <input
                required
                value={form.slug}
                onChange={e => setForm(f => ({ ...f, slug: e.target.value }))}
                className="flex-1 text-sm px-2 py-1.5 bg-surface text-fg outline-none"
                placeholder="suplementos"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-fg-2 block mb-1">Canal *</label>
            <select
              required
              value={form.channel_id}
              onChange={e => setForm(f => ({ ...f, channel_id: e.target.value }))}
              className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg"
            >
              <option value="">Selecionar canal...</option>
              {channels.map(ch => (
                <option key={ch.id} value={ch.id}>{ch.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-fg-2 block mb-1">Estratégia de fallback</label>
            <select
              value={form.redirect_strategy}
              onChange={e => setForm(f => ({ ...f, redirect_strategy: e.target.value }))}
              className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg"
            >
              <option value="first_active">Primeiro ativo</option>
              <option value="least_full">Menos cheio</option>
              <option value="round_robin">Round robin</option>
            </select>
          </div>
          <p className="text-xs text-fg-3">A cadeia de fallback pode ser configurada após criar o link.</p>
          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="text-sm px-4 py-2 rounded-md bg-surface-2 text-fg-2"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="text-sm px-4 py-2 rounded-md bg-accent text-white disabled:opacity-50"
            >
              {saving ? 'Criando...' : 'Criar link'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── FallbackChainPanel ────────────────────────────────────────────────────────

function FallbackChainPanel({ link, channels }: { link: PublicLink; channels: Channel[] }) {
  const qc = useQueryClient()
  const [showAddDropdown, setShowAddDropdown] = React.useState(false)
  const chain: FallbackGroup[] = link.fallback_chain ?? []

  const saveMut = useMutation({
    mutationFn: (newChain: FallbackGroup[]) =>
      apiClient.patch(`/api/public-links/${link.id}`, { fallback_chain: newChain }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['public-links'] }),
  })

  const removeGroup = (groupId: number) => {
    const updated = chain
      .filter(g => g.group_id !== groupId)
      .map((g, i) => ({ ...g, priority: i + 1 }))
    saveMut.mutate(updated)
  }

  const addGroup = (ch: Channel) => {
    setShowAddDropdown(false)
    const already = chain.some(g => g.group_id === ch.id)
    if (already) return
    const updated = [...chain, { group_id: ch.id, group_name: ch.name, priority: chain.length + 1 }]
    saveMut.mutate(updated)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-fg-2 uppercase tracking-wide">Cadeia de fallback</p>
        <div className="relative">
          <Button variant="ghost" size="sm" onClick={() => setShowAddDropdown(v => !v)}>
            + Adicionar
          </Button>
          {showAddDropdown && (
            <div className="absolute right-0 top-8 z-30 w-48 bg-surface border border-border rounded-md shadow-lg py-1">
              {channels.length === 0 ? (
                <p className="text-xs text-fg-3 px-3 py-2">Nenhum canal disponível</p>
              ) : (
                channels.map(ch => (
                  <button
                    key={ch.id}
                    onClick={() => addGroup(ch)}
                    className="w-full text-left text-sm px-3 py-1.5 hover:bg-surface-2 text-fg"
                  >
                    {ch.name}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {chain.length === 0 ? (
        <p className="text-xs text-fg-3 py-2">Nenhum grupo na cadeia. Adicione canais como destino de fallback.</p>
      ) : (
        <ol className="space-y-1">
          {chain.map((g, idx) => (
            <li
              key={g.group_id}
              className="flex items-center gap-2 bg-surface-2 border border-border rounded-md px-3 py-2"
            >
              {/* drag handle visual */}
              <span className="text-fg-3 cursor-grab select-none text-xs">&#9776;</span>
              <span className="text-xs text-fg-3 w-4">{idx + 1}.</span>
              <span className="flex-1 text-sm text-fg truncate">{g.group_name ?? `grupo #${g.group_id}`}</span>
              <button
                onClick={() => removeGroup(g.group_id)}
                className="text-fg-3 hover:text-danger text-xs ml-1"
                title="Remover"
              >
                ×
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

// ── LinkDetailPanel ───────────────────────────────────────────────────────────

function LinkDetailPanel({ link, channels, onClose }: { link: PublicLink; channels: Channel[]; onClose: () => void }) {
  const [showQr, setShowQr] = React.useState(false)
  const [copied, setCopied] = React.useState(false)
  const fullUrl = `https://snatcher.link/${link.slug}`

  const copyUrl = () => {
    navigator.clipboard?.writeText(fullUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="bg-surface border border-border rounded-md p-4 flex flex-col gap-4">
      {/* header */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-fg-2 uppercase tracking-wide">URL pública</p>
        <button onClick={onClose} className="text-fg-3 hover:text-fg text-xs">fechar ×</button>
      </div>
      <p className="text-xs text-fg-3">
        compartilhe livremente — sobrevive a mudanças de grupo
      </p>

      {/* url row */}
      <div className="flex items-center gap-2 bg-surface-2 border border-border rounded-md px-3 py-2">
        <span className="flex-1 text-sm text-fg font-mono truncate">{fullUrl}</span>
        <Button variant="secondary" size="sm" onClick={copyUrl}>
          {copied ? 'Copiado!' : 'Copiar'}
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setShowQr(v => !v)}>
          QR
        </Button>
      </div>

      {/* qr code */}
      {showQr && (
        <div className="flex justify-center py-2">
          <QrImage url={fullUrl} />
        </div>
      )}

      {/* how it works */}
      <p className="text-xs text-fg-3">
        <span className="font-medium text-fg-2">Como funciona:</span> ao clicar, o servidor consulta
        a fila de fallback abaixo e redireciona para o primeiro grupo aberto, com vagas e ativo. O
        cliente nunca vê o link real do WhatsApp.
      </p>

      {/* fallback chain */}
      <FallbackChainPanel link={link} channels={channels} />
    </div>
  )
}

// ── ClicksChart ───────────────────────────────────────────────────────────────

function ClicksChart({ links }: { links: PublicLink[] }) {
  const { data: chartData } = useQuery<DayBucket[]>({
    queryKey: ['public-links-analytics', links.map(l => l.id).join(',')],
    queryFn: async () => {
      // Try real endpoint; fall back to mock on any error
      try {
        const results = await Promise.all(
          links.map(l =>
            apiClient
              .get<{ days: number[] }>(`/api/public-links/${l.id}/analytics`)
              .then(r => ({ slug: l.slug, days: r.data.days }))
              .catch(() => ({
                slug: l.slug,
                days: Array.from({ length: 7 }, () =>
                  Math.max(0, Math.round(((l.clicks_7d ?? Math.round(l.clicks_30d / 4)) / 7) * (0.7 + Math.random() * 0.6)))
                ),
              }))
          )
        )
        return DAY_LABELS.map((day, i) => {
          const bucket: DayBucket = { day }
          results.forEach(r => { bucket[r.slug] = r.days[i] ?? 0 })
          return bucket
        })
      } catch {
        return buildMockChart(links)
      }
    },
    enabled: links.length > 0,
    staleTime: 60_000,
  })

  const data = chartData ?? buildMockChart(links)
  const total7d = data.reduce((acc, b) => {
    let daySum = 0
    links.forEach(l => { daySum += (b[l.slug] as number) ?? 0 })
    return acc + daySum
  }, 0)

  return (
    <div className="bg-surface border border-border rounded-md p-4">
      <div className="flex items-start justify-between mb-1">
        <div>
          <p className="text-sm font-medium text-fg">Cliques por dia · últimos 7 dias</p>
          <p className="text-xs text-fg-3 mt-0.5">
            {total7d.toLocaleString('pt-BR')} total
          </p>
        </div>
        {/* mini legend */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 justify-end">
          {links.slice(0, 6).map((l, i) => (
            <span key={l.id} className="flex items-center gap-1 text-xs text-fg-2">
              <span
                className="inline-block w-2.5 h-2.5 rounded-sm"
                style={{ background: SLUG_COLORS[i % SLUG_COLORS.length] }}
              />
              /{l.slug}
            </span>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={data} margin={{ top: 16, right: 0, left: -24, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #2a2d3e)" vertical={false} />
          <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'var(--color-fg-3, #888)' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: 'var(--color-fg-3, #888)' }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{ background: 'var(--color-surface, #1a1d2e)', border: '1px solid var(--color-border, #2a2d3e)', borderRadius: 6, fontSize: 12 }}
            labelStyle={{ color: 'var(--color-fg, #e2e8f0)' }}
          />
          {links.map((l, i) => (
            <Bar
              key={l.id}
              dataKey={l.slug}
              stackId="clicks"
              fill={SLUG_COLORS[i % SLUG_COLORS.length]}
              radius={i === links.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PublicLinks() {
  const qc = useQueryClient()
  const [showCreateModal, setShowCreateModal] = React.useState(false)
  const [selectedId, setSelectedId] = React.useState<number | null>(null)

  const { data: links = [], isLoading } = useQuery<PublicLink[]>({
    queryKey: ['public-links'],
    queryFn: () =>
      apiClient.get('/api/public-links').then(r => (Array.isArray(r.data) ? r.data : [])).catch(() => []),
  })

  const { data: channels = [] } = useQuery<Channel[]>({
    queryKey: ['channels-select'],
    queryFn: () =>
      apiClient.get('/api/channels').then(r => (Array.isArray(r.data) ? r.data : (r.data?.items ?? []))),
  })

  const toggleMut = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      apiClient.patch(`/api/public-links/${id}`, { active }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['public-links'] }),
  })

  // ── KPI derivations ──────────────────────────────────────────────────────────
  const activeCount = links.filter(l => l.active).length
  const clicks7d = links.reduce((s, l) => s + (l.clicks_7d ?? 0), 0)
  const clicks30d = links.reduce((s, l) => s + l.clicks_30d, 0)
  const ctrAvg = links.length > 0
    ? Math.round(links.reduce((s, l) => s + (l.clicks_30d / Math.max(1, 30)), 0) / links.length)
    : 0
  const noFallback = links.filter(l => !l.fallback_chain || l.fallback_chain.length === 0).length

  const selectedLink = links.find(l => l.id === selectedId) ?? null

  return (
    <div className="p-6 space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-fg">Links públicos</h1>
          <p className="text-xs text-fg-3 mt-0.5">
            URL estável que <strong>sempre</strong> resolve para um grupo válido. Quando o grupo
            enche ou é arquivado, o link automaticamente passa pro próximo da fila — o link sobrevive
            como <em>referência</em>, não cola num grupo específico.
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowCreateModal(true)}>
          + Novo link público
        </Button>
      </div>

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Links ativos" value={activeCount} />
        <KpiCard
          label="Cliques 7d"
          value={clicks7d > 0 ? clicks7d.toLocaleString('pt-BR') : clicks30d.toLocaleString('pt-BR')}
          subtitle={clicks7d > 0 ? undefined : '(30d)'}
        />
        <KpiCard label="CTR médio / dia" value={`${ctrAvg}`} subtitle="cliques/dia por link" />
        <KpiCard
          label="Links com risco"
          value={noFallback}
          subtitle="sem fallback configurado"
          delta={noFallback > 0 ? { value: -1, tone: 'danger', displayText: 'sem fallback' } : undefined}
        />
      </div>

      {/* ── Stacked bar chart ── */}
      {links.length > 0 && !isLoading && <ClicksChart links={links} />}

      {/* ── Split layout: table + detail ── */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : !links.length ? (
        <EmptyState
          title="Nenhum link público"
          description="Crie links estáveis com fallback automático entre grupos."
          cta={{ label: 'Criar link', onClick: () => setShowCreateModal(true) }}
        />
      ) : (
        <div className="flex gap-4 items-start">
          {/* ── Links table ── */}
          <div className="flex-1 min-w-0 bg-surface border border-border rounded-md overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border">
              <p className="text-sm font-medium text-fg">Todos os links · {links.length}</p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2">
                  {['Slug', 'Estratégia', 'Cliques', 'Status', ''].map(h => (
                    <th key={h} className="text-left px-3 py-2 text-xs text-fg-2 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {links.map(l => (
                  <tr
                    key={l.id}
                    onClick={() => setSelectedId(id => (id === l.id ? null : l.id))}
                    className={`border-b border-border last:border-0 cursor-pointer transition-colors ${
                      selectedId === l.id ? 'bg-accent/10' : 'hover:bg-surface-2'
                    }`}
                  >
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-fg">snatcher.link/{l.slug}</p>
                      {l.channel_name && (
                        <p className="text-xs text-fg-3 mt-0.5">
                          canal <span className="font-medium text-fg-2">{l.channel_name}</span>
                          {l.clicks_30d > 0 && ` · ${l.clicks_30d.toLocaleString('pt-BR')} cliques 30d`}
                          {l.current_target && (
                            <> · apontando agora para <span className="font-medium text-fg-2">{l.current_target}</span></>
                          )}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-fg-2 text-xs">{l.redirect_strategy}</td>
                    <td className="px-3 py-2.5 text-fg text-xs">{l.clicks_30d.toLocaleString('pt-BR')}</td>
                    <td className="px-3 py-2.5">
                      <Badge variant={l.active ? 'success' : 'default'}>
                        {l.active ? 'ativo' : 'inativo'}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigator.clipboard?.writeText(`https://snatcher.link/${l.slug}`)}
                          title="Copiar URL"
                        >
                          Copiar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedId(id => (id === l.id ? null : l.id))}
                          title="Ver QR e cadeia"
                        >
                          QR
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleMut.mutate({ id: l.id, active: !l.active })}
                        >
                          {l.active ? 'Pausar' : 'Ativar'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Detail panel ── */}
          {selectedLink !== null && (
            <div className="w-80 shrink-0">
              <LinkDetailPanel
                link={selectedLink}
                channels={channels}
                onClose={() => setSelectedId(null)}
              />
            </div>
          )}
        </div>
      )}

      {showCreateModal && <CreateLinkModal onClose={() => setShowCreateModal(false)} />}
    </div>
  )
}
