import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Badge, Button, Skeleton, EmptyState, PageHeader, Tabs,
} from '../components/ui'
import { PriceTrendBadge } from '../components/PriceTrendBadge'
import { apiClient } from '../lib/apiClient'
import { pushCatalogProductView } from '../lib/gtm'
import { responsiveGrid, sectionCard } from '../lib/uiTokens'

// ── Types ─────────────────────────────────────────────────────────────────────

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
  inspected?: boolean
  inspection_notes?: string
  created_at?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  amz:         { label: 'Amazon',       color: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  amazon:      { label: 'Amazon',       color: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  ml:          { label: 'Mercado Livre',color: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
  mercadolivre:{ label: 'Mercado Livre',color: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
  magalu:      { label: 'Magalu',       color: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  shopee:      { label: 'Shopee',       color: 'bg-orange-600/15 text-orange-300 border-orange-600/30' },
  aliexpress:  { label: 'AliExpress',   color: 'bg-red-500/15 text-red-400 border-red-500/30' },
  kabum:       { label: 'KaBuM!',       color: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  americanas:  { label: 'Americanas',   color: 'bg-red-600/15 text-red-300 border-red-600/30' },
  casasbahia:  { label: 'Casas Bahia',  color: 'bg-blue-600/15 text-blue-300 border-blue-600/30' },
  manual:      { label: 'Manual',       color: 'bg-fg-3/15 text-fg-2 border-border' },
}

function parseTags(raw: string[] | string | undefined | null): string[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  try { return JSON.parse(raw as string) } catch { return [] }
}

const WEIGHT_RE = /\b(\d+(?:[.,]\d+)?\s*(?:kg|g|ml|l|lb))\b/gi

function formatTitle(raw: string, brand?: string): string {
  let s = raw.replace(/\s+/g, ' ').trim()
  if (brand) {
    const esc = brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    s = s.replace(new RegExp(`\\b${esc}\\b`, 'gi'), '').replace(/\s+/g, ' ').trim()
  }
  return s.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

function extractWeight(title: string): string | null {
  const m = title.match(WEIGHT_RE)
  return m ? m[0] : null
}

// ── Sidebar filter components ─────────────────────────────────────────────────

function FilterSection({
  label, active, children,
}: { label: string; active?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(true)
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between mb-1.5 group"
      >
        <span className={`text-[11px] font-semibold uppercase tracking-wide ${active ? 'text-accent' : 'text-fg-3'}`}>
          {label}{active ? ' \xb7' : ''}
        </span>
        <span className={`text-fg-3 text-[10px] transition-transform ${open ? '' : '-rotate-90'}`}>{'▾'}</span>
      </button>
      {open && children}
    </div>
  )
}

function FilterList({
  items, value, onSelect, allLabel = 'Todos', formatLabel,
}: {
  items: string[]
  value: string
  onSelect: (v: string) => void
  allLabel?: string
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
      <button
        type="button"
        onClick={() => onSelect('')}
        className={`w-full text-left text-xs px-2 py-1 rounded transition-colors ${!value ? 'bg-accent/10 text-accent font-medium' : 'text-fg-2 hover:bg-surface-2'}`}
      >
        {allLabel}
      </button>
      {visible.map(item => (
        <button
          key={item}
          type="button"
          onClick={() => onSelect(item === value ? '' : item)}
          className={`w-full text-left text-xs px-2 py-1 rounded transition-colors truncate ${value === item ? 'bg-accent/10 text-accent font-medium' : 'text-fg-2 hover:bg-surface-2'}`}
          title={item}
        >
          {labelFor(item)}
        </button>
      ))}
      {(hasMore || q) && (
        <input
          type="text"
          placeholder="Buscar..."
          value={q}
          onChange={e => setQ(e.target.value)}
          className="w-full text-xs border border-border rounded px-2 py-1 bg-surface text-fg outline-none focus:border-accent mt-1"
        />
      )}
    </div>
  )
}

interface SidebarProps {
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
  total: number; page: number; totalPages: number
}

function CatalogSidebar({
  search, onSearch,
  source, onSource, sources,
  categoryFilter, onCategoryFilter, categories,
  subcategoryFilter, onSubcategoryFilter, subcategories,
  brandFilter, onBrandFilter, brands,
  priceMin, onPriceMin, priceMax, onPriceMax,
  statusFilter, onStatusFilter,
  showInactive, onShowInactive,
  onClear, hasActiveFilters,
  total, page, totalPages,
}: SidebarProps) {
  const sourceLabelFn = (s: string) => {
    const meta = SOURCE_LABELS[s.toLowerCase()]
    if (meta?.label) return meta.label
    if (s === 'mercadolivre') return 'Mercado Livre'
    if (s === 'casasbahia') return 'Casas Bahia'
    return s
  }

  return (
    <aside className="flex-1 overflow-y-auto flex flex-col gap-4 px-3 py-4">
      <input
        type="text"
        placeholder="Buscar produto..."
        value={search}
        onChange={e => onSearch(e.target.value)}
        className="w-full text-xs border border-border rounded px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent"
      />

      <FilterSection label="Status" active={!!statusFilter}>
        {[
          { v: '',              l: 'Todos' },
          { v: 'novos',        l: 'Novos (7d)' },
          { v: 'curados',      l: 'Curados' },
          { v: 'disparados_7d',l: 'Disparados 7d' },
        ].map(({ v, l }) => (
          <button
            key={v || '_all'}
            type="button"
            onClick={() => onStatusFilter(v)}
            className={`w-full text-left text-xs px-2 py-1 rounded transition-colors ${statusFilter === v ? 'bg-accent/10 text-accent font-medium' : 'text-fg-2 hover:bg-surface-2'}`}
          >
            {l}
          </button>
        ))}
      </FilterSection>

      {sources.length > 0 && (
        <FilterSection label="Fonte" active={!!source}>
          <FilterList
            items={sources}
            value={source}
            onSelect={onSource}
            allLabel="Todas"
            formatLabel={sourceLabelFn}
          />
        </FilterSection>
      )}

      {categories.length > 0 && (
        <FilterSection label="Categoria" active={!!categoryFilter}>
          <FilterList items={categories} value={categoryFilter} onSelect={onCategoryFilter} allLabel="Todas" />
        </FilterSection>
      )}

      {brands.length > 0 && (
        <FilterSection label="Marca" active={!!brandFilter}>
          <FilterList items={brands} value={brandFilter} onSelect={onBrandFilter} allLabel="Todas" />
        </FilterSection>
      )}

      {subcategories.length > 0 && (
        <FilterSection label="Subcategoria" active={!!subcategoryFilter}>
          <FilterList items={subcategories} value={subcategoryFilter} onSelect={onSubcategoryFilter} allLabel="Todas" />
        </FilterSection>
      )}

      <FilterSection label="Preco (R$)" active={!!(priceMin || priceMax)}>
        <div className="flex items-center gap-1.5">
          <input
            type="number" min="0" placeholder="Min" value={priceMin}
            onChange={e => onPriceMin(e.target.value)}
            className="w-full text-xs border border-border rounded px-2 py-1.5 bg-surface text-fg outline-none focus:border-accent"
          />
          <span className="text-fg-3 text-xs flex-shrink-0">-</span>
          <input
            type="number" min="0" placeholder="Max" value={priceMax}
            onChange={e => onPriceMax(e.target.value)}
            className="w-full text-xs border border-border rounded px-2 py-1.5 bg-surface text-fg outline-none focus:border-accent"
          />
        </div>
      </FilterSection>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={showInactive}
          onChange={e => onShowInactive(e.target.checked)}
          className="accent-accent"
        />
        <span className="text-xs text-fg-2">Mostrar inativos</span>
      </label>

      {hasActiveFilters && (
        <button type="button" onClick={onClear} className="text-xs text-danger hover:underline text-left">
          x Limpar filtros
        </button>
      )}

      <div className="mt-auto pt-2 border-t border-border text-[11px] text-fg-3">
        <p><strong className="text-fg">{total}</strong> produto{total !== 1 ? 's' : ''}</p>
        {totalPages > 1 && <p>pag. {page + 1}/{totalPages}</p>}
      </div>
    </aside>
  )
}

// ── Product card for grid ─────────────────────────────────────────────────────

function CatalogProductCard({
  product, isSelected, onToggle, onSend, onDelete, onCurate,
  curating, deleting,
}: {
  product: Product
  isSelected: boolean
  onToggle: () => void
  onSend: () => void
  onDelete: () => void
  onCurate: (status: 'curated' | 'rejected') => void
  curating: boolean
  deleting: boolean
}) {
  const rawTitle = product.canonical_name ?? 'Produto'
  const title = formatTitle(rawTitle, product.brand)
  const weight = extractWeight(rawTitle)
  const price = product.lowest_price ?? 0
  const src = product.lowest_price_source ?? ''
  const tags = parseTags(product.tags)
  const isInactive = product.inactive === true

  return (
    <div
      className={`${sectionCard} flex flex-col gap-2 relative transition-colors ${isSelected ? 'ring-2 ring-accent' : ''} ${isInactive ? 'opacity-60' : ''}`}
    >
      {/* Checkbox + image row */}
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggle}
          className="accent-accent mt-1 flex-shrink-0"
        />
        <div className="w-12 h-12 bg-surface-2 rounded overflow-hidden flex-shrink-0">
          {product.image_url ? (
            <img src={product.image_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="flex items-center justify-center h-full text-xl">*</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-fg line-clamp-2 leading-tight">{title}</p>
          {product.brand && (
            <span className="text-xs bg-surface-2 border border-border text-fg-2 px-1.5 py-0.5 rounded font-medium mt-0.5 inline-block">
              {product.brand}
            </span>
          )}
        </div>
      </div>

      {/* Tags + weight */}
      {(weight || tags.length > 0) && (
        <div className="flex flex-wrap gap-1">
          {weight && (
            <span className="text-xs bg-accent/10 text-accent border border-accent/20 px-1.5 py-0.5 rounded-full font-medium">
              {weight}
            </span>
          )}
          {tags.slice(0, 3).map(tag => (
            <span
              key={tag}
              className="text-xs bg-surface-2 text-fg-3 border border-border px-1.5 py-0.5 rounded-full"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Price + source + trend */}
      <div className="flex items-center gap-2 flex-wrap mt-auto">
        {price > 0 ? (
          <span className="font-semibold text-fg whitespace-nowrap">
            R$ {price.toFixed(2)}
          </span>
        ) : (
          <span className="text-fg-3 text-xs">sem preco</span>
        )}
        {src && (
          <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${SOURCE_LABELS[src]?.color ?? 'bg-surface-2 text-fg-2 border-border'}`}>
            {SOURCE_LABELS[src]?.label ?? src}
          </span>
        )}
        <PriceTrendBadge variantId={product.id} />
      </div>

      {/* Badges: inactive, inspected */}
      <div className="flex items-center gap-1.5 flex-wrap text-xs">
        {isInactive && <Badge variant="outline" size="sm">inativo</Badge>}
        {product.inspected ? (
          <span title={product.inspection_notes ?? 'Auditado por LLM'} className="text-success font-medium">ok inspecionado</span>
        ) : (
          <span className="text-fg-3">o nao auditado</span>
        )}
        {product.curation_status && product.curation_status !== 'pending' && (
          <Badge variant="outline" size="sm">{product.curation_status}</Badge>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-border">
        {product.curation_status === 'pending' && (
          <>
            <Button
              variant="primary"
              size="sm"
              className="bg-green-600 hover:bg-green-700"
              loading={curating}
              onClick={() => onCurate('curated')}
            >
              Curar
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={curating}
              onClick={() => onCurate('rejected')}
            >
              Rejeitar
            </Button>
          </>
        )}
        <Button variant="primary" size="sm" onClick={onSend}>
          Enviar
        </Button>
        {product.lowest_price_url && (
          <a
            href={product.lowest_price_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-fg-3 hover:text-accent p-1 text-xs"
            title={`Abrir na ${SOURCE_LABELS[src]?.label ?? src}`}
          >
            link
          </a>
        )}
        <button
          type="button"
          title="Excluir produto"
          onClick={onDelete}
          disabled={deleting}
          className="text-fg-3 hover:text-danger p-1 disabled:opacity-40 ml-auto text-xs"
        >
          del
        </button>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 48

export default function Catalog() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  // Filters state
  const [search, setSearch] = React.useState('')
  const [source, setSource] = React.useState('')
  const [tagFilter, setTagFilter] = React.useState('')
  const [categoryFilter, setCategoryFilter] = React.useState('')
  const [subcategoryFilter, setSubcategoryFilter] = React.useState('')
  const [brandFilter, setBrandFilter] = React.useState('')
  const [priceMin, setPriceMin] = React.useState('')
  const [priceMax, setPriceMax] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState('')
  const [showInactive, setShowInactive] = React.useState(false)
  const [page, setPage] = React.useState(0)

  // UI state
  const [selected, setSelected] = React.useState<Set<number>>(new Set())
  const [mobileFiltersOpen, setMobileFiltersOpen] = React.useState(false)

  // Mutations
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

  // GTM on selection
  const handleGtmView = React.useCallback((p: Product) => {
    const rawTitle = p.canonical_name ?? 'Produto'
    const title = formatTitle(rawTitle, typeof p.brand === 'string' ? p.brand : undefined)
    const tags = parseTags(p.tags)
    pushCatalogProductView({
      id: p.id,
      title,
      brand: typeof p.brand === 'string' ? p.brand : undefined,
      price: p.lowest_price ?? 0,
      category: tags[0],
      source: p.lowest_price_source ?? undefined,
      curation_status: p.curation_status,
    })
  }, [])

  // Data queries
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

  const { data: brands = [] } = useQuery<string[]>({
    queryKey: ['catalog', 'brands'],
    queryFn: () => apiClient.get('/api/catalog/brands').then(r => Array.isArray(r.data) ? r.data : []).catch(() => []),
    staleTime: 60_000,
  })

  // Reset page on filter change
  React.useEffect(() => {
    setPage(0)
  }, [search, source, tagFilter, categoryFilter, subcategoryFilter, brandFilter, showInactive, statusFilter])

  const { data: catalogData, isLoading } = useQuery<{ items: Product[]; total: number }>({
    queryKey: ['catalog', search, source, tagFilter, categoryFilter, subcategoryFilter, brandFilter, showInactive, statusFilter, page],
    queryFn: () => {
      const params = new URLSearchParams()
      if (search)           params.set('search', search)
      if (source)           params.set('source', source)
      if (tagFilter)        params.set('tag', tagFilter)
      if (categoryFilter)   params.set('primary_category', categoryFilter)
      if (subcategoryFilter)params.set('subcategory', subcategoryFilter)
      if (brandFilter)      params.set('brand', brandFilter)
      if (statusFilter)     params.set('status', statusFilter)
      if (showInactive)     params.set('include_inactive', 'true')
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

  // Client-side price filter
  const products = rawProducts.filter(p => {
    const price = p.lowest_price ?? 0
    if (priceMin && price < Number(priceMin)) return false
    if (priceMax && price > Number(priceMax)) return false
    return true
  })

  // Selection helpers
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

  const hasActiveFilters = !!(search || source || tagFilter || categoryFilter || subcategoryFilter || brandFilter || priceMin || priceMax || statusFilter)

  const clearFilters = () => {
    setSearch(''); setSource(''); setTagFilter(''); setCategoryFilter('')
    setSubcategoryFilter(''); setBrandFilter(''); setPriceMin(''); setPriceMax(''); setStatusFilter('')
  }

  // Close mobile filters on desktop resize
  React.useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const onChange = () => { if (mq.matches) setMobileFiltersOpen(false) }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const sidebarProps = {
    search, onSearch: setSearch,
    source, onSource: setSource, sources,
    categoryFilter, onCategoryFilter: setCategoryFilter, categories,
    subcategoryFilter, onSubcategoryFilter: setSubcategoryFilter, subcategories,
    brandFilter, onBrandFilter: setBrandFilter, brands,
    priceMin, onPriceMin: setPriceMin,
    priceMax, onPriceMax: setPriceMax,
    statusFilter, onStatusFilter: setStatusFilter,
    showInactive, onShowInactive: setShowInactive,
    onClear: clearFilters, hasActiveFilters,
    total: totalProducts, page, totalPages,
  }

  // Tabs for state quick-filter (from design handoff)
  const tabs = [
    { id: '', label: 'Todos' },
    { id: 'novos', label: 'Novos (7d)' },
    { id: 'curados', label: 'Curados' },
    { id: 'disparados_7d', label: 'Disparados 7d' },
  ]

  return (
    <div className="flex flex-col md:flex-row h-full overflow-hidden relative">
      {/* Mobile overlay */}
      {mobileFiltersOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/40 md:hidden border-0 cursor-default"
          aria-label="Fechar filtros"
          onClick={() => setMobileFiltersOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        id="catalog-filter-panel"
        className={[
          'flex flex-col flex-shrink-0 border-r border-border bg-surface overflow-hidden',
          'fixed inset-y-0 left-0 z-50 w-[min(85vw,20rem)] transition-transform duration-200 ease-out',
          'md:static md:z-auto md:w-52 md:translate-x-0 md:inset-auto',
          mobileFiltersOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        ].join(' ')}
      >
        <div className="flex md:hidden items-center justify-between px-3 py-2 border-b border-border flex-shrink-0 bg-surface">
          <span className="text-sm font-semibold text-fg">Filtros</span>
          <button
            type="button"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md text-fg-2 hover:text-fg hover:bg-surface-2"
            aria-label="Fechar filtros"
            onClick={() => setMobileFiltersOpen(false)}
          >
            X
          </button>
        </div>
        <CatalogSidebar {...sidebarProps} />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 border-b border-border px-4 py-3 bg-surface">
          <PageHeader
            title="Catalogo"
            subtitle={`${totalProducts} produto${totalProducts !== 1 ? 's' : ''} coletados`}
            actions={
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => navigate('/catalog/manual')}
                >
                  + Adicionar manual
                </Button>
                {selected.size > 0 && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => navigate(`/compose?productIds=${Array.from(selected).join(',')}`)}
                  >
                    Disparar ({selected.size})
                  </Button>
                )}
              </>
            }
          />

          {/* Tabs */}
          <div className="mt-3">
            <Tabs
              tabs={tabs}
              active={statusFilter}
              onChange={v => { setStatusFilter(v); setPage(0) }}
            />
          </div>
        </div>

        {/* Mobile filter button */}
        <div className="md:hidden flex items-center gap-2 px-4 py-2 border-b border-border bg-surface flex-shrink-0">
          <button
            type="button"
            onClick={() => setMobileFiltersOpen(true)}
            className="min-h-[44px] px-3 py-2 rounded-md border border-border bg-surface-2 text-sm font-medium text-fg hover:bg-surface flex items-center gap-2"
            aria-expanded={mobileFiltersOpen}
            aria-controls="catalog-filter-panel"
          >
            Filtros
            {hasActiveFilters && (
              <span className="h-2 w-2 rounded-full bg-accent shrink-0" aria-label="Ha filtros ativos" />
            )}
          </button>
          {products.length > 0 && (
            <label className="flex items-center gap-1.5 text-xs text-fg-2 ml-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selected.size === products.length && products.length > 0}
                onChange={toggleAll}
                className="accent-accent"
              />
              Selecionar todos
            </label>
          )}
        </div>

        {/* Bulk select bar on desktop */}
        {products.length > 0 && (
          <div className="hidden md:flex items-center gap-2 px-4 py-1.5 border-b border-border bg-surface flex-shrink-0">
            <label className="flex items-center gap-1.5 text-xs text-fg-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selected.size === products.length && products.length > 0}
                onChange={toggleAll}
                className="accent-accent"
              />
              Selecionar todos ({products.length})
            </label>
            {selected.size > 0 && (
              <span className="text-xs text-accent font-medium ml-2">
                {selected.size} selecionado{selected.size !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}

        {/* Grid content */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {isLoading ? (
            <div className={responsiveGrid}>
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-48 w-full" />
              ))}
            </div>
          ) : products.length === 0 ? (
            <EmptyState
              title="Nenhum produto"
              description="Configure um crawler para comecar a coletar produtos."
              cta={{ label: 'Ir para Crawlers', onClick: () => navigate('/crawlers') }}
            />
          ) : (
            <div className={responsiveGrid}>
              {products.map(p => (
                <CatalogProductCard
                  key={p.id}
                  product={p}
                  isSelected={selected.has(p.id)}
                  onToggle={() => {
                    toggleSelect(p.id)
                    handleGtmView(p)
                  }}
                  onSend={() => navigate(`/match?productId=${p.id}`)}
                  onDelete={() => {
                    const rawTitle = p.canonical_name ?? 'Produto'
                    const title = formatTitle(rawTitle, p.brand)
                    if (confirm(`Excluir "${title}"?`)) deleteMutation.mutate(p.id)
                  }}
                  onCurate={status => curateMutation.mutate({ id: p.id, status })}
                  curating={curateMutation.isPending && curateMutation.variables?.id === p.id}
                  deleting={deleteMutation.isPending && deleteMutation.variables === p.id}
                />
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-0 py-4 mt-4 border-t border-border">
              <button
                type="button"
                disabled={page === 0}
                onClick={() => setPage(p => p - 1)}
                className="text-sm text-accent hover:underline disabled:opacity-40 disabled:no-underline"
              >
                Anterior
              </button>
              <span className="text-xs text-fg-3">
                Pagina {page + 1} de {totalPages} - {totalProducts} produtos
              </span>
              <button
                type="button"
                disabled={page >= totalPages - 1}
                onClick={() => setPage(p => p + 1)}
                className="text-sm text-accent hover:underline disabled:opacity-40 disabled:no-underline"
              >
                Proxima
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
