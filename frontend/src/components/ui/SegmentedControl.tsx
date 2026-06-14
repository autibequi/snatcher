import React from 'react'
import { cn } from '../../lib/utils'
import { uiFocusRing } from './tokens'

export interface SegmentedOption<T extends string> {
  value: T
  label: React.ReactNode
}

interface SegmentedControlProps<T extends string> {
  value: T
  onChange: (value: T) => void
  options: SegmentedOption<T>[]
  className?: string
}

/**
 * Botões em linha estilo "pill": um valor ativo com realce accent.
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  className = '',
}: SegmentedControlProps<T>) {
  return (
    <div className={cn('flex gap-2 flex-wrap', className)}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            'px-4 py-2 min-h-9 rounded-lg text-sm font-medium transition-colors',
            uiFocusRing,
            value === opt.value
              ? 'bg-accent text-white shadow-sm'
              : 'bg-surface-2 text-fg-2 hover:bg-surface-3 border border-border',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
