import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Input, KpiCard, PageHeader, Skeleton, Switch } from '../components/ui'
import { apiClient } from '../lib/apiClient'
import TagInput from '../components/TagInput'
import { filterBar, sectionCard, statusChipWarning, statusChipMuted } from '../lib/uiTokens'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Product {
  id: number
  canonical_name: string
  brand?: string | null
  image_url?: string | null
  lowest_price?: number | null
  quantity?: string
  tags: string
  curation_status: string
  source?: string | null
  created_at: string
}

interface StatRow {
  status: string
  count: number
}

// ── Jonfrey types ─────────────────────────────────────────────────────────────

interface JonfreyConfigLite {
  enabled: boolean
  interval_minutes: number
  enabled_actions: string[]
  last_run_at?: string | null
}

interface JonfreyActionLite {
  id: number
  action_type: string
  status: string
  reasoning?: string | null
  after?: Record<string, unknown> | null
  triggered_by: string
  created_at: string
}

const AUTO_CURATE_ACTION = 'auto_curate_high_confidence'

// ── Helpers ───────────────────────────────────────────────────────────────────

function relMin(s: string): string {
  const m = Math.floor((Date.now() - new Date(s).getTime()) / 60000)
  if (m < 1) return 'agora'
  if (m < 60) return `${m}m atras`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h atras`
  return `${Math.floor(h / 24)}d atras`
}

function parseSources(products: Product[]): string[] {
  const set = new Set<string>()
  products.forEach(p => { if (p.source) set.add(p.source) })
  return Array.from(set).sort()
}

function parseCategories(products: Product[]): string[] {
  const set = new Set<string>()
  products.forEach(p => {
    if (!p.tags || p.tags === '[]') return
    try {
      const arr = JSON.parse(p.tags)
      if (Array.isArray(arr)) arr.forEach((t: string) => set.add(t))
    } catch { /* ignore */ }
  })
  return Array.from(set).sort()
}

// ── JonfreyCurationCard ───────────────────────────────────────────────────────

function JonfreyCurationCard() {
  const qc = useQueryClient()
  const { data: config } = useQuery<JonfreyConfigLite | null>({
    queryKey: ['jonfrey-config'],
    queryFn: () => apiClient.get('/api/jonfrey/config').then(r => r.data).catch(() => null),
    staleTime: 30_000,
  })
  const { data: actions = [] } = useQuery<JonfreyActionLite[]>({
    queryKey: ['jonfrey-actions', AUTO_CURATE_ACTION],
    queryFn: () =>
      apiClient
        .get(`/api/jonfrey/actions?type=${AUTO_CURATE_ACTION}`)
        .then(r => (Array.isArray(r.data) ? r.data : []))
        .catch(() => []),
    refetchInterval: 30_000,
  })

  const toggleTriagemMut = useMutation({
    mutationFn: async (enable: boolean) => {
      if (!config) return
      const nextActions = enable
        ? Array.from(new Set([...config.enabled_actions, AUTO_CURATE_ACTION]))
        : config.enabled_actions.filter(a => a !== AUTO_CURATE_ACTION)
      await apiClient.put('/api/jonfrey/config', { enabled_actions: nextActions })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jonfrey-config'] }),
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: string } } }
      alert(e?.response?.data?.error ?? 'Erro ao salvar auto-triagem')
    },
  })

  const last = actions[0]
  const pilotOn = !!config?.enabled
  const actionEnabled = config?.enabled_actions?.includes(AUTO_CURATE_ACTION) ?? false
  const runsInCadence = pilotOn && actionEnabled

  const stateCls = runsInCadence
    ? 'border-success/35 bg-success/5'
    : actionEnabled && !pilotOn
      ? 'border-warning/40 bg-warning/5'
      : 'border-border bg-surface-2'

  return (
    <div className={`rounded-lg border p-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between ${stateCls}`}>
      <div className="flex gap-3 min-w-0 flex-1">
        <span className="text-lg leading-none mt-0.5 shrink-0" aria-hidden="true">
          &#x1F4CB;
        </span>
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold text-fg">Auto-triagem</p>
          <p className="text-xs text-fg-3 leading-relaxed">
            No ciclo do Jonfrey, produtos pendentes recebem categoria e marca automaticamente quando a
            confianca e alta. Voce continua podendo editar manualmente.
          </p>
          <p className="text-[11px] text-fg-3 leading-snug">
            {pilotOn
              ? actionEnabled
                ? `Ativo no ciclo (~${config?.interval_minutes ?? 60} min).`
                : 'Auto-pilot ligado, mas a triagem automatica esta desmarcada.'
              : 'Auto-pilot desligado: use o toggle abaixo para preparar a acao.'}
          </p>
          {last && (
            <p className="text-[11px] text-fg-2 truncate pt-0.5" title={last.reasoning ?? ''}>
              <span className="text-fg-3">Ultima execucao ({relMin(last.created_at)}):</span>{' '}
              {last.reasoning ?? `status=${last.status}`}
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-row sm:flex-col items-center sm:items-end gap-3 shrink-0 sm:pt-0.5 pl-8 sm:pl-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-fg-2 whitespace-nowrap">Triagem automatica</span>
          <Switch
            checked={actionEnabled}
            disabled={toggleTriagemMut.isPending || !config}
            onChange={v => toggleTriagemMut.mutate(v)}
          />
        </div>
        <a
          href="/automations/jonfrey"
          className="text-xs text-accent hover:underline whitespace-nowrap"
        >
          Piloto Jonfrey &rarr;
        </a>
      </div>
    </div>
  )
}

// ── ProductRow ────────────────────────────────────────────────────────────────

function ProductRow({
  product,
  onApproved,
  onRejected,
}: {
  product: Product
  onApproved: () => void
  onRejected: () => void
}) {
  const qc = useQueryClient()
  const [categories, setCategories] = useState<string[]>([])
  const [brand, setBrand] = useState<string[]>(product.brand ? [product.brand] : [])
  const [saved, setSaved] = useState(false)

  const saveMut = useMutation({
    mutationFn: () =>
      apiClient.patch(`/api/curation/${product.id}/taxonomy`, {
        categories,
        brand: brand[0] ?? '',
      }),
    onSuccess: () => {
      setSaved(true)
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['curation'] })
      }, 800)
      onApproved()
    },
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Erro ao salvar'),
  })

  const suggestMut = useMutation({
    mutationFn: () =>
      apiClient
        .post('/api/taxonomy/suggest', { title: product.canonical_name, brand: product.brand ?? '' })
        .then(r => r.data as { category?: string; brand?: string; tags?: string[]; confidence?: number }),
    onSuccess: (data) => {
      if (data.category) setCategories(prev => prev.includes(data.category!) ? prev : [...prev, data.category!])
      if (data.brand) setBrand([data.brand])
    },
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Erro ao pedir sugestao'),
  })

  const tagsMut = useMutation({
    mutationFn: () =>
      apiClient
        .post(`/api/catalog/${product.id}/suggest-tags`)
        .then(r => r.data as { tags?: string[]; new_tags?: string[] }),
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Erro ao pedir tags'),
  })

  const toggleTagInCategories = (tag: string) => {
    setCategories(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])
  }

  const hasWarnings = !product.brand || !product.tags || product.tags === '[]'

  return (
    <div className={`${sectionCard} flex flex-col sm:flex-row gap-4`}>
      {/* Thumbnail */}
      {product.image_url ? (
        <img
          src={product.image_url}
          alt=""
          className="w-full sm:w-20 h-40 sm:h-20 rounded-md object-cover bg-surface-2 flex-shrink-0"
        />
      ) : (
        <div className="w-full sm:w-20 h-16 sm:h-20 rounded-md bg-surface-2 flex items-center justify-center text-fg-3 text-xs flex-shrink-0">
          sem foto
        </div>
      )}

      {/* Body */}
      <div className="flex-1 min-w-0">
        {/* Title row */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-fg truncate" title={product.canonical_name}>
              {product.canonical_name}
            </p>
            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
              {product.curation_status !== 'pending' && (
                <span className={statusChipMuted}>{product.curation_status}</span>
              )}
              {hasWarnings && !product.brand && (
                <span className={statusChipWarning}>sem marca</span>
              )}
              {hasWarnings && (!product.tags || product.tags === '[]') && (
                <span className={statusChipWarning}>sem categoria</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {product.quantity && (
              <span className="text-xs px-1.5 py-0.5 bg-surface-2 border border-border rounded text-fg-2">
                {product.quantity}
              </span>
            )}
            {product.lowest_price && (
              <span className="text-xs text-fg-2 font-mono whitespace-nowrap">
                R$ {product.lowest_price.toFixed(2)}
              </span>
            )}
          </div>
        </div>

        {/* Taxonomy inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
          <div>
            <label className="text-xs text-fg-3 block mb-0.5">Categoria(s)</label>
            <TagInput
              type="category"
              value={categories}
              onChange={setCategories}
              placeholder="ex: smartphones"
            />
          </div>
          <div>
            <label className="text-xs text-fg-3 block mb-0.5">Marca</label>
            <TagInput
              type="brand"
              value={brand}
              onChange={next => setBrand(next.slice(0, 1))}
              placeholder="ex: Apple"
            />
          </div>
        </div>

        {/* AI suggestions row */}
        <div className="flex flex-wrap gap-2 mb-2">
          <button
            type="button"
            onClick={() => suggestMut.mutate()}
            disabled={suggestMut.isPending}
            className="min-h-[36px] sm:min-h-0 text-xs px-2.5 py-1.5 sm:py-1 rounded border border-border text-accent hover:bg-accent/5 disabled:opacity-50"
            title="Sugerir categoria e marca via IA"
          >
            {suggestMut.isPending ? '...' : 'IA: Categoria/Marca'}
          </button>
          <button
            type="button"
            onClick={() => tagsMut.mutate()}
            disabled={tagsMut.isPending}
            className="min-h-[36px] sm:min-h-0 text-xs px-2.5 py-1.5 sm:py-1 rounded border border-border text-accent hover:bg-accent/5 disabled:opacity-50"
            title="Sugerir tags via IA"
          >
            {tagsMut.isPending ? '...' : 'IA: Tags'}
          </button>
          {suggestMut.data?.confidence !== undefined && (
            <span className="text-[10px] text-fg-3 self-center">
              confianca: {Math.round((suggestMut.data.confidence ?? 0) * 100)}%
            </span>
          )}
        </div>

        {/* Suggested tags chips */}
        {tagsMut.data?.tags && tagsMut.data.tags.length > 0 && (
          <div className="mb-2 bg-accent/5 border border-accent/30 rounded-md p-2">
            <p className="text-[10px] text-fg-3 mb-1">Tags sugeridas (clique para adicionar a categoria):</p>
            <div className="flex flex-wrap gap-1">
              {tagsMut.data.tags.map(tag => {
                const isSelected = categories.includes(tag)
                const isNew = tagsMut.data?.new_tags?.includes(tag)
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTagInCategories(tag)}
                    className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                      isSelected
                        ? 'bg-accent text-white border-accent'
                        : isNew
                        ? 'bg-warning/10 text-warning border-warning/40'
                        : 'bg-surface-2 text-fg-2 border-border hover:border-accent'
                    }`}
                    title={isNew ? 'Tag nova (nao esta na taxonomia)' : 'Tag existente'}
                  >
                    {isNew ? '+ ' : ''}{tag}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Action buttons — touch-safe (min-h-[44px] on mobile) */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2">
          <button
            type="button"
            onClick={onRejected}
            className="min-h-[44px] sm:min-h-0 w-full sm:w-auto text-sm sm:text-xs px-4 sm:px-2.5 py-2 sm:py-1 rounded-md border border-danger/40 text-danger hover:bg-danger/10 transition-colors"
          >
            Rejeitar
          </button>
          <Button
            variant="primary"
            size="sm"
            className="min-h-[44px] sm:min-h-0 w-full sm:w-auto text-sm sm:text-xs"
            onClick={() => saveMut.mutate()}
            loading={saveMut.isPending}
            disabled={categories.length === 0 && brand.length === 0}
          >
            {saved ? 'Salvo' : 'Salvar e aprovar'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Curation (page) ───────────────────────────────────────────────────────────

export default function Curation() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ['curation', 'needs-taxonomy'],
    queryFn: () =>
      apiClient
        .get('/api/curation/needs-taxonomy?limit=100')
        .then(r => (Array.isArray(r.data) ? r.data : [])),
    refetchInterval: 60_000,
  })

  const { data: stats = [] } = useQuery<StatRow[]>({
    queryKey: ['curation', 'stats'],
    queryFn: () =>
      apiClient.get('/api/curation/stats').then(r => (Array.isArray(r.data) ? r.data : [])),
    refetchInterval: 60_000,
  })

  const rejectMut = useMutation({
    mutationFn: (id: number) => apiClient.post(`/api/curation/${id}/reject`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['curation'] }),
  })

  const approveAllMut = useMutation({
    mutationFn: () => apiClient.post('/api/curation/auto-heuristic').then(r => r.data as { processed: number; categorized: number; branded: number }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['curation'] })
      alert(`Heuristicas: ${data.categorized} categorizados, ${data.branded} marcas preenchidas (de ${data.processed} processados).`)
    },
    onError: () => alert('Erro ao rodar heuristicas'),
  })

  const autoLLMMut = useMutation({
    mutationFn: () => apiClient.post('/api/curation/auto-llm').then(r => r.data as { started: boolean; message?: string }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['work-queue'] })
      const interval = setInterval(() => qc.invalidateQueries({ queryKey: ['curation'] }), 5000)
      setTimeout(() => clearInterval(interval), 30 * 60 * 1000)
      alert(data.message ?? 'AutoLLM iniciado em background. Stats e logs serao atualizados.')
    },
    onError: (err: any) => {
      const status = err?.response?.status ?? '?'
      const detail = err?.response?.data?.error ?? err?.message ?? 'erro desconhecido'
      alert(`Erro ao iniciar LLM (HTTP ${status}): ${detail}`)
    },
  })

  // ── Derived state ──────────────────────────────────────────────────────────

  const totalPending = stats.find(s => s.status === 'pending')?.count ?? 0
  const totalAuto = stats.find(s => s.status === 'auto')?.count ?? 0
  const totalCurated = stats.find(s => s.status === 'curated')?.count ?? 0
  const totalRejected = stats.find(s => s.status === 'rejected')?.count ?? 0
  const totalIncomplete = stats.find(s => s.status === 'incomplete')?.count ?? 0
  const totalInspected = stats.find(s => s.status === 'inspected')?.count ?? 0
  const totalNotInspected = stats.find(s => s.status === 'not_inspected')?.count ?? 0

  const sources = parseSources(products)
  const categories = parseCategories(products)

  const filtered = products.filter(p => {
    if (search && !p.canonical_name.toLowerCase().includes(search.toLowerCase())) return false
    if (sourceFilter && p.source !== sourceFilter) return false
    if (categoryFilter) {
      try {
        const tags = JSON.parse(p.tags)
        if (!Array.isArray(tags) || !tags.includes(categoryFilter)) return false
      } catch { return false }
    }
    return true
  })

  const hasActiveFilters = !!(search || sourceFilter || categoryFilter)

  const clearFilters = () => {
    setSearch('')
    setSourceFilter('')
    setCategoryFilter('')
  }

  const pendingLabel = totalPending > 0
    ? `${totalPending} pendentes para revisao`
    : totalIncomplete > 0
      ? `${totalIncomplete} incompletos`
      : 'Nenhum produto pendente'

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Page header */}
      <div className="px-4 pt-4 pb-3 flex-shrink-0">
        <PageHeader
          title="Curadoria"
          subtitle={pendingLabel}
          actions={
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => autoLLMMut.mutate()}
                loading={autoLLMMut.isPending}
                title="Classificar produtos via LLM em background"
              >
                AutoLLM
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => approveAllMut.mutate()}
                loading={approveAllMut.isPending}
                title="Aplicar heuristicas de categoria/marca a todos os pendentes"
              >
                Aprovar com heuristicas
              </Button>
            </div>
          }
        />
      </div>

      {/* KPI bar */}
      <div className="px-4 pb-3 flex-shrink-0">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <KpiCard label="Pendentes" value={totalPending} />
          <KpiCard label="Incompletos" value={totalIncomplete} />
          <KpiCard label="Auto-inferidos" value={totalAuto} />
          <KpiCard label="Curados" value={totalCurated} />
          <KpiCard label="Rejeitados" value={totalRejected} />
          <KpiCard label="Inspecionados" value={totalInspected} />
          <KpiCard label="A inspecionar" value={totalNotInspected} />
        </div>
      </div>

      {/* Jonfrey card */}
      <div className="px-4 pb-3 flex-shrink-0">
        <JonfreyCurationCard />
      </div>

      {/* Filter bar */}
      <div className={`${filterBar} flex-shrink-0`}>
        <Input
          placeholder="Buscar por nome..."
          value={search}
          onChange={(e: any) => setSearch(e.target.value)}
          className="w-full sm:w-60"
        />
        {sources.length > 0 && (
          <select
            value={sourceFilter}
            onChange={e => setSourceFilter(e.target.value)}
            className="text-xs border border-border rounded px-2 py-1.5 bg-surface text-fg outline-none focus:border-accent"
          >
            <option value="">Todas as fontes</option>
            {sources.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        )}
        {categories.length > 0 && (
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="text-xs border border-border rounded px-2 py-1.5 bg-surface text-fg outline-none focus:border-accent"
          >
            <option value="">Todas as categorias</option>
            {categories.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="text-xs text-danger hover:underline whitespace-nowrap"
          >
            x Limpar
          </button>
        )}
        <span className="ml-auto text-xs text-fg-3">
          {filtered.length} produto{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Product list */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} variant="card" className="h-36" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="border border-border rounded-lg p-10 text-center">
            <p className="text-sm text-fg-2">
              {totalPending === 0 && totalIncomplete === 0
                ? 'Todos os produtos estao completos.'
                : 'Nenhum produto com esse filtro.'}
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="mt-2 text-xs text-accent hover:underline"
              >
                Limpar filtros
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(p => (
              <ProductRow
                key={p.id}
                product={p}
                onApproved={() => {}}
                onRejected={() => rejectMut.mutate(p.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
