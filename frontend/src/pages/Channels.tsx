import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  PageHeader,
  Skeleton,
  Switch,
} from '../components/ui'
import { authFetch, authFetchJSON } from '../lib/authFetch'
import {
  pageContainer,
  sectionCard,
  sectionHeader,
  sectionTitle,
  statusChipSuccess,
  statusChipMuted,
  statusChipAccent,
  statusChipWarning,
  formGroup,
  formLabel,
} from '../lib/uiTokens'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Channel {
  id: number
  name: string
  quality_threshold: number
  daily_cap: number
  active: boolean
  created_at: string
}

interface ChannelDetail extends Channel {
  groups: Group[]
}

interface Group {
  id: number
  name: string
  platform: string
  status: string
  member_count: number
  whatsapp_jid?: string
  channel_id?: number | null
}

interface Category {
  id: number
  slug: string
  name: string
}

interface CategoryWeight {
  channel_id: number
  category_id: number
  weight: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function platformBadge(platform: string) {
  const isWA = platform === 'whatsapp' || platform === 'wa'
  const isTG = platform === 'telegram' || platform === 'tg'
  if (isWA) return <span className={statusChipAccent}>WA</span>
  if (isTG) return <span className={statusChipWarning}>TG</span>
  return <span className={statusChipMuted}>{platform}</span>
}

function groupStatusBadge(status: string) {
  if (status === 'active') return <span className={statusChipSuccess}>ativo</span>
  return <span className={statusChipMuted}>{status}</span>
}

// ── Category Weight Sliders ───────────────────────────────────────────────────

function CategoryWeightsEditor({
  channelId,
  categories,
}: {
  channelId: number
  categories: Category[]
}) {
  const qc = useQueryClient()

  const { data: savedWeights = [] } = useQuery<CategoryWeight[]>({
    queryKey: ['channel-weights', channelId],
    queryFn: () => authFetchJSON<CategoryWeight[]>(`/api/channels/${channelId}/weights`, []),
    staleTime: 10_000,
  })

  const [weights, setWeights] = useState<Record<number, number>>({})
  const initialized = Object.keys(weights).length > 0 || savedWeights.length > 0

  // Inicializa com os pesos salvos quando carregam
  const [synced, setSynced] = useState(false)
  if (!synced && savedWeights.length > 0) {
    const map: Record<number, number> = {}
    savedWeights.forEach(w => { map[w.category_id] = w.weight })
    setWeights(map)
    setSynced(true)
  }

  const saveMut = useMutation({
    mutationFn: () => {
      const payload = Object.entries(weights)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => ({ category_id: Number(k), weight: v }))
      return authFetch(`/api/channels/${channelId}/weights`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['channel-weights', channelId] }),
  })

  const total = Object.values(weights).reduce((s, v) => s + v, 0)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-fg-2 uppercase tracking-wide">Categorias de produto</p>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-mono ${total > 100 ? 'text-danger' : total === 100 ? 'text-success' : 'text-fg-3'}`}>
            {total}%
          </span>
          <Button
            size="sm"
            variant={total === 100 ? 'primary' : 'secondary'}
            loading={saveMut.isPending}
            onClick={() => saveMut.mutate()}
          >
            Salvar pesos
          </Button>
        </div>
      </div>

      {categories.length === 0 && (
        <p className="text-xs text-fg-3">Nenhuma categoria cadastrada.</p>
      )}

      <div className="space-y-2">
        {categories.map(cat => {
          const val = weights[cat.id] ?? 0
          return (
            <div key={cat.id} className="flex items-center gap-3">
              <span className="text-xs text-fg-2 w-32 flex-shrink-0 truncate">{cat.name}</span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={val}
                onChange={e => setWeights(prev => ({ ...prev, [cat.id]: Number(e.target.value) }))}
                className="flex-1 accent-accent"
              />
              <span className="text-xs font-mono text-fg-2 w-10 text-right">{val}%</span>
              {val > 0 && (
                <button
                  type="button"
                  onClick={() => setWeights(prev => ({ ...prev, [cat.id]: 0 }))}
                  className="text-[10px] text-fg-3 hover:text-fg"
                >
                  ✕
                </button>
              )}
            </div>
          )
        })}
      </div>

      {total > 100 && (
        <p className="text-xs text-danger">Total ultrapassa 100%. Reduza alguns pesos.</p>
      )}
      {total === 0 && initialized && (
        <p className="text-xs text-fg-3">Sem categorias configuradas — o canal usará produtos de todas as categorias.</p>
      )}
    </div>
  )
}

// ── Channel form ──────────────────────────────────────────────────────────────

interface ChannelFormValues {
  name: string
  quality_threshold: number
  daily_cap: number
  active: boolean
}

const defaultForm = (): ChannelFormValues => ({
  name: '',
  quality_threshold: 0.40,
  daily_cap: 30,
  active: true,
})

function ChannelForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial?: ChannelFormValues
  onSave: (values: ChannelFormValues) => void
  onCancel: () => void
  saving: boolean
}) {
  const [form, setForm] = useState<ChannelFormValues>(initial ?? defaultForm())

  const set = <K extends keyof ChannelFormValues>(k: K, v: ChannelFormValues[K]) =>
    setForm(prev => ({ ...prev, [k]: v }))

  return (
    <div className="space-y-4">
      <div className={formGroup}>
        <label className={formLabel}>Nome</label>
        <input
          type="text"
          className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent"
          value={form.name}
          onChange={e => set('name', e.target.value)}
          placeholder="Nome do canal"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className={formGroup}>
          <label className={formLabel}>Score mínimo</label>
          <input
            type="number"
            className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent"
            value={form.quality_threshold}
            min={0.01}
            max={1.00}
            step={0.01}
            onChange={e => set('quality_threshold', parseFloat(e.target.value) || 0)}
          />
        </div>

        <div className={formGroup}>
          <label className={formLabel}>Cap diário</label>
          <input
            type="number"
            className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent"
            value={form.daily_cap}
            min={1}
            max={200}
            onChange={e => set('daily_cap', parseInt(e.target.value) || 1)}
          />
        </div>
      </div>

      <div className="flex items-center justify-between py-1">
        <span className={formLabel}>Ativo</span>
        <Switch checked={form.active} onChange={v => set('active', v)} />
      </div>

      <div className="flex gap-2 pt-1">
        <Button variant="primary" size="sm" disabled={!form.name.trim() || saving} onClick={() => onSave(form)}>
          {saving ? 'Salvando…' : 'Salvar'}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancelar</Button>
      </div>
    </div>
  )
}

// ── Groups panel (expanded) ───────────────────────────────────────────────────

function ChannelGroupsPanel({
  channelId,
  allGroups,
  onClose,
}: {
  channelId: number
  allGroups: Group[]
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [selectedGroupId, setSelectedGroupId] = useState('')

  const { data: detail, isLoading } = useQuery<ChannelDetail>({
    queryKey: ['channel-detail', channelId],
    queryFn: () => authFetchJSON<ChannelDetail>(`/api/channels/${channelId}`, {} as ChannelDetail),
    staleTime: 10_000,
  })

  const linkMut = useMutation({
    mutationFn: (groupId: number) =>
      authFetch(`/api/channels/${channelId}/groups/${groupId}`, { method: 'POST' }),
    onSuccess: () => {
      setSelectedGroupId('')
      void qc.invalidateQueries({ queryKey: ['channel-detail', channelId] })
      void qc.invalidateQueries({ queryKey: ['channels'] })
    },
  })

  const unlinkMut = useMutation({
    mutationFn: (groupId: number) =>
      authFetch(`/api/channels/${channelId}/groups/${groupId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['channel-detail', channelId] })
      void qc.invalidateQueries({ queryKey: ['channels'] })
    },
  })

  const linkedIds = new Set((detail?.groups ?? []).map(g => g.id))
  const availableGroups = allGroups.filter(g => !linkedIds.has(g.id))

  return (
    <div className="mt-3 border-t border-border pt-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-fg-2 uppercase tracking-wide">Grupos vinculados</p>
        <button type="button" onClick={onClose} className="text-xs text-fg-3 hover:text-fg">fechar</button>
      </div>

      {isLoading ? (
        <div className="space-y-1.5">
          <Skeleton className="h-7 w-full" />
          <Skeleton className="h-7 w-full" />
        </div>
      ) : (detail?.groups ?? []).length === 0 ? (
        <p className="text-xs text-fg-3">Nenhum grupo vinculado.</p>
      ) : (
        <div className="space-y-1.5">
          {(detail?.groups ?? []).map(g => (
            <div key={g.id} className="flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 bg-surface-2">
              <div className="flex items-center gap-2 min-w-0">
                {platformBadge(g.platform)}
                <span className="text-sm text-fg truncate">{g.name}</span>
                {groupStatusBadge(g.status)}
              </div>
              <button
                type="button"
                disabled={unlinkMut.isPending}
                onClick={() => unlinkMut.mutate(g.id)}
                className="text-xs text-danger hover:opacity-80 disabled:opacity-40 whitespace-nowrap flex-shrink-0"
              >
                Desvincular
              </button>
            </div>
          ))}
        </div>
      )}

      {availableGroups.length > 0 && (
        <div className="flex gap-2 pt-1">
          <select
            className="flex-1 text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg"
            value={selectedGroupId}
            onChange={e => setSelectedGroupId(e.target.value)}
          >
            <option value="">Selecionar grupo…</option>
            {availableGroups.map(g => (
              <option key={g.id} value={String(g.id)}>{g.name} ({g.platform})</option>
            ))}
          </select>
          <Button
            variant="primary"
            size="sm"
            disabled={!selectedGroupId || linkMut.isPending}
            onClick={() => {
              if (selectedGroupId) linkMut.mutate(Number(selectedGroupId))
            }}
          >
            Vincular
          </Button>
        </div>
      )}
    </div>
  )
}

// ── Channel card ──────────────────────────────────────────────────────────────

function ChannelCard({
  channel,
  allGroups,
  categories,
  expanded,
  onToggleExpand,
}: {
  channel: Channel & { groups_count?: number }
  allGroups: Group[]
  categories: Category[]
  expanded: boolean
  onToggleExpand: () => void
}) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)

  const updateMut = useMutation({
    mutationFn: (values: ChannelFormValues) =>
      authFetch(`/api/channels/${channel.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: values.name,
          quality_threshold: values.quality_threshold,
          daily_cap: values.daily_cap,
          active: values.active,
        }),
      }),
    onSuccess: () => {
      setEditing(false)
      void qc.invalidateQueries({ queryKey: ['channels'] })
    },
  })

  const deleteMut = useMutation({
    mutationFn: () => authFetch(`/api/channels/${channel.id}`, { method: 'DELETE' }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['channels'] }) },
  })

  const initialForm: ChannelFormValues = {
    name: channel.name,
    quality_threshold: channel.quality_threshold,
    daily_cap: channel.daily_cap,
    active: channel.active,
  }

  return (
    <div className={sectionCard}>
      {editing ? (
        <ChannelForm
          initial={initialForm}
          
          saving={updateMut.isPending}
          onSave={values => updateMut.mutate(values)}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          <div className={sectionHeader}>
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="text-sm font-semibold text-fg truncate">{channel.name}</span>
              {channel.active
                ? <span className={statusChipSuccess}>ativo</span>
                : <span className={statusChipMuted}>inativo</span>
              }
              <span className={statusChipMuted}>
                {channel.groups_count ?? 0} grupo{(channel.groups_count ?? 0) !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                type="button"
                onClick={onToggleExpand}
                className="text-xs text-fg-3 hover:text-fg px-2 py-1 rounded border border-border"
              >
                {expanded ? 'Fechar' : 'Grupos'}
              </button>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-xs text-fg-3 hover:text-fg px-2 py-1 rounded border border-border"
              >
                Editar
              </button>
              <button
                type="button"
                disabled={deleteMut.isPending}
                onClick={() => {
                  if (confirm(`Remover canal "${channel.name}"?`)) deleteMut.mutate()
                }}
                className="text-xs text-danger hover:opacity-80 px-2 py-1 rounded border border-danger/30 disabled:opacity-40"
              >
                Remover
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 text-xs text-fg-3">
            <span>Score min: <span className="text-fg-2 font-medium tabular-nums">{channel.quality_threshold.toFixed(2)}</span></span>
            <span>Cap/dia: <span className="text-fg-2 font-medium tabular-nums">{channel.daily_cap}</span></span>
          </div>
        </>
      )}

      {expanded && !editing && (
        <>
          <CategoryWeightsEditor channelId={channel.id} categories={categories} />
          <ChannelGroupsPanel
            channelId={channel.id}
            allGroups={allGroups}
            onClose={onToggleExpand}
          />
          <ChannelCandidatesPanel channelId={channel.id} />
        </>
      )}
    </div>
  )
}

// ── Channel Candidates Panel ──────────────────────────────────────────────────

interface ChannelCandidate {
  id: number
  title: string
  image_url?: string
  source_id: string
  category_name?: string
  price_current: number
  discount_pct?: number
  quality_score: number
  channel_weight: number
  composite_score: number
  below_threshold: boolean
  send_ready: boolean
  url_alive: boolean
}

function ChannelCandidatesPanel({ channelId }: { channelId: number }) {
  const [show, setShow] = useState(false)

  const { data: candidates = [], isFetching } = useQuery<ChannelCandidate[]>({
    queryKey: ['channel-candidates', channelId],
    queryFn: () => authFetchJSON<ChannelCandidate[]>(`/api/channels/${channelId}/candidates?limit=20`, []),
    enabled: show,
    staleTime: 30_000,
  })

  const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  return (
    <div className="border-t border-border px-4 py-3">
      <button
        className="text-xs font-semibold text-fg-2 uppercase tracking-wide flex items-center gap-1 hover:text-accent"
        onClick={() => setShow(v => !v)}
      >
        {show ? '▾' : '▸'} Produtos pontuados para este canal
        <span className="ml-1 text-[10px] text-fg-3 normal-case font-normal">(debug — mostra mesmo abaixo do threshold)</span>
      </button>

      {show && (
        <div className="mt-3">
          {isFetching && <p className="text-xs text-fg-3">Carregando…</p>}
          {!isFetching && candidates.length === 0 && (
            <p className="text-xs text-fg-3">Nenhum produto no catálogo com quality_score calculado.</p>
          )}
          {!isFetching && candidates.length > 0 && (
            <div className="border rounded-lg bg-surface overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-surface-2 border-b">
                  <tr>
                    <th className="text-left px-2 py-1.5 font-medium text-fg-2">Produto</th>
                    <th className="text-left px-2 py-1.5 font-medium text-fg-2">Categoria</th>
                    <th className="text-right px-2 py-1.5 font-medium text-fg-2">Preço</th>
                    <th className="text-right px-2 py-1.5 font-medium text-fg-2">Quality</th>
                    <th className="text-right px-2 py-1.5 font-medium text-fg-2">Canal%</th>
                    <th className="text-right px-2 py-1.5 font-medium text-fg-2">Score</th>
                    <th className="text-center px-2 py-1.5 font-medium text-fg-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {candidates.map(c => (
                    <tr key={c.id} className={c.below_threshold ? 'opacity-50' : ''}>
                      <td className="px-2 py-1.5 max-w-[220px]">
                        <p className="truncate text-fg" title={c.title}>{c.title}</p>
                        <p className="text-fg-3 text-[10px]">{c.source_id} #{c.id}</p>
                      </td>
                      <td className="px-2 py-1.5 text-fg-3">{c.category_name ?? '—'}</td>
                      <td className="px-2 py-1.5 text-right text-fg">{brl(c.price_current)}</td>
                      <td className={`px-2 py-1.5 text-right font-mono ${c.below_threshold ? 'text-danger' : 'text-fg'}`}>
                        {c.quality_score.toFixed(2)}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-fg-3">
                        {c.channel_weight > 0 ? `${c.channel_weight}%` : '—'}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-accent">
                        {c.composite_score.toFixed(3)}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        {!c.send_ready && <span title="não send_ready">🔴</span>}
                        {!c.url_alive && <span title="URL morta">💀</span>}
                        {c.below_threshold && <span title="abaixo do threshold">⚠️</span>}
                        {c.send_ready && c.url_alive && !c.below_threshold && <span title="elegível">✅</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="px-2 py-1 text-[10px] text-fg-3 border-t">
                ✅ elegível · ⚠️ abaixo do threshold de qualidade · 🔴 não send_ready · 💀 URL morta
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Channels() {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const { data: channels = [], isLoading: channelsLoading } = useQuery<(Channel & { groups_count?: number })[]>({
    queryKey: ['channels'],
    queryFn: () => authFetchJSON<(Channel & { groups_count?: number })[]>('/api/channels', []),
    staleTime: 20_000,
  })

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['template-categories'],
    queryFn: () => authFetchJSON<Category[]>('/api/admin/templates/categories', []),
    staleTime: 60_000,
  })

  const { data: allGroups = [] } = useQuery<Group[]>({
    queryKey: ['groups-all'],
    queryFn: () => authFetchJSON<Group[]>('/api/groups', []),
    staleTime: 30_000,
  })

  const createMut = useMutation({
    mutationFn: (values: ChannelFormValues) =>
      authFetch('/api/channels', {
        method: 'POST',
        body: JSON.stringify({
          name: values.name,
          quality_threshold: values.quality_threshold,
          daily_cap: values.daily_cap,
          active: values.active,
        }),
      }),
    onSuccess: () => {
      setShowCreate(false)
      void qc.invalidateQueries({ queryKey: ['channels'] })
    },
  })

  const toggleExpand = (id: number) =>
    setExpandedId(prev => (prev === id ? null : id))

  return (
    <div className={pageContainer}>
      <PageHeader
        title="Canais"
        subtitle={channelsLoading ? undefined : `${channels.length} canal${channels.length !== 1 ? 'is' : ''}`}
        className="mb-4"
        actions={
          <Button variant="primary" size="sm" onClick={() => setShowCreate(v => !v)}>
            {showCreate ? 'Cancelar' : 'Novo canal'}
          </Button>
        }
      />

      {showCreate && (
        <div className={`${sectionCard} mb-4`}>
          <p className={`${sectionTitle} mb-3`}>Novo canal</p>
          <ChannelForm
            
            saving={createMut.isPending}
            onSave={values => createMut.mutate(values)}
            onCancel={() => setShowCreate(false)}
          />
        </div>
      )}

      {channelsLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : channels.length === 0 ? (
        <div className={sectionCard}>
          <p className="text-sm text-fg-3 text-center py-4">Nenhum canal cadastrado.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {channels.map(ch => (
            <ChannelCard
              key={ch.id}
              channel={ch}
              categories={categories}
              allGroups={allGroups}
              expanded={expandedId === ch.id}
              onToggleExpand={() => toggleExpand(ch.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
