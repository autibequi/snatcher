import React from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Skeleton, EmptyState } from '../components/ui'
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

  // Current product — GET /api/catalog/{id} retorna {product, variants}
  const { data: product } = useQuery<Product>({
    queryKey: ['catalog', productId],
    queryFn: () =>
      apiClient.get(`/api/catalog/${productId}`).then(r => r.data?.product ?? r.data),
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

  const handleAction = (group: GroupScore, action: 'send' | 'review' | 'skip') => {
    if (action === 'send' || action === 'review') {
      navigate(`/compose?productId=${productId}&targets=${group.group_id}`)
    }
  }

  const handleSwitchProduct = (id: number) => {
    setSearchParams({ productId: String(id) })
  }

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="px-6 py-3 border-b border-border flex-shrink-0">
        <p className="text-sm text-fg-3">
          Escolha um produto. O sistema mostra{' '}
          <strong>quais grupos têm fit</strong> — e por quê.
        </p>
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
                  selected={false}
                  batchMode={false}
                  onToggle={() => {}}
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

// ── Página principal (sem productId → melhores matches do sistema) ──────────────

function BestMatchesView() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data, isLoading, refetch, isFetching } = useQuery<{
    items: Array<{ product_id: number; channel_id: number; product_name: string; channel_name: string; score: number; already_sent: boolean }>
    threshold: number
  }>({
    queryKey: ['auto-match-preview'],
    queryFn: () => apiClient.get('/api/auto-match/preview').then(r => r.data),
    staleTime: 30_000,
  })

  // Score DESC — usuário espera o melhor match no topo
  const items = React.useMemo(() => {
    const list = data?.items ?? []
    return [...list].sort((a, b) => b.score - a.score)
  }, [data?.items])
  const threshold = data?.threshold ?? 50

  const [toast, setToast] = React.useState<{ kind: 'success' | 'error'; msg: string } | null>(null)

  const dispatchMut = useMutation({
    mutationFn: (item: { product_id: number; channel_id: number }) =>
      apiClient.post('/api/auto-match/dispatch-one', item).then(r => r.data),
    onSuccess: () => {
      setToast({ kind: 'success', msg: '✓ Disparo enfileirado' })
      window.setTimeout(() => setToast(null), 3000)
      qc.invalidateQueries({ queryKey: ['auto-match-preview'] })
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error ?? err?.message ?? 'erro desconhecido'
      setToast({ kind: 'error', msg: '✗ ' + msg })
      window.setTimeout(() => setToast(null), 5000)
    },
  })

  return (
    <div className="flex flex-col h-full relative">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-md shadow-lg text-sm font-medium ${toast.kind === 'success' ? 'bg-success text-white' : 'bg-danger text-white'}`}>
          {toast.msg}
        </div>
      )}
      <div className="px-6 pt-6 pb-4 border-b border-border flex-shrink-0">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-fg">Melhores Matches</h2>
            <p className="text-sm text-fg-3">
              Produtos com score ≥ {threshold} prontos para disparar. Para roteamento manual, acesse o <button type="button" className="text-accent hover:underline" onClick={() => navigate('/catalog')}>Catálogo</button>.
            </p>
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            className="text-xs text-accent hover:underline mt-1"
          >
            {isFetching ? '⏳' : '↻ recalcular'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ) : items.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-12">
            <EmptyState
              title="Nenhum match com score suficiente"
              description={`Não há produtos com score ≥ ${threshold}. Configure canais com audiência ou adicione mais produtos.`}
              cta={{ label: 'Configurar Auto Match', onClick: () => navigate('/auto-match') }}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2">
                <th className="text-left px-6 py-3 text-xs text-fg-2 font-medium uppercase">Produto</th>
                <th className="text-left px-4 py-3 text-xs text-fg-2 font-medium uppercase">Canal</th>
                <th className="text-left px-4 py-3 text-xs text-fg-2 font-medium uppercase">Score</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={i} className={`border-b border-border last:border-0 hover:bg-surface-2 ${item.already_sent ? 'opacity-60' : ''}`}>
                  <td className="px-6 py-3">
                    <p className="text-sm text-fg font-medium truncate max-w-xs">{item.product_name}</p>
                    {item.already_sent && <p className="text-xs text-fg-3">enviado nas últimas 6h</p>}
                  </td>
                  <td className="px-4 py-3 text-sm text-fg">{item.channel_name}</td>
                  <td className="px-4 py-3">
                    <span className={`text-sm font-semibold ${item.score >= 70 ? 'text-success' : 'text-warning'}`}>
                      {item.score.toFixed(0)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!item.already_sent && (
                      <button
                        type="button"
                        onClick={() => dispatchMut.mutate({ product_id: item.product_id, channel_id: item.channel_id })}
                        disabled={dispatchMut.isPending}
                        className="text-xs bg-accent text-white px-3 py-1.5 rounded-md hover:bg-accent-hover disabled:opacity-50"
                      >
                        ✈ Disparar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default function Match() {
  const [params] = useSearchParams()
  const productId = params.get('productId')

  // Com productId → detail 2-col (acessado a partir do catálogo)
  if (productId) {
    return <ProductDetailMatch productId={productId} />
  }

  // Sem productId → melhores matches do sistema
  return <BestMatchesView />
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
