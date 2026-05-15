import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authFetch } from '../lib/authFetch'

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

interface CatalogItem {
  id: number
  short_id: string
  dedup_key: string
  source_id: string
  category_id?: number
  category_name?: string
  title: string
  brand?: string
  image_url?: string
  price_original?: number
  price_current: number
  discount_pct?: number
  quality_score?: number
  send_ready: boolean
  canonical_url_alive: boolean
  canonical_url?: string
  created_at: string
  send_ready_at?: string
}

interface Stats {
  total: number
  send_ready: number
  dead_urls: number
  unscored: number
  images_cached: number
  by_source: { source_id: string; n: number }[]
}

interface DetailModalProps {
  item: CatalogItem
  onClose: () => void
}

function DetailModal({ item, onClose }: DetailModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-surface dark:bg-bg rounded-xl shadow-2xl max-w-lg w-full mx-4 px-3 py-4 sm:px-4 sm:py-6 space-y-3"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-lg font-semibold leading-tight">{item.title}</h2>
          <button onClick={onClose} className="text-fg-4 hover:text-fg-2 text-xl leading-none flex-shrink-0">
            ✕
          </button>
        </div>
        <dl className="text-sm space-y-1.5">
          {item.brand && <div className="flex gap-2"><dt className="text-fg-3 w-36 flex-shrink-0">Marca</dt><dd className="font-semibold">{item.brand}</dd></div>}
          <div className="flex gap-2"><dt className="text-fg-3 w-36 flex-shrink-0">Categoria</dt><dd>{item.category_name ?? item.category_id ?? '—'}</dd></div>
          <div className="flex gap-2"><dt className="text-fg-3 w-36 flex-shrink-0">Source</dt><dd>{item.source_id}</dd></div>
          <div className="flex gap-2"><dt className="text-fg-3 w-36 flex-shrink-0">Preço atual</dt><dd className="font-medium">{brl.format(item.price_current)}</dd></div>
          {item.price_original != null && item.price_original > 0 && (
            <div className="flex gap-2"><dt className="text-fg-3 w-36 flex-shrink-0">Preço original</dt><dd>{brl.format(item.price_original)}</dd></div>
          )}
          {item.discount_pct != null && item.discount_pct > 0 && (
            <div className="flex gap-2"><dt className="text-fg-3 w-36 flex-shrink-0">Desconto</dt><dd className="text-success">{item.discount_pct.toFixed(1)}%</dd></div>
          )}
          <div className="flex gap-2"><dt className="text-fg-3 w-36 flex-shrink-0">Quality score</dt><dd>{item.quality_score?.toFixed(3) ?? '—'}</dd></div>
          <div className="flex gap-2"><dt className="text-fg-3 w-36 flex-shrink-0">send_ready</dt><dd>{item.send_ready ? '✓' : '✗'}</dd></div>
          {item.canonical_url && (
            <div className="flex gap-2 items-start"><dt className="text-fg-3 w-36 flex-shrink-0">URL</dt>
              <dd><a href={item.canonical_url} target="_blank" rel="noreferrer" className="text-accent text-xs break-all hover:underline">{item.canonical_url}</a></dd>
            </div>
          )}
          <div className="flex gap-2 font-mono text-xs"><dt className="text-fg-3 w-36 flex-shrink-0">dedup_key</dt><dd className="break-all">{item.dedup_key}</dd></div>
          <div className="flex gap-2"><dt className="text-fg-3 w-36 flex-shrink-0">Criado em</dt><dd>{item.created_at}</dd></div>
        </dl>
      </div>
    </div>
  )
}

function QualityBadge({ score }: { score?: number }) {
  if (score == null) {
    return <span className="inline-block px-2 py-0.5 rounded text-xs bg-surface-2 text-fg-3">—</span>
  }
  const color = score >= 0.6 ? 'bg-success-soft text-success' : score >= 0.4 ? 'bg-warning-soft text-warning' : 'bg-surface-2 text-fg-3'
  return <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${color}`}>{score.toFixed(2)}</span>
}

export default function AdminCatalogCanonical() {
  const navigate = useNavigate()
  const [stats, setStats] = useState<Stats | null>(null)
  const [items, setItems] = useState<CatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [statsLoading, setStatsLoading] = useState(true)
  const [readyOnly, setReadyOnly] = useState(false)
  const [categoryID, setCategoryID] = useState('')
  const [brandFilter, setBrandFilter] = useState('')
  const [priceMin, setPriceMin] = useState('')
  const [priceMax, setPriceMax] = useState('')
  const [page, setPage] = useState(0)
  const [detailItem, setDetailItem] = useState<CatalogItem | null>(null)
  const LIMIT = 50

  const loadStats = async () => {
    setStatsLoading(true)
    try {
      const r = await authFetch('/api/admin/catalog-canonical/stats')
      if (r.ok) setStats(await r.json())
    } finally {
      setStatsLoading(false)
    }
  }

  const loadItems = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        limit: String(LIMIT),
        offset: String(page * LIMIT),
      })
      if (readyOnly) params.set('ready_only', '1')
      if (categoryID) params.set('category_id', categoryID)
      if (brandFilter.trim()) params.set('brand', brandFilter.trim())
      if (priceMin.trim()) params.set('price_min', priceMin.trim())
      if (priceMax.trim()) params.set('price_max', priceMax.trim())
      const r = await authFetch(`/api/admin/catalog-canonical?${params}`)
      if (r.ok) setItems(await r.json())
    } finally {
      setLoading(false)
    }
  }

  const [categories, setCategories] = useState<{id: number; slug: string; name: string}[]>([])
  useEffect(() => {
    loadStats()
    authFetch('/api/admin/templates/categories').then(r => r.json()).then(d => setCategories(Array.isArray(d) ? d : []))
  }, [])
  useEffect(() => { loadItems() }, [readyOnly, categoryID, brandFilter, priceMin, priceMax, page]) // eslint-disable-line react-hooks/exhaustive-deps

  const KPI_CARDS = stats
    ? [
        { label: 'Total',          value: stats.total,          color: 'text-accent' },
        { label: 'Send ready',     value: stats.send_ready,     color: 'text-success' },
        { label: 'URLs mortas',    value: stats.dead_urls,      color: 'text-danger' },
        { label: 'Sem score',      value: stats.unscored,       color: 'text-warning' },
        { label: 'Imagens cached', value: stats.images_cached,  color: 'text-fg-2' },
      ]
    : []

  return (
    <div className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-4 sm:py-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Catálogo</h1>
        <p className="text-sm text-fg-3 mt-1">Produtos disponíveis para envio pelo Algo tick.</p>
      </div>

      {/* KPI cards */}
      {statsLoading ? (
        <div className="flex gap-4">{[...Array(5)].map((_, i) => <div key={i} className="h-20 flex-1 bg-surface-2 rounded-xl animate-pulse" />)}</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {KPI_CARDS.map(k => (
            <div key={k.label} className="bg-surface dark:bg-bg border rounded-xl p-4 shadow-sm">
              <p className="text-xs text-fg-3 uppercase tracking-wide">{k.label}</p>
              <p className={`text-2xl font-bold mt-1 ${k.color}`}>{k.value.toLocaleString('pt-BR')}</p>
            </div>
          ))}
        </div>
      )}


      {/* Filtros */}
      <div className="rounded-lg border border-border bg-surface p-3 space-y-3">
        <div className="flex flex-wrap gap-3 items-center">
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none shrink-0">
            <input type="checkbox" checked={readyOnly}
              onChange={e => { setReadyOnly(e.target.checked); setPage(0) }}
              className="accent-accent" />
            Só send_ready
          </label>

          <div className="flex items-center gap-1.5 text-sm">
            <label className="text-fg-3 shrink-0">Categoria:</label>
            <select
              value={categoryID}
              onChange={e => { setCategoryID(e.target.value); setPage(0) }}
              className="text-sm border border-border rounded px-2 py-1 bg-surface-2 focus:outline-none focus:border-accent"
            >
              <option value="">Todas</option>
              {categories.map(c => (
                <option key={c.id} value={String(c.id)}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 text-sm">
            <label className="text-fg-3 shrink-0">Marca:</label>
            <input
              value={brandFilter}
              onChange={e => { setBrandFilter(e.target.value); setPage(0) }}
              placeholder="ex: nike"
              className="w-28 text-sm border border-border rounded px-2 py-1 bg-surface-2 focus:outline-none focus:border-accent"
            />
          </div>

          <div className="flex items-center gap-1.5 text-sm">
            <label className="text-fg-3 shrink-0">Preço:</label>
            <input type="number" value={priceMin} onChange={e => { setPriceMin(e.target.value); setPage(0) }}
              placeholder="mín" className="w-20 text-sm border border-border rounded px-2 py-1 bg-surface-2 focus:outline-none focus:border-accent" />
            <span className="text-fg-4">–</span>
            <input type="number" value={priceMax} onChange={e => { setPriceMax(e.target.value); setPage(0) }}
              placeholder="máx" className="w-20 text-sm border border-border rounded px-2 py-1 bg-surface-2 focus:outline-none focus:border-accent" />
          </div>

          <button onClick={() => { setCategoryID(''); setBrandFilter(''); setPriceMin(''); setPriceMax(''); setReadyOnly(false); setPage(0) }}
            className="text-xs text-fg-3 hover:text-fg underline">
            Limpar
          </button>
          <button onClick={() => { loadItems(); loadStats() }}
            className="px-3 py-1 text-sm border border-border rounded hover:bg-surface-2 ml-auto">
            Atualizar
          </button>
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-surface dark:bg-bg border rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 border-b">
            <tr>
              <th className="w-14 px-3 py-2" />
              <th className="text-left px-3 py-2 font-medium text-fg-2">Título</th>
              <th className="text-left px-3 py-2 font-medium text-fg-2 hidden sm:table-cell">Marca</th>
              <th className="text-left px-3 py-2 font-medium text-fg-2 hidden md:table-cell">Categoria</th>
              <th className="text-right px-3 py-2 font-medium text-fg-2">Preço</th>
              <th className="text-center px-3 py-2 font-medium text-fg-2 hidden lg:table-cell">Score</th>
              <th className="text-center px-3 py-2 font-medium text-fg-2">Ready</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              [...Array(10)].map((_, i) => (
                <tr key={i}>
                  <td colSpan={7} className="px-3 py-2">
                    <div className="h-4 bg-surface-2 rounded animate-pulse" />
                  </td>
                </tr>
              ))
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-fg-4">Nenhum item encontrado.</td>
              </tr>
            ) : (
              items.map(item => (
                <tr key={item.id} className="hover:bg-surface-2 transition-colors">
                  {/* Thumbnail */}
                  <td className="px-3 py-2">
                    {item.image_url ? (
                      <img
                        src={item.image_url}
                        alt=""
                        className="w-12 h-12 object-cover rounded"
                        onError={e => { (e.target as HTMLImageElement).src = '' }}
                      />
                    ) : (
                      <div className="w-12 h-12 rounded bg-surface-2 flex items-center justify-center text-fg-4 text-xs">?</div>
                    )}
                  </td>
                  {/* Título */}
                  <td className="px-3 py-2 max-w-xs">
                    <span className="line-clamp-2 leading-tight">
                      {item.title.length > 60 ? item.title.slice(0, 60) + '…' : item.title}
                    </span>
                  </td>
                  {/* Marca */}
                  <td className="px-3 py-2 hidden sm:table-cell text-sm">
                    {item.brand ? (
                      <span className="font-medium text-fg">{item.brand}</span>
                    ) : (
                      <span className="text-fg-4 text-xs">—</span>
                    )}
                  </td>
                  {/* Categoria */}
                  <td className="px-3 py-2 hidden md:table-cell text-xs text-fg-3">
                    <div className="text-[10px] text-fg-4">{item.source_id}</div>
                    {item.category_name && <div>{item.category_name}</div>}
                  </td>
                  {/* Preço */}
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <div>{brl.format(item.price_current)}</div>
                    {item.discount_pct != null && item.discount_pct > 0 && (
                      <div className="text-xs text-success">-{item.discount_pct.toFixed(0)}%</div>
                    )}
                  </td>
                  {/* Score */}
                  <td className="px-3 py-2 text-center hidden lg:table-cell">
                    <QualityBadge score={item.quality_score} />
                  </td>
                  {/* send_ready */}
                  <td className="px-3 py-2 text-center">
                    <span className={item.send_ready ? 'text-success' : 'text-danger'}>
                      {item.send_ready ? '✓' : '✗'}
                    </span>
                  </td>
                  {/* Ações */}
                  <td className="px-3 py-2">
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => setDetailItem(item)}
                        className="px-2 py-1 text-xs bg-surface-2 rounded hover:bg-surface-3 transition-colors"
                      >
                        Ver
                      </button>
                      <button
                        onClick={() => navigate(`/compose?productIds=${item.id}`)}
                        className="px-2 py-1 text-xs bg-accent text-white rounded hover:bg-accent-hover transition-colors"
                        title="Abrir Composer com este produto"
                      >
                        ✈ Disparar
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      <div className="flex items-center justify-center gap-4 text-sm">
        <button
          onClick={() => setPage(p => Math.max(0, p - 1))}
          disabled={page === 0}
          className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-surface-2"
        >
          ←
        </button>
        <span className="text-fg-2">Página {page + 1}</span>
        <button
          onClick={() => setPage(p => p + 1)}
          disabled={items.length < LIMIT}
          className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-surface-2"
        >
          →
        </button>
      </div>

      {/* Modal detalhe */}
      {detailItem && <DetailModal item={detailItem} onClose={() => setDetailItem(null)} />}
    </div>
  )
}
