import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { Badge, Button, Skeleton, EmptyState, Input, SearchSelect, TooltipIcon } from '../components/ui'
import { apiClient } from '../lib/apiClient'

// ── Gráfico de histórico de preços (expandido ao clicar na linha) ─────────────
function PriceHistoryChart({ productId }: { productId: number }) {
  const { data: history = [], isLoading } = useQuery({
    queryKey: ['catalog', 'history', productId],
    queryFn: () =>
      apiClient.get(`/api/catalog/variants/${productId}/history`)
        .then(r => Array.isArray(r.data) ? r.data : [])
        .catch(() => []),
  })

  if (isLoading) return <div className="h-24 flex items-center justify-center text-xs text-fg-3">Carregando histórico...</div>
  if (history.length < 2) return <div className="h-16 flex items-center justify-center text-xs text-fg-3">Histórico insuficiente (mínimo 2 registros)</div>

  const data = history.map((h: any) => ({
    price: h.price ?? h.value ?? 0,
    date: h.recorded_at ? new Date(h.recorded_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '',
  }))

  const prices = data.map((d: any) => d.price)
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const isDown = prices[prices.length - 1] <= prices[0]

  return (
    <div className="px-4 pb-3">
      <p className="text-xs text-fg-3 mb-1">
        Histórico de preços · {history.length} registros ·
        <span className={isDown ? ' text-success' : ' text-danger'}> {isDown ? '↓' : '↑'} tendência</span>
        {' '}· mín R$ {min.toFixed(2)} · máx R$ {max.toFixed(2)}
      </p>
      <ResponsiveContainer width="100%" height={80}>
        <LineChart data={data}>
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#888' }} tickLine={false} axisLine={false} />
          <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10, fill: '#888' }} tickLine={false} axisLine={false} width={60}
            tickFormatter={(v: number) => `R$${v.toFixed(0)}`} />
          <Tooltip
            contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 6, fontSize: 12 }}
            formatter={(v: any) => [`R$ ${Number(v).toFixed(2)}`, 'Preço']}
          />
          <Line type="monotone" dataKey="price" stroke={isDown ? '#22c55e' : '#ef4444'} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}


interface Product {
  id: number
  canonical_name?: string
  brand?: string
  image_url?: string
  lowest_price?: number
  lowest_price_source?: string
  lowest_price_url?: string
  tags?: string[] | string
  inactive?: boolean
  curation_status?: string
  quantity?: string
  weight?: { String: string; Valid: boolean } | string
  inspected?: boolean
  inspected_at?: string
  inspection_notes?: string
  created_at?: string
}

// Mapa de fonte → label visual + cor
const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  amz: { label: 'Amazon', color: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  amazon: { label: 'Amazon', color: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  ml: { label: 'Mercado Livre', color: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
  mercadolivre: { label: 'Mercado Livre', color: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
  magalu: { label: 'Magalu', color: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  shopee: { label: 'Shopee', color: 'bg-orange-600/15 text-orange-300 border-orange-600/30' },
  aliexpress: { label: 'AliExpress', color: 'bg-red-500/15 text-red-400 border-red-500/30' },
  kabum: { label: 'KaBuM!', color: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  americanas: { label: 'Americanas', color: 'bg-red-600/15 text-red-300 border-red-600/30' },
  casasbahia: { label: 'Casas Bahia', color: 'bg-blue-600/15 text-blue-300 border-blue-600/30' },
  manual: { label: 'Manual', color: 'bg-fg-3/15 text-fg-2 border-border' },
}

interface TaxonomyEntry {
  id: number
  type: string
  name: string
  slug: string
}

// Normaliza tags — backend pode enviar string JSON ou array
function parseTags(raw: string[] | string | undefined | null): string[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  try { return JSON.parse(raw as string) } catch { return [] }
}

// Title case simples + extrai peso para exibir depois
const WEIGHT_RE = /\b(\d+(?:[.,]\d+)?\s*(?:kg|g|ml|l|lb))\b/gi

function formatTitle(raw: string, brand?: string): string {
  let s = raw.replace(/\s+/g, ' ').trim()
  // Remove ocorrências da marca do título (ela já é mostrada como pill)
  if (brand) {
    const escaped = brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    s = s.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), '').replace(/\s+/g, ' ').trim()
  }
  return s
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function extractWeight(title: string): string | null {
  const m = title.match(WEIGHT_RE)
  return m ? m[0] : null
}
// ── Sidebar helper components ─────────────────────────────────────────────────

function FilterSection({ label, active, children }: { label: string; active?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(true)
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between mb-1.5 group"
      >
        <span className={`text-[11px] font-semibold uppercase tracking-wide ${active ? 'text-accent' : 'text-fg-3'}`}>
          {label}{active ? ' ·' : ''}
        </span>
        <span className={`text-fg-3 text-[10px] transition-transform ${open ? '' : '-rotate-90'}`}>▾</span>
      </button>
      {open && children}
    </div>
  )
}

function FilterList({
  items, value, onSelect, allLabel = 'Todos',
  formatLabel,
}: {
  items: string[]
  value: string
  onSelect: (v: string) => void
  allLabel?: string
  /** Só Fonte usa labels amigáveis; marcas/categorias mostram o texto da base. */
  formatLabel?: (s: string) => string
}) {
  const [q, setQ] = React.useState('')
  const TOP = 5
  const filtered = q ? items.filter(i => i.toLowerCase().includes(q.toLowerCase())) : items
  const visible = q ? filtered : filtered.slice(0, TOP)
  const hasMore = !q && items.length > TOP
  const labelFor = formatLabel ?? ((s: string) => s)

  return (
    <div className="space-y-0.5">
      <button type="button" onClick={() => onSelect('')}
        className={`w-full text-left text-xs px-2 py-1 rounded transition-colors ${!value ? 'bg-accent/10 text-accent font-medium' : 'text-fg-2 hover:bg-surface-2'}`}>
        {allLabel}
      </button>
      {visible.map(item => (
        <button key={item} type="button" onClick={() => onSelect(item === value ? '' : item)}
          className={`w-full text-left text-xs px-2 py-1 rounded transition-colors truncate ${value === item ? 'bg-accent/10 text-accent font-medium' : 'text-fg-2 hover:bg-surface-2'}`}
          title={item}>
          {labelFor(item)}
        </button>
      ))}
      {(hasMore || q) && (
        <input
          type="text"
          placeholder={`Buscar…`}
          value={q}
          onChange={e => setQ(e.target.value)}
          className="w-full text-xs border border-border rounded px-2 py-1 bg-surface text-fg outline-none focus:border-accent mt-1"
        />
      )}
    </div>
  )
}

function CatalogSidebar({
  search, onSearch,
  source, onSource, sources,
  categoryFilter, onCategoryFilter, categories,
  subcategoryFilter, onSubcategoryFilter, subcategories,
  brandFilter, onBrandFilter, brands,
  priceMin, onPriceMin,
  priceMax, onPriceMax,
  statusFilter, onStatusFilter,
  showInactive, onShowInactive,
  onClear, hasActiveFilters,
  products,
}: {
  search: string; onSearch: (v: string) => void
  source: string; onSource: (v: string) => void; sources: string[]
  categoryFilter: string; onCategoryFilter: (v: string) => void; categories: string[]
  subcategoryFilter: string; onSubcategoryFilter: (v: string) => void; subcategories: string[]
  brandFilter: string; onBrandFilter: (v: string) => void; brands: string[]
  priceMin: string; onPriceMin: (v: string) => void
  priceMax: string; onPriceMax: (v: string) => void
  statusFilter: string; onStatusFilter: (v: string) => void
  showInactive: boolean; onShowInactive: (v: boolean) => void
  onClear: () => void; hasActiveFilters: boolean
  products: Product[]
}) {
  return (
    <aside className="flex-1 overflow-y-auto flex flex-col gap-4 px-3 py-4">
      {/* Busca */}
      <input
        type="text"
        placeholder="Buscar produto..."
        value={search}
        onChange={e => onSearch(e.target.value)}
        className="w-full text-xs border border-border rounded px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent"
      />

      {/* Status */}
      <FilterSection label="Status" active={!!statusFilter}>
        {[
          { v: '', l: 'Todos' },
          { v: 'novos', l: 'Novos (7d)' },
          { v: 'curados', l: 'Curados' },
          { v: 'disparados_7d', l: 'Disparados 7d' },
        ].map(({ v, l }) => (
          <button key={v || '_all'} type="button" onClick={() => onStatusFilter(v)}
            className={`w-full text-left text-xs px-2 py-1 rounded transition-colors ${statusFilter === v ? 'bg-accent/10 text-accent font-medium' : 'text-fg-2 hover:bg-surface-2'}`}>
            {l}
          </button>
        ))}
      </FilterSection>

      {/* Fonte — valores distintos na base */}
      <FilterSection label="Fonte" active={!!source}>
        <FilterList
          items={sources}
          value={source} onSelect={onSource} allLabel="Todas"
          formatLabel={(s) => {
            const meta = SOURCE_LABELS[s.toLowerCase()]
            if (meta?.label) return meta.label
            if (s === 'mercadolivre') return 'Mercado Livre'
            if (s === 'casasbahia') return 'Casas Bahia'
            return s
          }}
        />
      </FilterSection>

      {/* Categoria (taxonomy primary em produtos ativos) */}
      {categories.length > 0 && (
        <FilterSection label="Categoria" active={!!categoryFilter}>
          <FilterList items={categories} value={categoryFilter} onSelect={onCategoryFilter} allLabel="Todas" />
        </FilterSection>
      )}

      {/* Marca */}
      {brands.length > 0 && (
        <FilterSection label="Marca" active={!!brandFilter}>
          <FilterList items={brands} value={brandFilter} onSelect={onBrandFilter} allLabel="Todas" />
        </FilterSection>
      )}

      {/* Subcategoria (taxonomy role=subcategory) */}
      {subcategories.length > 0 && (
        <FilterSection label="Subcategoria" active={!!subcategoryFilter}>
          <FilterList
            items={subcategories}
            value={subcategoryFilter}
            onSelect={onSubcategoryFilter}
            allLabel="Todas"
          />
        </FilterSection>
      )}

      {/* Atributos — cor, tamanho, voltagem, capacidade */}
      {(() => {
        const colorSet = new Set<string>()
        const sizeSet = new Set<string>()
        const voltageSet = new Set<string>()
        const capacitySet = new Set<string>()

        products.forEach(p => {
          const attrs = (p as any).attributes
          if (attrs) {
            const colors = attrs.color
            if (Array.isArray(colors)) colors.forEach((c: any) => colorSet.add(String(c)))
            const sizes = attrs.size
            if (Array.isArray(sizes)) sizes.forEach((s: any) => sizeSet.add(String(s)))
            const voltages = attrs.voltage
            if (Array.isArray(voltages)) voltages.forEach((v: any) => voltageSet.add(String(v)))
            const capacities = attrs.capacity
            if (Array.isArray(capacities)) capacities.forEach((c: any) => capacitySet.add(String(c)))
          }
        })

        const attrSets = [
          { label: 'Cor', items: Array.from(colorSet).sort() },
          { label: 'Tamanho', items: Array.from(sizeSet).sort() },
          { label: 'Voltagem', items: Array.from(voltageSet).sort() },
          { label: 'Capacidade', items: Array.from(capacitySet).sort() },
        ]

        return attrSets
          .filter(a => a.items.length > 0)
          .map(a => (
            <FilterSection key={a.label} label={a.label} active={false}>
              <FilterList
                items={a.items}
                value=""
                onSelect={() => {}}
                allLabel="Todas"
              />
            </FilterSection>
          ))
      })()}

      {/* Preço */}
      <FilterSection label="Preço (R$)" active={!!(priceMin || priceMax)}>
        <div className="flex items-center gap-1.5">
          <input type="number" min="0" placeholder="Mín" value={priceMin} onChange={e => onPriceMin(e.target.value)}
            className="w-full text-xs border border-border rounded px-2 py-1.5 bg-surface text-fg outline-none focus:border-accent" />
          <span className="text-fg-3 text-xs flex-shrink-0">–</span>
          <input type="number" min="0" placeholder="Máx" value={priceMax} onChange={e => onPriceMax(e.target.value)}
            className="w-full text-xs border border-border rounded px-2 py-1.5 bg-surface text-fg outline-none focus:border-accent" />
        </div>
      </FilterSection>

      {/* Inativos */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={showInactive} onChange={e => onShowInactive(e.target.checked)} className="accent-accent" />
        <span className="text-xs text-fg-2">Mostrar inativos</span>
      </label>

      {hasActiveFilters && (
        <button type="button" onClick={onClear} className="text-xs text-danger hover:underline text-left">
          × Limpar filtros
        </button>
      )}
    </aside>
  )
}

function CountChip({ total, page, totalPages }: { total: number; page: number; totalPages: number }) {
  return (
    <div className="px-3 py-2 border-t border-border text-[11px] text-fg-3">
      <p><strong className="text-fg">{total}</strong> produto{total !== 1 ? 's' : ''}</p>
      {totalPages > 1 && <p>pág. {page + 1}/{totalPages}</p>}
    </div>
  )
}

export default function Catalog() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [search, setSearch] = React.useState('')
  const [source, setSource] = React.useState('')
  const [tagFilter, setTagFilter] = React.useState('')
  const [categoryFilter, setCategoryFilter] = React.useState('')
  const [subcategoryFilter, setSubcategoryFilter] = React.useState('')
  const [priceMin, setPriceMin] = React.useState('')
  const [priceMax, setPriceMax] = React.useState('')
  const [page, setPage] = React.useState(0)
  const PAGE_SIZE = 50
  const [brandFilter, setBrandFilter] = React.useState('')
  const [selected, setSelected] = React.useState<Set<number>>(new Set())
  const [expandedId, setExpandedId] = React.useState<number | null>(null)
  const [showInactive, setShowInactive] = React.useState(false)
  const [statusFilter, setStatusFilter] = React.useState('')

  const curateMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: 'curated' | 'rejected' }) =>
      apiClient.patch(`/api/catalog/${id}`, { curation_status: status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['catalog'] }),
    onError: () => alert('Erro ao salvar'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.delete(`/api/catalog/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['catalog'] }),
    onError: () => alert('Erro ao excluir produto'),
  })

  // Inspecionar via LLM — auditoria de produtos não inspecionados
  const inspectMut = useMutation({
    mutationFn: () => apiClient.post('/api/curation/inspect-all').then(r => r.data as { started: boolean; message?: string }),
    onSuccess: (data) => {
      const interval = setInterval(() => qc.invalidateQueries({ queryKey: ['catalog'] }), 5000)
      setTimeout(() => clearInterval(interval), 30 * 60 * 1000)
      alert(data.message ?? 'Inspeção iniciada em background. O catálogo será atualizado.')
    },
    onError: (err: any) => {
      const status = err?.response?.status ?? '?'
      const detail = err?.response?.data?.error ?? err?.message ?? 'erro desconhecido'
      alert(`Erro ao iniciar inspeção (HTTP ${status}): ${detail}`)
    },
  })

  // Reprocessar base — taxonomia + limpeza
  const reprocessMut = useMutation({
    mutationFn: () => apiClient.post('/api/catalog/reprocess', undefined, { timeout: 5 * 60 * 1000 })
      .then(r => r.data as { branded: number; cleaned: number; categorized: number; total: number }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['catalog'] })
      alert(`Reprocessamento: ${data.branded} marcas, ${data.cleaned} títulos, ${data.categorized} categorias (de ${data.total} produtos).`)
    },
    onError: () => alert('Erro ao reprocessar'),
  })

  // Categorias principais (taxonomy em produtos ativos)
  const { data: categories = [] } = useQuery<string[]>({
    queryKey: ['catalog', 'categories'],
    queryFn: () => apiClient.get('/api/catalog/categories').then(r => Array.isArray(r.data) ? r.data : []).catch(() => []),
    staleTime: 60_000,
  })

  const { data: subcategories = [] } = useQuery<string[]>({
    queryKey: ['catalog', 'subcategories'],
    queryFn: () => apiClient.get('/api/catalog/subcategories').then(r => Array.isArray(r.data) ? r.data : []).catch(() => []),
    staleTime: 60_000,
  })

  const { data: sources = [] } = useQuery<string[]>({
    queryKey: ['catalog', 'sources'],
    queryFn: () => apiClient.get('/api/catalog/sources').then(r => Array.isArray(r.data) ? r.data : []).catch(() => []),
    staleTime: 60_000,
  })

  // Marcas em uso no catálogo
  const { data: brands = [] } = useQuery<string[]>({
    queryKey: ['catalog', 'brands'],
    queryFn: () => apiClient.get('/api/catalog/brands').then(r => Array.isArray(r.data) ? r.data : []).catch(() => []),
    staleTime: 60_000,
  })

  // Resetar página ao mudar filtros
  React.useEffect(() => { setPage(0) }, [search, source, tagFilter, categoryFilter, subcategoryFilter, brandFilter, showInactive, statusFilter])

  const { data: catalogData, isLoading } = useQuery<{ items: Product[]; total: number }>({
    queryKey: ['catalog', search, source, tagFilter, categoryFilter, subcategoryFilter, brandFilter, showInactive, statusFilter, page],
    queryFn: () => {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (source) params.set('source', source)
      if (tagFilter) params.set('tag', tagFilter)
      if (categoryFilter) params.set('primary_category', categoryFilter)
      if (subcategoryFilter) params.set('subcategory', subcategoryFilter)
      if (brandFilter) params.set('brand', brandFilter)
      if (statusFilter) params.set('status', statusFilter)
      if (showInactive) params.set('include_inactive', 'true')
      params.set('limit', String(PAGE_SIZE))
      params.set('offset', String(page * PAGE_SIZE))
      return apiClient.get(`/api/catalog?${params}`).then(r => {
        const d = r.data
        if (Array.isArray(d)) return { items: d, total: d.length }
        return { items: d?.items ?? d?.products ?? [], total: d?.total ?? 0 }
      })
    },
    staleTime: 30_000,
  })

  const rawProducts = catalogData?.items ?? []
  const totalProducts = catalogData?.total ?? 0
  const totalPages = Math.ceil(totalProducts / PAGE_SIZE)

  // Filtrar por preço no cliente (rápido, sem chamada extra)
  const products = rawProducts.filter(p => {
    const price = p.lowest_price ?? 0
    if (priceMin && price < Number(priceMin)) return false
    if (priceMax && price > Number(priceMax)) return false
    return true
  })

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selected.size === products.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(products.map(p => p.id)))
    }
  }

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Sidebar de filtros + contagem ── */}
      <div className="flex flex-col w-52 flex-shrink-0 border-r border-border bg-surface">
        <CatalogSidebar
          search={search} onSearch={setSearch}
          source={source} onSource={setSource} sources={sources}
          categoryFilter={categoryFilter} onCategoryFilter={setCategoryFilter} categories={categories}
          subcategoryFilter={subcategoryFilter} onSubcategoryFilter={setSubcategoryFilter} subcategories={subcategories}
          brandFilter={brandFilter} onBrandFilter={setBrandFilter} brands={brands}
          priceMin={priceMin} onPriceMin={setPriceMin}
          priceMax={priceMax} onPriceMax={setPriceMax}
          statusFilter={statusFilter} onStatusFilter={setStatusFilter}
          showInactive={showInactive} onShowInactive={setShowInactive}
          onClear={() => {
            setSearch('')
            setSource('')
            setTagFilter('')
            setCategoryFilter('')
            setSubcategoryFilter('')
            setBrandFilter('')
            setPriceMin('')
            setPriceMax('')
            setStatusFilter('')
          }}
          hasActiveFilters={!!(search || source || tagFilter || categoryFilter || subcategoryFilter || brandFilter || priceMin || priceMax || statusFilter)}
          products={products}
        />
        <CountChip total={totalProducts} page={page} totalPages={totalPages} />
      </div>

      {/* ── Conteúdo principal ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Barra de seleção (só aparece quando tem itens marcados) */}
        {selected.size > 0 && (
          <div className="px-4 py-1.5 flex gap-2 border-b border-border flex-shrink-0 items-center">
            <Button variant="primary" size="sm"
              onClick={() => { const ids = Array.from(selected).join(','); navigate(`/compose?productIds=${ids}`) }}>
              Disparar selecionados ({selected.size})
            </Button>
          </div>
        )}

      {/* Tabela */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-6 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="Nenhum produto"
              description="Configure um crawler para comecar a coletar produtos."
              cta={{ label: 'Ir para Crawlers', onClick: () => navigate('/crawlers') }}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface border-b border-border z-10">
              <tr>
                <th className="w-10 px-4 py-2.5 text-left">
                  <input
                    type="checkbox"
                    checked={selected.size === products.length && products.length > 0}
                    onChange={toggleAll}
                    className="accent-accent"
                  />
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-fg-2 uppercase tracking-wide">
                  <span className="flex items-center gap-1">
                    Produto
                    <TooltipIcon content="Nome canônico do produto (sem marketplace jargon). Clique na linha pra expandir detalhes, tags e histórico de preço." side="bottom" />
                  </span>
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-fg-2 uppercase tracking-wide hidden md:table-cell">
                  <span className="flex items-center gap-1">
                    Loja
                    <TooltipIcon content="Marketplace onde o menor preço foi encontrado. Cada produto pode ter variantes em múltiplas lojas." side="bottom" />
                  </span>
                </th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-fg-2 uppercase tracking-wide">
                  <span className="flex items-center justify-end gap-1">
                    Preço
                    <TooltipIcon content="Menor preço atual entre todas as fontes rastreadas. Atualizado a cada ciclo do crawler." side="bottom" />
                  </span>
                </th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {products.map(p => {
                const rawTitle = p.canonical_name ?? 'Produto'
                const title = formatTitle(rawTitle, p.brand)
                const weight = extractWeight(rawTitle)
                const price = p.lowest_price ?? 0
                const src = p.lowest_price_source ?? ''
                const isSelected = selected.has(p.id)
                const isInactive = p.inactive === true
                const isExpanded = expandedId === p.id
                const tags = parseTags(p.tags)
                return (
                  <React.Fragment key={p.id}>
                  <tr
                    className={`border-b ${isExpanded ? '' : 'border-border'} hover:bg-surface-2 transition-colors cursor-pointer ${isSelected ? 'bg-accent/5' : ''} ${isInactive ? 'opacity-60' : ''}`}
                    onClick={() => setExpandedId(isExpanded ? null : p.id)}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(p.id)}
                        className="accent-accent"
                        onClick={e => e.stopPropagation()}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-surface-2 rounded-sm overflow-hidden flex-shrink-0">
                          {p.image_url ? (
                            <img src={p.image_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="flex items-center justify-center h-full text-lg">
                              📦
                            </span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-fg line-clamp-1">{title}</p>
                            {isInactive && <Badge variant="outline" size="sm">inativo</Badge>}
                            {p.inspected ? (
                              <span title={p.inspection_notes ?? 'Auditado por LLM'} className="text-xs text-success font-medium">✓ inspecionado</span>
                            ) : (
                              <span title="Aguardando inspeção via LLM" className="text-xs text-fg-3">○ não auditado</span>
                            )}
                          </div>
                          {/* Linha de marca (loja virou coluna separada) */}
                          {p.brand && (
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-xs bg-surface-2 border border-border text-fg-2 px-1.5 py-0.5 rounded font-medium">
                                {p.brand}
                              </span>
                            </div>
                          )}
                          {/* Pills de peso + tags */}
                          {(weight || tags.length > 0) && (
                            <div className="flex items-center gap-1 mt-1 flex-wrap">
                              {weight && (
                                <span className="text-xs bg-accent/10 text-accent border border-accent/20 px-1.5 py-0.5 rounded-full font-medium">
                                  {weight}
                                </span>
                              )}
                              {tags.slice(0, 4).map(tag => (
                                <button
                                  key={tag}
                                  type="button"
                                  onClick={e => { e.stopPropagation(); setTagFilter(tag === tagFilter ? '' : tag) }}
                                  className={`text-xs px-1.5 py-0.5 rounded-full border transition-colors ${
                                    tagFilter === tag
                                      ? 'bg-accent text-white border-accent'
                                      : 'bg-surface-2 text-fg-3 border-border hover:border-accent hover:text-accent'
                                  }`}
                                >
                                  {tag}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    {/* Loja — pill colorida visível */}
                    <td className="px-4 py-3 hidden md:table-cell">
                      {src ? (
                        <span className={`text-xs px-2 py-0.5 rounded border font-medium ${SOURCE_LABELS[src]?.color ?? 'bg-surface-2 text-fg-2 border-border'}`}>
                          {SOURCE_LABELS[src]?.label ?? src}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {price > 0 ? (
                        <span className="font-semibold text-fg whitespace-nowrap">R$ {price.toFixed(2)}</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        {p.curation_status === 'pending' && (
                          <>
                            <Button
                              variant="primary"
                              size="sm"
                              className="bg-green-600 hover:bg-green-700 focus-visible:ring-green-500"
                              loading={curateMutation.isPending && curateMutation.variables?.id === p.id && curateMutation.variables?.status === 'curated'}
                              onClick={e => { e.stopPropagation(); curateMutation.mutate({ id: p.id, status: 'curated' }) }}
                            >
                              ✓ Curar
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              loading={curateMutation.isPending && curateMutation.variables?.id === p.id && curateMutation.variables?.status === 'rejected'}
                              onClick={e => { e.stopPropagation(); curateMutation.mutate({ id: p.id, status: 'rejected' }) }}
                            >
                              ✗ Rejeitar
                            </Button>
                          </>
                        )}
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => navigate(`/match?productId=${p.id}`)}
                        >
                          Enviar
                        </Button>
                        {p.lowest_price_url && (
                          <a
                            href={p.lowest_price_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="text-fg-3 hover:text-accent p-1"
                            title={`Abrir na ${SOURCE_LABELS[src]?.label ?? src}`}
                          >
                            🔗
                          </a>
                        )}
                        <button
                          type="button"
                          title="Excluir produto"
                          onClick={e => {
                            e.stopPropagation()
                            if (confirm(`Excluir "${title}"?`)) deleteMutation.mutate(p.id)
                          }}
                          disabled={deleteMutation.isPending && deleteMutation.variables === p.id}
                          className="text-fg-3 hover:text-danger p-1 disabled:opacity-40"
                        >
                          🗑
                        </button>
                      </div>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="border-b border-border bg-surface-2">
                      <td colSpan={7} className="px-2 pt-2">
                        <PriceHistoryChart productId={p.id} />
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
          </div>
        )}
        {/* Paginação */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-border bg-surface">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
              className="text-sm text-accent hover:underline disabled:opacity-40 disabled:no-underline"
            >
              ← Anterior
            </button>
            <span className="text-xs text-fg-3">
              Página {page + 1} de {totalPages} · {totalProducts} produtos
            </span>
            <button
              type="button"
              disabled={page >= totalPages - 1}
              onClick={() => setPage(p => p + 1)}
              className="text-sm text-accent hover:underline disabled:opacity-40 disabled:no-underline"
            >
              Próxima →
            </button>
          </div>
        )}
      </div>
      </div>

    </div>
  )
}
