import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Input, Modal, Switch, Skeleton, EmptyState, KpiCard, Textarea } from '../../components/ui'
import { apiClient } from '../../lib/apiClient'
import { useWSEvent } from '../../lib/useWS'
import { tblDense, thDense, thDenseRight, tdDense, tdDenseRight, trDense } from '../../lib/uiTokens'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SearchTerm {
  id: number
  query: string
  queries?: string
  sources?: string
  active: boolean
  inbox_muted?: boolean
  crawl_interval: number
  last_crawled_at?: string
  result_count: number
  min_val?: number
  max_val?: number
  category?: string
  last_error?: string
  last_error_at?: string
}

// ── Source helpers ─────────────────────────────────────────────────────────────

const SRC_ALIAS: Record<string, string> = {
  amazon: 'amz', mercadolivre: 'ml', 'mercado livre': 'ml',
  magalu: 'magalu', shopee: 'shopee', aliexpress: 'aliexpress',
  casasbahia: 'casasbahia', 'casas bahia': 'casasbahia',
  kabum: 'kabum', americanas: 'americanas',
}
function normSrc(s: string): string { return SRC_ALIAS[s.toLowerCase().trim()] ?? s.toLowerCase().trim() }
export function parseSources(raw: string | undefined): string[] {
  if (!raw || raw === 'all') return []
  let list: string[] = []
  try { list = JSON.parse(raw) } catch { list = raw.split(',').map(s => s.trim()).filter(Boolean) }
  return [...new Set(list.map(normSrc).filter(Boolean))]
}

const SOURCES = ['amazon', 'mercadolivre', 'magalu', 'shopee', 'aliexpress', 'casasbahia', 'kabum', 'americanas'] as const
const SOURCES_OPTIONS = ['ml', 'amz', 'magalu', 'shopee', 'aliexpress', 'casasbahia', 'kabum', 'americanas']

const SOURCE_ALIAS: Record<string, string> = { amazon: 'amz', mercadolivre: 'ml' }
function sourceLabel(s: string): string { return SOURCE_ALIAS[s.toLowerCase()] ?? s.toLowerCase() }

function sourceColorClasses(s: string): string {
  switch (sourceLabel(s)) {
    case 'amz':        return 'bg-orange-500/10 text-orange-600 border-orange-500/30'
    case 'ml':         return 'bg-warning/15 text-warning border-warning/30'
    case 'magalu':     return 'bg-blue-500/10 text-blue-600 border-blue-500/30'
    case 'shopee':     return 'bg-orange-600/10 text-orange-700 border-orange-600/30'
    case 'aliexpress': return 'bg-danger/10 text-danger border-danger/30'
    case 'casasbahia': return 'bg-rose-600/10 text-rose-700 border-rose-600/30'
    case 'kabum':      return 'bg-amber-500/10 text-amber-700 border-amber-500/30'
    case 'americanas': return 'bg-danger/10 text-danger border-danger/30'
    default:           return 'bg-surface-2 text-fg-2 border-border'
  }
}

function SourcePill({ source, active = true, onClick }: { source: string; active?: boolean; onClick?: () => void }) {
  const baseClass = 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border'
  const colorClass = active ? sourceColorClasses(source) : 'bg-transparent text-fg-3 border-border hover:border-accent'
  const interactive = onClick ? 'cursor-pointer transition-colors' : ''
  const Tag: any = onClick ? 'button' : 'span'
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick} className={`${baseClass} ${colorClass} ${interactive}`}>
      {sourceLabel(source)}
    </Tag>
  )
}

// ── Formatting helpers ─────────────────────────────────────────────────────────

export function fmtInterval(min: number): string {
  if (min < 60) return `${min}min`
  if (min < 1440) return `${min / 60}h`
  return `${min / 1440}d`
}

export function relativeTime(iso?: string): string {
  if (!iso) return '—'
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return 'agora'
  if (diff < 3600) return `ha ${Math.round(diff / 60)}min`
  if (diff < 86400) return `ha ${Math.round(diff / 3600)}h`
  return `ha ${Math.round(diff / 86400)}d`
}

// ── Intervals ─────────────────────────────────────────────────────────────────

const INTERVALS = [
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 60, label: '1 hora' },
  { value: 120, label: '2 horas' },
  { value: 240, label: '4 horas' },
  { value: 480, label: '8 horas' },
  { value: 1440, label: '24 horas' },
]

// ── Form types ────────────────────────────────────────────────────────────────

interface MarketplaceFormData {
  query: string
  queries: string
  sources: string[]
  min_val: string
  max_val: string
  crawl_interval: number
  active: boolean
  inbox_muted: boolean
}

const defaultMarketplaceForm: MarketplaceFormData = {
  query: '',
  queries: '',
  sources: [],
  min_val: '',
  max_val: '',
  crawl_interval: 60,
  active: true,
  inbox_muted: false,
}

// ── CreateMarketplaceModal ────────────────────────────────────────────────────

export function CreateMarketplaceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = React.useState<MarketplaceFormData>(defaultMarketplaceForm)
  const [errors, setErrors] = React.useState<Record<string, string>>({})

  const createMut = useMutation({
    mutationFn: (data: object) =>
      apiClient.post('/api/search-terms', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['search-terms'] })
      onClose()
      setForm(defaultMarketplaceForm)
      setErrors({})
      alert('Crawler criado com sucesso!')
    },
    onError: () => {
      alert('Erro ao criar crawler. Verifique os dados e tente novamente.')
    },
  })

  function validate(): boolean {
    const errs: Record<string, string> = {}
    if (!form.query.trim()) errs.query = 'Termo e obrigatorio'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function toggleSource(src: string) {
    setForm(f => ({
      ...f,
      sources: f.sources.includes(src)
        ? f.sources.filter(s => s !== src)
        : [...f.sources, src],
    }))
  }

  function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault()
    if (!validate()) return
    const queriesArray = form.queries.split(/[;\n]/).map(s => s.trim()).filter(Boolean)
    const payload: Record<string, unknown> = {
      query: form.query.trim(),
      queries: queriesArray,
      sources: form.sources.length > 0 ? form.sources.join(',') : 'all',
      min_val: form.min_val ? Number(form.min_val) : 0,
      max_val: form.max_val ? Number(form.max_val) : 9999,
      crawl_interval: form.crawl_interval,
      active: form.active,
      category: 'ecommerce',
    }
    createMut.mutate(payload)
  }

  function handleClose() {
    onClose()
    setForm(defaultMarketplaceForm)
    setErrors({})
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Novo crawler de marketplace"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={handleClose}>Cancelar</Button>
          <Button variant="primary" size="sm" loading={createMut.isPending} onClick={handleSubmit}>
            Criar crawler
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Termo principal *"
          placeholder="Ex: iPhone 15 Pro"
          value={form.query}
          onChange={e => setForm(f => ({ ...f, query: e.target.value }))}
          error={errors.query}
        />
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-fg-2">Termos adicionais (separados por ;)</label>
          <textarea
            placeholder="iphone 15 pro&#10;iphone 15 pro max&#10;apple iphone 15"
            value={form.queries}
            onChange={e => setForm(f => ({ ...f, queries: e.target.value }))}
            rows={3}
            className="w-full px-2.5 py-1.5 text-sm rounded-md border bg-surface text-fg placeholder:text-fg-3 border-border focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent resize-none"
          />
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-fg-2">Fontes</label>
          <div className="flex flex-wrap gap-2">
            {SOURCES.map(src => (
              <button
                key={src}
                type="button"
                onClick={() => toggleSource(src)}
                className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                  form.sources.includes(src)
                    ? 'bg-accent text-white border-accent'
                    : 'bg-surface text-fg-2 border-border hover:border-border-strong'
                }`}
              >
                {src}
              </button>
            ))}
          </div>
          <p className="text-xs text-fg-3">Nenhuma selecionada = todas as fontes</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Valor minimo (R$)"
            type="number"
            min={0}
            placeholder="0"
            value={form.min_val}
            onChange={e => setForm(f => ({ ...f, min_val: e.target.value }))}
          />
          <Input
            label="Valor maximo (R$)"
            type="number"
            min={0}
            placeholder="9999"
            value={form.max_val}
            onChange={e => setForm(f => ({ ...f, max_val: e.target.value }))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-fg-2">Intervalo de crawl</label>
          <select
            value={form.crawl_interval}
            onChange={e => setForm(f => ({ ...f, crawl_interval: Number(e.target.value) }))}
            className="w-full h-8 px-2.5 text-sm rounded-md border bg-surface text-fg border-border focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          >
            {INTERVALS.map(i => (
              <option key={i.value} value={i.value}>{i.label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-3 pt-1">
          <Switch checked={form.active} onChange={v => setForm(f => ({ ...f, active: v }))} />
          <span className="text-sm text-fg">Crawler ativo</span>
        </div>
      </form>
    </Modal>
  )
}

// ── EditTermModal ─────────────────────────────────────────────────────────────

function EditTermModal({ term, onClose }: { term: SearchTerm | null; onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = React.useState<MarketplaceFormData>(defaultMarketplaceForm)

  React.useEffect(() => {
    if (!term) return
    const srcs = parseSources(term.sources)
    let parsedQueries: string[] = []
    try { parsedQueries = JSON.parse(term.queries ?? '[]') } catch { parsedQueries = [] }
    const additionalQueries = parsedQueries.filter((q: string) => q !== term.query)
    setForm({
      query: term.query,
      queries: additionalQueries.join('; '),
      min_val: String(term.min_val ?? ''),
      max_val: String(term.max_val ?? ''),
      crawl_interval: term.crawl_interval ?? 60,
      sources: srcs,
      active: term.active ?? true,
      inbox_muted: term.inbox_muted ?? false,
    })
  }, [term])

  const deleteMut = useMutation({
    mutationFn: () => apiClient.delete(`/api/search-terms/${term!.id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['search-terms'] }); onClose() },
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Erro ao excluir'),
  })

  const saveMut = useMutation({
    mutationFn: () => {
      const queriesArray = form.queries.split('\n').map(s => s.trim()).filter(Boolean)
      return apiClient.put(`/api/search-terms/${term!.id}`, {
        query: form.query,
        queries: queriesArray,
        min_val: Number(form.min_val) || 0,
        max_val: Number(form.max_val) || 9999,
        crawl_interval: Number(form.crawl_interval),
        sources: form.sources.length > 0 ? form.sources.join(',') : 'all',
        category: term!.category || 'ecommerce',
        active: form.active,
        inbox_muted: form.inbox_muted,
      }).then(r => r.data)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['search-terms'] })
      qc.invalidateQueries({ queryKey: ['dashboard', 'inbox-v2'] })
      onClose()
    },
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Erro ao salvar'),
  })

  if (!term) return null

  function toggleSrc(s: string) {
    setForm(f => ({ ...f, sources: f.sources.includes(s) ? f.sources.filter(x => x !== s) : [...f.sources, s] }))
  }

  return (
    <Modal open onClose={onClose} title="Editar crawler" footer={
      <div className="flex items-center justify-between w-full gap-2">
        <Button
          variant="danger"
          size="sm"
          loading={deleteMut.isPending}
          onClick={() => {
            if (confirm(`Excluir crawler "${term!.query}"? Esta acao nao pode ser desfeita.`)) deleteMut.mutate()
          }}
        >
          Excluir
        </Button>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" size="sm" loading={saveMut.isPending} disabled={!form.query.trim()} onClick={() => saveMut.mutate()}>Salvar</Button>
        </div>
      </div>
    }>
      <div className="space-y-4">
        <Input
          label="Termo principal *"
          placeholder="Ex: iPhone 15 Pro"
          value={form.query}
          onChange={e => setForm(f => ({ ...f, query: e.target.value }))}
        />
        <Textarea
          label="Termos adicionais (separados por ;)"
          rows={3}
          placeholder="iphone 15 pro&#10;iphone 15 pro max"
          value={form.queries}
          onChange={e => setForm(f => ({ ...f, queries: e.target.value }))}
        />
        <div>
          <label className="text-xs text-fg-2 block mb-1">Fontes</label>
          <div className="flex flex-wrap gap-2">
            {SOURCES_OPTIONS.map(s => (
              <SourcePill key={s} source={s} active={form.sources.includes(s)} onClick={() => toggleSrc(s)} />
            ))}
          </div>
          <p className="text-xs text-fg-3 mt-1">Nenhuma selecionada = todas as fontes</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Valor minimo (R$)"
            type="number"
            placeholder="0"
            value={form.min_val}
            onChange={e => setForm(f => ({ ...f, min_val: e.target.value }))}
          />
          <Input
            label="Valor maximo (R$)"
            type="number"
            placeholder="9999"
            value={form.max_val}
            onChange={e => setForm(f => ({ ...f, max_val: e.target.value }))}
          />
        </div>
        <div>
          <label className="text-xs text-fg-2 block mb-1">Intervalo de crawl</label>
          <select
            className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg"
            value={form.crawl_interval}
            onChange={e => setForm(f => ({ ...f, crawl_interval: Number(e.target.value) }))}
          >
            {[15, 30, 60, 120, 240, 480, 1440].map(v => (
              <option key={v} value={v}>{v < 60 ? `${v}min` : `${v / 60}h`}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setForm(f => ({ ...f, active: !f.active }))}
            className={`relative w-10 h-5 rounded-full transition-colors overflow-hidden ${form.active ? 'bg-accent' : 'bg-border'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.active ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
          <span className="text-sm text-fg">Crawler ativo</span>
        </div>
        <div className="flex items-start gap-3 rounded-md border border-border bg-surface-2/40 px-3 py-2">
          <Switch checked={form.inbox_muted} onChange={v => setForm(f => ({ ...f, inbox_muted: v }))} />
          <div>
            <p className="text-sm text-fg">Silenciar alertas no dashboard</p>
            <p className="text-xs text-fg-3 mt-0.5">
              O crawler continua na lista; so deixa de aparecer em &quot;Precisa de voce&quot;.
            </p>
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ── SuggestCrawlerModal ───────────────────────────────────────────────────────

interface CrawlerSuggestion {
  query: string
  queries: string[]
  sources: string[]
  min_val: number
  max_val: number
  crawl_interval: number
  rationale: string
  expected_products: string
  category: string
}

function SuggestCrawlerModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [intent, setIntent] = React.useState('')
  const [mode, setMode] = React.useState<'next' | 'expand' | ''>('')
  const [suggestion, setSuggestion] = React.useState<CrawlerSuggestion | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [creating, setCreating] = React.useState(false)
  const [error, setError] = React.useState('')

  const handleSuggest = async () => {
    setLoading(true)
    setError('')
    setSuggestion(null)
    try {
      const res = await apiClient.post('/api/search-terms/suggest', { intent, mode }, { timeout: 90_000 })
      setSuggestion(res.data.suggestion)
    } catch (err: any) {
      setError(err?.response?.data?.error ?? err?.message ?? 'Erro ao consultar LLM')
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    if (!suggestion) return
    setCreating(true)
    try {
      await apiClient.post('/api/search-terms', {
        query: suggestion.query,
        queries: suggestion.queries,
        sources: suggestion.sources.map(normSrc).join(','),
        min_val: suggestion.min_val,
        max_val: suggestion.max_val,
        crawl_interval: suggestion.crawl_interval,
        category: suggestion.category || 'ecommerce',
        active: true,
      })
      onCreated()
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Erro ao criar crawler')
      setCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface border border-border rounded-lg p-6 w-full max-w-lg shadow-modal overflow-y-auto max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-fg">Sugerir crawler com IA</h3>
          <button type="button" onClick={onClose} className="text-fg-3 hover:text-fg text-lg">x</button>
        </div>
        <div className="space-y-3 mb-4">
          <div>
            <label className="text-xs text-fg-2 block mb-1">O que voce quer rastrear? (opcional)</label>
            <textarea
              value={intent}
              onChange={e => setIntent(e.target.value)}
              rows={2}
              placeholder="ex: suplementos importados baratos, jogos Nintendo Switch..."
              className="w-full text-sm border border-border rounded-md px-2.5 py-2 bg-surface text-fg outline-none focus:border-accent resize-none"
            />
          </div>
          <div>
            <label className="text-xs text-fg-2 block mb-1">Estrategia</label>
            <div className="flex gap-2">
              {(['', 'next', 'expand'] as const).map(m => (
                <button key={m} type="button" onClick={() => setMode(m)}
                  className={`flex-1 text-xs px-3 py-1.5 rounded-md border transition-colors ${mode === m ? 'border-accent bg-accent/10 text-accent' : 'border-border text-fg-2 hover:bg-surface-2'}`}>
                  {m === '' ? 'Auto' : m === 'next' ? 'Proximo' : 'Novo mercado'}
                </button>
              ))}
            </div>
            <p className="text-xs text-fg-3 mt-1">
              {mode === 'next' ? 'Complementa os crawlers atuais' : mode === 'expand' ? 'Explora nicho diferente' : 'IA decide a melhor estrategia'}
            </p>
          </div>
        </div>
        <button type="button" onClick={handleSuggest} disabled={loading}
          className="w-full text-sm bg-accent text-white rounded-md px-4 py-2 hover:bg-accent-hover disabled:opacity-50 mb-4">
          {loading ? 'Consultando IA...' : 'Gerar sugestao'}
        </button>
        {error && <p className="text-sm text-danger mb-3">{error}</p>}
        {suggestion && (
          <div className="border border-border rounded-md p-4 space-y-3 bg-surface-2">
            <div className="bg-accent/5 border border-accent/20 rounded p-3">
              <p className="text-xs text-fg-2 font-medium mb-1">Raciocinio da IA</p>
              <p className="text-sm text-fg">{suggestion.rationale}</p>
              {suggestion.expected_products && (
                <p className="text-xs text-fg-3 mt-1">Estimativa: ~{suggestion.expected_products} produtos/ciclo</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-fg-2 mb-0.5">Termo principal</p>
                <p className="font-mono text-fg">{suggestion.query}</p>
              </div>
              <div>
                <p className="text-fg-2 mb-0.5">Fontes</p>
                <p className="font-mono text-fg">{(suggestion.sources || []).join(', ')}</p>
              </div>
              <div>
                <p className="text-fg-2 mb-0.5">Faixa de preco</p>
                <p className="font-mono text-fg">
                  {suggestion.min_val > 0 ? `R$ ${suggestion.min_val}` : 'sem min'} - {suggestion.max_val > 0 ? `R$ ${suggestion.max_val}` : 'sem max'}
                </p>
              </div>
              <div>
                <p className="text-fg-2 mb-0.5">Intervalo</p>
                <p className="font-mono text-fg">{suggestion.crawl_interval}min</p>
              </div>
            </div>
            {(suggestion.queries || []).length > 0 && (
              <div>
                <p className="text-xs text-fg-2 mb-1">Variacoes</p>
                <div className="flex flex-wrap gap-1">
                  {suggestion.queries.map((q, i) => (
                    <span key={i} className="text-xs bg-surface border border-border rounded px-1.5 py-0.5 font-mono">{q}</span>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-2 pt-2 border-t border-border">
              <button type="button" onClick={() => { setSuggestion(null); setError('') }}
                className="flex-1 text-sm px-3 py-1.5 border border-border rounded-md text-fg-2 hover:bg-surface">
                Gerar nova
              </button>
              <button type="button" onClick={handleCreate} disabled={creating}
                className="flex-1 text-sm bg-success text-white rounded-md px-3 py-1.5 hover:opacity-90 disabled:opacity-50">
                {creating ? 'Criando...' : '+ Criar crawler'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── MarketplaceTab ────────────────────────────────────────────────────────────

export function MarketplaceTab({ onNew, onSuggest }: { onNew: () => void; onSuggest: () => void }) {
  const qc = useQueryClient()
  const { data: terms = [], isLoading } = useQuery<SearchTerm[]>({
    queryKey: ['search-terms'],
    queryFn: () => apiClient.get('/api/search-terms').then(r => Array.isArray(r.data) ? r.data : (r.data?.items ?? [])),
  })

  const [runningIds, setRunningIds] = React.useState<Set<number>>(new Set())
  const [editingTerm, setEditingTerm] = React.useState<SearchTerm | null>(null)

  const toggleMut = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) => {
      const term = terms.find(t => t.id === id)
      if (!term) return Promise.reject('term not found')
      return apiClient.put(`/api/search-terms/${id}`, {
        query: term.query,
        queries: [],
        min_val: term.min_val ?? 0,
        max_val: term.max_val ?? 9999,
        sources: term.sources ?? 'all',
        category: term.category || 'ecommerce',
        crawl_interval: term.crawl_interval ?? 30,
        active,
        inbox_muted: term.inbox_muted ?? false,
      }).then(r => r.data)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['search-terms'] })
      qc.invalidateQueries({ queryKey: ['dashboard', 'inbox-v2'] })
    },
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Erro ao atualizar'),
  })

  const crawlNow = useMutation({
    mutationFn: (id: number) => {
      setRunningIds(prev => new Set([...prev, id]))
      return apiClient.post(`/api/search-terms/${id}/crawl`).then(r => r.data)
    },
    onSettled: (_: any, __: any, id: number) => {
      setRunningIds(prev => { const n = new Set(prev); n.delete(id); return n })
      qc.invalidateQueries({ queryKey: ['search-terms'] })
    },
  })

  useWSEvent('crawler.run_completed', () => {
    qc.invalidateQueries({ queryKey: ['search-terms'] })
  })

  if (isLoading) return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
    </div>
  )

  if (!terms.length) return (
    <div className="p-4">
      <EmptyState
        title="Nenhum crawler"
        description="Crie um crawler de marketplace para comecar."
        cta={{ label: '+ Novo crawler', onClick: onNew }}
      />
    </div>
  )

  const activeTerms = terms.filter(t => t.active)
  const totalCrawlers = terms.length
  const totalProducts = terms.reduce((s, t) => s + (t.result_count ?? 0), 0)

  const allSources = new Set<string>()
  for (const t of terms) {
    try {
      const list: string[] = JSON.parse(t.sources ?? '[]')
      list.forEach(s => allSources.add(s))
    } catch {
      const raw = t.sources ?? 'all'
      if (raw === 'all') {
        ;['amazon', 'mercadolivre', 'magalu', 'shopee', 'aliexpress', 'casasbahia', 'kabum', 'americanas'].forEach(s => allSources.add(s))
      } else {
        raw.split(',').map((s: string) => s.trim()).filter(Boolean).forEach(s => allSources.add(s))
      }
    }
  }

  const nextRun = activeTerms.filter(t => t.last_crawled_at).reduce((min, t) => {
    const next = new Date(t.last_crawled_at!).getTime() + (t.crawl_interval * 60_000)
    return min === 0 ? next : Math.min(min, next)
  }, 0)
  const minutesUntilNext = nextRun > 0 ? Math.max(0, Math.round((nextRun - Date.now()) / 60_000)) : null

  return (
    <div className="p-4">
      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard label="Crawlers ativos" value={activeTerms.length} subtitle={`${totalCrawlers} total`} />
        <KpiCard label="Produtos coletados" value={totalProducts.toLocaleString('pt-BR')} subtitle="desde o inicio" />
        <KpiCard
          label="Marketplaces cobertos"
          value={allSources.size}
          subtitle={allSources.size > 0 ? [...allSources].slice(0, 3).join(', ') + (allSources.size > 3 ? '...' : '') : '—'}
        />
        <KpiCard
          label="Proxima execucao"
          value={minutesUntilNext != null ? `~${minutesUntilNext}min` : '—'}
          subtitle={activeTerms[0] ? `"${activeTerms[0].query}"` : undefined}
        />
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-fg-2">{totalCrawlers} crawler{totalCrawlers !== 1 ? 's' : ''}</p>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={runningIds.size > 0}
            onClick={() => activeTerms.forEach(t => crawlNow.mutate(t.id))}
            className="border-accent text-accent hover:bg-accent/5"
          >
            {runningIds.size > 0 ? `Rodando ${runningIds.size}...` : 'Rodar todos'}
          </Button>
          <Button variant="secondary" size="sm" onClick={onSuggest}>
            Sugerir crawler
          </Button>
          <Button variant="primary" size="sm" onClick={onNew}>
            + Novo crawler
          </Button>
        </div>
      </div>

      {/* Tabela densa — spec v4: status (running/ok/error/paused) + ações ▶/⚙ */}
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className={`${tblDense} min-w-[820px]`}>
          <thead>
            <tr>
              <th className={`${thDense} w-[60px]`}>Ativo</th>
              <th className={thDense}>Termo</th>
              <th className={thDense}>Fontes</th>
              <th className={thDense}>Status</th>
              <th className={thDense}>Frequência</th>
              <th className={thDense}>Última coleta</th>
              <th className={thDenseRight}>Encontrados</th>
              <th className={`${thDense} w-[100px] text-right`}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {terms.map(t => {
              const isRunning = runningIds.has(t.id)
              const status: 'running' | 'ok' | 'error' | 'paused' =
                !t.active ? 'paused' :
                isRunning ? 'running' :
                t.last_error ? 'error' :
                'ok'

              return (
                <tr
                  key={t.id}
                  className={`${trDense} cursor-pointer`}
                  onClick={() => setEditingTerm(t)}
                >
                  <td className={tdDense} onClick={e => e.stopPropagation()}>
                    <Switch
                      checked={t.active}
                      onChange={active => toggleMut.mutate({ id: t.id, active })}
                    />
                  </td>
                  <td className={`${tdDense} font-medium text-fg max-w-[260px] truncate`} title={t.query}>
                    “{t.query}”
                  </td>
                  <td className={tdDense}>
                    <div className="flex flex-wrap gap-1">
                      {parseSources(t.sources).map((s: string) => <SourcePill key={s} source={s} />)}
                    </div>
                  </td>
                  <td className={tdDense}>
                    {status === 'running' && (
                      <span className="inline-flex items-center gap-1 text-success text-xs font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                        rodando
                      </span>
                    )}
                    {status === 'ok' && (
                      <span className="inline-flex items-center gap-1 text-success text-xs font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-success" />
                        ok
                      </span>
                    )}
                    {status === 'error' && (
                      <span
                        className="inline-flex items-center gap-1 text-danger text-xs font-medium"
                        title={t.last_error}
                      >
                        ⚠ erro
                        {t.last_error && (
                          <span className="text-[11px] text-fg-3 ml-1 max-w-[160px] truncate">
                            · {t.last_error}
                          </span>
                        )}
                      </span>
                    )}
                    {status === 'paused' && (
                      <span className="inline-flex items-center gap-1 text-warning text-xs font-medium">
                        ⏸ pausado
                      </span>
                    )}
                  </td>
                  <td className={`${tdDense} font-mono text-[12px] text-fg-3 whitespace-nowrap`}>
                    {fmtInterval(t.crawl_interval)}
                  </td>
                  <td className={`${tdDense} text-fg-3 text-xs whitespace-nowrap`}>
                    {relativeTime(t.last_crawled_at)}
                  </td>
                  <td className={tdDenseRight}>
                    <span className="font-semibold text-fg">{t.result_count.toLocaleString('pt-BR')}</span>
                  </td>
                  <td className={`${tdDense} text-right`} onClick={e => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => crawlNow.mutate(t.id)}
                      disabled={runningIds.size > 0}
                      className="text-success hover:bg-success-soft p-1 rounded text-sm disabled:opacity-40 mr-1"
                      title={isRunning ? 'Rodando…' : 'Rodar agora'}
                      aria-label="Rodar agora"
                    >
                      {isRunning ? '⏳' : '▶'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingTerm(t)}
                      className="text-fg-3 hover:text-fg p-1 rounded text-sm"
                      title="Configurações"
                      aria-label="Configurações"
                    >
                      ⚙
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <EditTermModal term={editingTerm} onClose={() => setEditingTerm(null)} />
    </div>
  )
}

// ── Re-export SuggestCrawlerModal for the hub shell ───────────────────────────
export { SuggestCrawlerModal }
