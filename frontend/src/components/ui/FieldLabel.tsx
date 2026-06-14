import React from 'react'
import { cn } from '../../lib/utils'

export interface FieldLabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  children: React.ReactNode
  /** Exibe asterisco de obrigatório (acessibilidade: combine com `required` no controle) */
  required?: boolean
}

/**
 * Rótulo de campo alinhado ao `Input` / `Textarea` (tipografia e espaçamento do DS).
 */
export function FieldLabel({ children, className = '', required, ...props }: FieldLabelProps) {
  return (
    <label
      className={cn('text-xs font-medium text-fg-2 block mb-1', className)}
      {...props}
    >
      {children}
      {required ? <span className="text-danger"> *</span> : null}
    </label>
  )
}
