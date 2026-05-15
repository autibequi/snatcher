import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { BrandAutocomplete, type ProductBrandRow } from '../components/BrandAutocomplete'
import { Tabs } from '../components/ui'
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
  brand_slug?: string
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
  llm_queue_pending?: number
  by_source: { source_id: string; n: number }[]
}

interface LLMQueueRow {
  catalog_id: number
  status: string
  reason?: string
  enqueued_at: string
  processed_at?: string
  last_error?: string
  title: string
  source_id: string
  category_name?: string
}

interface DetailModalProps {
  item: CatalogItem
  onClose: () => void
}

interface PriceHistoryPoint {
  price: number
  seen_at: string
}

function DetailModal({ item, onClose }: DetailModalProps) {
  const [priceHistory, setPriceHistory] = useState<PriceHistoryPoint[] | null>(null)

  useEffect(() => {
    let cancelled = false
    setPriceHistory(null)
    void (async () => {
      try {
        const r = await authFetch(`/api/admin/catalog/${item.id}/price-history?limit=80`)
        if (!r.ok) {
          if (!cancelled) setPriceHistory([])
          return
        }
        const d = (await r.json()) as PriceHistoryPoint[]
        if (!cancelled) setPriceHistory(Array.isArray(d) ? d : [])
      } catch {
        if (!cancelled) setPriceHistory([])
      }
    })()
    return () => { cancelled = true }
  }, [item.id])

  const historyLoading = priceHistory === null
  const historyRows = priceHistory ?? []

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-surface dark:bg-bg rounded-xl shadow-2xl max-w-2xl w-full mx-4 px-3 py-4 sm:px-4 sm:py-6 space-y-3 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-lg font-semibold leading-tight">{item.title}</h2>
          <button onClick={onClose} className="text-fg-4 hover:text-fg-2 text-xl leading-none flex-shrink-0">
            ✕
          </button>
        </div>
        <dl className="text-sm space-y-1.5">
          {item.brand && (
            <div className="flex gap-2">
              <dt className="text-fg-3 w-36 flex-shrink-0">Marca</dt>
              <dd className="font-semibold">
                {item.brand}
                {item.brand_slug ? <span className="text-fg-4 text-xs font-normal ml-1">({item.brand_slug})</span> : null}
              </dd>
            </div>
          )}
          <div className="flex gap-2"><dt className="text-fg-3 w-36 flex-shrink-0">Categoria</dt><dd>{item.category_name ?? item.category_id ?? '—'}</dd></div>
          <div className="flex gap-2"><dt className="text-fg-3 w-36 flex-shrink-0">Source</dt><dd>{item.source_id}</dd></div>
          <div className="flex gap-2"><dt className="text-fg-3 w-36 flex-shrink-0">Preço atual</dt><dd className="font-medium">{brl.format(item.price_current)}</dd></div>
          {item.price_original != null && item.price_original > 0 && (
            <div className="flex gap-2"><dt className="text-fg-3 w-36 flex-shrink-0">Preço original</dt><dd>{brl.format(item.price_original)}</dd></div>
          )}
          {item.discount_pct != null && item.discount_pct > 0 && (
            <div className="flex gap-2"><dt className="text-fg-3 w-36 flex-shrink-0">Desconto</dt><dd className="text-success">{item.discount_pct.toFixed(1)}%</dd></div>
          )}
          <div className="border-t border-border pt-3 mt-2">
            <h3 className="text-xs font-semibold text-fg-3 uppercase tracking-wide mb-2">Histórico de preço</h3>
            {historyLoading && <p className="text-xs text-fg-4">Carregando…</p>}
            {!historyLoading && historyRows.length === 0 && (
              <p className="text-xs text-fg-4">
                Nenhum ponto no histórico. Após aplicar a migration recente, novos produtos e alterações de{' '}
                <code className="text-[10px]">price_current</code> passam a ser registrados automaticamente.
              </p>
            )}
            {!historyLoading && historyRows.length > 0 && (
              <div className="max-h-44 overflow-y-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-surface-2 sticky top-0 z-10">
                    <tr>
                      <th className="text-left font-medium text-fg-2 px-2 py-1.5">Quando</th>
                      <th className="text-right font-medium text-fg-2 px-2 py-1.5">Preço</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {historyRows.map((h, idx) => (
                      <tr key={`${h.seen_at}-${idx}`} className="hover:bg-surface-2/80">
                        <td className="px-2 py-1.5 text-fg-3 whitespace-nowrap tabular-nums">
                          {new Date(h.seen_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                        </td>
                        <td className="px-2 py-1.5 text-right font-medium tabular-nums">{brl.format(h.price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
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

type CatalogTab = 'catalog' | 'llm'

export default function AdminCatalogCanonical() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab: CatalogTab = searchParams.get('tab') === 'llm' ? 'llm' : 'catalog'

  const setTab = (id: string) => {
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev)
        if (id === 'catalog') next.delete('tab')
        else next.set('tab', 'llm')
        return next
      },
      { replace: true },
    )
  }

  const [stats, setStats] = useState<Stats | null>(null)
  const [items, setItems] = useState<CatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [statsLoading, setStatsLoading] = useState(true)
  const [readyOnly, setReadyOnly] = useState(false)
  const [categoryID, setCategoryID] = useState('')
  const [brandSlug, setBrandSlug] = useState('')
  const [brandInput, setBrandInput] = useState('')
  const [priceMin, setPriceMin] = useState('')
  const [priceMax, setPriceMax] = useState('')
  const [page, setPage] = useState(0)
  const [detailItem, setDetailItem] = useState<CatalogItem | null>(null)
  const [llmQueue, setLlmQueue] = useState<LLMQueueRow[] | null>(null)
  const [llmQueueLoading, setLlmQueueLoading] = useState(false)
  const [processNextBusy, setProcessNextBusy] = useState(false)
  const [llmQueueStatus, setLlmQueueStatus] = useState<'active' | 'all' | 'pending' | 'processing' | 'done' | 'error'>('active')
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

  const loadLLMQueue = async () => {
    setLlmQueueLoading(true)
    try {
      const params = new URLSearchParams({ status: llmQueueStatus, limit: '200' })
      const r = await authFetch(`/api/admin/catalog-canonical/llm-queue?${params}`)
      if (r.ok) {
        const d = (await r.json()) as LLMQueueRow[]
        setLlmQueue(Array.isArray(d) ? d : [])
      } else {
        setLlmQueue([])
      }
    } finally {
      setLlmQueueLoading(false)
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
      if (brandSlug) params.set('brand_slug', brandSlug)
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
  useEffect(() => { loadItems() }, [readyOnly, categoryID, brandSlug, priceMin, priceMax, page]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (tab !== 'llm') return
    void loadLLMQueue()
  }, [tab, llmQueueStatus]) // eslint-disable-line react-hooks/exhaustive-deps

  const pendingLLM = stats?.llm_queue_pending ?? 0

  const runProcessNext = async () => {
    setProcessNextBusy(true)
    try {
      const r = await authFetch('/api/admin/catalog-llm-queue/process-next', { method: 'POST' })
      const text = await r.text()
      let j: Record<string, unknown> = {}
      try {
        j = JSON.parse(text) as Record<string, unknown>
      } catch {
        /* plain text error */
      }
      if (!r.ok) {
        window.alert(text.slice(0, 500))
        return
      }
      if (j.message && typeof j.message === 'string' && !j.processed) {
        window.alert(j.message as string)
      }
      await Promise.all([loadStats(), loadLLMQueue()])
    } finally {
      setProcessNextBusy(false)
    }
  }

  const KPI_CARDS = stats
    ? [
        { key: 'total', label: 'Total', value: stats.total, color: 'text-accent' as const },
        { key: 'ready', label: 'Send ready', value: stats.send_ready, color: 'text-success' as const },
        { key: 'dead', label: 'URLs mortas', value: stats.dead_urls, color: 'text-danger' as const },
        { key: 'unscored', label: 'Sem score', value: stats.unscored, color: 'text-warning' as const },
        { key: 'images', label: 'Imagens cached', value: stats.images_cached, color: 'text-fg-2' as const },
        {
          key: 'llm',
          label: 'Fila LLM (pendentes)',
          value: pendingLLM,
          color: pendingLLM > 0 ? ('text-warning' as const) : ('text-fg-2' as const),
          goToLLM: true as const,
        },
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
        <div className="flex gap-4">{[...Array(6)].map((_, i) => <div key={i} className="h-20 flex-1 bg-surface-2 rounded-xl animate-pulse" />)}</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          {KPI_CARDS.map(k => {
            const inner = (
              <>
                <p className="text-xs text-fg-3 uppercase tracking-wide">{k.label}</p>
                <p className={`text-2xl font-bold mt-1 ${k.color}`}>{k.value.toLocaleString('pt-BR')}</p>
              </>
            )
            const cardClass = 'bg-surface dark:bg-bg border rounded-xl p-4 shadow-sm text-left'
            if (k.goToLLM) {
              return (
                <button
                  key={k.key}
                  type="button"
                  onClick={() => setTab('llm')}
                  className={`${cardClass} transition-colors hover:border-accent/40 cursor-pointer`}
                >
                  {inner}
                </button>
              )
            }
            return (
              <div key={k.key} className={cardClass}>
                {inner}
              </div>
            )
          })}
        </div>
      )}

      <Tabs
        className="mb-2"
        tabs={[
          { id: 'catalog', label: 'Catálogo' },
          { id: 'llm', label: 'Fila LLM', badge: pendingLLM, title: 'catalog_llm_queue — enriquecimento marca/categoria' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'llm' && (
      <div className="rounded-xl border border-border bg-surface dark:bg-bg shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 px-3 py-3 border-b border-border bg-surface-2/50">
          <h2 className="text-sm font-semibold text-fg-2">Fila LLM <span className="text-fg-4 font-normal">(catalog_llm_queue)</span></h2>
          <select
            value={llmQueueStatus}
            onChange={e => {
              setLlmQueueStatus(e.target.value as typeof llmQueueStatus)
            }}
            className="text-sm border border-border rounded px-2 py-1 bg-surface focus:outline-none focus:border-accent"
            title="active = pendente + processando + erro; all inclui concluídos"
          >
            <option value="active">Ativos (pendente / processando / erro)</option>
            <option value="pending">Só pendentes</option>
            <option value="processing">Só processando</option>
            <option value="error">Só erro</option>
            <option value="done">Só concluídos</option>
            <option value="all">Todos os status</option>
          </select>
          <button
            type="button"
            onClick={() => void runProcessNext()}
            disabled={processNextBusy}
            className="text-xs px-2 py-1 border border-accent/40 rounded hover:bg-accent/10 disabled:opacity-50"
            title="Processa um item pending (eurística + LLM). O servidor também drena a fila a cada 2 min."
          >
            {processNextBusy ? 'Processando…' : 'Processar 1'}
          </button>
          <button
            type="button"
            onClick={() => void loadLLMQueue()}
            className="text-xs px-2 py-1 border border-border rounded hover:bg-surface-2 ml-auto sm:ml-0"
          >
            Atualizar fila
          </button>
        </div>
        <div className="overflow-x-auto">
          {llmQueueLoading ? (
            <p className="px-3 py-4 text-sm text-fg-4">Carregando fila…</p>
          ) : !llmQueue || llmQueue.length === 0 ? (
            <p className="px-3 py-4 text-sm text-fg-4">Nenhum item neste filtro.</p>
          ) : (
            <table className="w-full text-xs sm:text-sm">
              <thead className="bg-surface-2 border-b border-border">
                <tr>
                  <th className="text-left font-medium text-fg-2 px-3 py-2">ID</th>
                  <th className="text-left font-medium text-fg-2 px-3 py-2 min-w-[12rem]">Título</th>
                  <th className="text-left font-medium text-fg-2 px-3 py-2 hidden md:table-cell">Source</th>
                  <th className="text-left font-medium text-fg-2 px-3 py-2 hidden lg:table-cell">Categoria</th>
                  <th className="text-left font-medium text-fg-2 px-3 py-2">Status</th>
                  <th className="text-left font-medium text-fg-2 px-3 py-2 hidden sm:table-cell">Motivo</th>
                  <th className="text-left font-medium text-fg-2 px-3 py-2 hidden xl:table-cell max-w-[12rem]">Erro</th>
                  <th className="text-left font-medium text-fg-2 px-3 py-2 whitespace-nowrap">Enfileirado</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {llmQueue.map(row => (
                  <tr key={row.catalog_id} className="hover:bg-surface-2/80">
                    <td className="px-3 py-2 font-mono tabular-nums">{row.catalog_id}</td>
                    <td className="px-3 py-2 max-w-[20rem]"><span className="line-clamp-2">{row.title}</span></td>
                    <td className="px-3 py-2 hidden md:table-cell text-fg-3">{row.source_id}</td>
                    <td className="px-3 py-2 hidden lg:table-cell text-fg-3">{row.category_name ?? '—'}</td>
                    <td className="px-3 py-2">
                      <span className={
                        row.status === 'pending' ? 'text-warning font-medium'
                          : row.status === 'processing' ? 'text-accent font-medium'
                            : row.status === 'error' ? 'text-danger font-medium'
                              : 'text-fg-3'
                      }>{row.status}</span>
                    </td>
                    <td className="px-3 py-2 hidden sm:table-cell text-fg-3 max-w-[10rem] truncate" title={row.reason ?? ''}>{row.reason ?? '—'}</td>
                    <td className="px-3 py-2 hidden xl:table-cell text-danger/90 max-w-[12rem] truncate" title={row.last_error ?? ''}>{row.last_error ?? '—'}</td>
                    <td className="px-3 py-2 text-fg-3 whitespace-nowrap tabular-nums">
                      {new Date(row.enqueued_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className="text-xs px-2 py-1 bg-surface-2 rounded hover:bg-surface-3"
                        onClick={() => {
                          const found = items.find(i => i.id === row.catalog_id)
                          if (found) setDetailItem(found)
                          else void authFetch(`/api/admin/catalog-canonical?ids=${row.catalog_id}`).then(r => r.json()).then((d: CatalogItem[]) => {
                            if (Array.isArray(d) && d[0]) setDetailItem(d[0])
                          })
                        }}
                      >
                        Ver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      )}

      {tab === 'catalog' && (
      <>
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

          <div className="flex items-center gap-1.5 text-sm min-w-[12rem]">
            <label className="text-fg-3 shrink-0">Marca:</label>
            <BrandAutocomplete
              inputValue={brandInput}
              onInputChange={v => { setBrandInput(v); setBrandSlug(''); setPage(0) }}
              onSelect={(b: ProductBrandRow) => { setBrandSlug(b.slug); setBrandInput(b.display_name); setPage(0) }}
              placeholder="Buscar…"
              className="flex-1 min-w-[8rem]"
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

          <button onClick={() => { setCategoryID(''); setBrandSlug(''); setBrandInput(''); setPriceMin(''); setPriceMax(''); setReadyOnly(false); setPage(0) }}
            className="text-xs text-fg-3 hover:text-fg underline">
            Limpar
          </button>
          <button
            onClick={() => { void loadItems(); void loadStats() }}
            className="px-3 py-1 text-sm border border-border rounded hover:bg-surface-2 ml-auto"
          >
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
      </>
      )}

      {/* Modal detalhe */}
      {detailItem && <DetailModal item={detailItem} onClose={() => setDetailItem(null)} />}
    </div>
  )
}
