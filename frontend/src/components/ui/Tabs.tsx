import type { ReactNode } from 'react'
import { uiFocusRing } from './tokens'

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
    <div className={`flex border-b border-border ${className}`}>
      {tabs.map(tab => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          title={tab.title}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px rounded-t-md inline-flex items-center ${uiFocusRing} ${
            active === tab.id
              ? 'border-accent text-accent'
              : 'border-transparent text-fg-2 hover:text-fg hover:border-border-strong'
          }`}
        >
          {tab.label}
          {renderBadge(tab.badge)}
        </button>
      ))}
    </div>
  )
}
