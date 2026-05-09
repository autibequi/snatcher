import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { Badge, Button, Tabs, KpiCard, Skeleton, Switch, Tooltip as UITooltip, TooltipIcon } from '../components/ui'
import { apiClient } from '../lib/apiClient'
import { describeError } from '../lib/errors'
import { usePublicLinkBaseURL } from '../hooks/useBrand'
import AudienceEditor from '../components/AudienceEditor'

/** Garante URL https://chat.whatsapp.com/… (só código, URL sem scheme, etc.) */
function normalizeWhatsAppInvite(raw: string): string {
  const s = raw.trim()
  if (!s) return ''
  const low = s.toLowerCase()
  if (low.startsWith('http://') || low.startsWith('https://')) return s
  if (low.startsWith('//')) return `https:${s}`
  const marker = 'chat.whatsapp.com/'
  const i = low.indexOf(marker)
  if (i >= 0) {
    let rest = s.slice(i + marker.length).trim()
    rest = rest.replace(/^invite\//, '').replace(/^c\//, '')
    const q = rest.indexOf('?')
    if (q >= 0) rest = rest.slice(0, q)
    if (rest) return `https://chat.whatsapp.com/${rest}`
  }
  const tokenOk = /^[\w-]{10,512}$/.test(s) && !s.includes('/') && !s.includes(':') && !/\s/.test(s)
  return tokenOk ? `https://chat.whatsapp.com/${s}` : s
}

function waInviteHref(link: string | null | undefined): string | null {
  if (!link?.trim()) return null
  return normalizeWhatsAppInvite(link)
}

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

      {/* Prévia do auto-match (ainda não são dispatches criados) */}
      <div className="border border-border rounded-md overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border bg-surface-2">
          <p className="text-sm font-medium text-fg">Próximos disparos · prévia do match</p>
          <p className="text-xs text-fg-3">
            Candidatos com score ≥ threshold para o próximo ciclo (não é a fila WA/TG nem pendentes de aprovação).
          </p>
        </div>
        {queueItems.length === 0 ? (
          <p className="px-4 py-4 text-sm text-fg-3">Nenhum candidato elegível na prévia agora.</p>
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

/** Normaliza channel_id da API (pode vir null, número ou objeto estilo NullInt64). */
function groupRowChannelId(row: any): number | null {
  const v = row?.channel_id
  if (v == null || v === '') return null
  if (typeof v === 'object' && v !== null && 'Int64' in v) {
    const n = (v as { Int64?: number; Valid?: boolean }).Int64
    if ((v as { Valid?: boolean }).Valid === false) return null
    return typeof n === 'number' && n > 0 ? n : null
  }
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

function normRegistryPlat(p: string | undefined) {
  const x = String(p ?? '').toLowerCase()
  return x === 'telegram' || x === 'tg' ? 'telegram' : 'whatsapp'
}

/** Uma linha canônica por JID+plataforma (menor id) — evita duas entradas no modal quando o DB tem duplicata. */
function dedupeRegistryByPhysicalJid<T extends { id?: number; jid?: string; platform?: string }>(rows: T[]): T[] {
  const by = new Map<string, T>()
  for (const g of rows) {
    const jid = String(g.jid ?? '').trim().toLowerCase()
    const key = jid ? `${normRegistryPlat(g.platform)}:${jid}` : `id:${g.id}`
    const prev = by.get(key)
    if (!prev) {
      by.set(key, g)
      continue
    }
    if (Number(g.id) < Number(prev.id)) by.set(key, g)
  }
  return Array.from(by.values())
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
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
  { id: 'audience', label: 'Audiência e filtros' },
  { id: 'automation', label: 'Automação' },
  { id: 'groups', label: 'Grupos' },
  { id: 'monitor_am', label: 'Monitor match' },
  { id: 'next_preview', label: 'Próximos produtos' },
  { id: 'envios', label: 'Envios e fila' },
]

const MATCH_TYPES = [
  { value: 'all', label: 'Todos os produtos' },
  { value: 'category', label: 'Categoria' },
  { value: 'brand', label: 'Marca' },
  { value: 'keyword', label: 'Palavra-chave' },
]

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

export interface ChannelDetailInnerProps {
  channelId: string
  embedded?: boolean
  onClose?: () => void
}

export function ChannelDetailInner({ channelId, embedded, onClose }: ChannelDetailInnerProps) {
  const id = channelId
  const navigate = useNavigate()
  const [tab, setTab] = React.useState('overview')
  const publicLinkBase = usePublicLinkBaseURL()
  const [channelDraft, setChannelDraft] = React.useState({
    name: '',
    description: '',
    active: true,
    slug: '',
  })
  const [publicLinkCopied, setPublicLinkCopied] = React.useState(false)

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

  React.useEffect(() => {
    if (!channel) return
    setChannelDraft({
      name: channel.name ?? '',
      description: channel.description ?? '',
      active: channel.active ?? true,
      slug: channel.slug || slugify(channel.name || ''),
    })
  }, [channel])

  const channelDraftDirty = !!channel && (
    channelDraft.name.trim() !== (channel.name ?? '').trim() ||
    (channelDraft.description ?? '').trim() !== (channel.description ?? '').trim() ||
    channelDraft.active !== !!channel.active ||
    channelDraft.slug !== (channel.slug || slugify(channel.name ?? ''))
  )

  const updateMut = useMutation({
    mutationFn: () =>
      apiClient.put(`/api/channels/${id}`, {
        ...channel,
        name: channelDraft.name.trim(),
        description: channelDraft.description.trim(),
        active: channelDraft.active,
        slug: channelDraft.slug.trim() || slugify(channelDraft.name.trim()),
      }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['channels', id] })
      qc.invalidateQueries({ queryKey: ['channels'] })
    },
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Erro ao salvar'),
  })

  const deleteMut = useMutation({
    mutationFn: () => apiClient.delete(`/api/channels/${id}`),
    onSuccess: () => {
      onClose?.()
      navigate('/automations/channels')
    },
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
    mutationFn: ({ groupId, link }: { groupId: number; link: string }) => {
      const list = (qc.getQueryData(['groups', { channelId: id }]) as any[]) ?? []
      const g = list.find((x: any) => x.id === groupId)
      const normalized =
        g?.platform === 'whatsapp' && link.trim() ? normalizeWhatsAppInvite(link) : link.trim()
      return apiClient.patch(`/api/groups/${groupId}`, { invite_link: normalized })
    },
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
    enabled:
      !!id &&
      (tab === 'automation' ||
        tab === 'audience' ||
        tab === 'monitor_am' ||
        tab === 'next_preview'),
  })

  const { data: automationDetail, isLoading: automationDetailLoading } = useQuery<{ automation: any; logs: AutoMatchLog[] }>({
    queryKey: ['automations', id, 'detail'],
    queryFn: () => apiClient.get(`/api/automations/${id}`).then(r => r.data),
    enabled: tab === 'monitor_am' && !!id,
    staleTime: 30_000,
  })
  const monitorLogs = automationDetail?.logs ?? []

  const { data: channelPreview, isLoading: channelPreviewLoading } = useQuery<{
    items: { product_id: number; product_name: string; score: number; price: number; already_sent: boolean }[]
    threshold: number
    max_per_run: number
  }>({
    queryKey: ['automations', id, 'preview'],
    queryFn: () => apiClient.get(`/api/automations/${id}/preview`).then(r => r.data),
    enabled: tab === 'next_preview' && !!id,
    staleTime: 30_000,
  })
  const previewItems = channelPreview?.items ?? []
  const [autoForm, setAutoForm] = React.useState<any>({})
  React.useEffect(() => { if (automationRow) setAutoForm(automationRow) }, [automationRow])
  const saveAutoMut = useMutation({
    mutationFn: () => apiClient.put(`/api/automations/${id}`, autoForm).then(r => r.data),
    onSuccess: () => {
      refetchAutomation()
      qc.invalidateQueries({ queryKey: ['automations', id, 'detail'] })
    },
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Erro ao salvar'),
  })

  const adviseMut = useMutation({
    mutationFn: () =>
      apiClient
        .post(`/api/automations/${id}/advise`)
        .then(
          r =>
            r.data as {
              summary?: string
              suggestions?: { field: string; current: string; recommended: string; reason: string }[]
            },
        ),
  })

  const globalThreshold = 50
  const globalMaxPerRun = 3
  const needsMatchValue = (autoForm.match_type ?? 'all') !== 'all'
  const dropPct = Math.round((autoForm.drop_threshold ?? 0.1) * 100)

  const { data: groups = [] } = useQuery({
    queryKey: ['groups', { channelId: id }],
    queryFn: () => apiClient.get(`/api/groups?channelId=${encodeURIComponent(String(id))}`).then(r => Array.isArray(r.data) ? r.data : []).catch(() => []),
    enabled: (tab === 'groups' || showAddGroup) && !!id,
  })

  // Grupos já cadastrados na plataforma (página Grupos) — sem buscar WhatsApp/Evolution
  const { data: registryGroups = [], isLoading: registryLoading } = useQuery({
    queryKey: ['groups', 'registry', 'all'],
    queryFn: () => apiClient.get('/api/groups').then(r => (Array.isArray(r.data) ? r.data : [])).catch(() => []),
    enabled: showAddGroup && !!id,
    staleTime: 15_000,
  })

  const linkGroupMut = useMutation({
    mutationFn: async (row: any) => {
      const chId = Number(id)
      const jidKey = String(row.jid ?? '').trim().toLowerCase()
      if (jidKey) {
        const jidDup = groups.some((x: any) => String(x.jid ?? '').trim().toLowerCase() === jidKey)
        if (jidDup) {
          throw new Error('Este grupo (mesmo JID) já está vinculado a este canal.')
        }
      }
      const currentCh = groupRowChannelId(row)
      if (currentCh != null && currentCh === chId) {
        throw new Error('Este grupo já está vinculado a este canal')
      }
      if (currentCh == null) {
        return apiClient.patch(`/api/groups/${row.id}`, { channel_id: chId }).then(r => r.data)
      }
      const plat = row.platform === 'telegram' || row.platform === 'tg' ? 'telegram' : 'whatsapp'
      const body: Record<string, unknown> = {
        channel_id: chId,
        name: row.name,
        platform: plat,
        status: row.status || 'active',
      }
      if (row.jid) body.jid = row.jid
      if (row.wa_account_id != null && row.wa_account_id !== '')
        body.wa_account_id = Number(row.wa_account_id)
      if (row.tg_account_id != null && row.tg_account_id !== '')
        body.tg_account_id = Number(row.tg_account_id)
      return apiClient.post('/api/groups', body).then(r => r.data)
    },
    onSuccess: async (data: any) => {
      await qc.invalidateQueries({ queryKey: ['groups'] })
      await qc.invalidateQueries({ queryKey: ['groups', { channelId: id }] })
      setShowAddGroup(false)
      setSearch('')
      const gid = data?.id ?? data?.ID
      const plat = data?.platform === 'whatsapp' || data?.platform === 'wa'
      if (gid != null && plat && data?.jid) {
        try {
          await apiClient.post(`/api/groups/${gid}/fetch-invite`)
        } catch {
          /* Evolution indisponível — link manual na lista */
        }
      }
    },
    onError: (err: any) =>
      alert(String(err?.response?.data?.error ?? err?.message ?? 'Erro ao vincular grupo')),
  })

  const removeGroupMut = useMutation({
    mutationFn: (groupId: number) => apiClient.delete(`/api/groups/${groupId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['groups', { channelId: id }] }),
  })

  if (isLoading) return <div className="p-6"><Skeleton className="h-48 w-full" /></div>
  if (!channel) return <div className="p-6 text-fg-2">Canal não encontrado</div>

  return (
    <div className={`flex flex-col h-full min-h-0 ${embedded ? 'min-h-0' : ''}`}>
      {/* Header */}
      <div className={`border-b border-border shrink-0 ${embedded ? 'px-4 py-3' : 'p-6'}`}>
        {!embedded && (
          <div className="flex items-center gap-3 mb-2">
            <button onClick={() => navigate('/automations/channels')} className="text-fg-3 hover:text-fg text-sm">
              ← Canais
            </button>
          </div>
        )}
        <div className={`flex items-center justify-between gap-3 flex-wrap ${embedded ? '' : ''}`}>
          {!embedded ? (
            <div>
              <h1 className="text-lg font-semibold text-fg">{channel.name}</h1>
              {channel.description && <p className="text-sm text-fg-2">{channel.description}</p>}
            </div>
          ) : (
            <div className="min-w-0 flex-1 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-fg">{channel.name}</h2>
                <p className="text-xs text-fg-3 line-clamp-2 mt-0.5">{channel.description || 'Sem descrição'}</p>
              </div>
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="text-fg-3 hover:text-fg text-xl leading-none px-2 shrink-0 -mt-0.5"
                  aria-label="Fechar"
                >
                  ×
                </button>
              )}
            </div>
          )}
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant={channel.active ? 'success' : 'default'}>{channel.active ? 'ativo' : 'inativo'}</Badge>
            <UITooltip content="Pedir conselho à IA com base nos últimos disparos deste canal — sugere ajustes de threshold, cooldown e horário" side="bottom">
              <Button variant="secondary" size="sm" loading={suggestLoading} onClick={runSuggest}>
                ✨ Sugerir
              </Button>
            </UITooltip>
            <Button variant="danger" size="sm" loading={deleteMut.isPending}
              onClick={() => { if (confirm(`Excluir canal "${channel.name}"? Esta ação é irreversível.`)) deleteMut.mutate() }}>
              Excluir
            </Button>
          </div>
        </div>

        {/* Painel de sugestões da IA */}
        {showSuggest && (
          <div className={`border-t border-border bg-surface-2 py-3 ${embedded ? 'px-4 mt-3' : 'px-5 mt-4'}`}>
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

      {/* Tabs */}
      <Tabs tabs={TABS} active={tab} onChange={setTab} className={embedded ? 'px-2 overflow-x-auto shrink-0 border-b border-border' : 'px-6'} />

      {/* Content */}
      <div className={embedded ? 'flex-1 overflow-y-auto min-h-0 p-4' : 'flex-1 overflow-y-auto p-6'}>
        {tab === 'overview' && (
          <div className="space-y-4">
            <div className="border border-border rounded-lg p-5 space-y-4 max-w-3xl">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-fg">Dados do canal</p>
                  <p className="text-xs text-fg-3 mt-0.5">
                    Nome, descrição, status e URL pública — salve uma vez. Quando um grupo enche, atualize o convite na aba{' '}
                    <strong>Grupos</strong>.
                  </p>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  loading={updateMut.isPending}
                  disabled={!channelDraft.name.trim() || !channelDraftDirty}
                  onClick={() => updateMut.mutate()}
                >
                  Salvar alterações
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="text-xs text-fg-2 block mb-1">Nome *</label>
                  <input
                    className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent"
                    value={channelDraft.name}
                    onChange={e => setChannelDraft(d => ({ ...d, name: e.target.value }))}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs text-fg-2 block mb-1">Descrição</label>
                  <textarea
                    rows={3}
                    className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent resize-none"
                    value={channelDraft.description}
                    onChange={e => setChannelDraft(d => ({ ...d, description: e.target.value }))}
                  />
                </div>
                <div className="sm:col-span-2 flex items-center justify-between gap-3 rounded-md border border-border/80 px-3 py-2.5 bg-surface-2/50">
                  <div>
                    <p className="text-sm font-medium text-fg">Canal ativo</p>
                    <p className="text-[10px] text-fg-3">Desliga automações e envios deste canal</p>
                  </div>
                  <Switch
                    checked={channelDraft.active}
                    onChange={v => setChannelDraft(d => ({ ...d, active: v }))}
                  />
                </div>
              </div>
              <div className="border-t border-border pt-4 space-y-3">
                <p className="text-xs font-medium text-fg-2 uppercase tracking-wide">Link público</p>
                <div>
                  <label className="text-xs text-fg-2 block mb-1">Slug (parte da URL)</label>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-fg-3 font-mono shrink-0">
                      {publicLinkBase.replace(/^https?:\/\//, '')}/canal/
                    </span>
                    <input
                      value={channelDraft.slug}
                      onChange={e => setChannelDraft(d => ({ ...d, slug: slugify(e.target.value) }))}
                      placeholder={slugify(channelDraft.name || 'meu-canal')}
                      className="flex-1 min-w-[8rem] text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent font-mono"
                    />
                  </div>
                  <p className="text-xs text-fg-3 mt-1">
                    Por padrão vem do nome; pode encurtar para um URL mais limpo (salva junto com os dados acima).
                  </p>
                </div>
                <div className="border border-border rounded-md p-3 bg-surface-2">
                  <p className="text-[10px] text-fg-2 font-medium uppercase tracking-wide mb-2">Preview</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="flex-1 min-w-0 text-xs font-mono text-accent bg-surface border border-border rounded px-2 py-1.5 truncate">
                      {`${publicLinkBase}/canal/${channelDraft.slug || slugify(channelDraft.name || 'canal')}`}
                    </code>
                    <Button
                      variant="secondary"
                      size="sm"
                      type="button"
                      onClick={() => {
                        const u = `${publicLinkBase}/canal/${channelDraft.slug || slugify(channelDraft.name || 'canal')}`
                        void navigator.clipboard.writeText(u).then(() => {
                          setPublicLinkCopied(true)
                          setTimeout(() => setPublicLinkCopied(false), 2000)
                        })
                      }}
                    >
                      {publicLinkCopied ? '✓ Copiado' : 'Copiar'}
                    </Button>
                    <a
                      href={`${publicLinkBase}/canal/${channelDraft.slug || slugify(channelDraft.name || 'canal')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-accent hover:underline whitespace-nowrap"
                    >
                      abrir →
                    </a>
                  </div>
                </div>
                <p className="text-xs text-fg-3">
                  Quem abre vê os grupos ativos e escolhe um para entrar. Links de convite por grupo continuam na aba Grupos.
                </p>
              </div>
            </div>

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
          <div className="space-y-6">
            <AudienceEditor channelId={id!} audience={audience} />
            <div className="border border-border rounded-md p-4 space-y-3">
              <p className="text-xs font-medium text-fg">Filtro estrito (descarta antes de pontuar)</p>
              <p className="text-xs text-fg-3">
                Produtos que não passam neste filtro nem entram na pontuação. Mesmos campos da automação — salve abaixo.
              </p>
              <div>
                <label className="text-xs text-fg-2 block mb-1">Tipo de filtro</label>
                <select
                  className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg"
                  value={autoForm.match_type ?? 'all'}
                  onChange={e => setAutoForm((f: any) => ({ ...f, match_type: e.target.value }))}
                >
                  {MATCH_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              {needsMatchValue && (
                <div>
                  <label className="text-xs text-fg-2 block mb-1">
                    Valor ({MATCH_TYPES.find(t => t.value === autoForm.match_type)?.label?.toLowerCase() ?? autoForm.match_type})
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: suplementos / growth / whey"
                    value={autoForm.match_value ?? ''}
                    onChange={e => setAutoForm((f: any) => ({ ...f, match_value: e.target.value || null }))}
                    className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent"
                  />
                </div>
              )}
              <div>
                <label className="text-xs text-fg-2 block mb-1">Preço máximo absoluto (R$, opcional)</label>
                <input
                  type="number"
                  min={0}
                  placeholder="ex: 199.90"
                  value={autoForm.max_price ?? ''}
                  onChange={e =>
                    setAutoForm((f: any) => ({
                      ...f,
                      max_price: e.target.value === '' ? null : Number(e.target.value),
                    }))
                  }
                  className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent"
                />
              </div>
              <Button variant="primary" size="sm" loading={saveAutoMut.isPending} onClick={() => saveAutoMut.mutate()}>
                Salvar filtros de automação
              </Button>
            </div>
          </div>
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
                    <div>
                      <h3 className="font-medium text-fg">Vincular grupo ao canal</h3>
                      <p className="text-[11px] text-fg-3 mt-1 leading-snug">
                        Lista apenas grupos já cadastrados na página{' '}
                        <a href="/groups" className="text-accent hover:underline" onClick={e => e.stopPropagation()}>Grupos</a>.
                        Para incluir um grupo novo do WhatsApp, cadastre-o lá primeiro.
                        {' '}
                        Se o grupo já estiver ligado a outro canal, ao vincular aqui o sistema cria uma nova linha para este canal (mesmo grupo físico; pode haver mais de uma linha na página Grupos).
                      </p>
                    </div>
                    <button type="button" onClick={() => setShowAddGroup(false)} className="text-fg-3 hover:text-fg text-lg leading-none shrink-0">×</button>
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

                  <div className="flex-1 overflow-y-auto">
                    {registryLoading ? (
                      <div className="px-5 py-6 text-xs text-fg-3 text-center">Carregando grupos cadastrados...</div>
                    ) : (() => {
                      const linkedIds = new Set(groups.map((g: any) => Number(g.id)))
                      const linkedJids = new Set(
                        groups.map((g: any) => String(g.jid ?? '').trim().toLowerCase()).filter(Boolean),
                      )
                      const dedupedRegistry = dedupeRegistryByPhysicalJid(registryGroups)
                      const available = dedupedRegistry.filter((g: any) => {
                        if (linkedIds.has(Number(g.id))) return false
                        const j = String(g.jid ?? '').trim().toLowerCase()
                        if (j && linkedJids.has(j)) return false
                        return true
                      })
                      const q = search.trim().toLowerCase()
                      const filtered = q
                        ? available.filter((g: any) => {
                            const name = String(g.name ?? '').toLowerCase()
                            const ch = String(g.channel_name ?? '').toLowerCase()
                            const jid = String(g.jid ?? '').toLowerCase()
                            return name.includes(q) || ch.includes(q) || jid.includes(q)
                          })
                        : available
                      if (registryGroups.length === 0) {
                        return (
                          <div className="p-6 text-sm text-fg-3 text-center space-y-2">
                            <p>Nenhum grupo cadastrado na plataforma ainda.</p>
                            <p>
                              <a href="/groups" className="text-accent hover:underline">Abrir página Grupos</a>
                              {' '}para adicionar grupos do WhatsApp ou Telegram.
                            </p>
                          </div>
                        )
                      }
                      if (available.length === 0) {
                        return (
                          <div className="px-5 py-6 text-sm text-fg-3 text-center">
                            Todos os grupos cadastrados já estão vinculados a este canal.
                          </div>
                        )
                      }
                      if (filtered.length === 0) {
                        return <div className="px-5 py-6 text-xs text-fg-3 text-center">Nenhum grupo encontrado para esta busca.</div>
                      }
                      return filtered.map((g: any) => {
                        const ch = groupRowChannelId(g)
                        const plat = g.platform === 'telegram' || g.platform === 'tg' ? 'Telegram' : 'WhatsApp'
                        return (
                          <div
                            key={g.id}
                            className="flex items-center justify-between px-5 py-2.5 border-b border-border last:border-0 hover:bg-surface-2 gap-3"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-sm text-fg truncate">{g.name || '(sem nome)'}</p>
                              <p className="text-[10px] text-fg-3 mt-0.5">
                                {plat}
                                {g.channel_name ? (
                                  <> · canal: <span className="text-fg-2">{g.channel_name}</span></>
                                ) : ch == null ? (
                                  <> · <span className="text-warning">sem canal</span></>
                                ) : null}
                                {(g.member_count ?? g.size) > 0 && (
                                  <> · {(g.member_count ?? g.size).toLocaleString('pt-BR')} membros</>
                                )}
                              </p>
                            </div>
                            <button
                              type="button"
                              disabled={linkGroupMut.isPending}
                              onClick={() => linkGroupMut.mutate(g)}
                              className="text-xs text-accent hover:underline disabled:opacity-50 shrink-0"
                            >
                              + Vincular
                            </button>
                          </div>
                        )
                      })
                    })()}
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
                            <div className="flex items-center gap-2 min-w-0 max-w-[280px]">
                              {g.platform === 'whatsapp' && waInviteHref(g.invite_link) ? (
                                <a
                                  href={waInviteHref(g.invite_link)!}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-accent font-mono truncate hover:underline min-w-0 flex-1"
                                  title="Abrir convite no WhatsApp"
                                >
                                  {waInviteHref(g.invite_link)}
                                </a>
                              ) : g.invite_link ? (
                                <a
                                  href={g.invite_link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-accent font-mono truncate hover:underline min-w-0 flex-1"
                                >
                                  {g.invite_link}
                                </a>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setEditingInviteLink(prev => ({ ...prev, [g.id]: '' }))}
                                  className="text-xs text-fg-3 italic hover:text-fg text-left flex-1 min-w-0"
                                >
                                  + definir link
                                </button>
                              )}
                              {Boolean(String(g.invite_link ?? '').trim()) && (
                                <button
                                  type="button"
                                  onClick={() => setEditingInviteLink(prev => ({ ...prev, [g.id]: g.invite_link ?? '' }))}
                                  className="text-[10px] text-fg-3 hover:text-fg shrink-0"
                                  title="Editar link"
                                >
                                  ✎
                                </button>
                              )}
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
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-border">
              <p className="text-xs text-fg-3">
                Pedir conselho à IA com base nos últimos disparos + tendências.
              </p>
              <button
                type="button"
                disabled={adviseMut.isPending}
                onClick={() => adviseMut.mutate()}
                className="text-xs border border-border rounded px-2 py-1.5 text-accent hover:bg-accent/5 disabled:opacity-50 whitespace-nowrap"
              >
                {adviseMut.isPending ? '⏳ Analisando…' : '✨ Pedir conselho'}
              </button>
            </div>
            {adviseMut.data && (
              <div className="bg-accent/5 border border-accent/30 rounded-md p-3 space-y-2">
                {adviseMut.data.summary && (
                  <p className="text-sm font-medium text-fg">{adviseMut.data.summary}</p>
                )}
                {adviseMut.data.suggestions?.map((s, i) => (
                  <div key={i} className="text-xs">
                    <p className="text-fg-2">
                      <span className="font-mono text-accent">{s.field}</span>{' '}
                      <span className="text-fg-3">atual:</span> <span className="font-mono">{s.current}</span>
                      {' → '}
                      <span className="text-fg-3">sugerido:</span>{' '}
                      <span className="font-mono text-success">{s.recommended}</span>
                    </p>
                    <p className="text-fg-3 mt-0.5">{s.reason}</p>
                  </div>
                ))}
              </div>
            )}
            {adviseMut.isError && (
              <p className="text-xs text-danger">Erro ao pedir conselho: {describeError(adviseMut.error)}</p>
            )}

            <div className="border border-border rounded-md p-5 space-y-4">
              <div className="flex items-center justify-between py-2 border-b border-border">
                <div>
                  <p className="text-sm font-medium text-fg">Canal ativo</p>
                  <p className="text-xs text-fg-3">Habilita toda automação deste canal</p>
                </div>
                <Switch checked={!!autoForm.enabled} onChange={v => setAutoForm((f: any) => ({ ...f, enabled: v }))} />
              </div>
              <div className="flex items-center justify-between py-2 border-b border-border">
                <div>
                  <p className="text-sm font-medium text-fg">Auto Match</p>
                  <p className="text-xs text-fg-3">Dispara automaticamente produtos com score alto</p>
                </div>
                <Switch checked={!!autoForm.auto_match_enabled} onChange={v => setAutoForm((f: any) => ({ ...f, auto_match_enabled: v }))} />
              </div>
              <div className="flex items-center justify-between py-2 border-b border-border">
                <div>
                  <p className="text-sm font-medium text-fg">Eventos</p>
                  <p className="text-xs text-fg-3">Pipeline de eventos de preço (dentro da janela configurada)</p>
                </div>
                <Switch checked={!!autoForm.events_enabled} onChange={v => setAutoForm((f: any) => ({ ...f, events_enabled: v }))} />
              </div>

              <div>
                <label className="text-xs text-fg-2 flex items-center gap-1 mb-1">
                  Threshold de score (0–100)
                  <TooltipIcon content="Score mínimo para disparar neste canal." />
                  <span className="text-fg-3 ml-1">
                    {autoForm.threshold == null ? `(default: ${globalThreshold})` : ''}
                  </span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={autoForm.threshold ?? globalThreshold}
                  onChange={e => setAutoForm((f: any) => ({ ...f, threshold: Number(e.target.value) }))}
                  className="w-full accent-accent"
                />
                <div className="flex justify-between text-xs text-fg-3 mt-0.5">
                  <span>0</span>
                  <span className="font-semibold text-fg">{autoForm.threshold ?? globalThreshold}</span>
                  <span>100</span>
                </div>
                <button
                  type="button"
                  className="text-xs text-fg-3 hover:text-accent mt-1"
                  onClick={() => setAutoForm((f: any) => ({ ...f, threshold: null }))}
                >
                  Usar default global ({globalThreshold})
                </button>
              </div>

              <div>
                <label className="text-xs text-fg-2 flex items-center gap-1 mb-1">
                  Max disparos por ciclo
                  <TooltipIcon content="Máximo de produtos por ciclo automático neste canal." />
                  <span className="text-fg-3 ml-1">
                    {autoForm.max_per_run == null ? `(default: ${globalMaxPerRun})` : ''}
                  </span>
                </label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={autoForm.max_per_run ?? ''}
                  placeholder={String(globalMaxPerRun)}
                  onChange={e =>
                    setAutoForm((f: any) => ({
                      ...f,
                      max_per_run: e.target.value === '' ? null : Number(e.target.value),
                    }))
                  }
                  className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="text-xs text-fg-2 flex items-center gap-1 mb-1">
                  Cooldown entre disparos (horas)
                  <TooltipIcon content="Evita reenviar o mesmo produto para este canal dentro do período." />
                </label>
                <input
                  type="number"
                  min={1}
                  max={168}
                  value={autoForm.cooldown_hours ?? 6}
                  onChange={e => setAutoForm((f: any) => ({ ...f, cooldown_hours: Number(e.target.value) || 6 }))}
                  className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="text-xs text-fg-2 block mb-1">Pausar até (opcional)</label>
                <input
                  type="datetime-local"
                  value={autoForm.paused_until ? autoForm.paused_until.slice(0, 16) : ''}
                  onChange={e =>
                    setAutoForm((f: any) => ({
                      ...f,
                      paused_until: e.target.value ? new Date(e.target.value).toISOString() : null,
                    }))
                  }
                  className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent"
                />
                {autoForm.paused_until && (
                  <button
                    type="button"
                    className="text-xs text-fg-3 hover:text-accent mt-1"
                    onClick={() => setAutoForm((f: any) => ({ ...f, paused_until: null }))}
                  >
                    Remover pausa
                  </button>
                )}
              </div>
            </div>

            <div className="border border-border rounded-md p-5 space-y-4">
              <p className="text-sm font-semibold text-fg">Notificações (eventos)</p>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!autoForm.notify_new}
                  onChange={e => setAutoForm((f: any) => ({ ...f, notify_new: e.target.checked }))}
                  className="accent-accent"
                />
                <div>
                  <p className="text-sm text-fg">Produto novo encontrado</p>
                  <p className="text-xs text-fg-3">Notifica quando um produto que atende ao filtro aparece no catálogo</p>
                </div>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!autoForm.notify_drop}
                  onChange={e => setAutoForm((f: any) => ({ ...f, notify_drop: e.target.checked }))}
                  className="accent-accent"
                />
                <div>
                  <p className="text-sm text-fg">Queda de preço</p>
                  <p className="text-xs text-fg-3">Notifica quando o preço cair mais que o threshold abaixo</p>
                </div>
              </label>
              <div>
                <label className="text-xs text-fg-2 block mb-1">Threshold de queda (%) — atualmente {dropPct}%</label>
                <input
                  type="range"
                  min={1}
                  max={50}
                  value={dropPct}
                  disabled={!autoForm.notify_drop}
                  onChange={e =>
                    setAutoForm((f: any) => ({ ...f, drop_threshold: Number(e.target.value) / 100 }))
                  }
                  className="w-full accent-accent disabled:opacity-40"
                />
                <div className="flex justify-between text-xs text-fg-3 mt-0.5">
                  <span>1%</span>
                  <span className="font-semibold text-fg">{dropPct}%</span>
                  <span>50%</span>
                </div>
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!autoForm.notify_lowest}
                  onChange={e => setAutoForm((f: any) => ({ ...f, notify_lowest: e.target.checked }))}
                  className="accent-accent"
                />
                <div>
                  <p className="text-sm text-fg">Menor preço histórico</p>
                  <p className="text-xs text-fg-3">Notifica quando atingir o menor preço registrado</p>
                </div>
              </label>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="primary" size="sm" loading={saveAutoMut.isPending} onClick={() => saveAutoMut.mutate()}>
                Salvar automação
              </Button>
            </div>
          </div>
        )}

        {tab === 'monitor_am' && (
          <div>
            <p className="text-xs text-fg-2 font-medium uppercase tracking-wide mb-3">Últimos 20 disparos automáticos (auto-match)</p>
            {automationDetailLoading ? (
              <div className="space-y-2">{[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-8 w-full" />)}</div>
            ) : monitorLogs.length === 0 ? (
              <p className="text-sm text-fg-3 py-6 text-center">Nenhum disparo automático registrado para este canal.</p>
            ) : (
              <div className="border border-border rounded-md overflow-hidden overflow-x-auto">
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
                    {monitorLogs.map(log => (
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
                          <span
                            className={`text-xs font-semibold ${log.score >= 70 ? 'text-success' : log.score >= 50 ? 'text-warning' : 'text-fg-2'}`}
                          >
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
        )}

        {tab === 'next_preview' && (
          <div>
            <p className="text-xs text-fg-2 font-medium uppercase tracking-wide mb-3">
              Candidatos ao próximo ciclo (prévia)
              {channelPreview && (
                <span className="ml-1 normal-case font-normal text-fg-3">
                  (score ≥ {channelPreview.threshold} · max {channelPreview.max_per_run}/ciclo)
                </span>
              )}
            </p>
            {channelPreviewLoading ? (
              <div className="space-y-2">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-8 w-full" />)}</div>
            ) : previewItems.length === 0 ? (
              <div className="rounded-lg border border-warning/50 bg-warning/10 p-4 flex items-start gap-3">
                <span className="text-warning text-base mt-0.5">⚠</span>
                <div>
                  <p className="text-sm font-medium text-fg">Nenhum candidato elegível na prévia</p>
                  <p className="text-xs text-fg-3 mt-1">
                    Nenhum produto atende ao threshold e filtros deste canal nos dados analisados.
                  </p>
                </div>
              </div>
            ) : (
              <div className="border border-border rounded-md overflow-hidden overflow-x-auto">
                <table className="w-full text-sm min-w-[480px]">
                  <thead>
                    <tr className="bg-surface-2 border-b border-border">
                      <th className="text-left px-3 py-2 text-xs text-fg-2 font-medium">Produto</th>
                      <th className="text-left px-3 py-2 text-xs text-fg-2 font-medium">
                        <span className="flex items-center gap-1">
                          Score <TooltipIcon content="Afinidade produto-canal (0–100)." side="bottom" />
                        </span>
                      </th>
                      <th className="text-left px-3 py-2 text-xs text-fg-2 font-medium">Preço</th>
                      <th className="text-left px-3 py-2 text-xs text-fg-2 font-medium">Prévia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewItems.map(item => (
                      <tr key={item.product_id} className="border-b border-border last:border-0 hover:bg-surface-2">
                        <td className="px-3 py-2">
                          <p className="text-xs text-fg truncate max-w-[160px]">{item.product_name}</p>
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`text-xs font-semibold ${item.score >= 70 ? 'text-success' : item.score >= 50 ? 'text-warning' : 'text-fg-2'}`}
                          >
                            {fmtScore(item.score)}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span className="text-xs text-fg-3">
                            {item.price > 0 ? `R$ ${item.price.toFixed(2)}` : '—'}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          {item.already_sent ? (
                            <span className="text-xs text-fg-3 italic">cooldown</span>
                          ) : (
                            <span className="text-xs text-success font-medium">elegível</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === 'envios' && <ChannelHistory channelId={id!} />}

      </div>
    </div>
  )
}

export default function ChannelDetail() {
  const { id } = useParams<{ id: string }>()
  if (!id) return <div className="p-6 text-fg-2">Canal não encontrado</div>
  return <ChannelDetailInner channelId={id} />
}
