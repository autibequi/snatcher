import { useState, FC, ChangeEvent } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getSearchTerms, updateSearchTerm, deleteSearchTerm, crawlSearchTerm, getCrawlResults, getConfig } from '../api'
import { CategoryPicker } from '../components/CategoryPicker'
import { SourcePicker } from '../components/SourcePicker'
import { PageHeader, Button, Badge, KpiCard, Skeleton, Switch, Tabs } from '../components/ui'
import {
  pageContainer,
  sectionCard,
  tableContainer,
  tableHeaderCell,
  tableRow,
  tableCell,
  tableCellMuted,
  formGroup,
  formLabel,
  inputBase,
} from '../lib/uiTokens'

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

// ── Tab: Resultados ───────────────────────────────────────────────────────────

interface TabResultsProps {
  termId: string
}

// TabResults: exibe a tabela paginada de crawl results para o termo
const TabResults: FC<TabResultsProps> = ({ termId }) => {
  const [page, setPage] = useState<number>(0)
  const qc = useQueryClient()
  const crawl = useMutation({
    mutationFn: () => crawlSearchTerm(termId),
    onSuccess: () => { setTimeout(() => qc.invalidateQueries({ queryKey: ['crawlResults'] }), 3000) },
  })

  const { data: resultsData, isLoading: loadingResults } = useQuery({
    queryKey: ['crawlResults', termId, page],
    queryFn: () => getCrawlResults(termId, { limit: 30, offset: page * 30 }) as Promise<CrawlResultsResponse>,
    enabled: !!termId,
    refetchInterval: 15_000,
  })

  const results = resultsData?.items ?? []
  const total = resultsData?.total ?? 0
  const totalPages = Math.ceil(total / 30)

  return (
    <div className="space-y-4">
      {/* Actions row */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-fg-2">
          {total > 0 ? `${total} resultado${total !== 1 ? 's' : ''}` : 'Nenhum resultado ainda'}
        </p>
        <Button
          variant="primary"
          size="sm"
          onClick={() => crawl.mutate()}
          loading={crawl.isPending}
        >
          Crawl agora
        </Button>
      </div>

      {loadingResults && (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      )}

      {!loadingResults && results.length === 0 && (
        <div className={sectionCard + ' text-center py-10'}>
          <p className="text-fg-3 text-sm">
            Nenhum resultado. Clique &quot;Crawl agora&quot; para buscar.
          </p>
        </div>
      )}

      {results.length > 0 && (
        <div className={tableContainer}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {['Produto', 'Fonte', 'Preço', 'Data', 'Status', ''].map((header, index) => (
                  <th key={index} className={tableHeaderCell}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.map(result => (
                <tr key={result.id} className={tableRow}>
                  <td className={tableCell}>
                    <div className="flex items-center gap-3">
                      {result.image_url && (
                        <img
                          src={result.image_url}
                          alt=""
                          className="w-10 h-10 object-contain bg-white rounded flex-shrink-0"
                        />
                      )}
                      <p className="text-fg truncate max-w-[280px]">{result.title}</p>
                    </div>
                  </td>
                  <td className={tableCellMuted + ' text-xs'}>{result.source}</td>
                  <td className={tableCell + ' text-success font-medium'}>
                    R$ {result.price.toFixed(2).replace('.', ',')}
                  </td>
                  <td className={tableCellMuted + ' text-xs'}>
                    {new Date(result.crawled_at).toLocaleString('pt-BR')}
                  </td>
                  <td className={tableCell}>
                    <Badge
                      variant={result.catalog_variant_id ? 'success' : 'warning'}
                      size="sm"
                    >
                      {result.catalog_variant_id ? 'processado' : 'pendente'}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    <a
                      href={result.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-fg-3 hover:text-accent text-xs"
                    >
                      link
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
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

    </div>
  )
}

// ── Tab: Configuração ─────────────────────────────────────────────────────────

interface TabConfigProps {
  term: SearchTerm
  parsedQueries: string[]
  onSaved: () => void
}

// TabConfig: form de edição sempre visível (não toggle)
const TabConfig: FC<TabConfigProps> = ({ term, parsedQueries, onSaved }) => {
  const [editForm, setEditForm] = useState<SearchTermFormData>(() => {
    const sourcesArray = Array.isArray(term.sources)
      ? term.sources
      : (typeof term.sources === 'string' ? term.sources.split(',') : [])
    return {
      query: term.query,
      queries: parsedQueries,
      min_val: term.min_val,
      max_val: term.max_val,
      sources: sourcesArray,
      crawl_interval: term.crawl_interval,
      category: term.category || 'ecommerce',
    }
  })

  const update = useMutation({
    mutationFn: (data: SearchTermFormData) => {
      const payload = { query: data.query || term.query, ...data }
      return updateSearchTerm(String(term.id), payload as any)
    },
    onSuccess: onSaved,
  })

  return (
    <div className={sectionCard + ' max-w-2xl'}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label className={formLabel + ' text-xs text-fg-2 block mb-1'}>Query principal</label>
          <input
            className={inputBase + ' w-full text-sm'}
            value={editForm.query || ''}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setEditForm(f => ({ ...f, query: e.target.value }))
            }
          />
        </div>

        <div className="sm:col-span-2">
          <label className={formLabel + ' text-xs text-fg-2 block mb-1'}>Queries adicionais</label>
          <div className="space-y-1">
            {(editForm.queries || []).map((q, queryIndex) => (
              <div key={queryIndex} className="flex gap-2">
                <input
                  className={inputBase + ' flex-1 text-sm'}
                  value={q}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setEditForm(f => {
                      const qs = [...(f.queries || [])]
                      qs[queryIndex] = e.target.value
                      return { ...f, queries: qs }
                    })
                  }
                  placeholder={`Termo alternativo ${queryIndex + 1}`}
                />
                <button
                  type="button"
                  onClick={() =>
                    setEditForm(f => ({
                      ...f,
                      queries: (f.queries || []).filter((_, j) => j !== queryIndex),
                    }))
                  }
                  className="text-fg-3 hover:text-danger px-2"
                >
                  x
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setEditForm(f => ({ ...f, queries: [...(f.queries || []), ''] }))
              }
              className="text-xs text-accent hover:text-accent-hover mt-1"
            >
              + Adicionar query
            </button>
          </div>
        </div>

        <div className={formGroup}>
          <label className={formLabel + ' text-xs text-fg-2'}>Min (R$)</label>
          <input
            className={inputBase + ' w-full text-sm'}
            type="number"
            value={editForm.min_val || ''}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setEditForm(f => ({ ...f, min_val: +e.target.value }))
            }
          />
        </div>

        <div className={formGroup}>
          <label className={formLabel + ' text-xs text-fg-2'}>Max (R$)</label>
          <input
            className={inputBase + ' w-full text-sm'}
            type="number"
            value={editForm.max_val || ''}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setEditForm(f => ({ ...f, max_val: +e.target.value }))
            }
          />
        </div>

        <div className="sm:col-span-2">
          <label className={formLabel + ' text-xs text-fg-2 block mb-2'}>Categoria</label>
          <CategoryPicker
            value={editForm.category || 'ecommerce'}
            onChange={cat => setEditForm(f => ({ ...f, category: cat }))}
          />
        </div>

        <div className="sm:col-span-2">
          <label className={formLabel + ' text-xs text-fg-2 block mb-2'}>Sources</label>
          <SourcePicker
            value={Array.isArray(editForm.sources) ? editForm.sources : []}
            onChange={sources => setEditForm(f => ({ ...f, sources }))}
            category={editForm.category || 'ecommerce'}
          />
        </div>

        <div className={formGroup}>
          <label className={formLabel + ' text-xs text-fg-2'}>Intervalo (min)</label>
          <input
            className={inputBase + ' w-full text-sm'}
            type="number"
            min={5}
            value={editForm.crawl_interval || ''}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setEditForm(f => ({ ...f, crawl_interval: +e.target.value }))
            }
          />
        </div>
      </div>

      <div className="flex gap-2 pt-4 mt-3 border-t border-border">
        <Button
          variant="primary"
          size="sm"
          onClick={() => update.mutate(editForm)}
          loading={update.isPending}
        >
          Salvar
        </Button>
      </div>
    </div>
  )
}

// ── Tab: Histórico ────────────────────────────────────────────────────────────

// TabHistory: histórico de execuções do crawler
// Endpoint /api/crawlers/:id/history ainda não implementado — exibe empty state elegante
const TabHistory: FC<{ termId: string }> = ({ termId: _termId }) => {
  return (
    <div className={sectionCard + ' text-center py-12'}>
      <p className="text-fg-3 text-sm font-medium mb-1">Histórico em breve</p>
      <p className="text-xs text-fg-3">
        Esta aba exibirá quando e quantos resultados foram coletados por horário.
      </p>
    </div>
  )
}

// ── CrawlerDetail ─────────────────────────────────────────────────────────────

const CrawlerDetail: FC = () => {
  const { id } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState<string>('results')

  const { data: terms = [] } = useQuery({
    queryKey: ['searchTerms'],
    queryFn: getSearchTerms as () => Promise<SearchTerm[]>,
  })
  const { data: _config } = useQuery({
    queryKey: ['config'],
    queryFn: getConfig as () => Promise<ConfigData>,
  })

  const term = terms.find(t => t.id === Number(id))

  const toggle = useMutation({
    mutationFn: () =>
      updateSearchTerm(id || '', { query: term?.query || '', active: !term?.active } as any),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['searchTerms'] }),
  })
  const del = useMutation({
    mutationFn: () => deleteSearchTerm(id || ''),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['searchTerms'] })
      navigate('/crawlers')
    },
  })

  const parsedQueries: string[] = (() => {
    try {
      const parsed = JSON.parse(term?.queries || '[]')
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  })()

  if (!term) {
    return (
      <div className={pageContainer}>
        <Link to="/crawlers" className="text-fg-3 hover:text-fg text-sm">
          Crawlers
        </Link>
        <p className="text-fg-3 mt-8 text-center">Crawler nao encontrado.</p>
      </div>
    )
  }

  const TABS = [
    { id: 'results', label: 'Resultados' },
    { id: 'config', label: 'Configuração' },
    { id: 'history', label: 'Histórico' },
  ]

  // Callback: recarrega searchTerms após salvar configuração
  const handleConfigSaved = () => {
    qc.invalidateQueries({ queryKey: ['searchTerms'] })
  }

  return (
    <div className={pageContainer}>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-5 text-sm text-fg-3">
        <Link to="/crawlers" className="hover:text-fg transition-colors">
          Crawlers
        </Link>
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
              {/* Switch de ativo/pausado no lugar do Button */}
              <div className="flex items-center gap-2">
                <Switch
                  checked={term.active}
                  onChange={() => toggle.mutate()}
                  disabled={toggle.isPending}
                  label={term.active ? 'Ativo' : 'Pausado'}
                />
              </div>
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  if (confirm(`Remover "${term.query}"?`)) del.mutate()
                }}
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
                <span
                  key={q}
                  className="text-xs bg-surface-2 text-fg-3 px-2 py-0.5 rounded-full border border-border"
                >
                  "{q}"
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
        <KpiCard label="Resultados total" value={term.result_count} />
        <KpiCard label="Ultimo crawl" value={term.result_count} />
        <KpiCard
          label="Horario"
          value={
            term.last_crawled_at
              ? new Date(term.last_crawled_at).toLocaleTimeString('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : '—'
          }
        />
      </div>

      {/* Tabs */}
      <Tabs tabs={TABS} active={activeTab} onChange={setActiveTab} className="mb-6" />

      {/* Tab content */}
      <div>
        {activeTab === 'results' && (
          <TabResults termId={id || ''} />
        )}
        {activeTab === 'config' && (
          <TabConfig
            term={term}
            parsedQueries={parsedQueries}
            onSaved={handleConfigSaved}
          />
        )}
        {activeTab === 'history' && <TabHistory termId={id || ''} />}
      </div>
    </div>
  )
}

export default CrawlerDetail
