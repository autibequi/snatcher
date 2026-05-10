import React from 'react'
import { uiPanel } from './tokens'

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** @default true */
  padding?: boolean
}

/**
 * Painel de superfície padrão — alinhado a KpiCard / tokens `uiPanel`.
 */
export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className = '', padding = true, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`${uiPanel} ${padding ? 'p-4' : ''} ${className}`.trim()}
        {...props}
      >
        {children}
      </div>
    )
  }
)
Card.displayName = 'Card'
