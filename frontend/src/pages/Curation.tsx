import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Input, KpiCard, Switch } from '../components/ui'
import { apiClient } from '../lib/apiClient'
import TagInput from '../components/TagInput'

interface Product {
  id: number
  canonical_name: string
  brand?: string | null
  image_url?: string | null
  lowest_price?: number | null
  quantity?: string
  tags: string
  curation_status: string
  created_at: string
}

interface StatRow {
  status: string
  count: number
}

export default function Curation() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ['curation', 'needs-taxonomy'],
    queryFn: () =>
      apiClient
        .get('/api/curation/needs-taxonomy?limit=100')
        .then(r => (Array.isArray(r.data) ? r.data : [])),
    refetchInterval: 60_000,
  })

  const { data: stats = [] } = useQuery<StatRow[]>({
    queryKey: ['curation', 'stats'],
    queryFn: () =>
      apiClient.get('/api/curation/stats').then(r => (Array.isArray(r.data) ? r.data : [])),
    refetchInterval: 60_000,
  })

  const filtered = products.filter(p =>
    !search || p.canonical_name.toLowerCase().includes(search.toLowerCase())
  )

  const totalPending = stats.find(s => s.status === 'pending')?.count ?? 0
  const totalAuto = stats.find(s => s.status === 'auto')?.count ?? 0
  const totalCurated = stats.find(s => s.status === 'curated')?.count ?? 0
  const totalRejected = stats.find(s => s.status === 'rejected')?.count ?? 0
  const totalIncomplete = stats.find(s => s.status === 'incomplete')?.count ?? 0
  const totalInspected = stats.find(s => s.status === 'inspected')?.count ?? 0
  const totalNotInspected = stats.find(s => s.status === 'not_inspected')?.count ?? 0

  const rejectMut = useMutation({
    mutationFn: (id: number) => apiClient.post(`/api/curation/${id}/reject`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['curation'] }),
  })

  const autoHeuristicMut = useMutation({
    mutationFn: () => apiClient.post('/api/curation/auto-heuristic').then(r => r.data as { processed: number; categorized: number; branded: number }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['curation'] })
      alert(`Heurísticas: ${data.categorized} categorizados, ${data.branded} marcas preenchidas (de ${data.processed} processados).`)
    },
    onError: () => alert('Erro ao rodar heurísticas'),
  })

  const autoLLMMut = useMutation({
    mutationFn: () => apiClient.post('/api/curation/auto-llm').then(r => r.data as { started: boolean; message?: string }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['work-queue'] })
      const interval = setInterval(() => qc.invalidateQueries({ queryKey: ['curation'] }), 5000)
      setTimeout(() => clearInterval(interval), 30 * 60 * 1000)
      alert(data.message ?? 'AutoLLM iniciado em background. Stats e logs serão atualizados.')
    },
    onError: (err: any) => {
      const status = err?.response?.status ?? '?'
      const detail = err?.response?.data?.error ?? err?.message ?? 'erro desconhecido'
      alert(`Erro ao iniciar LLM (HTTP ${status}): ${detail}`)
    },
  })

  return (
    <div className="p-6">
      <JonfreyCurationCard />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
        <KpiCard label="Pendentes" value={totalPending} />
        <KpiCard label="Incompletos" value={totalIncomplete} />
        <KpiCard label="Auto-inferidos" value={totalAuto} />
        <KpiCard label="Curados manual" value={totalCurated} />
        <KpiCard label="Rejeitados" value={totalRejected} />
        <KpiCard label="Inspecionados" value={totalInspected} />
        <KpiCard label="A inspecionar" value={totalNotInspected} />
      </div>

      <div className="mb-3">
        <Input
          placeholder="Buscar por nome..."
          value={search}
          onChange={(e: any) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <p className="text-sm text-fg-3">Carregando...</p>
      ) : filtered.length === 0 ? (
        <div className="border border-border rounded-md p-8 text-center">
          <p className="text-sm text-fg-2">
            {totalPending === 0 && totalIncomplete === 0
              ? 'Todos os produtos estão completos. ✨'
              : 'Nenhum produto com esse filtro.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(p => (
            <ProductRow
              key={p.id}
              product={p}
              onRejected={() => rejectMut.mutate(p.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ProductRow({
  product,
  onRejected,
}: {
  product: Product
  onRejected: () => void
}) {
  const qc = useQueryClient()
  const [categories, setCategories] = useState<string[]>([])
  const [brand, setBrand] = useState<string[]>(product.brand ? [product.brand] : [])
  const [saved, setSaved] = useState(false)

  const saveMut = useMutation({
    mutationFn: () =>
      apiClient.patch(`/api/curation/${product.id}/taxonomy`, {
        categories,
        brand: brand[0] ?? '',
      }),
    onSuccess: () => {
      setSaved(true)
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['curation'] })
      }, 800)
    },
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Erro ao salvar'),
  })

  // P3: sugestão de taxonomia via LLM
  const suggestMut = useMutation({
    mutationFn: () =>
      apiClient
        .post('/api/taxonomy/suggest', { title: product.canonical_name, brand: product.brand ?? '' })
        .then(r => r.data as { category?: string; brand?: string; tags?: string[]; confidence?: number }),
    onSuccess: (data) => {
      if (data.category) setCategories(prev => prev.includes(data.category!) ? prev : [...prev, data.category!])
      if (data.brand) setBrand([data.brand])
    },
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Erro ao pedir sugestão'),
  })

  // P5: sugestão de tags via LLM
  const tagsMut = useMutation({
    mutationFn: () =>
      apiClient
        .post(`/api/catalog/${product.id}/suggest-tags`)
        .then(r => r.data as { tags?: string[]; new_tags?: string[] }),
    onError: (err: any) => alert(err?.response?.data?.error ?? 'Erro ao pedir tags'),
  })

  const toggleTagInCategories = (tag: string) => {
    setCategories(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])
  }

  return (
    <div className="border border-border rounded-md p-3 bg-surface flex gap-4">
      {product.image_url ? (
        <img
          src={product.image_url}
          alt=""
          className="w-20 h-20 rounded-md object-cover bg-surface-2 flex-shrink-0"
        />
      ) : (
        <div className="w-20 h-20 rounded-md bg-surface-2 flex items-center justify-center text-fg-3 text-xs flex-shrink-0">
          sem foto
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-fg truncate" title={product.canonical_name}>
              {product.canonical_name}
            </p>
            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
              {product.curation_status !== 'pending' && (
                <span className="text-xs px-1.5 py-0.5 bg-surface-2 border border-border rounded text-fg-3">
                  {product.curation_status}
                </span>
              )}
              {(!product.brand) && (
                <span className="text-xs px-1.5 py-0.5 bg-warning/10 border border-warning/30 rounded text-warning">
                  sem marca
                </span>
              )}
              {(!product.tags || product.tags === '[]') && (
                <span className="text-xs px-1.5 py-0.5 bg-warning/10 border border-warning/30 rounded text-warning">
                  sem categoria
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {product.quantity && (
              <span className="text-xs px-1.5 py-0.5 bg-surface-2 border border-border rounded text-fg-2">
                {product.quantity}
              </span>
            )}
            {product.lowest_price && (
              <span className="text-xs text-fg-2 font-mono">
                R$ {product.lowest_price.toFixed(2)}
              </span>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-fg-3 block mb-0.5">Categoria(s)</label>
            <TagInput
              type="category"
              value={categories}
              onChange={setCategories}
              placeholder="ex: smartphones"
            />
          </div>
          <div>
            <label className="text-xs text-fg-3 block mb-0.5">Marca</label>
            <TagInput
              type="brand"
              value={brand}
              onChange={next => setBrand(next.slice(0, 1))}
              placeholder="ex: Apple"
            />
          </div>
        </div>
        <div className="flex justify-between gap-2 mt-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => suggestMut.mutate()}
              disabled={suggestMut.isPending}
              className="text-xs px-2 py-1 rounded border border-border text-accent hover:bg-accent/5 disabled:opacity-50"
              title="Sugerir categoria e marca via IA"
            >
              {suggestMut.isPending ? '⏳' : '✨ Categoria/Marca'}
            </button>
            <button
              type="button"
              onClick={() => tagsMut.mutate()}
              disabled={tagsMut.isPending}
              className="text-xs px-2 py-1 rounded border border-border text-accent hover:bg-accent/5 disabled:opacity-50"
              title="Sugerir tags via IA"
            >
              {tagsMut.isPending ? '⏳' : '🏷️ Tags'}
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onRejected}
              className="text-xs px-2 py-1 rounded text-danger hover:bg-danger/10"
            >
              Rejeitar
            </button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => saveMut.mutate()}
              loading={saveMut.isPending}
              disabled={categories.length === 0 && brand.length === 0}
            >
              {saved ? '✓ Salvo' : 'Salvar'}
            </Button>
          </div>
        </div>
        {suggestMut.data?.confidence !== undefined && (
          <p className="text-[10px] text-fg-3 mt-1 text-right">
            confiança: {Math.round((suggestMut.data.confidence ?? 0) * 100)}%
          </p>
        )}
        {tagsMut.data?.tags && tagsMut.data.tags.length > 0 && (
          <div className="mt-2 bg-accent/5 border border-accent/30 rounded p-2">
            <p className="text-[10px] text-fg-3 mb-1">Tags sugeridas (clique pra adicionar à categoria):</p>
            <div className="flex flex-wrap gap-1">
              {tagsMut.data.tags.map(tag => {
                const isSelected = categories.includes(tag)
                const isNew = tagsMut.data?.new_tags?.includes(tag)
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTagInCategories(tag)}
                    className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                      isSelected
                        ? 'bg-accent text-white border-accent'
                        : isNew
                        ? 'bg-warning/10 text-warning border-warning/40'
                        : 'bg-surface-2 text-fg-2 border-border hover:border-accent'
                    }`}
                    title={isNew ? 'Tag nova (não está na taxonomia)' : 'Tag existente'}
                  >
                    {isNew ? '+ ' : ''}{tag}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Jonfrey integration ─────────────────────────────────────────────────────

interface JonfreyConfigLite {
  enabled: boolean
  interval_minutes: number
  enabled_actions: string[]
  last_run_at?: string | null
}

interface JonfreyActionLite {
  id: number
  action_type: string
  status: string
  reasoning?: string | null
  after?: Record<string, unknown> | null
  triggered_by: string
  created_at: string
}

const AUTO_CURATE_ACTION = 'auto_curate_high_confidence'

function relMin(s: string): string {
  const m = Math.floor((Date.now() - new Date(s).getTime()) / 60000)
  if (m < 1) return 'agora'
  if (m < 60) return `${m}m atrás`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h atrás`
  return `${Math.floor(h / 24)}d atrás`
}

function JonfreyCurationCard() {
  const qc = useQueryClient()
  const { data: config } = useQuery<JonfreyConfigLite | null>({
    queryKey: ['jonfrey-config'],
    queryFn: () => apiClient.get('/api/jonfrey/config').then(r => r.data).catch(() => null),
    staleTime: 30_000,
  })
  const { data: actions = [] } = useQuery<JonfreyActionLite[]>({
    queryKey: ['jonfrey-actions', AUTO_CURATE_ACTION],
    queryFn: () =>
      apiClient
        .get(`/api/jonfrey/actions?type=${AUTO_CURATE_ACTION}`)
        .then(r => (Array.isArray(r.data) ? r.data : []))
        .catch(() => []),
    refetchInterval: 30_000,
  })

  const toggleTriagemMut = useMutation({
    mutationFn: async (enable: boolean) => {
      if (!config) return
      const nextActions = enable
        ? Array.from(new Set([...config.enabled_actions, AUTO_CURATE_ACTION]))
        : config.enabled_actions.filter(a => a !== AUTO_CURATE_ACTION)
      await apiClient.put('/api/jonfrey/config', { enabled_actions: nextActions })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jonfrey-config'] }),
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: string } } }
      alert(e?.response?.data?.error ?? 'Erro ao salvar auto-triagem')
    },
  })

  const last = actions[0]
  const pilotOn = !!config?.enabled
  const actionEnabled = config?.enabled_actions?.includes(AUTO_CURATE_ACTION) ?? false
  const runsInCadence = pilotOn && actionEnabled

  const stateCls = runsInCadence
    ? 'border-success/35 bg-success/5'
    : actionEnabled && !pilotOn
      ? 'border-warning/40 bg-warning/5'
      : 'border-border bg-surface-2'

  return (
    <div className={`rounded-md border p-3 mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between ${stateCls}`}>
      <div className="flex gap-3 min-w-0 flex-1">
        <span className="text-lg leading-none mt-0.5 shrink-0" aria-hidden>
          📋
        </span>
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold text-fg">Auto-triagem nesta página</p>
          <p className="text-xs text-fg-3 leading-relaxed">
            <strong className="text-fg-2">O que é:</strong> no ciclo do Jonfrey, produtos pendentes podem receber categoria e marca automaticamente quando a
            confiança é alta — você continua podendo editar manualmente abaixo.
          </p>
          <p className="text-[11px] text-fg-3 leading-snug">
            {pilotOn
              ? actionEnabled
                ? `Ativo no ciclo (~${config?.interval_minutes ?? 60} min).`
                : 'Auto-pilot ligado, mas a triagem automática está desmarcada — use o interruptor à direita.'
              : 'Auto-pilot desligado: nada roda em cadência até ligar em Jonfrey — o toggle abaixo só prepara a ação para quando o piloto voltar.'}
          </p>
          {last && (
            <p className="text-[11px] text-fg-2 truncate pt-0.5" title={last.reasoning ?? ''}>
              <span className="text-fg-3">Última execução ({relMin(last.created_at)}):</span>{' '}
              {last.reasoning ?? `status=${last.status}`}
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-row sm:flex-col items-center sm:items-end gap-3 shrink-0 sm:pt-0.5 pl-8 sm:pl-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-fg-2 whitespace-nowrap">Triagem automática</span>
          <Switch
            checked={actionEnabled}
            disabled={toggleTriagemMut.isPending || !config}
            onChange={v => toggleTriagemMut.mutate(v)}
          />
        </div>
        <a
          href="/automations/jonfrey"
          className="text-xs text-accent hover:underline whitespace-nowrap"
        >
          Piloto Jonfrey →
        </a>
      </div>
    </div>
  )
}
