import React from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Skeleton, EmptyState, PageHeader, Button, Badge, ScoreChip } from '../components/ui'
import { apiClient } from '../lib/apiClient'
import { ProductFocusCard, Product } from '../components/match/ProductFocusCard'
import { ProductSwitcher } from '../components/match/ProductSwitcher'
import {
  GroupRankItem,
  GroupScore,
  ChannelScore,
  adaptChannelScore,
} from '../components/match/GroupRankItem'
import {
  tableContainer,
  tblDense, thDense, tdDense, trDense, rowDimmed,
} from '../lib/uiTokens'

// ── Score breakdown modal ─────────────────────────────────────────────────────

const SCORE_FACTORS = [
  { key: 'categoria match',     weight: 30, label: 'Categoria',            fix: 'Adicione a categoria ao perfil do canal em Canais → Audiência' },
  { key: 'brand presente',      weight: 20, label: 'Marca',                fix: 'Adicione a marca ao perfil do canal em Canais → Audiência' },
  { key: 'drop acima minimo',   weight: 20, label: 'Desconto mínimo',      fix: 'Reduza o desconto mínimo do canal ou aguarde promoção maior' },
  { key: 'ticket dentro faixa', weight: 15, label: 'Faixa de preço',       fix: 'Ajuste a faixa de preço do canal' },
  { key: 'historico',           weight: 15, label: 'Histórico de cliques', fix: 'O histórico se constrói automaticamente com os primeiros disparos' },
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
          <h3 className="font-semibold text-fg">Score {score}/100</h3>
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
      </div>
    </div>
  )
}

// ── Adapter: resposta do backend pode ser GroupScore[] ou ChannelScore[] ───────

type BackendResponse = GroupScore[] | ChannelScore[]

function normalizeScores(data: BackendResponse): GroupScore[] {
  if (!Array.isArray(data) || data.length === 0) return []
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

  const { data: allProducts = [] } = useQuery<Product[]>({
    queryKey: ['catalog', 'match-list'],
    queryFn: () =>
      apiClient
        .get('/api/catalog?limit=50')
        .then(r => (Array.isArray(r.data) ? r.data : (r.data?.items ?? [])))
        .catch(() => []),
    staleTime: 60_000,
  })

  const { data: product } = useQuery<Product>({
    queryKey: ['catalog', productId],
    queryFn: () =>
      apiClient.get(`/api/catalog/${productId}`).then(r => r.data?.product ?? r.data),
  })

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
      {/* Responsive 2-col grid: stacked on mobile, side-by-side on md+ */}
      <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-[2fr_3fr] gap-4 p-4 sm:gap-6 sm:p-6">
        {/* Coluna esquerda */}
        <div className="flex flex-col gap-4 overflow-y-auto">
          {product ? (
            <ProductFocusCard product={product} />
          ) : (
            <Skeleton className="h-36 w-full" />
          )}
          <ProductSwitcher
            products={allProducts}
            selectedId={product?.id ?? null}
            onSelect={handleSwitchProduct}
          />
        </div>

        {/* Coluna direita */}
        <div className="flex flex-col overflow-hidden">
          <div className="flex items-center gap-3 mb-3 flex-wrap flex-shrink-0">
            <span className="text-sm font-medium text-fg flex-1">
              Grupos rankeados · {filtered.length}/{scores.length}
            </span>
            <label className="flex items-center gap-1.5 text-xs text-fg-2 flex-shrink-0">
              Score ≥{' '}
              <span className="font-bold text-fg w-5 text-right">{minScore}</span>
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

interface PreviewMatchItem {
  product_id: number
  channel_id: number
  product_name: string
  channel_name: string
  score: number
  already_sent: boolean
  /** Razões (top 3 mostradas como badges verdes) — opcional do backend */
  reasons?: string[]
}

function BestMatchesView() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data, isLoading, refetch, isFetching } = useQuery<{
    items: PreviewMatchItem[]
    threshold: number
  }>({
    queryKey: ['auto-match-preview'],
    queryFn: () => apiClient.get('/api/auto-match/preview').then(r => r.data),
    staleTime: 30_000,
  })

  const allItems = React.useMemo(() => {
    const list = data?.items ?? []
    return [...list].sort((a, b) => b.score - a.score)
  }, [data?.items])

  const backendThreshold = data?.threshold ?? 50
  // Slider local — começa no threshold do backend mas o user pode ajustar.
  // Pattern oficial React p/ "ajustar state quando prop muda":
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [minScore, setMinScore] = React.useState<number>(backendThreshold)
  const [prevThreshold, setPrevThreshold] = React.useState<number>(backendThreshold)
  if (backendThreshold !== prevThreshold) {
    setPrevThreshold(backendThreshold)
    setMinScore(backendThreshold)
  }

  const items = React.useMemo(
    () => allItems.filter(it => it.score >= minScore),
    [allItems, minScore],
  )

  const [toast, setToast] = React.useState<{ kind: 'success' | 'error'; msg: string } | null>(null)

  const dispatchMut = useMutation({
    mutationFn: (item: { product_id: number; channel_id: number }) =>
      apiClient.post('/api/auto-match/dispatch-one', item).then(r => r.data),
    onSuccess: () => {
      setToast({ kind: 'success', msg: '✓ Disparo enfileirado' })
      window.setTimeout(() => setToast(null), 3000)
      qc.invalidateQueries({ queryKey: ['auto-match-preview'] })
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: string } }; message?: string }
      const msg = e?.response?.data?.error ?? e?.message ?? 'erro desconhecido'
      setToast({ kind: 'error', msg: '✗ ' + msg })
      window.setTimeout(() => setToast(null), 5000)
    },
  })

  return (
    <div className="flex flex-col h-full relative">
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-md shadow-lg text-sm font-medium ${
            toast.kind === 'success' ? 'bg-success text-white' : 'bg-danger text-white'
          }`}
        >
          {toast.msg}
        </div>
      )}

      <div className="px-4 pt-4 pb-3 border-b border-border flex-shrink-0 sm:px-6 sm:pt-6 sm:pb-4">
        <PageHeader
          title="Melhores Matches"
          subtitle={`${items.length}/${allItems.length} com score ≥ ${minScore}`}
          actions={
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-fg-2">
                Score ≥{' '}
                <span className="font-bold text-fg w-7 text-right tabular-nums">{minScore}</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={minScore}
                  onChange={e => setMinScore(Number(e.target.value))}
                  className="w-32 accent-accent"
                />
              </label>
              <button
                type="button"
                onClick={() => refetch()}
                disabled={isFetching}
                className="text-xs text-accent hover:underline disabled:opacity-40"
              >
                {isFetching ? '⏳ recalculando…' : '↻ Recalcular'}
              </button>
            </div>
          }
        />
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <EmptyState
              title="Nenhum match com score suficiente"
              description={`Não há produtos com score ≥ ${minScore}. Reduza o filtro ou configure canais com audiência.`}
              cta={{ label: 'Configurar Auto Match', onClick: () => navigate('/auto-match') }}
            />
          </div>
        ) : (
          <div className={tableContainer}>
            <table className={`${tblDense} min-w-[760px]`}>
              <thead>
                <tr>
                  <th className={`${thDense} w-[34%]`}>Produto</th>
                  <th className={thDense}>Canal</th>
                  <th className={thDense}>Razões</th>
                  <th className={`${thDense} w-[80px]`}>Score</th>
                  <th className={`${thDense} w-[110px] text-right`}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => {
                  const reasons = (item.reasons ?? []).slice(0, 3)
                  return (
                    <tr
                      key={i}
                      className={`${trDense} ${item.already_sent ? rowDimmed : ''}`}
                    >
                      <td className={tdDense}>
                        <p className="font-medium text-fg truncate max-w-xs">{item.product_name}</p>
                        {item.already_sent && (
                          <p className="text-[11px] text-fg-3">enviado nas últimas 6h</p>
                        )}
                      </td>
                      <td className={`${tdDense} text-fg-2`}>{item.channel_name}</td>
                      <td className={tdDense}>
                        {reasons.length > 0 ? (
                          <div className="flex gap-1 flex-wrap">
                            {reasons.map(r => (
                              <Badge key={r} variant="success" size="sm">✓ {r}</Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-fg-3 text-xs">—</span>
                        )}
                      </td>
                      <td className={tdDense}>
                        <ScoreChip value={item.score} />
                      </td>
                      <td className={`${tdDense} text-right`}>
                        {!item.already_sent && (
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() =>
                              dispatchMut.mutate({
                                product_id: item.product_id,
                                channel_id: item.channel_id,
                              })
                            }
                            disabled={dispatchMut.isPending}
                          >
                            ✈ Disparar
                          </Button>
                        )}
                      </td>
                    </tr>
                  )
                })}
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

  if (productId) {
    return <ProductDetailMatch productId={productId} />
  }

  return <BestMatchesView />
}
