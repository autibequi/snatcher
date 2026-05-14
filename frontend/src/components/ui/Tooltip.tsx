import React from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { cn } from '@/lib/utils'

interface TooltipProps {
  content: string
  children: React.ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
  className?: string
}

export function Tooltip({ content, children, side = 'top', className = '' }: TooltipProps) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>
        <span className={cn('inline-flex items-center', className)}>
          {children}
        </span>
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={4}
          className="z-[9999] pointer-events-none px-2 py-1.5 rounded-md text-xs bg-fg text-surface max-w-[220px] whitespace-normal shadow-lg animate-in fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2"
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
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
