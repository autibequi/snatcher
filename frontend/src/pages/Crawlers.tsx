import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Input, Modal, Switch, Tabs, Skeleton, EmptyState } from '../components/ui'
import { apiClient } from '../lib/apiClient'
import { useWSEvent } from '../lib/useWS'

interface SearchTerm {
  id: number
  query: string
  sources?: string
  active: boolean
  crawl_interval: number
  last_crawled_at?: string
  result_count: number
}

interface Account {
  id: number
  name?: string
  phone?: string
  role: string
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
      .split('\n')
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
          <label className="text-xs font-medium text-fg-2">Termos adicionais (um por linha)</label>
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
  platform: 'wa',
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
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault()
    if (!validate()) return

    const payload: Record<string, unknown> = {
      group_name: form.group_name.trim(),
      platform: form.platform,
      invite_link: form.invite_link.trim() || undefined,
      reader_account_id: form.reader_account_id ? Number(form.reader_account_id) : undefined,
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
            <option value="wa">WhatsApp</option>
            <option value="tg">Telegram</option>
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

function StatusBadge({ term }: { term: SearchTerm }) {
  if (!term.active) return <Badge variant="default" size="sm">● pausado</Badge>
  if (term.last_crawled_at && term.result_count === 0) {
    return <Badge variant="danger" size="sm">● erro</Badge>
  }
  return <Badge variant="success" size="sm">● rodando</Badge>
}

function MarketplacesTab({ onNew }: { onNew: () => void }) {
  const qc = useQueryClient()
  const { data: terms = [], isLoading } = useQuery<SearchTerm[]>({
    queryKey: ['search-terms'],
    queryFn: () => apiClient.get('/api/search-terms').then(r => Array.isArray(r.data) ? r.data : (r.data?.items ?? [])),
  })

  const toggleMut = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      apiClient.patch(`/api/search-terms/${id}`, { active }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['search-terms'] }),
  })

  const crawlNow = useMutation({
    mutationFn: (id: number) => apiClient.post(`/api/search-terms/${id}/crawl`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['search-terms'] }),
  })

  // WS: crawler concluiu
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
  const nextRun = activeTerms.filter(t => t.last_crawled_at).reduce((min, t) => {
    const next = new Date(t.last_crawled_at!).getTime() + (t.crawl_interval * 60_000)
    return min === 0 ? next : Math.min(min, next)
  }, 0)
  const minutesUntilNext = nextRun > 0 ? Math.max(0, Math.round((nextRun - Date.now()) / 60_000)) : null
  const firstActive = activeTerms[0]

  return (
    <div className="p-4">
      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-surface border border-border rounded-md p-4">
          <p className="text-xs text-fg-3 uppercase tracking-wide font-medium">Crawlers</p>
          <p className="text-2xl font-bold text-fg mt-1">{totalCrawlers}</p>
          <p className="text-xs text-fg-3 mt-1">{activeTerms.length} rodando</p>
        </div>
        <div className="bg-surface border border-border rounded-md p-4">
          <p className="text-xs text-fg-3 uppercase tracking-wide font-medium">Produtos coletados</p>
          <p className="text-2xl font-bold text-fg mt-1">{terms.reduce((s, t) => s + (t.result_count ?? 0), 0).toLocaleString()}</p>
          <p className="text-xs text-fg-3 mt-1">desde o início</p>
        </div>
        <div className="bg-surface border border-border rounded-md p-4">
          <p className="text-xs text-fg-3 uppercase tracking-wide font-medium">Próxima execução</p>
          <p className="text-2xl font-bold text-fg mt-1">
            {minutesUntilNext != null ? `~${minutesUntilNext}min` : '—'}
          </p>
          {firstActive && (
            <p className="text-xs text-fg-3 mt-1 truncate">"{firstActive.query}"</p>
          )}
        </div>
        <div className="bg-surface border border-border rounded-md p-4">
          <p className="text-xs text-fg-3 uppercase tracking-wide font-medium">Status geral</p>
          <p className="text-2xl font-bold text-fg mt-1">{activeTerms.length}/{totalCrawlers}</p>
          <p className="text-xs text-fg-3 mt-1">ativos</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-fg-2">{totalCrawlers} crawler{totalCrawlers !== 1 ? 's' : ''}</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => activeTerms.forEach(t => crawlNow.mutate(t.id))}
            className="text-sm border border-border rounded-md px-3 py-1.5 text-fg-2 hover:bg-surface-2"
          >
            ▶ Rodar todos
          </button>
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
              {['Ativo', 'Termo', 'Fontes', 'Intervalo', '# Encontrados', 'Último crawl', 'Status', 'Ações'].map(h => (
                <th key={h} className="text-left p-3 text-fg-2 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {terms.map(t => (
              <tr key={t.id} className="border-b border-border last:border-0 hover:bg-surface-2">
                <td className="p-3">
                  <Switch
                    checked={t.active}
                    onChange={active => toggleMut.mutate({ id: t.id, active })}
                  />
                </td>
                <td className="p-3 font-medium text-fg">"{t.query}"</td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-1">
                    {(t.sources ?? 'all').split(',').map(s => (
                      <Badge key={s} size="sm" variant="default">{s.trim()}</Badge>
                    ))}
                  </div>
                </td>
                <td className="p-3 text-fg-2">
                  <span>⏱ {fmtInterval(t.crawl_interval)}</span>
                </td>
                <td className="p-3 text-fg">{t.result_count}</td>
                <td className="p-3 text-fg-3 text-xs">
                  {relativeTime(t.last_crawled_at)}
                </td>
                <td className="p-3">
                  <StatusBadge term={t} />
                </td>
                <td className="p-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => crawlNow.mutate(t.id)}
                    loading={crawlNow.isPending}
                  >
                    Rodar agora
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SpyTab({ onNew }: { onNew: () => void }) {
  const { data: spies = [], isLoading } = useQuery({
    queryKey: ['crawlers', 'group-spy'],
    queryFn: () => apiClient.get('/api/crawlers/group-spy').then(r => Array.isArray(r.data) ? r.data : []).catch(() => []),
  })

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
    <div className="p-4">
      {spies.map((s: Record<string, unknown>) => (
        <div key={String(s.id)} className="flex items-center justify-between p-3 bg-surface border border-border rounded-md mb-2">
          <div>
            <p className="text-sm font-medium text-fg">{String(s.group_name ?? '')}</p>
            <p className="text-xs text-fg-3">{String(s.platform ?? '')}</p>
          </div>
          <Badge variant={s.active ? 'success' : 'default'}>{s.active ? 'ativo' : 'parado'}</Badge>
        </div>
      ))}
    </div>
  )
}

export default function Crawlers() {
  const [tab, setTab] = React.useState('marketplaces')
  const [showMarketplaceModal, setShowMarketplaceModal] = React.useState(false)
  const [showSpyModal, setShowSpyModal] = React.useState(false)

  const tabs = [
    { id: 'marketplaces', label: 'Marketplaces' },
    { id: 'spy', label: 'Grupos concorrentes' },
  ]

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold text-fg">Crawlers</h1>
        {tab === 'spy' && (
          <Button variant="primary" size="sm" onClick={() => setShowSpyModal(true)}>
            + Adicionar grupo a espionar
          </Button>
        )}
      </div>
      <div className="bg-surface border border-border rounded-md overflow-hidden">
        <Tabs tabs={tabs} active={tab} onChange={setTab} />
        {tab === 'marketplaces'
          ? <MarketplacesTab onNew={() => setShowMarketplaceModal(true)} />
          : <SpyTab onNew={() => setShowSpyModal(true)} />
        }
      </div>

      <CreateMarketplaceModal open={showMarketplaceModal} onClose={() => setShowMarketplaceModal(false)} />
      <CreateSpyModal open={showSpyModal} onClose={() => setShowSpyModal(false)} />
    </div>
  )
}
