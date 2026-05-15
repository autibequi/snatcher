import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, PageHeader, Skeleton, Switch } from '../components/ui'
import { authFetch, authFetchJSON } from '../lib/authFetch'
import { apiClient } from '../lib/apiClient'
import {
  pageContainer, sectionCard, sectionTitle,
  statusChipSuccess, statusChipMuted, statusChipAccent, statusChipWarning,
  formGroup, formLabel,
} from '../lib/uiTokens'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Channel {
  id: number; name: string; quality_threshold: number
  daily_cap: number; active: boolean; created_at: string
  price_min?: number | null; price_max?: number | null; min_discount_pct?: number
}
interface ChannelWithCount extends Channel { groups_count?: number }
interface ChannelDetail extends Channel { groups: Group[] }
interface Group {
  id: number; name: string; platform: string; status: string
  member_count: number; whatsapp_jid?: string; channel_id?: number | null
}
interface Category { id: number; slug: string; name: string }
interface CategoryWeight { channel_id: number; category_id: number; weight: number }
interface ChannelCandidate {
  id: number; title: string; image_url?: string; source_id: string
  category_name?: string; price_current: number; discount_pct?: number
  quality_score: number; channel_weight: number; composite_score: number
  below_threshold: boolean; send_ready: boolean; url_alive: boolean
}
interface ChannelFormValues {
  name: string; quality_threshold: number; daily_cap: number; active: boolean
  price_min: string; price_max: string; min_discount_pct: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const defaultForm = (): ChannelFormValues => ({
  name: '', quality_threshold: 0.40, daily_cap: 30, active: true,
  price_min: '', price_max: '', min_discount_pct: 0,
})

function platformBadge(platform: string) {
  if (platform === 'whatsapp' || platform === 'wa') return <span className={statusChipAccent}>WA</span>
  if (platform === 'telegram' || platform === 'tg') return <span className={statusChipWarning}>TG</span>
  return <span className={statusChipMuted}>{platform}</span>
}

// ── Channel Form ──────────────────────────────────────────────────────────────

function ChannelForm({ initial, onSave, onCancel, saving }: {
  initial?: ChannelFormValues; onSave: (v: ChannelFormValues) => void
  onCancel: () => void; saving: boolean
}) {
  const [form, setForm] = useState<ChannelFormValues>(initial ?? defaultForm())
  // Reseta o form quando initial muda (ex: após refetch bem-sucedido do canal)
  useEffect(() => { if (initial) setForm(initial) }, [JSON.stringify(initial)])
  const set = <K extends keyof ChannelFormValues>(k: K, v: ChannelFormValues[K]) =>
    setForm(p => ({ ...p, [k]: v }))
  return (
    <div className="space-y-4">
      <div className={formGroup}>
        <label className={formLabel}>Nome</label>
        <input className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent"
          value={form.name} onChange={e => set('name', e.target.value)} placeholder="Nome do canal" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className={formGroup}>
          <label className={formLabel}>Score mínimo</label>
          <input type="number" className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent"
            value={form.quality_threshold} min={0.01} max={1} step={0.01}
            onChange={e => set('quality_threshold', parseFloat(e.target.value) || 0)} />
        </div>
        <div className={formGroup}>
          <label className={formLabel}>Cap diário</label>
          <input type="number" className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent"
            value={form.daily_cap} min={1} max={200}
            onChange={e => set('daily_cap', parseInt(e.target.value) || 1)} />
        </div>
      </div>
      {/* Faixa de preço */}
      <div className={formGroup}>
        <label className={formLabel}>Faixa de preço <span className="font-normal text-fg-3">(filtro duro — vazio = sem limite)</span></label>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-fg-3">R$</span>
            <input type="number" placeholder="Mínimo" min={0} step={1}
              className="w-full text-sm border border-border rounded-md pl-7 pr-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent"
              value={form.price_min} onChange={e => set('price_min', e.target.value)} />
          </div>
          <span className="text-fg-3 text-xs flex-shrink-0">até</span>
          <div className="relative flex-1">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-fg-3">R$</span>
            <input type="number" placeholder="Máximo" min={0} step={1}
              className="w-full text-sm border border-border rounded-md pl-7 pr-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent"
              value={form.price_max} onChange={e => set('price_max', e.target.value)} />
          </div>
        </div>
      </div>

      {/* Desconto mínimo */}
      <div className={formGroup}>
        <label className={formLabel}>Desconto mínimo <span className="font-normal text-fg-3">(0 = sem filtro)</span></label>
        <div className="flex items-center gap-3">
          <input type="range" min={0} max={80} step={5} value={form.min_discount_pct}
            onChange={e => set('min_discount_pct', Number(e.target.value))}
            className="flex-1 accent-accent" />
          <span className="text-sm font-mono text-fg-2 w-10 text-right">{form.min_discount_pct}%</span>
        </div>
      </div>

      <div className="flex items-center justify-between py-1">
        <span className={formLabel}>Ativo</span>
        <Switch checked={form.active} onChange={v => set('active', v)} />
      </div>
      <div className="flex gap-2 pt-1">
        <Button variant="primary" size="sm" disabled={!form.name.trim() || saving}
          onClick={() => onSave(form)}>{saving ? 'Salvando…' : 'Salvar'}</Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancelar</Button>
      </div>
    </div>
  )
}

// ── Tab: Categorias ───────────────────────────────────────────────────────────

function TabCategorias({ channelId, categories }: { channelId: number; categories: Category[] }) {
  const qc = useQueryClient()
  const { data: saved = [] } = useQuery<CategoryWeight[]>({
    queryKey: ['channel-weights', channelId],
    queryFn: () => authFetchJSON<CategoryWeight[]>(`/api/channels/${channelId}/weights`, []),
    staleTime: 10_000,
  })
  const [weights, setWeights] = useState<Record<number, number>>({})
  // ids das categorias adicionadas à lista (com peso 0 ou >0)
  const [active, setActive] = useState<Set<number>>(new Set())
  const [synced, setSynced] = useState(false)
  if (!synced && saved.length > 0) {
    const map: Record<number, number> = {}
    const ids = new Set<number>()
    saved.forEach(w => { map[w.category_id] = w.weight; ids.add(w.category_id) })
    setWeights(map); setActive(ids); setSynced(true)
  }

  const saveMut = useMutation({
    mutationFn: () => authFetch(`/api/channels/${channelId}/weights`, {
      method: 'PUT',
      body: JSON.stringify(Object.entries(weights).filter(([, v]) => v > 0)
        .map(([k, v]) => ({ category_id: Number(k), weight: v }))),
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['channel-weights', channelId] }),
  })

  const total = [...active].reduce((s, id) => s + (weights[id] ?? 0), 0)

  // Categorias ainda não adicionadas ao canal
  const available = categories.filter(c => !active.has(c.id))

  const addCategory = (id: number) => {
    setActive(prev => new Set([...prev, id]))
    setWeights(prev => ({ ...prev, [id]: prev[id] ?? 50 }))
  }

  const removeCategory = (id: number) => {
    setActive(prev => { const s = new Set(prev); s.delete(id); return s })
    setWeights(prev => { const n = { ...prev }; delete n[id]; return n })
  }

  const activeCategories = categories.filter(c => active.has(c.id))

  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-fg-3">Categorias que este canal considera ao pontuar produtos.</p>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-mono ${total > 100 ? 'text-danger' : total > 0 ? 'text-success' : 'text-fg-3'}`}>{total}%</span>
          <Button size="sm" variant="primary" loading={saveMut.isPending} onClick={() => saveMut.mutate()}>
            Salvar
          </Button>
        </div>
      </div>

      {/* Categorias ativas */}
      {activeCategories.length === 0 ? (
        <p className="text-xs text-fg-3 py-2">Nenhuma categoria adicionada — adicione abaixo para pontuar produtos por categoria.</p>
      ) : (
        <div className="space-y-2">
          {activeCategories.map(cat => {
            const val = weights[cat.id] ?? 0
            return (
              <div key={cat.id} className="flex items-center gap-3">
                <span className="text-xs text-fg-2 w-36 flex-shrink-0 truncate">{cat.name}</span>
                <input type="range" min={0} max={100} step={5} value={val}
                  onChange={e => setWeights(p => ({ ...p, [cat.id]: Number(e.target.value) }))}
                  className="flex-1 accent-accent" />
                <span className="text-xs font-mono text-fg-2 w-10 text-right">{val}%</span>
                <button type="button" onClick={() => removeCategory(cat.id)}
                  className="text-[10px] text-fg-3 hover:text-danger transition-colors flex-shrink-0" title="Remover categoria">✕</button>
              </div>
            )
          })}
        </div>
      )}

      {total > 100 && <p className="text-xs text-danger">Total ultrapassa 100%. Reduza alguns pesos.</p>}

      {/* Seletor para adicionar categorias */}
      {available.length > 0 && (
        <div className="pt-2 border-t border-border">
          <p className="text-[11px] text-fg-3 mb-1.5">Adicionar categoria:</p>
          <div className="flex flex-wrap gap-1.5">
            {available.map(cat => (
              <button
                key={cat.id}
                type="button"
                onClick={() => addCategory(cat.id)}
                className="px-2 py-1 text-xs rounded-full border border-border text-fg-3 hover:border-accent hover:text-accent transition-colors"
              >
                + {cat.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Tab: Grupos ───────────────────────────────────────────────────────────────

function TabGrupos({ channelId, allGroups }: { channelId: number; allGroups: Group[] }) {
  const qc = useQueryClient()
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const { data: detail, isLoading } = useQuery<ChannelDetail>({
    queryKey: ['channel-detail', channelId],
    queryFn: () => authFetchJSON<ChannelDetail>(`/api/channels/${channelId}`, {} as ChannelDetail),
    staleTime: 10_000,
  })
  const linkMut = useMutation({
    mutationFn: (gid: number) => authFetch(`/api/channels/${channelId}/groups/${gid}`, { method: 'POST' }),
    onSuccess: () => { setSelectedGroupId(''); void qc.invalidateQueries({ queryKey: ['channel-detail', channelId] }); void qc.invalidateQueries({ queryKey: ['channels'] }) },
  })
  const unlinkMut = useMutation({
    mutationFn: (gid: number) => authFetch(`/api/channels/${channelId}/groups/${gid}`, { method: 'DELETE' }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['channel-detail', channelId] }); void qc.invalidateQueries({ queryKey: ['channels'] }) },
  })
  const linkedIds = new Set((detail?.groups ?? []).map(g => g.id))
  const available = allGroups.filter(g => !linkedIds.has(g.id))
  return (
    <div className="p-4 space-y-4">
      {isLoading
        ? <div className="space-y-1.5"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>
        : (detail?.groups ?? []).length === 0
          ? <p className="text-xs text-fg-3">Nenhum grupo vinculado.</p>
          : <div className="space-y-1.5">
            {(detail?.groups ?? []).map(g => (
              <div key={g.id} className="flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 bg-surface-2">
                <div className="flex items-center gap-2 min-w-0">
                  {platformBadge(g.platform)}
                  <span className="text-sm text-fg truncate">{g.name}</span>
                  {g.status === 'active'
                    ? <span className={statusChipSuccess}>ativo</span>
                    : <span className={statusChipMuted}>{g.status}</span>}
                </div>
                <button type="button" disabled={unlinkMut.isPending}
                  onClick={() => unlinkMut.mutate(g.id)}
                  className="text-xs text-danger hover:opacity-80 disabled:opacity-40 whitespace-nowrap">
                  Desvincular
                </button>
              </div>
            ))}
          </div>
      }
      {available.length > 0 && (
        <div className="flex gap-2">
          <select className="flex-1 text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg"
            value={selectedGroupId} onChange={e => setSelectedGroupId(e.target.value)}>
            <option value="">Selecionar grupo…</option>
            {available.map(g => <option key={g.id} value={String(g.id)}>{g.name} ({g.platform})</option>)}
          </select>
          <Button variant="primary" size="sm" disabled={!selectedGroupId || linkMut.isPending}
            onClick={() => selectedGroupId && linkMut.mutate(Number(selectedGroupId))}>Vincular</Button>
        </div>
      )}
    </div>
  )
}

// ── Tab: Produtos ─────────────────────────────────────────────────────────────

function TabProdutos({ channelId }: { channelId: number }) {
  const navigate = useNavigate()
  const { data: candidates = [], isFetching } = useQuery<ChannelCandidate[]>({
    queryKey: ['channel-candidates', channelId],
    queryFn: () => authFetchJSON<ChannelCandidate[]>(`/api/channels/${channelId}/candidates?limit=20`, []),
    staleTime: 30_000,
  })
  return (
    <div className="p-4">
      <p className="text-xs text-fg-3 mb-3">Top 20 produtos por score composto para este canal. Inclui abaixo do threshold (marcados em ⚠️).</p>
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
                <th className="px-2 py-1.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {candidates.map(c => (
                <tr
                  key={c.id}
                  className={c.below_threshold ? 'opacity-50' : ''}
                  style={!c.below_threshold ? { backgroundColor: 'rgba(34,197,94,0.10)' } : undefined}
                >
                  <td className="px-2 py-1.5 max-w-[200px]">
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
                  <td className="px-2 py-1.5 text-right font-mono text-accent">{c.composite_score.toFixed(3)}</td>
                  <td className="px-2 py-1.5 text-center">
                    {!c.send_ready && <span title="não send_ready">🔴</span>}
                    {!c.url_alive && <span title="URL morta">💀</span>}
                    {c.below_threshold && <span title="abaixo do threshold">⚠️</span>}
                    {c.send_ready && c.url_alive && !c.below_threshold && <span title="elegível">✅</span>}
                  </td>
                  <td className="px-2 py-1.5">
                    <button
                      onClick={() => navigate(`/compose?productIds=${c.id}`)}
                      title="Abrir Composer com este produto"
                      className="px-2 py-0.5 text-[10px] bg-accent text-white rounded hover:bg-accent-hover transition-colors whitespace-nowrap"
                    >
                      ✈ Disparar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-2 py-1 text-[10px] text-fg-3 border-t border-border">
            ✅ elegível · ⚠️ abaixo do threshold · 🔴 não send_ready · 💀 URL morta
          </p>
        </div>
      )}
    </div>
  )
}

// ── Tab: Scoring ──────────────────────────────────────────────────────────────

interface ScoringParam { param_name: string; current_value: number; default_value: number }

function TabScoring({ channel }: { channel: Channel }) {
  const { data: params = [] } = useQuery<ScoringParam[]>({
    queryKey: ['scoring-params'],
    queryFn: () => authFetchJSON<ScoringParam[]>('/api/admin/parameters', []),
    staleTime: 30_000,
  })

  const { data: weights = [] } = useQuery<CategoryWeight[]>({
    queryKey: ['channel-weights', channel.id],
    queryFn: () => authFetchJSON<CategoryWeight[]>(`/api/channels/${channel.id}/weights`, []),
    staleTime: 30_000,
  })

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['template-categories'],
    queryFn: () => authFetchJSON<Category[]>('/api/admin/templates/categories', []),
    staleTime: 60_000,
  })

  const scoreWeights = params.filter(p => p.param_name.startsWith('score_weight_'))
  const otherRelevant = params.filter(p => [
    'quality_threshold','anti_saturation_decay','diversity_bonus_weight',
    'half_life_freshness','epsilon_base','click_reward_weight',
    'antirepeat_window_days','repromo_drop_threshold',
  ].includes(p.param_name))

  const Row = ({ p }: { p: ScoringParam }) => (
    <div className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
      <span className="text-xs font-mono text-fg-2">{p.param_name}</span>
      <div className="flex items-center gap-2">
        {p.current_value !== p.default_value && (
          <span className="text-[10px] text-fg-3 line-through">{p.default_value}</span>
        )}
        <span className={`text-xs font-mono font-semibold ${p.current_value !== p.default_value ? 'text-accent' : 'text-fg'}`}>
          {p.current_value}
        </span>
      </div>
    </div>
  )

  return (
    <div className="p-4 space-y-5 text-sm">

      {/* Config do canal */}
      <section>
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-fg-3 mb-2">Config deste canal</h3>
        <div className="rounded-lg border border-border bg-surface-2 divide-y divide-border">
          {([
            ['quality_threshold', channel.quality_threshold, 'Score mínimo para entrar no funil'],
            ['daily_cap', channel.daily_cap, 'Máx mensagens/dia'],
            ['price_min', channel.price_min ?? '—', 'Preço mínimo (R$)'],
            ['price_max', channel.price_max ?? '—', 'Preço máximo (R$)'],
            ['min_discount_pct', (channel.min_discount_pct ?? 0) + '%', 'Desconto mínimo exigido'],
          ] as [string, string | number, string][]).map(([k, v, desc]) => (
            <div key={k} className="flex items-center justify-between px-3 py-1.5">
              <div>
                <span className="text-xs font-mono text-fg-2">{k}</span>
                <span className="ml-2 text-[10px] text-fg-3">{desc}</span>
              </div>
              <span className="text-xs font-semibold text-fg">{v}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Sliders de categoria do canal */}
      <section>
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-fg-3 mb-2">
          Pesos de categoria <span className="normal-case font-normal">(term w_channel × slider / 100 na fórmula)</span>
        </h3>
        {weights.length === 0
          ? <p className="text-xs text-fg-3 italic">Nenhum peso configurado — categoria não influencia o score neste canal.</p>
          : (
            <div className="rounded-lg border border-border bg-surface-2 divide-y divide-border overflow-hidden">
              {categories
                .map(cat => ({ cat, w: weights.find(w => w.category_id === cat.id)?.weight ?? 0 }))
                .filter(({ w }) => w > 0)
                .sort((a, b) => b.w - a.w)
                .map(({ cat, w }) => (
                  <div key={cat.id} className="flex items-center gap-3 px-3 py-1.5">
                    <span className="text-xs text-fg-2 w-28 flex-shrink-0">{cat.name}</span>
                    <div className="flex-1 bg-border rounded-full h-1.5">
                      <div className="bg-accent h-1.5 rounded-full" style={{ width: `${w}%` }} />
                    </div>
                    <span className="text-xs font-mono font-semibold text-accent w-10 text-right">{w}%</span>
                  </div>
                ))
              }
            </div>
          )
        }
      </section>

      {/* Pesos da fórmula */}
      <section>
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-fg-3 mb-2">
          Pesos da fórmula composta <span className="normal-case font-normal">(score = Σ w_* × sinal)</span>
        </h3>
        <div className="rounded-lg border border-border bg-surface-2 px-3">
          {scoreWeights.length === 0
            ? <p className="py-2 text-xs text-fg-3">Carregando…</p>
            : scoreWeights.map(p => <Row key={p.param_name} p={p} />)
          }
        </div>
        <p className="text-[10px] text-fg-3 mt-1">Valores em destaque (roxo) diferem do default. Configure em <span className="font-mono">/admin/params</span>.</p>
      </section>

      {/* Outros parâmetros relevantes */}
      <section>
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-fg-3 mb-2">Outros parâmetros que afetam o score</h3>
        <div className="rounded-lg border border-border bg-surface-2 px-3">
          {otherRelevant.length === 0
            ? <p className="py-2 text-xs text-fg-3">Carregando…</p>
            : otherRelevant.map(p => <Row key={p.param_name} p={p} />)
          }
        </div>
      </section>

      {/* Fórmula resumida */}
      <section>
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-fg-3 mb-2">Fórmula resumida</h3>
        <pre className="text-[10px] bg-surface-2 border border-border rounded-lg p-3 overflow-x-auto leading-snug text-fg-2">
{`score = w_quality    × quality_score           (intrínseco do produto)
      + w_affinity   × affinity(grupo, cat)    (histórico do grupo)
      + w_channel    × slider_canal / 100      (sliders desta aba Categorias)
      + w_ctr        × ctr_blended             (CTR com shrinkage grupo↔canal)
      + w_epc        × epc_blended             (EPC com shrinkage)
      + w_freshness  × exp(-decay × idade)     (recência do produto)
      - w_saturation × (1 - decay^n_sent_hoje) (penalidade por repetição)

Filtros duros (eliminam antes do score):
  quality_score ≥ quality_threshold do canal
  preço ∈ [price_min, price_max] se definido
  desconto ≥ min_discount_pct se > 0
  anti-repeat 7d por grupo`}
        </pre>
      </section>
    </div>
  )
}

// ── Channel Modal ─────────────────────────────────────────────────────────────

type ModalTab = 'config' | 'categorias' | 'grupos' | 'produtos' | 'scoring' | 'links'

function ChannelModal({
  channel, categories, allGroups, onClose,
}: {
  channel: ChannelWithCount; categories: Category[]; allGroups: Group[]; onClose: () => void
}) {
  const qc = useQueryClient()
  const [tab, setTab] = useState<ModalTab>('config')
  const [editing, setEditing] = useState(false)

  // Fechar com Esc
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [onClose])

  const updateMut = useMutation({
    mutationFn: async (values: ChannelFormValues) => {
      const res = await authFetch(`/api/channels/${channel.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: values.name,
          quality_threshold: values.quality_threshold,
          daily_cap: values.daily_cap,
          active: values.active,
          price_min: values.price_min !== '' ? parseFloat(values.price_min) : null,
          price_max: values.price_max !== '' ? parseFloat(values.price_max) : null,
          min_discount_pct: values.min_discount_pct,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? `Erro ${res.status}`)
      }
    },
    onSuccess: () => { setEditing(false); void qc.invalidateQueries({ queryKey: ['channels'] }) },
    onError: (err: Error) => alert(`Não foi possível salvar: ${err.message}`),
  })
  const deleteMut = useMutation({
    mutationFn: () => authFetch(`/api/channels/${channel.id}`, { method: 'DELETE' }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['channels'] }); onClose() },
  })

  const TABS: { id: ModalTab; label: string }[] = [
    { id: 'config',    label: 'Configuração' },
    { id: 'categorias',label: 'Categorias' },
    { id: 'grupos',    label: `Grupos (${channel.groups_count ?? 0})` },
    { id: 'produtos',  label: 'Produtos' },
    { id: 'scoring',   label: '🧮 Scoring' },
    { id: 'links',     label: '🔗 Links' },
  ]

  return (
    // Backdrop
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/60" />

      {/* Modal */}
      <div
        className="relative z-10 w-full max-w-2xl bg-surface border border-border rounded-xl shadow-2xl flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-base font-semibold text-fg truncate">{channel.name}</span>
            {channel.active
              ? <span className={statusChipSuccess}>ativo</span>
              : <span className={statusChipMuted}>inativo</span>}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              disabled={deleteMut.isPending}
              onClick={() => { if (confirm(`Remover canal "${channel.name}"?`)) deleteMut.mutate() }}
              className="text-xs text-danger hover:opacity-80 px-2 py-1 rounded border border-danger/30"
            >
              Remover
            </button>
            <button type="button" onClick={onClose} className="text-fg-3 hover:text-fg text-lg leading-none px-1">✕</button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border px-5">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setEditing(false) }}
              className={[
                'text-sm py-2.5 px-3 -mb-px border-b-2 transition-colors',
                tab === t.id ? 'border-accent text-accent font-medium' : 'border-transparent text-fg-3 hover:text-fg',
              ].join(' ')}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto">
          {tab === 'config' && (
            editing
              ? <div className="p-4">
                  <ChannelForm
                    initial={{
                      name: channel.name,
                      quality_threshold: channel.quality_threshold,
                      daily_cap: channel.daily_cap,
                      active: channel.active,
                      price_min: channel.price_min != null ? String(channel.price_min) : '',
                      price_max: channel.price_max != null ? String(channel.price_max) : '',
                      min_discount_pct: channel.min_discount_pct ?? 0,
                    }}
                    saving={updateMut.isPending}
                    onSave={values => updateMut.mutate(values)}
                    onCancel={() => setEditing(false)}
                  />
                </div>
              : <div className="p-4 space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Score mínimo', value: channel.quality_threshold.toFixed(2) },
                      { label: 'Cap diário', value: `${channel.daily_cap}/dia` },
                      {
                        label: 'Faixa de preço',
                        value: channel.price_min != null || channel.price_max != null
                          ? `${channel.price_min != null ? `R$${channel.price_min}` : '—'} → ${channel.price_max != null ? `R$${channel.price_max}` : '—'}`
                          : 'sem filtro',
                      },
                      {
                        label: 'Desconto mínimo',
                        value: (channel.min_discount_pct ?? 0) > 0 ? `≥ ${channel.min_discount_pct}%` : 'sem filtro',
                      },
                    ].map(r => (
                      <div key={r.label} className="rounded-lg border border-border bg-surface-2 px-3 py-2.5">
                        <p className="text-[10px] text-fg-3 uppercase tracking-wide">{r.label}</p>
                        <p className="text-sm font-semibold text-fg tabular-nums">{r.value}</p>
                      </div>
                    ))}
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>Editar configurações</Button>
                </div>
          )}
          {tab === 'categorias' && <TabCategorias channelId={channel.id} categories={categories} />}
          {tab === 'grupos'     && <TabGrupos channelId={channel.id} allGroups={allGroups} />}
          {tab === 'produtos'   && <TabProdutos channelId={channel.id} />}
          {tab === 'scoring'   && <TabScoring channel={channel} />}
          {tab === 'links'     && <TabLinks channelId={channel.id} channelName={channel.name} />}
        </div>
      </div>
    </div>
  )
}

// ── Tab: Links públicos ───────────────────────────────────────────────────────

function slugifyChannelName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // remove acentos
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function TabLinks({ channelId, channelName }: { channelId: number; channelName: string }) {
  const qc = useQueryClient()
  // Pre-preenche com slug derivado do nome do canal
  const [slug, setSlug] = useState(() => slugifyChannelName(channelName))
  const [error, setError] = useState('')

  interface PubLink { id: number; slug: string; redirect_strategy: string }
  const { data: links = [], isLoading } = useQuery<PubLink[]>({
    queryKey: ['public-links', channelId],
    queryFn: () => apiClient.get(`/api/public-links?channel_id=${channelId}`).then(r => Array.isArray(r.data) ? r.data : []).catch(() => []),
    staleTime: 30_000,
  })

  // Busca grupos do canal para popular fallback_chain
  const { data: channelDetail } = useQuery<{ groups?: { id: number }[] }>({
    queryKey: ['channel-detail', channelId],
    queryFn: () => authFetchJSON(`/api/channels/${channelId}`, {}),
    staleTime: 60_000,
  })

  const createMut = useMutation({
    mutationFn: () => {
      const groupIds = (channelDetail as { groups?: { id: number }[] })?.groups?.map(g => g.id) ?? []
      return apiClient.post('/api/public-links', {
        slug: slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        channel_id: channelId,
        fallback_chain: groupIds,
        redirect_strategy: 'round-robin',
      }).then(r => r.data)
    },
    onSuccess: () => {
      setError('')
      void qc.invalidateQueries({ queryKey: ['public-links', channelId] })
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Erro ao criar link'
      setError(msg)
    },
  })

  const deleteMutLink = useMutation({
    mutationFn: (id: number) => apiClient.delete(`/api/public-links/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['public-links', channelId] }),
  })

  if (isLoading) return <p className="text-fg-3 text-sm">Carregando...</p>

  const existing = links[0]

  return (
    <div className="p-4 space-y-3">
      <p className="text-xs text-fg-3">Link de entrada do canal — redireciona para o grupo com vaga.</p>

      {existing ? (
        <div className="flex items-center gap-2 rounded border border-border bg-surface px-3 py-2">
          <span className="font-mono text-sm text-accent flex-1">jon.promo/g/{existing.slug}</span>
          <button
            onClick={() => { if (confirm(`Remover /${existing.slug}?`)) deleteMutLink.mutate(existing.id) }}
            className="text-xs text-danger hover:opacity-70"
          >Remover</button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-fg-3 text-sm font-mono shrink-0">jon.promo/g/</span>
          <input
            value={slug}
            onChange={e => setSlug(e.target.value)}
            className="flex-1 min-w-0 text-sm font-mono border border-border rounded px-2 py-1.5 bg-surface-2 focus:outline-none focus:border-accent"
          />
          <button
            onClick={() => createMut.mutate()}
            disabled={!slug.trim() || createMut.isPending}
            className="text-xs px-3 py-1.5 rounded bg-accent text-white disabled:opacity-50 shrink-0"
          >
            {createMut.isPending ? '...' : 'Criar'}
          </button>
        </div>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Channels() {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [selectedChannel, setSelectedChannel] = useState<ChannelWithCount | null>(null)

  const { data: channels = [], isLoading } = useQuery<ChannelWithCount[]>({
    queryKey: ['channels'],
    queryFn: () => authFetchJSON<ChannelWithCount[]>('/api/channels', []),
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
    mutationFn: (v: ChannelFormValues) =>
      authFetch('/api/channels', { method: 'POST', body: JSON.stringify({ name: v.name, quality_threshold: v.quality_threshold, daily_cap: v.daily_cap, active: v.active }) }),
    onSuccess: () => { setShowCreate(false); void qc.invalidateQueries({ queryKey: ['channels'] }) },
  })

  return (
    <div className={pageContainer}>
      <PageHeader
        title="Canais"
        subtitle={isLoading ? undefined : `${channels.length} canal${channels.length !== 1 ? 'is' : ''}`}
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
          <ChannelForm saving={createMut.isPending} onSave={v => createMut.mutate(v)} onCancel={() => setShowCreate(false)} />
        </div>
      )}

      {isLoading
        ? <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
        : channels.length === 0
          ? <div className={sectionCard}><p className="text-sm text-fg-3 text-center py-4">Nenhum canal cadastrado.</p></div>
          : (
            <div className="border border-border rounded-xl overflow-hidden bg-surface shadow-sm">
              {channels.map((ch, i) => (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => setSelectedChannel(ch)}
                  className={[
                    'w-full flex items-center justify-between px-4 py-3 hover:bg-surface-2 transition-colors text-left',
                    i !== 0 ? 'border-t border-border' : '',
                  ].join(' ')}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`h-2 w-2 rounded-full flex-shrink-0 ${ch.active ? 'bg-success' : 'bg-fg-3'}`} />
                    <span className="text-sm font-medium text-fg">{ch.name}</span>
                    <span className="text-xs text-fg-3">
                      {ch.groups_count ?? 0} grupo{(ch.groups_count ?? 0) !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-fg-3 flex-shrink-0">
                    <span>Score min <span className="text-fg-2 font-mono">{ch.quality_threshold.toFixed(2)}</span></span>
                    <span>Cap <span className="text-fg-2 font-mono">{ch.daily_cap}/dia</span></span>
                    <span className="text-fg-3">→</span>
                  </div>
                </button>
              ))}
            </div>
          )
      }

      {selectedChannel && (
        <ChannelModal
          channel={selectedChannel}
          categories={categories}
          allGroups={allGroups}
          onClose={() => setSelectedChannel(null)}
        />
      )}
    </div>
  )
}
