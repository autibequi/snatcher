import React from 'react'

interface TooltipProps {
  content: string
  children: React.ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
  className?: string
}

export function Tooltip({ content, children, side = 'top', className = '' }: TooltipProps) {
  const [visible, setVisible] = React.useState(false)
  const ref = React.useRef<HTMLSpanElement>(null)
  const show = () => setVisible(true)

  const sideClasses: Record<string, string> = {
    top:    '-translate-x-1/2 -translate-y-full mb-1.5 bottom-full left-1/2',
    bottom: '-translate-x-1/2 translate-y-1 top-full left-1/2',
    left:   '-translate-x-full -translate-y-1/2 right-full top-1/2 mr-1.5',
    right:  'translate-y-[-50%] left-full top-1/2 ml-1.5',
  }

  return (
    <span
      ref={ref}
      className={`relative inline-flex items-center ${className}`}
      onMouseEnter={show}
      onMouseLeave={() => setVisible(false)}
      onFocus={show}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && (
        <span
          role="tooltip"
          className={`absolute z-[9999] pointer-events-none px-2 py-1.5 rounded-md text-xs bg-fg text-surface max-w-[220px] whitespace-normal shadow-lg ${sideClasses[side]}`}
        >
          {content}
        </span>
      )}
    </span>
  )
}

// Ícone "?" pequeno que dispara tooltip — útil pra campos com label
export function TooltipIcon({ content, side = 'top' }: { content: string; side?: TooltipProps['side'] }) {
  return (
    <Tooltip content={content} side={side}>
      <span
        className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-fg-3 text-fg-3 text-[9px] font-bold leading-none cursor-help hover:border-accent hover:text-accent transition-colors"
        tabIndex={0}
        aria-label="ajuda"
      >
        ?
      </span>
    </Tooltip>
  )
}
