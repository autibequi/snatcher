import React from 'react'

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'accent' | 'outline'
type BadgeSize = 'sm' | 'md'

interface BadgeProps {
  variant?: BadgeVariant
  size?: BadgeSize
  children: React.ReactNode
  className?: string
}

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-surface-2 text-fg-2 border border-border',
  success: 'bg-success-soft text-success border border-success/25',
  warning: 'bg-warning-soft text-warning border border-warning/30',
  danger: 'bg-danger-soft text-danger border border-danger/30',
  accent: 'bg-accent-soft text-accent border border-accent/25',
  outline: 'border border-border-strong text-fg-2 bg-transparent',
}

const sizeClasses: Record<BadgeSize, string> = {
  sm: 'px-1.5 py-0.5 text-xs',
  md: 'px-2 py-0.5 text-sm',
}

export function Badge({ variant = 'default', size = 'sm', children, className = '' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center rounded-md font-medium ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}>
      {children}
    </span>
  )
}
