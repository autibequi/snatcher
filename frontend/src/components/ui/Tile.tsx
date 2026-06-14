import React from 'react'

interface TileProps {
  children?: React.ReactNode
  /** Tamanho em px (default 36 — spec v4) */
  size?: number
  className?: string
  imageUrl?: string
  alt?: string
}

// Quadrado 36×36, raio sm, fundo surface-3.
// Aceita filho (emoji/letra/inicial) OU imageUrl. Usado em row leftmost de listas.
export function Tile({ children, size = 36, className = '', imageUrl, alt = '' }: TileProps) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-lg bg-surface-3 text-fg-2 overflow-hidden flex-shrink-0 ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
    >
      {imageUrl ? (
        <img src={imageUrl} alt={alt} className="w-full h-full object-cover" />
      ) : (
        children
      )}
    </span>
  )
}
