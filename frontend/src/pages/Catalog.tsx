import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Badge, Button, Skeleton, EmptyState, Input } from '../components/ui'
import { apiClient } from '../lib/apiClient'

interface Product {
  id: number
  canonical_name?: string
  title?: string
  source?: string
  lowest_price?: number
  price?: number
  tags?: string[]
  image_url?: string
}

function ProductCard({ product, onCompose }: { product: Product; onCompose: () => void }) {
  const title = product.canonical_name ?? product.title ?? 'Produto'
  const price = product.lowest_price ?? product.price ?? 0
  return (
    <div className="bg-surface border border-border rounded-md overflow-hidden hover:border-border-strong transition-colors flex flex-col">
      <div className="aspect-square bg-surface-2 flex items-center justify-center">
        {product.image_url ? (
          <img src={product.image_url} alt={title} className="w-full h-full object-cover" />
        ) : (
          <span className="text-3xl text-fg-3">📦</span>
        )}
      </div>
      <div className="p-3 flex flex-col gap-2 flex-1">
        <p className="text-sm font-medium text-fg line-clamp-2">{title}</p>
        {price > 0 && <p className="text-sm font-semibold text-fg">R$ {price.toFixed(2)}</p>}
        {product.source && <Badge size="sm">{product.source}</Badge>}
        <Button variant="ghost" size="sm" onClick={onCompose} className="mt-auto">
          Compor disparo
        </Button>
      </div>
    </div>
  )
}

export default function Catalog() {
  const navigate = useNavigate()
  const [search, setSearch] = React.useState('')

  const { data: raw, isLoading } = useQuery({
    queryKey: ['catalog', search],
    queryFn: () => apiClient.get(`/api/catalog${search ? `?search=${encodeURIComponent(search)}` : ''}`).then(r => {
      const d = r.data
      return Array.isArray(d) ? d : (d?.items ?? d?.products ?? [])
    }),
    staleTime: 30_000,
  })

  const products: Product[] = raw ?? []

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-fg">Catálogo</h1>
        <div className="w-64">
          <Input
            placeholder="Buscar produto..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {Array.from({length:10}).map((_,i) => <Skeleton key={i} variant="card" className="h-48" />)}
        </div>
      ) : products.length === 0 ? (
        <EmptyState title="Catálogo vazio" description="Configure crawlers para começar a coletar produtos." cta={{ label: 'Ir para Crawlers', onClick: () => navigate('/crawlers') }} />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} onCompose={() => navigate(`/compose?productId=${p.id}`)} />
          ))}
        </div>
      )}
    </div>
  )
}
