import React from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Button, Badge, Skeleton, EmptyState } from '../components/ui'
import { apiClient } from '../lib/apiClient'

interface MatchScore {
  channel_id: number
  channel_name: string
  score: number
  reasons: string[]
  platform?: string
  member_count?: number
  ctr_30d?: number
}

interface Product {
  id: number
  title: string
  marketplace: string
  priceCurrent: number
  priceOriginal?: number
  drop: number
  category?: string
  brand?: string
  imageUrl?: string
}

function MatchRow({ score, onToggle, selected }: { score: MatchScore; onToggle: () => void; selected: boolean }) {
  const pct = Math.max(0, Math.min(100, score.score))
  const barColor = pct >= 70 ? 'bg-success' : pct >= 40 ? 'bg-warning' : 'bg-danger'
  const textColor = pct >= 70 ? 'text-success' : pct >= 40 ? 'text-warning' : 'text-danger'

  return (
    <div
      onClick={onToggle}
      className={`flex items-center gap-4 p-3 border rounded-md cursor-pointer transition-colors ${
        selected ? 'border-accent bg-accent/5' : 'border-border bg-surface hover:border-border-strong'
      }`}
    >
      {/* Cor accent bar lateral */}
      <div className={`w-1 h-12 rounded-full flex-shrink-0 ${barColor}`} />

      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        className="accent-accent"
        onClick={e => e.stopPropagation()}
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-sm font-medium text-fg">{score.channel_name}</p>
          {score.platform && (
            <Badge size="sm" variant={score.platform === 'whatsapp' ? 'success' : 'accent'}>
              {score.platform === 'whatsapp' ? 'WA' : 'TG'}
            </Badge>
          )}
          {score.member_count && (
            <span className="text-xs text-fg-3">{score.member_count.toLocaleString()} membros</span>
          )}
          {score.ctr_30d != null && score.ctr_30d > 0 && (
            <span className="text-xs text-success">CTR {(score.ctr_30d * 100).toFixed(1)}%</span>
          )}
        </div>
        {/* Reasons como chips */}
        <div className="flex flex-wrap gap-1">
          {(score.reasons ?? []).map((r, i) => {
            const isNeg = r.startsWith('fora') || (r.startsWith('preco') && r.includes('alto')) || r.startsWith('drop abaixo')
            return (
              <span
                key={i}
                className={`text-xs px-2 py-0.5 rounded-sm font-medium ${
                  isNeg
                    ? 'bg-danger/10 text-danger'
                    : 'bg-success/10 text-success'
                }`}
              >
                {isNeg ? '−' : '+'} {r}
              </span>
            )
          })}
        </div>
      </div>

      {/* Score */}
      <div className="flex flex-col items-end gap-1 flex-shrink-0 w-24">
        <span className={`text-xl font-bold ${textColor}`}>{pct}</span>
        <div className="w-full h-1.5 bg-surface-2 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  )
}

export default function Match() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const productId = params.get('productId')
  const [selected, setSelected] = React.useState<number[]>([])
  const [minScore, setMinScore] = React.useState(0)
  const [batchMode, setBatchMode] = React.useState(false)

  const { data: product } = useQuery<Product>({
    queryKey: ['catalog', productId],
    queryFn: () => apiClient.get(`/api/catalog/${productId}`).then((r) => r.data),
    enabled: !!productId,
  })

  const {
    data: scores,
    isPending: isLoading,
    mutate: runMatch,
  } = useMutation<MatchScore[]>({
    mutationFn: () =>
      apiClient
        .post('/api/match', {
          product_id: productId ? Number(productId) : undefined,
          category: product?.category ?? '',
          brand: product?.brand ?? '',
          price: product?.priceCurrent ?? 0,
          drop: product?.drop ?? 0,
        })
        .then((r) => r.data),
  })

  // Rodar match assim que produto carrega ou ao abrir sem produto
  React.useEffect(() => {
    if (product || (!productId && !product)) {
      runMatch()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product])

  const toggle = (id: number) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )

  const filteredScores = (scores ?? []).filter((s: MatchScore) => s.score >= minScore)
  const greenCount = filteredScores.filter((s: MatchScore) => s.score >= 70).length

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 flex-1 overflow-y-auto max-w-4xl mx-auto w-full">
        <h1 className="text-lg font-semibold text-fg mb-4">Match de produto</h1>

        {/* Card produto */}
        {product && (
          <div className="bg-surface border border-border rounded-md p-4 mb-6 flex gap-4">
            {product.imageUrl && (
              <img
                src={product.imageUrl}
                alt=""
                className="w-20 h-20 object-cover rounded-sm flex-shrink-0 bg-surface-2"
              />
            )}
            <div>
              <p className="font-medium text-fg">{product.title}</p>
              <div className="flex gap-2 mt-2 flex-wrap items-center">
                <Badge>{product.marketplace}</Badge>
                {product.drop > 0 && (
                  <Badge variant="success">-{product.drop.toFixed(0)}%</Badge>
                )}
                {product.priceCurrent != null && (
                  <span className="text-sm text-fg font-semibold">
                    R$ {product.priceCurrent.toFixed(2)}
                  </span>
                )}
                {product.category && (
                  <Badge variant="accent">{product.category}</Badge>
                )}
                {product.brand && (
                  <Badge variant="outline">{product.brand}</Badge>
                )}
              </div>
            </div>
          </div>
        )}

        {!productId && (
          <div className="bg-surface border border-border rounded-md p-4 mb-6">
            <p className="text-sm text-fg-2">
              Abra o Match a partir do Dashboard clicando em um produto, ou passe ?productId=N na URL.
            </p>
          </div>
        )}

        {/* Filtro slider + toggle de modo lote */}
        <div className="flex items-center gap-4 mb-4 flex-wrap">
          <label className="flex items-center gap-2 text-sm text-fg-2">
            Score mínimo: <span className="font-medium text-fg">{minScore}</span>
            <input
              type="range"
              min={0} max={100} step={5}
              value={minScore}
              onChange={e => setMinScore(Number(e.target.value))}
              className="w-32 accent-accent"
            />
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={batchMode} onChange={e => setBatchMode(e.target.checked)} className="accent-accent" />
            <span className="text-fg-2">Modo lote</span>
          </label>
        </div>

        {/* Lista de scores */}
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} variant="card" className="h-16" />
            ))}
          </div>
        ) : !filteredScores.length ? (
          <EmptyState
            title="Nenhum canal compativel"
            description="Configure canais com perfil de audiencia para ver sugestoes de match."
          />
        ) : (
          <div className="space-y-2">
            {filteredScores.map((s) => (
              <MatchRow
                key={s.channel_id}
                score={s}
                onToggle={() => toggle(s.channel_id)}
                selected={selected.includes(s.channel_id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer sticky */}
      <div className="border-t border-border p-4 bg-surface">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-fg-2">{selected.length} selecionado(s)</span>
          <div className="flex gap-2">
            {greenCount > 0 && selected.length === 0 && (
              <Button variant="secondary" size="sm" onClick={() => {
                const greens = filteredScores.filter((s: MatchScore) => s.score >= 70).map((s: MatchScore) => s.channel_id)
                setSelected(greens)
              }}>
                Selecionar {greenCount} verde{greenCount !== 1 ? 's' : ''}
              </Button>
            )}
            <Button
              variant="primary"
              disabled={selected.length === 0 && greenCount === 0}
              onClick={() => navigate(`/compose?productId=${productId}&targets=${selected.join(',')}`)}
            >
              ✈ Disparar para {selected.length > 0 ? selected.length : `os ${greenCount} verdes`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
