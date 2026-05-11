import { useState, FC, ChangeEvent } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getSearchTerms, updateSearchTerm, deleteSearchTerm, crawlSearchTerm, getCrawlResults, getConfig } from '../api'
import { CategoryPicker } from '../components/CategoryPicker'
import { SourcePicker } from '../components/SourcePicker'
import { PageHeader, Button, Badge, KpiCard, Skeleton } from '../components/ui'
import { pageContainer } from '../lib/uiTokens'

// ── Types ─────────────────────────────────────────────────────────────────────

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

// ── CrawlerDetail ─────────────────────────────────────────────────────────────

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
  const { data: _config } = useQuery({
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['searchTerms'] }); navigate('/crawlers') },
  })
  const crawl = useMutation({
    mutationFn: () => crawlSearchTerm(id || ''),
    onSuccess: () => { setTimeout(() => qc.invalidateQueries({ queryKey: ['crawlResults'] }), 3000) },
  })

  const results = resultsData?.items ?? []
  const total = resultsData?.total ?? 0
  const totalPages = Math.ceil(total / 30)

  const inputClass = 'w-full bg-surface border border-border rounded-md px-3 py-2 text-fg text-sm placeholder:text-fg-3 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors'

  if (!term) {
    return (
      <div className={pageContainer}>
        <Link to="/crawlers" className="text-fg-3 hover:text-fg text-sm">Crawlers</Link>
        <p className="text-fg-3 mt-8 text-center">Crawler nao encontrado.</p>
      </div>
    )
  }

  return (
    <div className={pageContainer}>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-5 text-sm text-fg-3">
        <Link to="/crawlers" className="hover:text-fg transition-colors">Crawlers</Link>
        <span>/</span>
        <span className="text-fg truncate max-w-xs">"{term.query}"</span>
      </div>

      {/* Header */}
      <div className="mb-6">
        <PageHeader
          title={<span className="font-mono">"{term.query}"</span>}
          subtitle={`R$${term.min_val.toFixed(0)}–R$${term.max_val.toFixed(0)} | cada ${term.crawl_interval}min`}
          actions={
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setEditing(e => !e)
                  const sourcesArray = Array.isArray(term.sources)
                    ? term.sources
                    : (typeof term.sources === 'string' ? term.sources.split(',') : [])
                  setEditForm({
                    query: term.query,
                    queries: parsedQueries,
                    min_val: term.min_val,
                    max_val: term.max_val,
                    sources: sourcesArray,
                    crawl_interval: term.crawl_interval,
                    category: term.category || 'ecommerce',
                  })
                }}
              >
                {editing ? 'Cancelar edicao' : 'Editar'}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => toggle.mutate()}
                loading={toggle.isPending}
              >
                {term.active ? 'Pausar' : 'Ativar'}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => crawl.mutate()}
                loading={crawl.isPending}
              >
                Crawl agora
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => { if (confirm(`Remover "${term.query}"?`)) del.mutate() }}
                loading={del.isPending}
              >
                Deletar
              </Button>
            </>
          }
        />
        <div className="flex items-center gap-2 mt-2">
          <Badge variant={term.active ? 'success' : 'default'} size="sm">
            {term.active ? 'ativo' : 'pausado'}
          </Badge>
          {parsedQueries.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {parsedQueries.map(q => (
                <span key={q} className="text-xs bg-surface-2 text-fg-3 px-2 py-0.5 rounded-full border border-border">"{q}"</span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Edit form */}
      {editing && (
        <div className="bg-surface border border-border rounded-lg p-4 mb-6 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="text-xs text-fg-2 block mb-1">Query principal</label>
              <input
                className={inputClass}
                value={editForm.query || ''}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setEditForm(f => ({ ...f, query: e.target.value }))}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-fg-2 block mb-1">Queries adicionais</label>
              <div className="space-y-1">
                {(editForm.queries || []).map((q, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      className={inputClass}
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
                      className="text-fg-3 hover:text-danger px-2"
                    >x</button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setEditForm(f => ({ ...f, queries: [...(f.queries || []), ''] }))}
                  className="text-xs text-accent hover:text-accent-hover mt-1"
                >+ Adicionar query</button>
              </div>
            </div>
            <div>
              <label className="text-xs text-fg-2 block mb-1">Min (R$)</label>
              <input
                className={inputClass}
                type="number"
                value={editForm.min_val || ''}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setEditForm(f => ({ ...f, min_val: +e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs text-fg-2 block mb-1">Max (R$)</label>
              <input
                className={inputClass}
                type="number"
                value={editForm.max_val || ''}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setEditForm(f => ({ ...f, max_val: +e.target.value }))}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-fg-2 block mb-2">Categoria</label>
              <CategoryPicker value={editForm.category || 'ecommerce'} onChange={cat => setEditForm(f => ({ ...f, category: cat }))} />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-fg-2 block mb-2">Sources</label>
              <SourcePicker
                value={Array.isArray(editForm.sources) ? editForm.sources : []}
                onChange={sources => setEditForm(f => ({ ...f, sources }))}
                category={editForm.category || 'ecommerce'}
              />
            </div>
            <div>
              <label className="text-xs text-fg-2 block mb-1">Intervalo (min)</label>
              <input
                className={inputClass}
                type="number"
                min={5}
                value={editForm.crawl_interval || ''}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setEditForm(f => ({ ...f, crawl_interval: +e.target.value }))}
              />
            </div>
          </div>
          <div className="flex gap-2 pt-1 border-t border-border">
            <Button
              variant="primary"
              size="sm"
              onClick={() => update.mutate(editForm)}
              loading={update.isPending}
            >
              Salvar
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setEditing(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* KPI Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
        <KpiCard label="Resultados total" value={total} />
        <KpiCard label="Ultimo crawl" value={term.result_count} />
        <KpiCard
          label="Horario"
          value={term.last_crawled_at
            ? new Date(term.last_crawled_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
            : '—'}
        />
      </div>

      {/* Results table */}
      <div className="bg-surface border border-border rounded-lg p-4">
        <h2 className="text-sm font-medium text-fg mb-3">Resultados brutos ({total})</h2>

        {loadingResults && (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        )}

        <div className="space-y-1">
          {results.map(r => (
            <div key={r.id} className="flex items-center gap-3 py-2 px-3 bg-surface-2 rounded-md text-xs">
              {r.image_url && (
                <img src={r.image_url} alt="" className="w-10 h-10 object-contain bg-white rounded flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-fg truncate">{r.title}</p>
                <p className="text-fg-3">{r.source} | {new Date(r.crawled_at).toLocaleString('pt-BR')}</p>
              </div>
              <span className="text-success font-medium whitespace-nowrap">R$ {r.price.toFixed(2).replace('.', ',')}</span>
              <Badge
                variant={r.catalog_variant_id ? 'success' : 'warning'}
                size="sm"
              >
                {r.catalog_variant_id ? 'processado' : 'pendente'}
              </Badge>
              <a
                href={r.url}
                target="_blank"
                rel="noreferrer"
                className="text-fg-3 hover:text-accent"
              >
                link
              </a>
            </div>
          ))}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage(p => p - 1)}
              disabled={page === 0}
            >
              Anterior
            </Button>
            <span className="text-xs text-fg-3">{page + 1} / {totalPages}</span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage(p => p + 1)}
              disabled={page >= totalPages - 1}
            >
              Proximo
            </Button>
          </div>
        )}

        {!loadingResults && results.length === 0 && (
          <p className="text-fg-3 text-sm text-center py-8">
            Nenhum resultado. Clique &quot;Crawl agora&quot; para buscar.
          </p>
        )}
      </div>
    </div>
  )
}

export default CrawlerDetail
