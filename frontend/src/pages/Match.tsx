import React from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Button, Skeleton, EmptyState } from '../components/ui'
import { apiClient } from '../lib/apiClient'
import { ProductFocusCard, Product } from '../components/match/ProductFocusCard'
import { ProductSwitcher } from '../components/match/ProductSwitcher'
import {
  GroupRankItem,
  GroupScore,
  ChannelScore,
  adaptChannelScore,
} from '../components/match/GroupRankItem'

// ── Score breakdown modal ─────────────────────────────────────────────────────

const SCORE_FACTORS = [
  { key: 'categoria match',     weight: 30, label: 'Categoria',            fix: 'Adicione a categoria deste produto ao perfil do canal em Canais → Audiência' },
  { key: 'brand presente',      weight: 20, label: 'Marca',                fix: 'Adicione a marca deste produto ao perfil do canal em Canais → Audiência' },
  { key: 'drop acima minimo',   weight: 20, label: 'Desconto mínimo',      fix: 'Reduza o desconto mínimo do canal ou aguarde promoção maior' },
  { key: 'ticket dentro faixa', weight: 15, label: 'Faixa de preço',       fix: 'Ajuste a faixa de preço do canal para incluir R$ deste produto' },
  { key: 'historico',           weight: 15, label: 'Histórico de cliques', fix: 'Faça os primeiros disparos — o histórico de conversão se constrói automaticamente' },
]

function ScoreBreakdown({
  score,
  reasons,
  onClose,
}: {
  score: number
  reasons: string[]
  onClose: () => void
}) {
  const lowerReasons = (reasons ?? []).map(r => r.toLowerCase())

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border rounded-lg p-5 w-full max-w-sm shadow-modal"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-fg">
            Como o score {score} foi calculado
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-fg-3 hover:text-fg text-lg leading-none"
          >
            ×
          </button>
        </div>

        <div className="mb-4">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-fg-2">Score total</span>
            <span
              className={`font-bold ${
                score >= 70
                  ? 'text-success'
                  : score >= 40
                  ? 'text-warning'
                  : 'text-danger'
              }`}
            >
              {score}/100
            </span>
          </div>
          <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                score >= 70
                  ? 'bg-success'
                  : score >= 40
                  ? 'bg-warning'
                  : 'bg-danger'
              }`}
              style={{ width: `${score}%` }}
            />
          </div>
        </div>

        <div className="space-y-2.5">
          {SCORE_FACTORS.map(factor => {
            const matched = lowerReasons.some(r =>
              r.includes(factor.key.split(' ')[0])
            )
            const earned = matched ? factor.weight : 0
            return (
              <div key={factor.key}>
                <div className="flex items-center justify-between mb-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className={matched ? 'text-success' : 'text-danger'}>
                      {matched ? '✓' : '✗'}
                    </span>
                    <span className="text-sm text-fg">{factor.label}</span>
                  </div>
                  <span
                    className={`text-xs font-medium ${
                      matched ? 'text-success' : 'text-danger'
                    }`}
                  >
                    {earned}/{factor.weight} pts
                  </span>
                </div>
                <div className="h-1 bg-surface-2 rounded-full overflow-hidden ml-5">
                  <div
                    className={`h-full rounded-full ${
                      matched ? 'bg-success' : 'bg-danger/30'
                    }`}
                    style={{ width: matched ? '100%' : '0%' }}
                  />
                </div>
                {!matched && (
                  <p className="text-xs text-fg-3 ml-5 mt-0.5">→ {factor.fix}</p>
                )}
              </div>
            )
          })}
        </div>

        <p className="text-xs text-fg-3 mt-4 border-t border-border pt-3">
          Para chegar a 100, configure o perfil do canal em{' '}
          <a href="/channels" className="text-accent hover:underline">
            Canais → Audiência
          </a>
          .
        </p>
      </div>
    </div>
  )
}

// ── Adapter: resposta do backend pode ser GroupScore[] ou ChannelScore[] ───────

type BackendResponse = GroupScore[] | ChannelScore[]

function normalizeScores(data: BackendResponse): GroupScore[] {
  if (!Array.isArray(data) || data.length === 0) return []
  // Detect by presence of group_id (new format) vs only channel_id (legacy)
  const first = data[0] as unknown as Record<string, unknown>
  if ('group_id' in first) {
    return (data as GroupScore[]).map(g => ({ ...g, reasons: g.reasons ?? [] }))
  }
  return (data as ChannelScore[]).map(adaptChannelScore)
}

// ── Detail view: 2-col layout ─────────────────────────────────────────────────

function ProductDetailMatch({ productId }: { productId: string }) {
  const navigate = useNavigate()
  const [, setSearchParams] = useSearchParams()

  const [minScore, setMinScore] = React.useState(0)
  const [breakdown, setBreakdown] = React.useState<GroupScore | null>(null)
  const [selected, setSelected] = React.useState<number[]>([])
  const [batchMode, setBatchMode] = React.useState(false)

  // Product list (for switcher)
  const { data: allProducts = [] } = useQuery<Product[]>({
    queryKey: ['catalog', 'match-list'],
    queryFn: () =>
      apiClient
        .get('/api/catalog?limit=50')
        .then(r => (Array.isArray(r.data) ? r.data : (r.data?.items ?? [])))
        .catch(() => []),
    staleTime: 60_000,
  })

  // Current product
  const { data: product } = useQuery<Product>({
    queryKey: ['catalog', productId],
    queryFn: () =>
      apiClient.get(`/api/catalog/${productId}`).then(r => r.data),
  })

  // Match scores
  const {
    data: rawScores = [],
    isPending,
    mutate: runMatch,
  } = useMutation<BackendResponse>({
    mutationFn: () =>
      apiClient
        .post('/api/match', { product_id: Number(productId) })
        .then(r => r.data)
        .catch(() => []),
  })

  React.useEffect(() => {
    if (productId) runMatch()
  }, [productId])

  const scores: GroupScore[] = normalizeScores(rawScores)
  const filtered = scores.filter(s => s.score >= minScore)
  const greenCount = filtered.filter(s => s.score >= 70).length

  const toggleGroup = (id: number) =>
    setSelected(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )

  const handleAction = (group: GroupScore, action: 'send' | 'review' | 'skip') => {
    if (action === 'send' || action === 'review') {
      navigate(
        `/compose?productId=${productId}&targets=${group.group_id}`
      )
    }
    // skip: no-op (could add a "dismissed" set later)
  }

  const handleSwitchProduct = (id: number) => {
    setSearchParams({ productId: String(id) })
    setSelected([])
  }

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="px-6 pt-5 pb-3 border-b border-border flex-shrink-0 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold text-fg">Match</h1>
          <p className="text-sm text-fg-3 mt-0.5">
            Escolha um produto. O sistema mostra{' '}
            <strong>quais grupos têm fit</strong> — e por quê.
          </p>
        </div>

        {/* Card 05: Modo lote + Disparar batch */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => {
              setBatchMode(b => !b)
              if (batchMode) setSelected([])
            }}
            className={`text-sm px-3 py-1.5 rounded-md border transition-colors ${
              batchMode
                ? 'bg-accent/10 border-accent text-accent'
                : 'border-border text-fg-2 hover:bg-surface-2'
            }`}
          >
            Modo lote
          </button>
          {batchMode && (
            <Button
              variant="primary"
              size="sm"
              disabled={selected.length === 0 && greenCount === 0}
              onClick={() => {
                const targets =
                  selected.length > 0
                    ? selected
                    : filtered.filter(s => s.score >= 70).map(s => s.group_id)
                navigate(
                  `/compose?productId=${productId}&targets=${targets.join(',')}`
                )
              }}
            >
              ✈ Disparar para {selected.length > 0 ? selected.length : `${greenCount} verdes`}
            </Button>
          )}
        </div>
      </div>

      {/* 2-col grid */}
      <div className="flex-1 overflow-hidden grid grid-cols-[2fr_3fr] gap-6 p-6">
        {/* ── Coluna esquerda ── */}
        <div className="flex flex-col gap-4 overflow-y-auto">
          {/* Card 02: ProductFocusCard */}
          {product ? (
            <ProductFocusCard product={product} />
          ) : (
            <Skeleton className="h-36 w-full" />
          )}

          {/* Card 03: ProductSwitcher */}
          <ProductSwitcher
            products={allProducts}
            selectedId={product?.id ?? null}
            onSelect={handleSwitchProduct}
          />
        </div>

        {/* ── Coluna direita ── */}
        <div className="flex flex-col overflow-hidden">
          {/* Card 05: header coluna direita */}
          <div className="flex items-center gap-3 mb-3 flex-wrap flex-shrink-0">
            <span className="text-sm font-medium text-fg flex-1">
              Grupos rankeados · {filtered.length} de {scores.length}
            </span>

            {/* Botão "+ IA" placeholder */}
            <button
              type="button"
              onClick={() => console.log('[IA placeholder] clicked')}
              className="text-xs font-medium px-2.5 py-1 rounded-full border border-accent text-accent hover:bg-accent/10 transition-colors"
            >
              + IA
            </button>

            {/* Score slider reposicionado */}
            <label className="flex items-center gap-1.5 text-xs text-fg-2 flex-shrink-0">
              Score ≥ <span className="font-bold text-fg w-5 text-right">{minScore}</span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={minScore}
                onChange={e => setMinScore(Number(e.target.value))}
                className="w-24 accent-accent"
              />
            </label>
          </div>

          {/* Lista grupos */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {isPending ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))
            ) : filtered.length === 0 ? (
              <EmptyState
                title="Nenhum grupo compatível"
                description="Configure grupos com perfil de audiência ou reduza o score mínimo."
              />
            ) : (
              filtered.map(g => (
                <GroupRankItem
                  key={g.group_id}
                  group={g}
                  selected={selected.includes(g.group_id)}
                  batchMode={batchMode}
                  onToggle={() => toggleGroup(g.group_id)}
                  onAction={action => handleAction(g, action)}
                  onBreakdown={() => setBreakdown(g)}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Score breakdown modal */}
      {breakdown && (
        <ScoreBreakdown
          score={breakdown.score}
          reasons={breakdown.reasons}
          onClose={() => setBreakdown(null)}
        />
      )}
    </div>
  )
}

// ── Página principal (sem productId → lista compacta c/ 1º produto auto) ──────

export default function Match() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const productId = params.get('productId')
  const [search, setSearch] = React.useState('')

  // Com productId → detail 2-col
  if (productId) {
    return <ProductDetailMatch productId={productId} />
  }

  // Sem productId → lista de produtos com link pra detail
  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-6 pb-4 border-b border-border flex-shrink-0">
        <h1 className="text-lg font-semibold text-fg">Match</h1>
        <p className="text-sm text-fg-3 mt-0.5">
          Produtos do catálogo — clique em um produto para ver grupos compatíveis.
        </p>
      </div>

      <div className="px-6 py-3 border-b border-border flex-shrink-0">
        <input
          className="w-72 text-sm border border-border rounded-md px-2.5 py-1.5 bg-surface text-fg outline-none focus:border-accent"
          placeholder="Buscar produto..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <ProductListNav search={search} navigate={navigate} />
    </div>
  )
}

function ProductListNav({
  search,
  navigate,
}: {
  search: string
  navigate: ReturnType<typeof useNavigate>
}) {
  const { data: raw = [], isLoading } = useQuery<Product[]>({
    queryKey: ['catalog', 'match-list'],
    queryFn: () =>
      apiClient
        .get('/api/catalog?limit=50')
        .then(r => (Array.isArray(r.data) ? r.data : (r.data?.items ?? [])))
        .catch(() => []),
    staleTime: 60_000,
  })

  const products = search
    ? raw.filter(p =>
        (p.canonical_name ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : raw

  if (isLoading) {
    return (
      <div className="p-6 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    )
  }

  if (products.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <EmptyState
          title="Nenhum produto no catálogo"
          description="Configure crawlers para coletar produtos e o match será calculado automaticamente."
          cta={{
            label: 'Ir para Crawlers',
            onClick: () => navigate('/crawlers'),
          }}
        />
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-2">
      {products.map(p => {
        const price = p.lowest_price ?? 0
        const originalPrice = p.original_price
        const discount =
          originalPrice && originalPrice > price
            ? Math.round((1 - price / originalPrice) * 100)
            : null

        return (
          <button
            key={p.id}
            type="button"
            onClick={() => navigate(`/match?productId=${p.id}`)}
            className="w-full flex items-center gap-3 px-4 py-3 border border-border rounded-md bg-surface hover:border-border-strong hover:bg-surface-2 transition-colors text-left"
          >
            <div className="w-9 h-9 rounded-sm bg-surface-2 flex-shrink-0 flex items-center justify-center overflow-hidden">
              {p.image_url ? (
                <img
                  src={p.image_url}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-xl">📦</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-fg truncate">
                {p.canonical_name ?? 'Produto'}
              </p>
              <p className="text-xs text-fg-3">
                {price > 0 ? `R$ ${price.toFixed(2)}` : ''}
                {discount !== null ? ` · −${discount}%` : ''}
              </p>
            </div>
            <span className="text-xs text-fg-3">Ver grupos →</span>
          </button>
        )
      })}
    </div>
  )
}
