import React from 'react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  // error: string mostra mensagem inline; boolean apenas aplica estilo de erro.
  // Retrocompatível com callers anteriores ao FW-2 que passam string.
  error?: string | boolean
  // hint: texto auxiliar abaixo do campo (neutro, não-erro)
  hint?: string
  leftAddon?: React.ReactNode
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, leftAddon, className = '', ...props }, ref) => {
    // Resolve se há estado de erro (string ou boolean true)
    const hasError = Boolean(error)
    // Mensagem de erro: só exibida quando error é string não-vazia
    const errorMessage = typeof error === 'string' ? error : undefined

    return (
      <div className="flex flex-col gap-1">
        {label && <label className="text-xs font-medium text-fg-2">{label}</label>}
        <div className="relative flex items-center">
          {leftAddon && (
            <div className="absolute left-2.5 text-fg-3 pointer-events-none">{leftAddon}</div>
          )}
          <input
            ref={ref}
            className={`
              w-full h-8 px-2.5 text-sm rounded-lg border
              bg-surface text-fg placeholder:text-fg-3
              border-border focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent
              disabled:opacity-50 disabled:cursor-not-allowed
              ${hasError ? 'border-danger focus:border-danger focus:ring-danger' : ''}
              ${leftAddon ? 'pl-8' : ''}
              ${className}
            `}
            {...props}
          />
        </div>
        {errorMessage && <p className="text-xs text-danger">{errorMessage}</p>}
        {hint && !hasError && <p className="text-xs text-fg-3">{hint}</p>}
      </div>
    )
  }
)
Input.displayName = 'Input'
