import React from 'react'
import { Button } from './Button'

interface EmptyStateProps {
  title: string
  description?: string
  // action: ReactNode livre — preferir sobre cta para novos callsites
  action?: React.ReactNode
  // cta: mantido para retrocompatibilidade com callers anteriores ao FW-2
  cta?: { label: string; onClick: () => void }
  icon?: React.ReactNode
}

export function EmptyState({ title, description, action, cta, icon }: EmptyStateProps) {
  // Resolve o nó de ação: action tem precedência, cta é fallback legado
  const actionNode = action ?? (
    cta ? (
      <Button variant="primary" size="sm" onClick={cta.onClick}>
        {cta.label}
      </Button>
    ) : null
  )

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center gap-3">
      {icon && <div className="text-fg-3 text-4xl">{icon}</div>}
      <h3 className="text-base font-semibold text-fg">{title}</h3>
      {description && <p className="text-sm text-fg-2 max-w-sm">{description}</p>}
      {actionNode}
    </div>
  )
}
