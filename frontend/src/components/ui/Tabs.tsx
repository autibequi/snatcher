
interface Tab { id: string; label: string }

interface TabsProps {
  tabs: Tab[]
  active: string
  onChange: (id: string) => void
  className?: string
}

export function Tabs({ tabs, active, onChange, className = '' }: TabsProps) {
  return (
    <div className={`flex border-b border-border ${className}`}>
      {tabs.map(tab => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
            active === tab.id
              ? 'border-accent text-accent'
              : 'border-transparent text-fg-2 hover:text-fg hover:border-border-strong'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
