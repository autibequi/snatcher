import React from 'react'

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
 * Botões em linha estilo “pill”: um valor ativo com realce accent.
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  className = '',
}: SegmentedControlProps<T>) {
  return (
    <div className={`flex gap-2 flex-wrap ${className}`.trim()}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            value === opt.value
              ? 'bg-accent text-white'
              : 'bg-surface-2 text-fg-2 hover:bg-border border border-border'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
