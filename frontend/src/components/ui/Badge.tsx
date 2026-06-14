import React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

// badgeVariants — fonte única (padrão shadcn/cva). Variantes semânticas + aliases
// FW-2 (ok/warn/error/info → success/warning/danger/accent).
const badgeVariants = cva('inline-flex items-center rounded-md font-medium', {
  variants: {
    variant: {
      default: 'bg-surface-2 text-fg-2 border border-border',
      success: 'bg-success-soft text-success border border-success/25',
      warning: 'bg-warning-soft text-warning border border-warning/30',
      danger:  'bg-danger-soft text-danger border border-danger/30',
      accent:  'bg-accent-soft text-accent border border-accent/25',
      outline: 'border border-border-strong text-fg-2 bg-transparent',
      ok:    'bg-success-soft text-success border border-success/25',
      warn:  'bg-warning-soft text-warning border border-warning/30',
      error: 'bg-danger-soft text-danger border border-danger/30',
      info:  'bg-accent-soft text-accent border border-accent/25',
    },
    size: {
      sm: 'px-1.5 py-0.5 text-xs',
      md: 'px-2 py-0.5 text-sm',
    },
  },
  defaultVariants: { variant: 'default', size: 'sm' },
})

interface BadgeProps extends VariantProps<typeof badgeVariants> {
  children: React.ReactNode
  className?: string
}

export function Badge({ variant, size, children, className }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant, size }), className)}>
      {children}
    </span>
  )
}
