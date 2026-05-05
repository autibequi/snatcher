import { useState, FC, ChangeEvent } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getSearchTerms, updateSearchTerm, deleteSearchTerm, crawlSearchTerm, getCrawlResults, getConfig } from '../api'
import { CategoryPicker } from '../components/CategoryPicker'
import { SourcePicker } from '../components/SourcePicker'

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

interface SearchTerm {
  id: number
  query: string
  queries?: string | null
  min_val: number
  max_val: number
  sources: string | string[]
  crawl_interval: number
  active: boolean
  result_count: number
  last_crawled_at?: string
  category?: 'ecommerce' | 'cdkey'
}

interface CrawlResult {
  id: string
  title: string
  source: string
  crawled_at: string
  price: number
  url: string
  image_url?: string
  catalog_variant_id?: string
}

interface CrawlResultsResponse {
  items: CrawlResult[]
  total: number
}

interface ConfigData {
  ml_affiliate_tool_id?: string
  amz_tracking_id?: string
}

interface SearchTermFormData {
  query?: string
  queries?: string[]
  min_val?: number
  max_val?: number
  sources?: string[] | string
  crawl_interval?: number
  category?: 'ecommerce' | 'cdkey'
}

// ────────────────────────────────────────────────────────────
// Main Component
// ────────────────────────────────────────────────────────────

const CrawlerDetail: FC = () => {
  const { id } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [page, setPage] = useState<number>(0)
  const [editing, setEditing] = useState<boolean>(false)
  const [editForm, setEditForm] = useState<SearchTermFormData>({})

  const { data: terms = [] } = useQuery({
    queryKey: ['searchTerms'],
    queryFn: getSearchTerms as () => Promise<SearchTerm[]>,
  })
  const { data: config } = useQuery({
    queryKey: ['config'],
    queryFn: getConfig as () => Promise<ConfigData>,
  })
  const term = terms.find(t => t.id === Number(id))

  const { data: resultsData, isLoading: loadingResults } = useQuery({
    queryKey: ['crawlResults', id, page],
    queryFn: () => getCrawlResults(id || '', { limit: 30, offset: page * 30 }) as Promise<CrawlResultsResponse>,
    enabled: !!id,
    refetchInterval: 15_000,
  })

  const parsedQueries: string[] = (() => {
    try {
      const parsed = JSON.parse(term?.queries || '[]')
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  })()

  const update = useMutation({
    mutationFn: (data: SearchTermFormData) => {
      // Only send the fields that were edited; include query to satisfy API requirements
      const payload: SearchTermFormData & { query?: string } = { query: data.query || term?.query, ...data }
      return updateSearchTerm(id || '', payload as any)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['searchTerms'] }); setEditing(false) },
  })
  const toggle = useMutation({
    mutationFn: () => updateSearchTerm(id || '', { query: term?.query || '', active: !term?.active } as any),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['searchTerms'] }),
  })
  const del = useMutation({
    mutationFn: () => deleteSearchTerm(id || ''),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['searchTerms'] }); navigate('/admin/crawlers') },
  })
  const crawl = useMutation({
    mutationFn: () => crawlSearchTerm(id || ''),
    onSuccess: () => { setTimeout(() => qc.invalidateQueries({ queryKey: ['crawlResults'] }), 3000) },
  })

  const results = resultsData?.items ?? []
  const total = resultsData?.total ?? 0
  const totalPages = Math.ceil(total / 30)

  const field = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-green-500 transition-colors'
  const badge = 'text-xs px-2 py-0.5 rounded-full font-medium'

  if (!term) {
    return (
      <div>
        <Link to="/admin/crawlers" className="text-gray-400 hover:text-white text-sm">← Crawlers</Link>
        <p className="text-gray-500 mt-8 text-center">Crawler não encontrado.</p>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link to="/admin/crawlers" className="text-gray-400 hover:text-white text-sm">← Crawlers</Link>
        <span className={`${badge} ${term.active ? 'bg-green-900 text-green-300' : 'bg-gray-800 text-gray-500'}`}>
          {term.active ? 'ativo' : 'pauso'}
        </span>
      </div>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">"{term.query}"</h1>
          {parsedQueries.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {parsedQueries.map(q => (
                <span key={q} className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">"{q}"</span>
              ))}
            </div>
          )}
          <p className="text-gray-500 text-sm mt-1">
            R${term.min_val.toFixed(0)}–R${term.max_val.toFixed(0)} | cada {term.crawl_interval}min
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setEditing(e => !e); const sourcesArray = Array.isArray(term.sources) ? term.sources : (typeof term.sources === 'string' ? term.sources.split(',') : []); setEditForm({ query: term.query, queries: parsedQueries, min_val: term.min_val, max_val: term.max_val, sources: sourcesArray, crawl_interval: term.crawl_interval, category: term.category || 'ecommerce' }) }}
            className="bg-gray-800 hover:bg-gray-700 text-white text-sm px-3 py-2 rounded-lg transition-colors">Editar</button>
          <button onClick={() => toggle.mutate()}
            className="bg-gray-800 hover:bg-gray-700 text-white text-sm px-3 py-2 rounded-lg transition-colors">
            {term.active ? '⏸️ Pausar' : '▶️ Ativar'}
          </button>
          <button onClick={() => crawl.mutate()} disabled={crawl.isPending}
            className="bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition-colors">
            {crawl.isPending ? '⏳ Crawling...' : '🔄 Crawl agora'}
          </button>
          <button onClick={() => { if (confirm(`Remover "${term.query}"?`)) del.mutate() }}
            className="bg-red-900 hover:bg-red-800 text-white text-sm px-3 py-2 rounded-lg transition-colors">Deletar</button>
        </div>
      </div>

      {/* Edit form */}
      {editing && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="text-xs text-gray-400">Query principal</label>
              <input className={field} value={editForm.query || ''} onChange={(e: ChangeEvent<HTMLInputElement>) => setEditForm(f => ({ ...f, query: e.target.value }))} />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-gray-400 block mb-1">Queries adicionais</label>
              <div className="space-y-1">
                {(editForm.queries || []).map((q, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      className={field}
                      value={q}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => setEditForm(f => {
                        const qs = [...(f.queries || [])]
                        qs[i] = e.target.value
                        return { ...f, queries: qs }
                      })}
                      placeholder={`Termo alternativo ${i + 1}`}
                    />
                    <button
                      type="button"
                      onClick={() => setEditForm(f => ({ ...f, queries: (f.queries || []).filter((_, j) => j !== i) }))}
                      className="text-gray-500 hover:text-red-400 px-2"
                    >×</button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setEditForm(f => ({ ...f, queries: [...(f.queries || []), ''] }))}
                  className="text-xs text-blue-400 hover:text-blue-300 mt-1"
                >+ Adicionar query</button>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400">Min (R$)</label>
              <input className={field} type="number" value={editForm.min_val || ''} onChange={(e: ChangeEvent<HTMLInputElement>) => setEditForm(f => ({ ...f, min_val: +e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-gray-400">Max (R$)</label>
              <input className={field} type="number" value={editForm.max_val || ''} onChange={(e: ChangeEvent<HTMLInputElement>) => setEditForm(f => ({ ...f, max_val: +e.target.value }))} />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-gray-400 block mb-2">Categoria</label>
              <CategoryPicker value={editForm.category || 'ecommerce'} onChange={(cat) => setEditForm(f => ({ ...f, category: cat }))} />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-gray-400 block mb-2">Sources</label>
              <SourcePicker value={Array.isArray(editForm.sources) ? editForm.sources : []} onChange={(sources) => setEditForm(f => ({ ...f, sources }))} category={editForm.category || 'ecommerce'} />
            </div>
            <div>
              <label className="text-xs text-gray-400">Intervalo (min)</label>
              <input className={field} type="number" min={5} value={editForm.crawl_interval || ''} onChange={(e: ChangeEvent<HTMLInputElement>) => setEditForm(f => ({ ...f, crawl_interval: +e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => update.mutate(editForm)} disabled={update.isPending}
              className="bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition-colors">Salvar</button>
            <button onClick={() => setEditing(false)} className="bg-gray-700 hover:bg-gray-600 text-white text-sm px-4 py-2 rounded-lg transition-colors">Cancelar</button>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-white">{total}</p>
          <p className="text-xs text-gray-400">resultados total</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-white">{term.result_count}</p>
          <p className="text-xs text-gray-400">ultimo crawl</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-white">
            {term.last_crawled_at ? new Date(term.last_crawled_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'}
          </p>
          <p className="text-xs text-gray-400">ultimo crawl</p>
        </div>
      </div>

      {/* Results table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <h2 className="text-sm font-medium text-gray-300 mb-3">Resultados brutos ({total})</h2>

        {loadingResults && <p className="text-gray-500 text-sm">Carregando...</p>}

        <div className="space-y-1">
          {results.map(r => (
            <div key={r.id} className="flex items-center gap-3 py-2 px-3 bg-gray-800 rounded text-xs">
              {r.image_url && <img src={r.image_url} alt="" className="w-10 h-10 object-contain bg-white rounded flex-shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="text-gray-300 truncate">{r.title}</p>
                <p className="text-gray-500">{r.source} | {new Date(r.crawled_at).toLocaleString('pt-BR')}</p>
              </div>
              <span className="text-green-400 font-medium whitespace-nowrap">R$ {r.price.toFixed(2).replace('.', ',')}</span>
              <span className={`${badge} ${r.catalog_variant_id ? 'bg-green-900 text-green-300' : 'bg-yellow-900 text-yellow-300'}`}>
                {r.catalog_variant_id ? 'processado' : 'pendente'}
              </span>
              <a href={r.url} target="_blank" rel="noreferrer" className="text-gray-500 hover:text-blue-400">🔗</a>
            </div>
          ))}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-700">
            <button onClick={() => setPage(p => p - 1)} disabled={page === 0}
              className="text-sm text-gray-400 hover:text-white disabled:opacity-40">← Anterior</button>
            <span className="text-xs text-gray-500">{page + 1} / {totalPages}</span>
            <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1}
              className="text-sm text-gray-400 hover:text-white disabled:opacity-40">Proximo →</button>
          </div>
        )}

        {!loadingResults && results.length === 0 && (
          <p className="text-gray-600 text-sm text-center py-8">Nenhum resultado. Clique "Crawl agora" para buscar.</p>
        )}
      </div>
    </div>
  )
}

export default CrawlerDetail
