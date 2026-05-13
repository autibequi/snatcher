import { useEffect, useState } from 'react'
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
  image_url?: string
  price_original?: number
  price_current: number
  discount_pct?: number
  quality_score?: number
  send_ready: boolean
  canonical_url_alive: boolean
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
        <dl className="text-sm space-y-1">
          <div className="flex gap-2"><dt className="text-fg-3 w-36 flex-shrink-0">ID</dt><dd>{item.id}</dd></div>
          <div className="flex gap-2"><dt className="text-fg-3 w-36 flex-shrink-0">short_id</dt><dd className="font-mono text-xs">{item.short_id}</dd></div>
          <div className="flex gap-2"><dt className="text-fg-3 w-36 flex-shrink-0">dedup_key</dt><dd className="font-mono text-xs break-all">{item.dedup_key}</dd></div>
          <div className="flex gap-2"><dt className="text-fg-3 w-36 flex-shrink-0">source_id</dt><dd>{item.source_id}</dd></div>
          <div className="flex gap-2"><dt className="text-fg-3 w-36 flex-shrink-0">Categoria</dt><dd>{item.category_name ?? item.category_id ?? '—'}</dd></div>
          <div className="flex gap-2"><dt className="text-fg-3 w-36 flex-shrink-0">Preço atual</dt><dd>{brl.format(item.price_current)}</dd></div>
          {item.price_original != null && (
            <div className="flex gap-2"><dt className="text-fg-3 w-36 flex-shrink-0">Preço original</dt><dd>{brl.format(item.price_original)}</dd></div>
          )}
          {item.discount_pct != null && (
            <div className="flex gap-2"><dt className="text-fg-3 w-36 flex-shrink-0">Desconto</dt><dd>{item.discount_pct.toFixed(1)}%</dd></div>
          )}
          <div className="flex gap-2"><dt className="text-fg-3 w-36 flex-shrink-0">Quality score</dt><dd>{item.quality_score != null ? item.quality_score.toFixed(3) : '—'}</dd></div>
          <div className="flex gap-2"><dt className="text-fg-3 w-36 flex-shrink-0">send_ready</dt><dd>{item.send_ready ? '✓' : '✗'}</dd></div>
          <div className="flex gap-2"><dt className="text-fg-3 w-36 flex-shrink-0">canonical_url_alive</dt><dd>{item.canonical_url_alive ? '✓' : '✗'}</dd></div>
          <div className="flex gap-2"><dt className="text-fg-3 w-36 flex-shrink-0">Criado em</dt><dd>{item.created_at}</dd></div>
          {item.send_ready_at && (
            <div className="flex gap-2"><dt className="text-fg-3 w-36 flex-shrink-0">send_ready_at</dt><dd>{item.send_ready_at}</dd></div>
          )}
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
  const [stats, setStats] = useState<Stats | null>(null)
  const [items, setItems] = useState<CatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [statsLoading, setStatsLoading] = useState(true)
  const [readyOnly, setReadyOnly] = useState(false)
  const [categoryID, setCategoryID] = useState('')
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
      const r = await authFetch(`/api/admin/catalog-canonical?${params}`)
      if (r.ok) setItems(await r.json())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadStats() }, [])
  useEffect(() => { loadItems() }, [readyOnly, categoryID, page]) // eslint-disable-line react-hooks/exhaustive-deps

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

      {/* Por source */}
      {stats && stats.by_source.length > 0 && (
        <div className="bg-surface dark:bg-bg border rounded-xl p-4 shadow-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-fg-3 mb-3">Por source</h2>
          <table className="text-sm w-full max-w-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-1 pr-4 text-fg-2 font-medium">source_id</th>
                <th className="text-right py-1 text-fg-2 font-medium">count</th>
              </tr>
            </thead>
            <tbody>
              {stats.by_source.map(s => (
                <tr key={s.source_id} className="border-b last:border-0">
                  <td className="py-1 pr-4 font-mono text-xs">{s.source_id}</td>
                  <td className="py-1 text-right">{s.n.toLocaleString('pt-BR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-4 items-center">
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={readyOnly}
            onChange={e => { setReadyOnly(e.target.checked); setPage(0) }}
            className="accent-indigo-600"
          />
          Só send_ready
        </label>
        <div className="flex items-center gap-2 text-sm">
          <label htmlFor="catid" className="text-fg-2">Category ID:</label>
          <input
            id="catid"
            type="number"
            min={0}
            value={categoryID}
            onChange={e => { setCategoryID(e.target.value); setPage(0) }}
            placeholder="qualquer"
            className="w-28 border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>
        <button
          onClick={() => { loadItems(); loadStats() }}
          className="px-3 py-1 text-sm border rounded hover:bg-surface-2"
        >
          Atualizar
        </button>
      </div>

      {/* Tabela */}
      <div className="bg-surface dark:bg-bg border rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 border-b">
            <tr>
              <th className="w-14 px-3 py-2" />
              <th className="text-left px-3 py-2 font-medium text-fg-2">Título</th>
              <th className="text-left px-3 py-2 font-medium text-fg-2 hidden md:table-cell">Source / Categoria</th>
              <th className="text-right px-3 py-2 font-medium text-fg-2">Preço</th>
              <th className="text-center px-3 py-2 font-medium text-fg-2 hidden lg:table-cell">Score</th>
              <th className="text-center px-3 py-2 font-medium text-fg-2">Ready</th>
              <th className="text-center px-3 py-2 font-medium text-fg-2">URL</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              [...Array(10)].map((_, i) => (
                <tr key={i}>
                  <td colSpan={8} className="px-3 py-2">
                    <div className="h-4 bg-surface-2 rounded animate-pulse" />
                  </td>
                </tr>
              ))
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-fg-4">Nenhum item encontrado.</td>
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
                  {/* Source / Categoria */}
                  <td className="px-3 py-2 hidden md:table-cell text-xs text-fg-3">
                    <div>{item.source_id}</div>
                    {item.category_name && <div className="text-fg-4">{item.category_name}</div>}
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
                  {/* canonical_url_alive */}
                  <td className="px-3 py-2 text-center">
                    <span className={item.canonical_url_alive ? 'text-success' : 'text-danger'}>
                      {item.canonical_url_alive ? '✓' : '✗'}
                    </span>
                  </td>
                  {/* Ver */}
                  <td className="px-3 py-2">
                    <button
                      onClick={() => setDetailItem(item)}
                      className="px-2 py-1 text-xs bg-surface-2 rounded hover:bg-surface-3 transition-colors"
                    >
                      Ver
                    </button>
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
