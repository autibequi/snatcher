import React from 'react'

const controlClass = `
  w-full min-h-[2.25rem] px-2.5 py-1.5 text-sm rounded-md border
  bg-surface text-fg placeholder:text-fg-3
  border-border focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent
  disabled:opacity-50 disabled:cursor-not-allowed
`.replace(/\s+/g, ' ').trim()

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className = '', rows = 3, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1">
        {label ? <label className="text-xs font-medium text-fg-2">{label}</label> : null}
        <textarea
          ref={ref}
          rows={rows}
          className={`${controlClass} resize-none ${error ? 'border-danger focus:border-danger focus:ring-danger' : ''} ${className}`.trim()}
          {...props}
        />
        {error ? <p className="text-xs text-danger">{error}</p> : null}
      </div>
    )
  }
)
Textarea.displayName = 'Textarea'
