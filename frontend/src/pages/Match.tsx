import React from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Button, Badge, ScoreBar, Skeleton, EmptyState } from '../components/ui'
import { apiClient } from '../lib/apiClient'

interface MatchScore {
  channel_id: number
  channel_name: string
  score: number
  reasons: string[]
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

export default function Match() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const productId = params.get('productId')
  const [selected, setSelected] = React.useState<number[]>([])

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

        {/* Lista de scores */}
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} variant="card" className="h-16" />
            ))}
          </div>
        ) : !scores?.length ? (
          <EmptyState
            title="Nenhum canal compativel"
            description="Configure canais com perfil de audiencia para ver sugestoes de match."
          />
        ) : (
          <div className="space-y-2">
            {scores.map((s) => (
              <div
                key={s.channel_id}
                onClick={() => toggle(s.channel_id)}
                className={`flex items-center gap-4 p-3 bg-surface border rounded-md cursor-pointer transition-colors ${
                  selected.includes(s.channel_id)
                    ? 'border-accent bg-accent/5'
                    : 'border-border hover:border-border-strong'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(s.channel_id)}
                  onChange={() => toggle(s.channel_id)}
                  className="accent-accent"
                  onClick={(e) => e.stopPropagation()}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-fg">{s.channel_name}</p>
                  <div className="flex gap-1 flex-wrap mt-1">
                    {s.reasons.map((r) => (
                      <Badge key={r} variant="accent" size="sm">
                        {r}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="w-32">
                  <ScoreBar value={s.score} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer sticky */}
      <div className="border-t border-border p-4 bg-surface flex items-center justify-between">
        <span className="text-sm text-fg-2">
          {selected.length} canal{selected.length !== 1 ? 'is' : ''} selecionado{selected.length !== 1 ? 's' : ''}
        </span>
        <Button
          variant="primary"
          disabled={selected.length === 0}
          onClick={() =>
            navigate(
              `/compose?productId=${productId}&targets=${selected.join(',')}`
            )
          }
        >
          Compor disparo ({selected.length})
        </Button>
      </div>
    </div>
  )
}
