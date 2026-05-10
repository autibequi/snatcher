import React from 'react'
import { Button } from './Button'

interface EmptyStateProps {
  title: string
  description?: string
  cta?: { label: string; onClick: () => void }
  icon?: React.ReactNode
}

export function EmptyState({ title, description, cta, icon }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center gap-3">
      {icon && <div className="text-fg-3 text-4xl">{icon}</div>}
      <h3 className="text-base font-semibold text-fg">{title}</h3>
      {description && <p className="text-sm text-fg-2 max-w-sm">{description}</p>}
      {cta && (
        <Button variant="primary" size="sm" onClick={cta.onClick}>
          {cta.label}
        </Button>
      )}
    </div>
  )
}
