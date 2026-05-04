import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { KpiCard, Badge, Skeleton, EmptyState } from '../components/ui'
import { apiClient } from '../lib/apiClient'
import { useWSEvent } from '../lib/useWS'

interface Product {
  id: number
  title: string
  marketplace: string
  priceCurrent: number
  priceOriginal: number
  drop: number
  imageUrl?: string
  collectedAt: string
}

interface KPIs {
  dispatches_24h?: number
  clicks_24h?: number
  revenue_24h?: number
  conversion_pct?: number
}

function ProductFeedCard({ product, onCompose }: { product: Product; onCompose: (id: number) => void }) {
  return (
    <div className="flex gap-3 p-3 bg-surface border border-border rounded-md hover:border-border-strong transition-colors">
      {product.imageUrl && (
        <img
          src={product.imageUrl}
          alt=""
          className="w-16 h-16 object-cover rounded-sm flex-shrink-0 bg-surface-2"
        />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-fg truncate">{product.title}</p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <Badge variant="default">{product.marketplace}</Badge>
          {product.drop > 0 && (
            <Badge variant="success">-{product.drop.toFixed(0)}%</Badge>
          )}
          {product.priceCurrent != null && (
            <span className="text-sm font-semibold text-fg">
              R$ {product.priceCurrent.toFixed(2)}
            </span>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onCompose(product.id)}
        className="flex-shrink-0 text-xs text-accent hover:underline self-center"
      >
        Compor
      </button>
    </div>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [feed, setFeed] = React.useState<Product[]>([])

  // KPIs — endpoint novo (pode nao existir ainda, fallback gracioso)
  const { data: kpis } = useQuery<KPIs>({
    queryKey: ['dashboard', 'kpis'],
    queryFn: () =>
      apiClient
        .get('/api/dashboard/kpis?period=24h')
        .then((r) => r.data)
        .catch(() => ({})),
    refetchInterval: 60_000,
  })

  // Feed de produtos — endpoint dedicado com fallback para catalog
  const { data: catalogData, isLoading } = useQuery({
    queryKey: ['catalog', { limit: 20 }],
    queryFn: () =>
      apiClient
        .get('/api/catalog?limit=20')
        .then((r) => r.data)
        .catch(() => ({ items: [] })),
  })

  // WS: novos produtos em real-time — prepend ao feed local
  useWSEvent('product.new', (data) => {
    setFeed((prev) => [data.product as unknown as Product, ...prev].slice(0, 50))
  })

  // Produtos: feed WS tem prioridade; fallback catalog
  const products: Product[] = feed.length > 0 ? feed : (catalogData?.items ?? catalogData ?? [])

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-lg font-semibold text-fg mb-6">Dashboard</h1>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <button
          type="button"
          className="text-left"
          onClick={() => navigate('/logs?type=dispatch&period=24h')}
        >
          <KpiCard label="Disparos 24h" value={kpis?.dispatches_24h ?? '—'} />
        </button>
        <button
          type="button"
          className="text-left"
          onClick={() => navigate('/logs?type=click&period=24h')}
        >
          <KpiCard label="Cliques 24h" value={kpis?.clicks_24h ?? '—'} />
        </button>
        <KpiCard
          label="Receita 24h"
          value={
            kpis?.revenue_24h
              ? `R$ ${Number(kpis.revenue_24h).toFixed(2)}`
              : '—'
          }
        />
        <KpiCard
          label="Conversao"
          value={
            kpis?.conversion_pct
              ? `${Number(kpis.conversion_pct).toFixed(1)}%`
              : '—'
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Feed principal */}
        <div className="lg:col-span-2">
          <h2 className="text-sm font-medium text-fg-2 mb-3">Produtos novos</h2>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} variant="card" className="h-20" />
              ))}
            </div>
          ) : products.length === 0 ? (
            <EmptyState
              title="Nenhum produto ainda"
              description="Configure um crawler para comecar a coletar."
              cta={{ label: 'Ir para Crawlers', onClick: () => navigate('/crawlers') }}
            />
          ) : (
            <div className="space-y-2">
              {(Array.isArray(products) ? products : []).slice(0, 20).map((p: any, i: number) => (
                <ProductFeedCard
                  key={p.id ?? i}
                  product={p}
                  onCompose={(id) => navigate(`/match?productId=${id}`)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Coluna lateral insights */}
        <div>
          <h2 className="text-sm font-medium text-fg-2 mb-3">Insights</h2>
          <div className="bg-surface border border-border rounded-md p-4">
            <p className="text-sm text-fg-3 italic">
              Insights de IA serao exibidos aqui apos configurar o OpenRouter.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
