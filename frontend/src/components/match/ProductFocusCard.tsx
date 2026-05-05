import React from 'react'

export interface Product {
  id: number
  canonical_name?: string
  brand?: string
  image_url?: string
  lowest_price?: number
  original_price?: number
  lowest_price_source?: string
  tags?: string[]
}

interface ProductFocusCardProps {
  product: Product
}

export function ProductFocusCard({ product }: ProductFocusCardProps) {
  const name = product.canonical_name ?? 'Produto'
  const price = product.lowest_price ?? 0
  const originalPrice = product.original_price
  const source = product.lowest_price_source ?? ''
  const brand = product.brand ?? ''
  const tags = product.tags ?? []

  const discount =
    originalPrice && originalPrice > price
      ? Math.round((1 - price / originalPrice) * 100)
      : null

  return (
    <div className="border border-border rounded-lg bg-surface p-4">
      <p className="text-xs font-medium text-fg-3 uppercase tracking-wide mb-3">
        Produto a roteiar
      </p>

      <div className="flex items-start gap-4">
        {/* Imagem quadrada */}
        <div className="w-20 h-20 rounded-md bg-surface-2 flex-shrink-0 flex items-center justify-center overflow-hidden">
          {product.image_url ? (
            <img
              src={product.image_url}
              alt={name}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-3xl">📦</span>
          )}
        </div>

        {/* Infos */}
        <div className="flex-1 min-w-0">
          <p className="text-base font-bold text-fg leading-snug">{name}</p>

          {/* Preços */}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {price > 0 && (
              <span className="text-lg font-bold text-success">
                R$ {price.toFixed(2)}
              </span>
            )}
            {originalPrice && originalPrice > price && (
              <span className="text-sm text-fg-3 line-through">
                R$ {originalPrice.toFixed(2)}
              </span>
            )}
            {discount !== null && (
              <span className="text-xs font-semibold px-1.5 py-0.5 rounded-sm bg-success text-white">
                − {discount} %
              </span>
            )}
          </div>

          {/* Marca + tags + marketplace */}
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            {brand && (
              <span className="text-xs text-fg-2 font-medium">{brand}</span>
            )}
            {source && (
              <span className="text-xs px-1.5 py-0.5 rounded-sm border border-border text-fg-3">
                {source}
              </span>
            )}
            {tags.map(tag => (
              <span
                key={tag}
                className="text-xs px-1.5 py-0.5 rounded-sm bg-surface-2 text-fg-3"
              >
                # {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
