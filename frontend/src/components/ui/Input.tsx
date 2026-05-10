import React from 'react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  leftAddon?: React.ReactNode
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, leftAddon, className = '', ...props }, ref) => {
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
              ${error ? 'border-danger focus:border-danger focus:ring-danger' : ''}
              ${leftAddon ? 'pl-8' : ''}
              ${className}
            `}
            {...props}
          />
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    )
  }
)
Input.displayName = 'Input'
