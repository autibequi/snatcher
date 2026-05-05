import React from 'react'
import { Product } from './ProductFocusCard'

interface ProductSwitcherProps {
  products: Product[]
  selectedId: number | null
  onSelect: (id: number) => void
}

export function ProductSwitcher({ products, selectedId, onSelect }: ProductSwitcherProps) {
  const [search, setSearch] = React.useState('')

  const filtered = search
    ? products.filter(p =>
        (p.canonical_name ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : products

  return (
    <div className="border border-border rounded-lg bg-surface overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border flex-shrink-0">
        <span className="text-xs font-medium text-fg-3 uppercase tracking-wide">
          Trocar produto
        </span>
        <input
          className="w-36 text-xs border border-border rounded-md px-2 py-1 bg-surface text-fg outline-none focus:border-accent"
          placeholder="Buscar..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Lista scrollável */}
      <div className="flex-1 overflow-y-auto max-h-64">
        {filtered.length === 0 ? (
          <p className="text-xs text-fg-3 p-4 text-center">Nenhum produto encontrado.</p>
        ) : (
          filtered.map(p => {
            const isSelected = p.id === selectedId
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
                onClick={() => onSelect(p.id)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors border-b border-border last:border-0 ${
                  isSelected
                    ? 'bg-accent/8 hover:bg-accent/12'
                    : 'hover:bg-surface-2'
                }`}
              >
                {/* Thumb */}
                <div className="w-7 h-7 rounded-sm bg-surface-2 flex-shrink-0 flex items-center justify-center overflow-hidden">
                  {p.image_url ? (
                    <img
                      src={p.image_url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-base">📦</span>
                  )}
                </div>

                {/* Nome + preço */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-fg truncate leading-tight">
                    {p.canonical_name ?? 'Produto'}
                  </p>
                  <p className="text-xs text-fg-3 mt-0.5">
                    {price > 0 ? `R$ ${price.toFixed(2)}` : '—'}
                    {discount !== null ? ` · −${discount}%` : ''}
                  </p>
                </div>

                {/* Check selecionado */}
                {isSelected && (
                  <span className="text-accent text-sm flex-shrink-0">✓</span>
                )}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
