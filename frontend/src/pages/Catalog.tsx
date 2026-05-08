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
export default function Catalog() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [search, setSearch] = React.useState('')
  const [source, setSource] = React.useState('')
  const [tagFilter, setTagFilter] = React.useState('')
  const [priceMin, setPriceMin] = React.useState('')
  const [priceMax, setPriceMax] = React.useState('')
  const [page, setPage] = React.useState(0)
  const PAGE_SIZE = 50
  const [brandFilter, setBrandFilter] = React.useState('')
  const [selected, setSelected] = React.useState<Set<number>>(new Set())
  const [expandedId, setExpandedId] = React.useState<number | null>(null)
  const [showInactive, setShowInactive] = React.useState(false)

  const curateMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: 'curated' | 'rejected' }) =>
      apiClient.patch(`/api/catalog/${id}`, { curation_status: status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['catalog'] }),
    onError: () => alert('Erro ao salvar'),
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

  // Categorias em uso no catálogo (não filtra taxonomia aprovada — pega tudo que está nos produtos)
  const { data: categories = [] } = useQuery<string[]>({
    queryKey: ['catalog', 'categories'],
    queryFn: () => apiClient.get('/api/catalog/categories').then(r => Array.isArray(r.data) ? r.data : []).catch(() => []),
    staleTime: 60_000,
  })

  // Marcas em uso no catálogo
  const { data: brands = [] } = useQuery<string[]>({
    queryKey: ['catalog', 'brands'],
    queryFn: () => apiClient.get('/api/catalog/brands').then(r => Array.isArray(r.data) ? r.data : []).catch(() => []),
    staleTime: 60_000,
  })

  // Resetar página ao mudar filtros
  React.useEffect(() => { setPage(0) }, [search, source, tagFilter, brandFilter, showInactive])

  const { data: catalogData, isLoading } = useQuery<{ items: Product[]; total: number }>({
    queryKey: ['catalog', search, source, tagFilter, brandFilter, showInactive, page],
    queryFn: () => {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (source) params.set('source', source)
      if (tagFilter) params.set('tag', tagFilter)
      if (brandFilter) params.set('brand', brandFilter)
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
    <div className="flex flex-col h-full">
      {/* Filtros (título vai no topbar) */}
      <div className="px-6 py-2 flex gap-2 border-b border-border flex-shrink-0 flex-wrap items-center">
        {selected.size > 0 && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              const ids = Array.from(selected).join(',')
              navigate(`/compose?productIds=${ids}`)
            }}
          >
            Disparar selecionados ({selected.size})
          </Button>
        )}
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            if (confirm('Inspecionar via LLM os próximos 30 produtos não auditados? Roda em background.')) {
              inspectMut.mutate()
            }
          }}
          loading={inspectMut.isPending}
          title="LLM audita produtos não inspecionados, corrige nome/marca/tags e marca como inspecionado"
        >
          🔍 Inspecionar
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            if (confirm('Reprocessar TODA a base do catálogo? Pode demorar alguns segundos.')) {
              reprocessMut.mutate()
            }
          }}
          loading={reprocessMut.isPending}
          title="Roda taxonomia + limpeza de título em todos os produtos"
        >
          🔄 Reprocessar
        </Button>
        <div className="w-48">
          <Input
            placeholder="Buscar..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg h-8"
          value={source}
          onChange={e => setSource(e.target.value)}
        >
          <option value="">Todas as fontes</option>
          <option value="amazon">Amazon</option>
          <option value="mercadolivre">Mercado Livre</option>
          <option value="magalu">Magalu</option>
          <option value="shopee">Shopee</option>
          <option value="aliexpress">AliExpress</option>
          <option value="kabum">Kabum</option>
          <option value="americanas">Americanas</option>
          <option value="casasbahia">Casas Bahia</option>
        </select>
        {categories.length > 0 && (
          <SearchSelect
            placeholder="Todas as categorias"
            value={tagFilter}
            onChange={setTagFilter}
            options={categories.map(c => ({ value: c, label: c }))}
          />
        )}
        {brands.length > 0 && (
          <SearchSelect
            placeholder="Todas as marcas"
            value={brandFilter}
            onChange={setBrandFilter}
            options={brands.map(b => ({ value: b, label: b }))}
          />
        )}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-fg-3">R$</span>
          <input
            type="number" min="0" placeholder="Mín"
            value={priceMin}
            onChange={e => setPriceMin(e.target.value)}
            className="w-20 text-sm border border-border rounded-md px-2 py-1.5 bg-surface text-fg outline-none focus:border-accent h-8"
          />
          <span className="text-xs text-fg-3">–</span>
          <input
            type="number" min="0" placeholder="Máx"
            value={priceMax}
            onChange={e => setPriceMax(e.target.value)}
            className="w-20 text-sm border border-border rounded-md px-2 py-1.5 bg-surface text-fg outline-none focus:border-accent h-8"
          />
        </div>
        <label className="flex items-center gap-2 h-8 cursor-pointer">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={e => setShowInactive(e.target.checked)}
            className="accent-accent"
          />
          <span className="text-xs text-fg-2">Mostrar inativos</span>
        </label>
        {(search || source || tagFilter || brandFilter || priceMin || priceMax) && (
          <button type="button" onClick={() => { setSearch(''); setSource(''); setTagFilter(''); setBrandFilter(''); setPriceMin(''); setPriceMax('') }}
            className="text-xs text-fg-3 hover:text-danger">
            × Limpar filtros
          </button>
        )}
        <span className="text-xs text-fg-3 ml-auto">
          {totalProducts} produto{totalProducts !== 1 ? 's' : ''}
          {totalPages > 1 && ` · pág. ${page + 1}/${totalPages}`}
        </span>
      </div>

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
  )
}
