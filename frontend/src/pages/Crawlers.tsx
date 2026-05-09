import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Input, Modal, Switch, Tabs, Skeleton, EmptyState, KpiCard, Textarea } from '../components/ui'
import { apiClient } from '../lib/apiClient'
import { useWSEvent } from '../lib/useWS'

// Normaliza nomes longos de fonte pra IDs curtos que o backend registra
const SRC_ALIAS: Record<string, string> = {
  amazon: 'amz', mercadolivre: 'ml', 'mercado livre': 'ml',
  magalu: 'magalu', shopee: 'shopee', aliexpress: 'aliexpress',
  casasbahia: 'casasbahia', 'casas bahia': 'casasbahia',
  kabum: 'kabum', americanas: 'americanas',
}
function normSrc(s: string): string { return SRC_ALIAS[s.toLowerCase().trim()] ?? s.toLowerCase().trim() }
function parseSources(raw: string | undefined): string[] {
  if (!raw || raw === 'all') return []
  let list: string[] = []
  try { list = JSON.parse(raw) } catch { list = raw.split(',').map(s => s.trim()).filter(Boolean) }
  return [...new Set(list.map(normSrc).filter(Boolean))]
}

interface SearchTerm {
  id: number
  query: string
  queries?: string
  sources?: string
  active: boolean
  crawl_interval: number
  last_crawled_at?: string
  result_count: number
  min_val?: number
  max_val?: number
  category?: string
  last_error?: string
  last_error_at?: string
}

interface Account {
  id: number
  name?: string
  phone?: string
  role: string
}

interface SpyGroup {
  id: number
  group_name: string
  platform: string
  active: boolean
  invite_link?: string
  reader_wa_id?: number
  stealth_mode?: boolean
  categories?: string[]
  capture_count?: number
  last_capture_at?: string
}

interface SpyMessage {
  id: number
  sender?: string
  text?: string
  media_url?: string
  collected_at: string
}

const SOURCES = ['amazon', 'mercadolivre', 'magalu', 'shopee', 'aliexpress', 'casasbahia', 'kabum', 'americanas'] as const

const INTERVALS = [
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 60, label: '1 hora' },
  { value: 120, label: '2 horas' },
  { value: 240, label: '4 horas' },
  { value: 480, label: '8 horas' },
  { value: 1440, label: '24 horas' },
]

interface MarketplaceFormData {
  query: string
  queries: string
  sources: string[]
  min_val: string
  max_val: string
  crawl_interval: number
  active: boolean
}

const defaultMarketplaceForm: MarketplaceFormData = {
  query: '',
  queries: '',
  sources: [],
  min_val: '',
  max_val: '',
  crawl_interval: 60,
  active: true,
}

function CreateMarketplaceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
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
    if (!form.query.trim()) errs.query = 'Termo é obrigatório'
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

    const queriesArray = form.queries
      .split(/[;\n]/)
      .map(s => s.trim())
      .filter(Boolean)

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
          <Button variant="secondary" size="sm" onClick={handleClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={createMut.isPending}
            onClick={handleSubmit}
          >
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
            placeholder={'iphone 15 pro\niphone 15 pro max\napple iphone 15'}
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
            label="Valor mínimo (R$)"
            type="number"
            min={0}
            placeholder="0"
            value={form.min_val}
            onChange={e => setForm(f => ({ ...f, min_val: e.target.value }))}
          />
          <Input
            label="Valor máximo (R$)"
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
          <Switch
            checked={form.active}
            onChange={v => setForm(f => ({ ...f, active: v }))}
          />
          <span className="text-sm text-fg">Crawler ativo</span>
        </div>
      </form>
    </Modal>
  )
}

interface SpyFormData {
  group_name: string
  platform: string
  invite_link: string
  reader_account_id: string
}

const defaultSpyForm: SpyFormData = {
  group_name: '',
  platform: 'whatsapp',
  invite_link: '',
  reader_account_id: '',
}

function CreateSpyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = React.useState<SpyFormData>(defaultSpyForm)
  const [errors, setErrors] = React.useState<Record<string, string>>({})

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ['accounts', 'wa', 'reader'],
    queryFn: () =>
      apiClient.get('/api/accounts/wa?role=reader').then(r =>
        Array.isArray(r.data) ? r.data : (r.data?.items ?? [])
      ).catch(() => []),
    enabled: open,
  })

  const createMut = useMutation({
    mutationFn: (data: object) =>
      apiClient.post('/api/crawlers/group-spy', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crawlers', 'group-spy'] })
      onClose()
      setForm(defaultSpyForm)
      setErrors({})
      alert('Grupo adicionado para espionagem!')
    },
    onError: () => {
      alert('Erro ao adicionar grupo. Verifique os dados e tente novamente.')
    },
  })

  function validate(): boolean {
    const errs: Record<string, string> = {}
    if (!form.group_name.trim()) errs.group_name = 'Nome do grupo é obrigatório'
    if (!form.platform) errs.platform = 'Plataforma é obrigatória'
    if (!form.invite_link.trim()) errs.invite_link = 'Link de convite é obrigatório'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault()
    if (!validate()) return

    const payload: Record<string, unknown> = {
      group_name: form.group_name.trim(),
      platform: form.platform,
      invite_link: form.invite_link.trim() || '',
      reader_wa_id: form.reader_account_id ? Number(form.reader_account_id) : null,
    }

    createMut.mutate(payload)
  }

  function handleClose() {
    onClose()
    setForm(defaultSpyForm)
    setErrors({})
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Adicionar grupo a espionar"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={handleClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={createMut.isPending}
            onClick={handleSubmit}
          >
            Adicionar
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Nome do grupo *"
          placeholder="Ex: Concorrente Ofertas BR"
          value={form.group_name}
          onChange={e => setForm(f => ({ ...f, group_name: e.target.value }))}
          error={errors.group_name}
        />

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-fg-2">Plataforma *</label>
          <select
            value={form.platform}
            onChange={e => setForm(f => ({ ...f, platform: e.target.value }))}
            className={`w-full h-8 px-2.5 text-sm rounded-md border bg-surface text-fg border-border focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent ${errors.platform ? 'border-danger' : ''}`}
          >
            <option value="whatsapp">WhatsApp</option>
            <option value="telegram">Telegram</option>
          </select>
          {errors.platform && <p className="text-xs text-danger">{errors.platform}</p>}
        </div>

        <Input
          label="Link de convite"
          placeholder="https://chat.whatsapp.com/..."
          value={form.invite_link}
          onChange={e => setForm(f => ({ ...f, invite_link: e.target.value }))}
        />

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-fg-2">Conta leitora</label>
          <select
            value={form.reader_account_id}
            onChange={e => setForm(f => ({ ...f, reader_account_id: e.target.value }))}
            className="w-full h-8 px-2.5 text-sm rounded-md border bg-surface text-fg border-border focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="">Sem conta específica</option>
            {accounts.map(a => (
              <option key={a.id} value={a.id}>
                {a.name || a.phone || `Conta #${a.id}`}
              </option>
            ))}
          </select>
        </div>
      </form>
    </Modal>
  )
}

function fmtInterval(min: number): string {
  if (min < 60) return `${min}min`
  if (min < 1440) return `${min / 60}h`
  return `${min / 1440}d`
}

function relativeTime(iso?: string): string {
  if (!iso) return '—'
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return 'agora'
  if (diff < 3600) return `há ${Math.round(diff / 60)}min`
  if (diff < 86400) return `há ${Math.round(diff / 3600)}h`
  return `há ${Math.round(diff / 86400)}d`
}

function fmtRange(min?: number, max?: number): string {
  if (min == null && max == null) return '—'
  const lo = min != null ? `R$${min}` : 'R$0'
  const hi = max != null ? `R$${max}` : ''
  return hi ? `${lo}–${hi}` : `${lo}+`
}

// ── Modal editar crawler ──────────────────────────────────────────────────────

const SOURCES_OPTIONS = ['ml', 'amz', 'magalu', 'shopee', 'aliexpress', 'casasbahia', 'kabum', 'americanas']

// Aliases para mapear "amazon" → "amz", "mercadolivre" → "ml" etc
const SOURCE_ALIAS: Record<string, string> = {
  amazon: 'amz',
  mercadolivre: 'ml',
}

function sourceLabel(s: string): string {
  return SOURCE_ALIAS[s.toLowerCase()] ?? s.toLowerCase()
}

// Paleta inspirada nas cores de marca de cada marketplace
function sourceColorClasses(s: string): string {
  switch (sourceLabel(s)) {
    case 'amz':        return 'bg-orange-500/10 text-orange-600 border-orange-500/30'
    case 'ml':         return 'bg-yellow-400/15 text-yellow-700 border-yellow-500/30'
    case 'magalu':     return 'bg-blue-500/10 text-blue-600 border-blue-500/30'
    case 'shopee':     return 'bg-orange-600/10 text-orange-700 border-orange-600/30'
    case 'aliexpress': return 'bg-red-500/10 text-red-600 border-red-500/30'
    case 'casasbahia': return 'bg-rose-600/10 text-rose-700 border-rose-600/30'
    case 'kabum':      return 'bg-amber-500/10 text-amber-700 border-amber-500/30'
    case 'americanas': return 'bg-red-600/10 text-red-700 border-red-600/30'
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
      }).then(r => r.data)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['search-terms'] }); onClose() },
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
            if (confirm(`Excluir crawler "${term!.query}"? Esta ação não pode ser desfeita.`)) deleteMut.mutate()
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
          placeholder={'iphone 15 pro\niphone 15 pro max'}
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
            label="Valor mínimo (R$)"
            type="number"
            placeholder="0"
            value={form.min_val}
            onChange={e => setForm(f => ({ ...f, min_val: e.target.value }))}
          />
          <Input
            label="Valor máximo (R$)"
            type="number"
            placeholder="9999"
            value={form.max_val}
            onChange={e => setForm(f => ({ ...f, max_val: e.target.value }))}
          />
        </div>
        <div>
          <label className="text-xs text-fg-2 block mb-1">Intervalo de crawl</label>
          <select className="w-full text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg"
            value={form.crawl_interval} onChange={e => setForm(f => ({...f, crawl_interval: Number(e.target.value)}))}>
            {[15,30,60,120,240,480,1440].map(v => <option key={v} value={v}>{v < 60 ? `${v}min` : `${v/60}h`}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-3">
          <button type="button"
            onClick={() => setForm(f => ({...f, active: !f.active}))}
            className={`relative w-10 h-5 rounded-full transition-colors overflow-hidden ${form.active ? 'bg-accent' : 'bg-border'}`}>
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.active ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
          <span className="text-sm text-fg">Crawler ativo</span>
        </div>
      </div>
    </Modal>
  )
}

// ── MarketplacesTab ──────────────────────────────────────────────────────────

function MarketplacesTab({ onNew, onSuggest }: { onNew: () => void; onSuggest: () => void }) {
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
      }).then(r => r.data)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['search-terms'] }),
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

  if (isLoading) return <div className="space-y-2 p-4">{Array.from({length:4}).map((_,i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
  if (!terms.length) return (
    <div className="p-4">
      <EmptyState
        title="Nenhum crawler"
        description="Crie um crawler de marketplace para começar."
        cta={{ label: '+ Novo crawler', onClick: onNew }}
      />
    </div>
  )

  const activeTerms = terms.filter(t => t.active)
  const totalCrawlers = terms.length
  const totalProducts = terms.reduce((s, t) => s + (t.result_count ?? 0), 0)

  // Count unique sources across all terms
  const allSources = new Set<string>()
  for (const t of terms) {
    try {
      const list: string[] = JSON.parse(t.sources ?? '[]')
      list.forEach(s => allSources.add(s))
    } catch {
      const raw = t.sources ?? 'all'
      if (raw === 'all') {
        // count as covering all known sources
        ;['amazon','mercadolivre','magalu','shopee','aliexpress','casasbahia','kabum','americanas'].forEach(s => allSources.add(s))
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
        <KpiCard
          label="Crawlers ativos"
          value={activeTerms.length}
          subtitle={`${totalCrawlers} total`}
        />
        <KpiCard
          label="Produtos coletados"
          value={totalProducts.toLocaleString('pt-BR')}
          subtitle="desde o início"
        />
        <KpiCard
          label="Marketplaces cobertos"
          value={allSources.size}
          subtitle={allSources.size > 0 ? [...allSources].slice(0, 3).join(', ') + (allSources.size > 3 ? '…' : '') : '—'}
        />
        <KpiCard
          label="Próxima execução"
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
            {runningIds.size > 0 ? `▶ Rodando ${runningIds.size}...` : '▶ Rodar todos'}
          </Button>
          <Button variant="secondary" size="sm" onClick={onSuggest}>
            ✨ Sugerir crawler
          </Button>
          <Button variant="primary" size="sm" onClick={onNew}>
            + Novo crawler
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              {['Ativo', 'Termo', 'Fontes', 'Faixa', 'Frequência', '# Encontrados', 'Último crawl', 'Próxima exec', 'Ações'].map(h => (
                <th key={h} className="text-left p-3 text-fg-2 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {terms.map(t => (
              <tr
                key={t.id}
                className="border-b border-border last:border-0 hover:bg-surface-2 cursor-pointer"
                onClick={() => setEditingTerm(t)}
              >
                <td className="p-3" onClick={e => e.stopPropagation()}>
                  <Switch
                    checked={t.active}
                    onChange={active => toggleMut.mutate({ id: t.id, active })}
                  />
                </td>
                <td className="p-3 font-medium text-fg">"{t.query}"</td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-1">
                    {parseSources(t.sources).map((s: string) => <SourcePill key={s} source={s} />)}
                  </div>
                </td>
                <td className="p-3 text-fg-2 text-xs whitespace-nowrap">
                  {fmtRange(t.min_val, t.max_val)}
                </td>
                <td className="p-3 text-fg-2 text-xs whitespace-nowrap">
                  ⏱ {fmtInterval(t.crawl_interval)}
                </td>
                <td className="p-3 text-fg">{t.result_count}</td>
                <td className="p-3 text-fg-3 text-xs">
                  {relativeTime(t.last_crawled_at)}
                </td>
                <td className="p-3 text-xs text-fg-2">
                  {!t.active ? (
                    <span className="text-fg-3">pausado</span>
                  ) : t.last_error ? (
                    <span title={t.last_error}><Badge variant="danger" size="sm">erro</Badge></span>
                  ) : t.last_crawled_at ? (
                    <span className="text-fg-3">
                      {(() => {
                        const next = new Date(t.last_crawled_at).getTime() + (t.crawl_interval * 60_000)
                        const diff = Math.max(0, Math.round((next - Date.now()) / 60_000))
                        return diff === 0 ? 'agora' : `em ~${diff}min`
                      })()}
                    </span>
                  ) : (
                    <span className="text-fg-3">—</span>
                  )}
                </td>
                <td className="p-3" onClick={e => e.stopPropagation()}>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => crawlNow.mutate(t.id)}
                    loading={runningIds.has(t.id)}
                    disabled={runningIds.size > 0}
                    className="border-success/40 text-success hover:bg-success/10"
                  >
                    {runningIds.has(t.id) ? 'Rodando...' : '▶ Rodar agora'}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <EditTermModal term={editingTerm} onClose={() => setEditingTerm(null)} />
    </div>
  )
}

// ── SpyGroupDetail (right panel) ──────────────────────────────────────────────

function SpyGroupDetail({
  spy,
  onClose,
  onChangeReader,
}: {
  spy: SpyGroup
  onClose: () => void
  onChangeReader: () => void
}) {
  const { data: messages = [], isLoading } = useQuery<SpyMessage[]>({
    queryKey: ['spy-messages', spy.id],
    queryFn: () =>
      apiClient.get(`/api/crawlers/group-spy/${spy.id}/messages`).then(r =>
        Array.isArray(r.data) ? r.data : []
      ).catch(() => []),
    refetchInterval: 30_000,
  })

  // Derive 24h message count from messages (approximate — only loaded messages)
  const now = Date.now()
  const msgs24h = messages.filter(m => now - new Date(m.collected_at).getTime() < 86_400_000).length

  // Categories from spy data
  const categories: string[] = spy.categories ?? []

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
        <div>
          <h3 className="font-semibold text-fg">{spy.group_name}</h3>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-xs text-fg-3">{spy.platform}</p>
            {spy.stealth_mode && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
                stealth
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={spy.active ? 'success' : 'default'} size="sm">
            {spy.active ? 'ativo' : 'parado'}
          </Badge>
          <button type="button" onClick={onClose} className="text-fg-3 hover:text-fg p-1 rounded text-sm">✕</button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 px-5 py-4 border-b border-border flex-shrink-0">
        <div className="bg-surface-2 rounded-md p-3">
          <p className="text-xs text-fg-3">Msgs 24h</p>
          <p className="text-lg font-semibold text-fg">{msgs24h}</p>
        </div>
        <div className="bg-surface-2 rounded-md p-3">
          <p className="text-xs text-fg-3">Capturas</p>
          <p className="text-lg font-semibold text-fg">{spy.capture_count ?? messages.length}</p>
        </div>
        <div className="bg-surface-2 rounded-md p-3">
          <p className="text-xs text-fg-3">Aproveitamento</p>
          <p className="text-lg font-semibold text-fg">
            {messages.length > 0 ? `${Math.round((msgs24h / Math.max(messages.length, 1)) * 100)}%` : '—'}
          </p>
        </div>
        <div className="bg-surface-2 rounded-md p-3">
          <p className="text-xs text-fg-3">Última captura</p>
          <p className="text-sm font-medium text-fg">
            {spy.last_capture_at
              ? relativeTime(spy.last_capture_at)
              : messages.length > 0
                ? relativeTime(messages[0]?.collected_at)
                : '—'}
          </p>
        </div>
      </div>

      {/* Categories */}
      {categories.length > 0 && (
        <div className="px-5 py-3 border-b border-border flex-shrink-0">
          <p className="text-xs text-fg-3 mb-2">Categorias detectadas</p>
          <div className="flex flex-wrap gap-1.5">
            {categories.map(c => (
              <Badge key={c} variant="accent" size="sm">{c}</Badge>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="px-5 py-3 border-b border-border flex-shrink-0">
        <Button variant="secondary" size="sm" onClick={onChangeReader}>
          Trocar conta leitora
        </Button>
      </div>

      {/* Capturas recentes */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0">
        <p className="text-xs text-fg-3 font-medium uppercase tracking-wide mb-3">Capturas recentes</p>
        {isLoading ? (
          <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : messages.length === 0 ? (
          <div className="text-center py-8 space-y-1">
            <p className="text-sm text-fg-2">Nenhuma mensagem coletada ainda.</p>
            <p className="text-xs text-fg-3">O sistema coleta automaticamente as postagens do grupo enquanto o spy estiver ativo.</p>
          </div>
        ) : (
          messages.map(m => (
            <div key={m.id} className="bg-surface-2 rounded-md p-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-medium text-accent">{m.sender || 'desconhecido'}</p>
                <p className="text-xs text-fg-3">{new Date(m.collected_at).toLocaleString('pt-BR')}</p>
              </div>
              {m.media_url && (
                <img src={m.media_url} alt="" className="w-full max-h-32 object-cover rounded mb-2"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
              )}
              <p className="text-sm text-fg whitespace-pre-wrap break-words">{m.text}</p>
            </div>
          ))
        )}
      </div>

      {/* Invite link */}
      {spy.invite_link && (
        <div className="px-5 py-3 border-t border-border flex-shrink-0">
          <a href={spy.invite_link} target="_blank" rel="noopener noreferrer"
            className="text-xs text-accent hover:underline truncate block">
            {spy.invite_link}
          </a>
        </div>
      )}
    </div>
  )
}

// ── SpyTab (split layout) ────────────────────────────────────────────────────

function SpyTab({ onNew }: { onNew: () => void }) {
  const [selectedId, setSelectedId] = React.useState<number | null>(null)
  const [showChangeReaderModal, setShowChangeReaderModal] = React.useState(false)

  const { data: spies = [], isLoading } = useQuery<SpyGroup[]>({
    queryKey: ['crawlers', 'group-spy'],
    queryFn: () =>
      apiClient.get('/api/crawlers/group-spy').then(r =>
        Array.isArray(r.data) ? r.data : []
      ).catch(() => []),
  })

  const selectedSpy = spies.find(s => s.id === selectedId) ?? null

  if (isLoading) return <div className="p-4"><Skeleton className="h-24 w-full" /></div>
  if (!spies.length) return (
    <div className="p-4">
      <EmptyState
        title="Nenhum grupo espionado"
        description="Adicione grupos concorrentes para extrair produtos automaticamente."
        cta={{ label: 'Adicionar grupo', onClick: onNew }}
      />
    </div>
  )

  return (
    <div className="flex h-[600px]">
      {/* Left: compact list */}
      <div className={`flex flex-col border-r border-border overflow-y-auto ${selectedSpy ? 'w-72 flex-shrink-0' : 'flex-1'}`}>
        <div className="p-3 border-b border-border flex-shrink-0">
          <p className="text-xs text-fg-3 font-medium uppercase tracking-wide">{spies.length} grupo{spies.length !== 1 ? 's' : ''}</p>
        </div>
        {spies.map(s => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSelectedId(prev => prev === s.id ? null : s.id)}
            className={`flex items-center gap-3 px-3 py-3 text-left border-b border-border last:border-0 transition-colors w-full ${
              selectedId === s.id
                ? 'bg-accent/5 border-l-2 border-l-accent'
                : 'hover:bg-surface-2'
            }`}
          >
            {/* Platform icon */}
            <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold ${s.platform === 'telegram' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400' : 'bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400'}`}>
              {s.platform === 'telegram' ? 'TG' : 'WA'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-fg truncate">{s.group_name}</p>
              <p className="text-xs text-fg-3">{s.platform}</p>
            </div>
            <Badge variant={s.active ? 'success' : 'default'} size="sm">
              {s.active ? '●' : '○'}
            </Badge>
          </button>
        ))}
      </div>

      {/* Right: detail panel */}
      {selectedSpy ? (
        <div className="flex-1 overflow-hidden flex flex-col min-w-0">
          <SpyGroupDetail
            spy={selectedSpy}
            onClose={() => setSelectedId(null)}
            onChangeReader={() => setShowChangeReaderModal(true)}
          />
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-fg-3 text-sm">
          <p>Selecione um grupo para ver detalhes</p>
        </div>
      )}

      {/* Change reader modal (stub — triggers modal flow) */}
      {showChangeReaderModal && selectedSpy && (
        <ChangeReaderModal
          spy={selectedSpy}
          onClose={() => setShowChangeReaderModal(false)}
        />
      )}
    </div>
  )
}

// ── ChangeReaderModal ─────────────────────────────────────────────────────────

function ChangeReaderModal({ spy, onClose }: { spy: SpyGroup; onClose: () => void }) {
  const qc = useQueryClient()
  const [readerId, setReaderId] = React.useState<string>(String(spy.reader_wa_id ?? ''))

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ['accounts', 'wa', 'reader'],
    queryFn: () =>
      apiClient.get('/api/accounts/wa?role=reader').then(r =>
        Array.isArray(r.data) ? r.data : (r.data?.items ?? [])
      ).catch(() => []),
  })

  const saveMut = useMutation({
    mutationFn: () =>
      apiClient.patch(`/api/crawlers/group-spy/${spy.id}`, {
        reader_wa_id: readerId ? Number(readerId) : null,
      }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crawlers', 'group-spy'] })
      onClose()
    },
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Erro ao salvar'),
  })

  return (
    <Modal
      open
      onClose={onClose}
      title="Trocar conta leitora"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" size="sm" loading={saveMut.isPending} onClick={() => saveMut.mutate()}>Salvar</Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-fg-2">
          Selecione a conta que vai ler as mensagens de <strong className="text-fg">{spy.group_name}</strong>.
        </p>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-fg-2">Conta leitora</label>
          <select
            value={readerId}
            onChange={e => setReaderId(e.target.value)}
            className="w-full h-8 px-2.5 text-sm rounded-md border bg-surface text-fg border-border focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="">Sem conta específica</option>
            {accounts.map(a => (
              <option key={a.id} value={a.id}>
                {a.name || a.phone || `Conta #${a.id}`}
              </option>
            ))}
          </select>
        </div>
      </div>
    </Modal>
  )
}

// ── Suggest Crawler Modal ─────────────────────────────────────────────────────

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
          <h3 className="font-semibold text-fg">✨ Sugerir crawler com IA</h3>
          <button type="button" onClick={onClose} className="text-fg-3 hover:text-fg text-lg">×</button>
        </div>

        <div className="space-y-3 mb-4">
          <div>
            <label className="text-xs text-fg-2 block mb-1">O que você quer rastrear? (opcional)</label>
            <textarea
              value={intent}
              onChange={e => setIntent(e.target.value)}
              rows={2}
              placeholder="ex: suplementos importados baratos, jogos Nintendo Switch, tênis Nike masculino..."
              className="w-full text-sm border border-border rounded-md px-2.5 py-2 bg-surface text-fg outline-none focus:border-accent resize-none"
            />
          </div>
          <div>
            <label className="text-xs text-fg-2 block mb-1">Estratégia</label>
            <div className="flex gap-2">
              {(['', 'next', 'expand'] as const).map(m => (
                <button key={m} type="button" onClick={() => setMode(m)}
                  className={`flex-1 text-xs px-3 py-1.5 rounded-md border transition-colors ${mode === m ? 'border-accent bg-accent/10 text-accent' : 'border-border text-fg-2 hover:bg-surface-2'}`}>
                  {m === '' ? 'Auto' : m === 'next' ? '🔗 Próximo' : '🚀 Novo mercado'}
                </button>
              ))}
            </div>
            <p className="text-xs text-fg-3 mt-1">
              {mode === 'next' ? 'Complementa os crawlers atuais' : mode === 'expand' ? 'Explora nicho completamente diferente' : 'IA decide a melhor estratégia'}
            </p>
          </div>
        </div>

        <button type="button" onClick={handleSuggest} disabled={loading}
          className="w-full text-sm bg-accent text-white rounded-md px-4 py-2 hover:bg-accent-hover disabled:opacity-50 mb-4">
          {loading ? '⏳ Consultando IA...' : '✨ Gerar sugestão'}
        </button>

        {error && <p className="text-sm text-danger mb-3">{error}</p>}

        {suggestion && (
          <div className="border border-border rounded-md p-4 space-y-3 bg-surface-2">
            <div className="bg-accent/5 border border-accent/20 rounded p-3">
              <p className="text-xs text-fg-2 font-medium mb-1">💡 Raciocínio da IA</p>
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
                <p className="text-fg-2 mb-0.5">Faixa de preço</p>
                <p className="font-mono text-fg">
                  {suggestion.min_val > 0 ? `R$ ${suggestion.min_val}` : 'sem min'} — {suggestion.max_val > 0 ? `R$ ${suggestion.max_val}` : 'sem max'}
                </p>
              </div>
              <div>
                <p className="text-fg-2 mb-0.5">Intervalo</p>
                <p className="font-mono text-fg">{suggestion.crawl_interval}min</p>
              </div>
            </div>
            {(suggestion.queries || []).length > 0 && (
              <div>
                <p className="text-xs text-fg-2 mb-1">Variações</p>
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

// ── Main Crawlers page ────────────────────────────────────────────────────────

export default function Crawlers() {
  const qc = useQueryClient()
  const [tab, setTab] = React.useState('marketplaces')
  const [showMarketplaceModal, setShowMarketplaceModal] = React.useState(false)
  const [showSpyModal, setShowSpyModal] = React.useState(false)
  const [showSuggestModal, setShowSuggestModal] = React.useState(false)

  const tabs = [
    { id: 'marketplaces', label: 'Marketplaces' },
    { id: 'spy', label: 'Grupos' },
  ]

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-end mb-4">
        {tab === 'spy' && (
          <Button variant="primary" size="sm" onClick={() => setShowSpyModal(true)}>
            + Adicionar grupo a espionar
          </Button>
        )}
      </div>
      <div className="bg-surface border border-border rounded-md overflow-hidden">
        <Tabs tabs={tabs} active={tab} onChange={setTab} />
        {tab === 'marketplaces'
          ? <MarketplacesTab onNew={() => setShowMarketplaceModal(true)} onSuggest={() => setShowSuggestModal(true)} />
          : <SpyTab onNew={() => setShowSpyModal(true)} />
        }
      </div>

      <CreateMarketplaceModal open={showMarketplaceModal} onClose={() => setShowMarketplaceModal(false)} />
      <CreateSpyModal open={showSpyModal} onClose={() => setShowSpyModal(false)} />
      {showSuggestModal && <SuggestCrawlerModal onClose={() => setShowSuggestModal(false)} onCreated={() => { setShowSuggestModal(false); qc.invalidateQueries({ queryKey: ['search-terms'] }) }} />}
    </div>
  )
}
