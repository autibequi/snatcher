import React from 'react'

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** @default true */
  padding?: boolean
}

/**
 * Painel de superfície padrão do app: borda, cantos, fundo.
 */
export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className = '', padding = true, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`border border-border rounded-lg bg-surface ${padding ? 'p-4' : ''} ${className}`.trim()}
        {...props}
      >
        {children}
      </div>
    )
  }
)
Card.displayName = 'Card'
