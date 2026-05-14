import type { ReactNode } from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { cn } from '@/lib/utils'

interface Tab {
  id: string
  label: string
  // Badge opcional: número (mostrado em pill warning-soft quando > 0) ou
  // ReactNode arbitrário (caller controla cor/forma). Foi adicionado para
  // exibir contador de anomalias na aba "Jonfrey Check" em Automations,
  // sem precisar reimplementar tabs manualmente em cada página.
  badge?: number | ReactNode
  title?: string
}

interface TabsProps {
  tabs: Tab[]
  active: string
  onChange: (id: string) => void
  className?: string
}

function renderBadge(badge: Tab['badge']) {
  if (badge === undefined || badge === null) return null
  if (typeof badge === 'number') {
    if (badge <= 0) return null
    return (
      <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-warning-soft text-warning font-mono tabular-nums leading-none">
        {badge}
      </span>
    )
  }
  return <span className="ml-1.5 inline-flex items-center">{badge}</span>
}

export function Tabs({ tabs, active, onChange, className = '' }: TabsProps) {
  return (
    <TabsPrimitive.Root value={active} onValueChange={onChange}>
      <TabsPrimitive.List className={cn('flex border-b border-border', className)}>
        {tabs.map(tab => (
          <TabsPrimitive.Trigger
            key={tab.id}
            value={tab.id}
            title={tab.title}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px rounded-t-md inline-flex items-center',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
              'data-[state=active]:border-accent data-[state=active]:text-accent',
              'data-[state=inactive]:border-transparent data-[state=inactive]:text-fg-2',
              'data-[state=inactive]:hover:text-fg data-[state=inactive]:hover:border-border-strong'
            )}
          >
            {tab.label}
            {renderBadge(tab.badge)}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
    </TabsPrimitive.Root>
  )
}
