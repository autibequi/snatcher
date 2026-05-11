import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Badge, Button, Skeleton, EmptyState, PageHeader, Tabs,
  Sparkline, Tile, SearchSelect,
} from '../components/ui'
import { PriceTrendBadge } from '../components/PriceTrendBadge'
import { apiClient } from '../lib/apiClient'
import { pushCatalogProductView } from '../lib/gtm'
import {
  pageContainer,
  tblDense, thDense, thDenseRight, tdDense, tdDenseRight,
  trDense, rowSelected, rowDimmed,
  filterBar,
} from '../lib/uiTokens'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Product {
  id: number
  canonical_name?: string
  brand?: string
  image_url?: string
  lowest_price?: number
  lowest_price_source?: string
  lowest_price_url?: string
  /** Preço original / "de" — quando backend retornar */
  original_price?: number
  /** Pontos para sparkline (8 últimos preços) */
  price_history?: number[]
  /** Estoque humano-legível ("em estoque", "últimas unidades", "esgotado") */
  stock?: string
  tags?: string[] | string
  inactive?: boolean
  curation_status?: string
  inspected?: boolean
  inspection_notes?: string
  created_at?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const SOURCE_ALIAS: Record<string, string> = {
  amz: 'amazon', amazon: 'amazon',
  ml: 'mercadolivre', mercadolivre: 'mercadolivre',
  magalu: 'magalu',
  shopee: 'shopee',
  aliexpress: 'aliexpress',
  kabum: 'kabum',
  americanas: 'americanas',
  casasbahia: 'casasbahia',
  manual: 'manual',
}

const SOURCE_LABEL: Record<string, string> = {
  amazon: 'Amazon',
  mercadolivre: 'Mercado Livre',
  magalu: 'Magalu',
  shopee: 'Shopee',
  aliexpress: 'AliExpress',
  kabum: 'KaBuM',
  americanas: 'Americanas',
  casasbahia: 'Casas Bahia',
  manual: 'Manual',
}

function sourceLabel(s?: string) {
  if (!s) return ''
  const k = SOURCE_ALIAS[s.toLowerCase()] ?? s.toLowerCase()
  return SOURCE_LABEL[k] ?? s
}

function parseTags(raw: string[] | string | undefined | null): string[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  try { return JSON.parse(raw as string) } catch { return [] }
}

function formatTitle(raw: string, brand?: string): string {
  let s = raw.replace(/\s+/g, ' ').trim()
  if (brand) {
    const esc = brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    s = s.replace(new RegExp(`\\b${esc}\\b`, 'gi'), '').replace(/\s+/g, ' ').trim()
  }
  return s.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

function brl(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function discountPct(price: number, original?: number): number | null {
  if (!original || original <= price) return null
  return Math.round(((original - price) / original) * 100)
}

// ── Sort options ──────────────────────────────────────────────────────────────

type SortKey = 'discount_desc' | 'price_asc' | 'name_asc' | 'created_desc'

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'discount_desc', label: 'Maior desconto' },
  { value: 'price_asc',     label: 'Menor preço' },
  { value: 'name_asc',      label: 'Nome (A→Z)' },
  { value: 'created_desc',  label: 'Mais recente' },
]

function sortProducts(items: Product[], key: SortKey): Product[] {
  const arr = items.slice()
  switch (key) {
    case 'price_asc':
      return arr.sort((a, b) => (a.lowest_price ?? Infinity) - (b.lowest_price ?? Infinity))
    case 'name_asc':
      return arr.sort((a, b) => (a.canonical_name ?? '').localeCompare(b.canonical_name ?? ''))
    case 'created_desc':
      return arr.sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
    case 'discount_desc':
    default:
      return arr.sort((a, b) => {
        const da = discountPct(a.lowest_price ?? 0, a.original_price) ?? -1
        const db = discountPct(b.lowest_price ?? 0, b.original_price) ?? -1
        return db - da
      })
  }
}

// ── Advanced filters drawer (categoria/marca/preço/inativos) ──────────────────

interface AdvFiltersState {
  categoryFilter: string
  subcategoryFilter: string
  brandFilter: string
  priceMin: string
  priceMax: string
  showInactive: boolean
}

function AdvancedFiltersDrawer({
  open, onClose,
  state, setState,
  categories, subcategories, brands,
}: {
  open: boolean
  onClose: () => void
  state: AdvFiltersState
  setState: React.Dispatch<React.SetStateAction<AdvFiltersState>>
  categories: string[]
  subcategories: string[]
  brands: string[]
}) {
  if (!open) return null
  const set = <K extends keyof AdvFiltersState>(k: K, v: AdvFiltersState[K]) =>
    setState(s => ({ ...s, [k]: v }))

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-black/40 border-0 cursor-default"
        aria-label="Fechar filtros avançados"
        onClick={onClose}
      />
      <aside className="fixed top-0 right-0 z-50 h-full w-[min(90vw,22rem)] bg-surface border-l border-border shadow-modal flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-fg">Filtros avançados</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-fg-3 hover:text-fg p-1 text-sm"
            aria-label="Fechar"
          >✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {categories.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-3 mb-1.5">Categoria</p>
              <SearchSelect
                options={[{ value: '', label: 'Todas' }, ...categories.map(c => ({ value: c, label: c }))]}
                value={state.categoryFilter}
                onChange={v => set('categoryFilter', v)}
                placeholder="Todas"
              />
            </div>
          )}
          {subcategories.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-3 mb-1.5">Subcategoria</p>
              <SearchSelect
                options={[{ value: '', label: 'Todas' }, ...subcategories.map(c => ({ value: c, label: c }))]}
                value={state.subcategoryFilter}
                onChange={v => set('subcategoryFilter', v)}
                placeholder="Todas"
              />
            </div>
          )}
          {brands.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-3 mb-1.5">Marca</p>
              <SearchSelect
                options={[{ value: '', label: 'Todas' }, ...brands.map(c => ({ value: c, label: c }))]}
                value={state.brandFilter}
                onChange={v => set('brandFilter', v)}
                placeholder="Todas"
              />
            </div>
          )}

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-3 mb-1.5">Preço (R$)</p>
            <div className="flex items-center gap-1.5">
              <input
                type="number" min="0" placeholder="Mín" value={state.priceMin}
                onChange={e => set('priceMin', e.target.value)}
                className="w-full text-sm border border-border rounded-md px-2 py-1.5 bg-surface text-fg outline-none focus:border-accent"
              />
              <span className="text-fg-3 text-xs flex-shrink-0">—</span>
              <input
                type="number" min="0" placeholder="Máx" value={state.priceMax}
                onChange={e => set('priceMax', e.target.value)}
                className="w-full text-sm border border-border rounded-md px-2 py-1.5 bg-surface text-fg outline-none focus:border-accent"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={state.showInactive}
              onChange={e => set('showInactive', e.target.checked)}
              className="accent-accent"
            />
            <span className="text-sm text-fg-2">Mostrar inativos</span>
          </label>
        </div>

        <div className="px-4 py-3 border-t border-border flex items-center justify-between">
          <button
            type="button"
            onClick={() => setState({
              categoryFilter: '',
              subcategoryFilter: '',
              brandFilter: '',
              priceMin: '',
              priceMax: '',
              showInactive: false,
            })}
            className="text-xs text-danger hover:underline"
          >
            Limpar
          </button>
          <Button variant="primary" size="sm" onClick={onClose}>Aplicar</Button>
        </div>
      </aside>
    </>
  )
}

// ── Selection bar flutuante ───────────────────────────────────────────────────

function SelectionBar({
  count, onClear, onCompose, onAddTags, onMoveToChannel,
}: {
  count: number
  onClear: () => void
  onCompose: () => void
  onAddTags?: () => void
  onMoveToChannel?: () => void
}) {
  if (count === 0) return null
  return (
    <div
      role="region"
      aria-label="Ações em massa"
      className="fixed left-1/2 -translate-x-1/2 z-40 min-w-[560px] max-w-[calc(100vw-2rem)] flex items-center gap-3 px-4 py-2.5 rounded-xl shadow-lg"
      style={{
        bottom: 18,
        background: 'oklch(0.20 0.015 270)',
        color: 'oklch(0.96 0.01 270)',
      }}
    >
      <span className="text-sm whitespace-nowrap">
        ✓ <span className="font-semibold tabular-nums">{count}</span> produto{count !== 1 ? 's' : ''} selecionado{count !== 1 ? 's' : ''}
      </span>
      <span className="opacity-30 text-xs">·</span>
      {onAddTags && (
        <button
          type="button"
          onClick={onAddTags}
          className="text-xs px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 transition-colors"
        >
          Adicionar tags
        </button>
      )}
      {onMoveToChannel && (
        <button
          type="button"
          onClick={onMoveToChannel}
          className="text-xs px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 transition-colors"
        >
          Mover para canal
        </button>
      )}
      <span className="flex-1 border-t border-dashed border-white/15 mx-2" />
      <button
        type="button"
        onClick={onClear}
        className="text-xs px-2 py-1 rounded-md text-white/70 hover:text-white"
      >
        Limpar
      </button>
      <button
        type="button"
        onClick={onCompose}
        className="text-xs px-2.5 py-1 rounded-md font-semibold text-white bg-accent hover:bg-accent-hover transition-colors"
      >
        ✈ Compor disparo
      </button>
    </div>
  )
}

// ── Catalog Row ───────────────────────────────────────────────────────────────

function CatalogRow({
  product, isSelected, onToggle, onView, onSend, onDelete, onCurate,
  curating, deleting,
}: {
  product: Product
  isSelected: boolean
  onToggle: () => void
  onView: () => void
  onSend: () => void
  onDelete: () => void
  onCurate: (status: 'curated' | 'rejected') => void
  curating: boolean
  deleting: boolean
}) {
  const rawTitle = product.canonical_name ?? 'Produto'
  const title = formatTitle(rawTitle, product.brand)
  const price = product.lowest_price ?? 0
  const original = product.original_price
  const disc = discountPct(price, original)
  const tags = parseTags(product.tags)
  const inactive = product.inactive === true
  const src = product.lowest_price_source ?? ''
  const sLabel = sourceLabel(src)
  const history = product.price_history && product.price_history.length > 1 ? product.price_history.slice(-8) : null

  const rowCls = [
    trDense,
    isSelected ? rowSelected : '',
    inactive ? rowDimmed : '',
  ].join(' ')

  return (
    <tr className={rowCls}>
      <td className={`${tdDense} w-[40px]`}>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggle}
          className="accent-accent"
          aria-label={`Selecionar ${title}`}
        />
      </td>
      <td className={`${tdDense} max-w-0`}>
        <button
          type="button"
          onClick={onView}
          className="flex items-center gap-2.5 text-left w-full group min-w-0"
          title={title}
        >
          <Tile imageUrl={product.image_url} alt={title}>📦</Tile>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-fg truncate group-hover:text-accent transition-colors">
              {title}
            </p>
            <p className="text-[12px] text-fg-3 truncate">
              {product.brand ?? '—'}{product.stock ? ` · ${product.stock}` : ''}
            </p>
          </div>
        </button>
      </td>
      <td className={tdDense}>
        {sLabel ? <Badge variant="default">{sLabel}</Badge> : <span className="text-fg-3 text-xs">—</span>}
      </td>
      <td className={`${tdDenseRight} whitespace-nowrap`}>
        {price > 0 ? (
          <div className="leading-tight">
            <div className="font-semibold text-success tabular-nums">R$ {brl(price)}</div>
            {original && original > price ? (
              <div className="text-[11px] text-fg-3 tabular-nums line-through">R$ {brl(original)}</div>
            ) : null}
          </div>
        ) : (
          <span className="text-fg-3 text-xs">sem preço</span>
        )}
      </td>
      <td className={tdDense}>
        {disc !== null ? (
          <Badge variant="success">−{disc}%</Badge>
        ) : (
          <PriceTrendBadge variantId={product.id} />
        )}
      </td>
      <td className={tdDense}>
        {history ? (
          <Sparkline values={history} />
        ) : (
          <span className="text-fg-3 text-xs">—</span>
        )}
      </td>
      <td className={tdDense}>
        <div className="flex items-center gap-1 flex-wrap">
          {tags.slice(0, 2).map(t => (
            <span
              key={t}
              className="text-[11px] px-1.5 py-0.5 rounded-md bg-surface-2 text-fg-3 border border-border"
            >
              #{t}
            </span>
          ))}
          {tags.length > 2 && (
            <span className="text-[11px] text-fg-3">+{tags.length - 2}</span>
          )}
        </div>
      </td>
      <td className={`${tdDense} w-[120px]`}>
        <div className="flex items-center justify-end gap-1">
          {product.curation_status === 'pending' && (
            <button
              type="button"
              onClick={() => onCurate('curated')}
              disabled={curating}
              title="Curar produto"
              className="text-success hover:bg-success-soft p-1 rounded disabled:opacity-40 text-sm"
            >
              ✓
            </button>
          )}
          <button
            type="button"
            onClick={onSend}
            title="Compor disparo"
            className="text-fg-2 hover:text-accent hover:bg-accent-soft p-1 rounded text-sm"
          >
            ✈
          </button>
          {product.lowest_price_url && (
            <a
              href={product.lowest_price_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-fg-2 hover:text-accent p-1 rounded text-sm"
              title={`Abrir em ${sLabel}`}
            >
              🔗
            </a>
          )}
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            title="Excluir produto"
            className="text-fg-3 hover:text-danger hover:bg-danger-soft p-1 rounded disabled:opacity-40 text-sm"
          >
            🗑
          </button>
        </div>
      </td>
    </tr>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50

export default function Catalog() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [search, setSearch] = React.useState('')
  const [source, setSource] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState('')
  const [sortKey, setSortKey] = React.useState<SortKey>('discount_desc')
  const [page, setPage] = React.useState(0)
  const [selected, setSelected] = React.useState<Set<number>>(new Set())
  const [advOpen, setAdvOpen] = React.useState(false)

  const [advState, setAdvState] = React.useState<AdvFiltersState>({
    categoryFilter: '',
    subcategoryFilter: '',
    brandFilter: '',
    priceMin: '',
    priceMax: '',
    showInactive: false,
  })

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

  React.useEffect(() => {
    setPage(0)
  }, [search, source, statusFilter, advState])

  const { data: catalogData, isLoading } = useQuery<{ items: Product[]; total: number; new_today?: number }>({
    queryKey: ['catalog', search, source, statusFilter, advState, page],
    queryFn: () => {
      const params = new URLSearchParams()
      if (search)                    params.set('search', search)
      if (source)                    params.set('source', source)
      if (advState.categoryFilter)   params.set('primary_category', advState.categoryFilter)
      if (advState.subcategoryFilter)params.set('subcategory', advState.subcategoryFilter)
      if (advState.brandFilter)      params.set('brand', advState.brandFilter)
      if (statusFilter)              params.set('status', statusFilter)
      if (advState.showInactive)     params.set('include_inactive', 'true')
      params.set('limit', String(PAGE_SIZE))
      params.set('offset', String(page * PAGE_SIZE))
      return apiClient.get(`/api/catalog?${params}`).then(r => {
        const d = r.data
        if (Array.isArray(d)) return { items: d, total: d.length }
        return {
          items: d?.items ?? d?.products ?? [],
          total: d?.total ?? 0,
          new_today: d?.new_today,
        }
      })
    },
    staleTime: 30_000,
  })

  const rawProducts = catalogData?.items ?? []
  const totalProducts = catalogData?.total ?? 0
  const newToday = catalogData?.new_today
  const totalPages = Math.ceil(totalProducts / PAGE_SIZE)

  const products = React.useMemo(() => {
    const filtered = rawProducts.filter(p => {
      const price = p.lowest_price ?? 0
      if (advState.priceMin && price < Number(advState.priceMin)) return false
      if (advState.priceMax && price > Number(advState.priceMax)) return false
      return true
    })
    return sortProducts(filtered, sortKey)
  }, [rawProducts, advState.priceMin, advState.priceMax, sortKey])

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selected.size === products.length) setSelected(new Set())
    else setSelected(new Set(products.map(p => p.id)))
  }

  const sourceOptions = React.useMemo(() => {
    const opts = sources.map(s => ({ value: s, label: sourceLabel(s) }))
    return [{ value: '', label: 'Todas as fontes' }, ...opts]
  }, [sources])

  const advCount =
    (advState.categoryFilter ? 1 : 0)
    + (advState.subcategoryFilter ? 1 : 0)
    + (advState.brandFilter ? 1 : 0)
    + (advState.priceMin ? 1 : 0)
    + (advState.priceMax ? 1 : 0)
    + (advState.showInactive ? 1 : 0)

  const tabs = [
    { id: '', label: 'Todos' },
    { id: 'novos', label: 'Novos (7d)' },
    { id: 'curados', label: 'Curados' },
    { id: 'disparados_7d', label: 'Disparados 7d' },
  ]

  const subtitle =
    totalProducts === 0
      ? 'Nenhum produto coletado ainda'
      : `${totalProducts.toLocaleString('pt-BR')} produto${totalProducts !== 1 ? 's' : ''} coletados${newToday ? ` · ${newToday} novos hoje` : ''}`

  return (
    <div className={pageContainer}>
      <PageHeader
        title="Catálogo"
        subtitle={subtitle}
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => navigate('/catalog/manual')}>
              + Adicionar manual
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={selected.size === 0}
              onClick={() => navigate(`/compose?productIds=${Array.from(selected).join(',')}`)}
            >
              ✈ Disparar selecionados ({selected.size})
            </Button>
          </>
        }
      />

      <div className="mt-3">
        <Tabs
          tabs={tabs}
          active={statusFilter}
          onChange={v => { setStatusFilter(v); setPage(0) }}
        />
      </div>

      {/* Filter bar — card próprio, flex-wrap */}
      <div className={`${filterBar} -mx-3 sm:-mx-4 mt-2 mb-4`}>
        <div className="flex items-center gap-2 flex-1 min-w-[180px] max-w-[420px] bg-surface-2 rounded-md px-2.5 h-8">
          <span className="text-fg-3 text-sm" aria-hidden="true">🔍</span>
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome, marca, tag…"
            className="flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-3"
          />
        </div>
        <SearchSelect
          options={sourceOptions}
          value={source}
          onChange={setSource}
          placeholder="Todas as fontes"
        />
        <SearchSelect
          options={SORT_OPTIONS}
          value={sortKey}
          onChange={v => setSortKey(v as SortKey)}
          placeholder="Ordenar"
        />
        <button
          type="button"
          onClick={() => setAdvOpen(true)}
          className="inline-flex items-center gap-1.5 text-xs px-2.5 h-8 rounded-md border border-border-strong bg-transparent text-fg-2 hover:bg-surface-2 transition-colors"
        >
          + Filtros
          {advCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[1.1rem] h-4 px-1 rounded-full bg-accent text-[10px] font-bold text-white tabular-nums">
              {advCount}
            </span>
          )}
        </button>
      </div>

      {/* Tabela densa */}
      <div className="rounded-lg border border-border bg-surface overflow-hidden">
        {isLoading ? (
          <div className="px-4 py-3 space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="p-2">
            <EmptyState
              title="Nenhum produto"
              description={
                search || source || statusFilter || advCount > 0
                  ? 'Ajuste os filtros para ver mais resultados.'
                  : 'Configure um crawler para começar a coletar produtos.'
              }
              cta={
                search || source || statusFilter || advCount > 0
                  ? undefined
                  : { label: 'Ir para Crawlers', onClick: () => navigate('/crawlers') }
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className={tblDense}>
              <thead>
                <tr>
                  <th className={`${thDense} w-[40px]`}>
                    <input
                      type="checkbox"
                      className="accent-accent"
                      checked={selected.size === products.length && products.length > 0}
                      onChange={toggleAll}
                      aria-label="Selecionar todos"
                    />
                  </th>
                  <th className={thDense}>Produto</th>
                  <th className={thDense}>Fonte</th>
                  <th className={thDenseRight}>Preço</th>
                  <th className={thDense}>Desconto</th>
                  <th className={thDense}>Histórico</th>
                  <th className={thDense}>Tags</th>
                  <th className={`${thDense} text-right`}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {products.map(p => (
                  <CatalogRow
                    key={p.id}
                    product={p}
                    isSelected={selected.has(p.id)}
                    onToggle={() => {
                      toggleSelect(p.id)
                      handleGtmView(p)
                    }}
                    onView={() => navigate(`/match?productId=${p.id}`)}
                    onSend={() => navigate(`/compose?productIds=${p.id}`)}
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
              </tbody>
            </table>
          </div>
        )}

        {/* Paginação */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
              className="text-sm text-accent hover:underline disabled:opacity-40 disabled:no-underline"
            >
              ← Anterior
            </button>
            <span className="text-xs text-fg-3 tabular-nums">
              Página {page + 1} de {totalPages} · {totalProducts.toLocaleString('pt-BR')} produtos
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

      <AdvancedFiltersDrawer
        open={advOpen}
        onClose={() => setAdvOpen(false)}
        state={advState}
        setState={setAdvState}
        categories={categories}
        subcategories={subcategories}
        brands={brands}
      />

      <SelectionBar
        count={selected.size}
        onClear={() => setSelected(new Set())}
        onCompose={() => navigate(`/compose?productIds=${Array.from(selected).join(',')}`)}
      />
    </div>
  )
}
